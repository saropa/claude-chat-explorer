/**
 * Architecture: the index lives in a worker thread (worker.ts), so parsing and regex matching never
 * block the extension host. In memory it keeps only per-chat metadata, file lists and a trigram
 * bloom filter (bloom.ts). Each chat version is one immutable record file (record.ts) named by a hash
 * of its source path, mtime and size, so windows share the folder with no lock. Failed writes fall
 * back to memory; sweep.ts removes records whose source version is gone. Read path: recReader.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildChat } from './build';
import { FileStat, listFiles, projectsRoot } from './files';
import { chatOf, code, headerOf, readHeaders, unchanged } from './recChat';
import { recCache } from './recCache';
import { RecReader } from './recReader';
import { encodeFile, EXT, isCorrupt, Parsed, quiet, readHeader, recName, writeRecord } from './record';
import { DEFAULT_AGES, sweepAll, SweepAges } from './sweep';
import { Chat } from './types';

export const CACHE_LIMIT = 200 * 1024 * 1024;
const PRUNE_DAYS = 90;
const WATCH_DELAY = 1000;
const CONCURRENCY = 8;
const SWEEP_EVERY = 6 * 3600e3;

export type IndexProgress = (done: number, total: number, subs: number) => void;
type Built = { chat: Chat; body: Buffer };
const verOf = (f: { mtime: number; size: number }): string => `${f.mtime}:${f.size}`;

export class ChatIndex extends RecReader {
  private chain: Promise<void> = Promise.resolve();
  private memOnly = false;
  private swept = false;
  private sweeping?: Promise<void>; // a sweep in flight; never overlaps itself
  private closed = false;
  private pruned = false;
  private watchTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  private watcher?: fs.FSWatcher;
  ages: SweepAges = { ...DEFAULT_AGES };
  building = false;

  constructor(dir: string, root: string = projectsRoot()) { super(dir, root); }

  load(): Promise<void> { return this.enqueue(() => this.doLoad()); }
  refresh(cb?: IndexProgress): Promise<void> { return this.enqueue(() => this.doRefresh(cb)); }
  /** Nothing to save: every record is written as it is built. */
  persist(): Promise<void> { return Promise.resolve(); }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job);
    this.chain = run.catch((e) => this.onError?.('index', e));
    return run;
  }

  /** Create the record folder and check it is writable; a problem switches to memory only, and a fix switches back. Never throws. */
  private async checkDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.recDir, { recursive: true });
      await fs.promises.access(this.recDir, fs.constants.W_OK);
      this.memOnly = false;
    } catch (e) { this.memOnly = true; this.logOnce('record folder unavailable, keeping records in memory', e); }
  }

  /** Read every record header as it is found; the load never throws. */
  private async doLoad(): Promise<void> {
    try {
      await this.checkDir();
      const names = await fs.promises.readdir(this.recDir).catch(() => [] as string[]);
      await readHeaders(this.recDir, names.filter((n) => n.endsWith(EXT)), (p, n) => this.adoptNewest(p, n));
      this.changed();
      this.pruned = this.total() > CACHE_LIMIT;
    } catch (e) { this.memOnly = true; this.logOnce('load records', e); }
  }

  /** Keep the newest version per source; an older header is dropped at once. */
  private adoptNewest(p: Parsed, name: string): void {
    const k = path.join(this.root, p.h.src), cur = this.chats.get(k);
    if (!cur || cur.mtime < p.h.mtime) { this.chats.set(k, chatOf(p, name)); }
  }

  private total(): number { let n = 0; for (const c of this.chats.values()) { n += c.len; } return n; }

  private needs(f: FileStat): boolean {
    if (this.failed.get(f.file) === verOf(f)) { return false; }
    const c = this.chats.get(f.file);
    return !c || c.mtime !== f.mtime || c.size !== f.size || (this.keepMem.pend.has(c.rec) && !this.keepMem.bodies.has(c.rec));
  }

  /** Adopt the record another window wrote for this version. error means an I/O failure: the file stays and the next refresh retries. */
  private async adopt(t: FileStat): Promise<'ok' | 'miss' | 'error'> {
    const name = recName(this.srcOf(t.file), t.mtime, t.size);
    if (this.memOnly || this.unreadable(name)) { return 'miss'; } // 3 failed reads: rebuild into memory
    try {
      this.chats.set(t.file, chatOf(await readHeader(path.join(this.recDir, name), name), name));
      this.fails.delete(name);
      this.changed();
      return 'ok';
    } catch (e) {
      if (code(e) === 'ENOENT' || isCorrupt(e)) { return 'miss'; }
      this.logOnce('record ' + t.id, e);
      return this.noteFail(name) >= 3 ? 'miss' : 'error';
    }
  }

  /** Parse files newest first with a few concurrent readers; progress per file. */
  private async parseAll(todo: FileStat[], cb?: IndexProgress): Promise<void> {
    let done = 0, next = 0;
    const subs = todo.filter((t) => t.parent).length;
    const before = this.pruned ? Date.now() - PRUNE_DAYS * 86400000 : 0;
    todo.sort((a, b) => b.mtime - a.mtime);
    const worker = async () => {
      while (next < todo.length) {
        const t = todo[next++];
        try { await this.handle(t, before); } catch (e) { this.onError?.('parse ' + t.file, e); }
        try { cb?.(++done, todo.length, subs); } catch (e) { this.onError?.('progress', e); }
      }
    };
    if (todo.length) { cb?.(0, todo.length, subs); }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  }

  private async handle(t: FileStat, before: number): Promise<void> {
    if ((await this.adopt(t)) !== 'miss') { return; }
    await this.put(t, await buildChat(t, before));
  }

  /** Write the record, then switch the chat to it and delete its previous version. */
  private async put(t: FileStat, b: Built): Promise<void> {
    const src = this.srcOf(t.file), name = recName(src, t.mtime, t.size);
    b.chat.rec = name;
    const prev = this.chats.get(t.file);
    try {
      if (this.memOnly || this.unreadable(name)) { throw new Error('memory only'); }
      const buf = encodeFile(headerOf(b.chat, src), b.chat.bloom, b.body);
      if (!(await writeRecord(this.recDir, name, buf, unchanged(t)))) { this.holdMem(t.file, b, prev); return; }
      this.keepMem.pend.delete(name);
      recCache.drop(name); // same-name rewrite: forget the old bytes
      this.fails.delete(name);
      this.install(t.file, b.chat, prev);
      if (prev && prev.rec !== name) { recCache.drop(prev.rec); await quiet(fs.promises.unlink(path.join(this.recDir, prev.rec))); }
    } catch (e) { this.fallback(t, b, prev, e); }
  }

  private install(file: string, chat: Chat, prev?: Chat): void {
    if (prev && prev.rec !== chat.rec) { this.keepMem.release(prev.rec); }
    this.chats.set(file, chat);
    this.failed.delete(file); // this version now has a home
    this.changed();
  }

  /** The source moved during the parse: search the parsed version from memory; the next refresh replaces it. */
  private holdMem(file: string, b: Built, prev?: Chat): void {
    if (this.keepMem.add(b.chat.rec, b.body)) { this.install(file, b.chat, prev); }
  }

  /** A failed write keeps the body in memory (capped); over the cap the version is skipped until the source changes. */
  private fallback(t: FileStat, b: Built, prev: Chat | undefined, e: unknown): void {
    if (!this.memOnly) { this.logOnce('record write failed, keeping records in memory', e); }
    if (this.keepMem.add(b.chat.rec, b.body)) { this.install(t.file, b.chat, prev); return; }
    if (!prev) {
      this.keepMem.pend.add(b.chat.rec);
      this.install(t.file, b.chat);
    }
    this.failed.set(t.file, verOf(t));
  }

  /** Retry writing records held in memory. */
  private async retryPending(): Promise<void> {
    if (this.memOnly || !this.keepMem.bodies.size) { return; }
    const byRec = new Map([...this.chats].map(([f, c]) => [c.rec, { f, c }]));
    for (const [name, body] of [...this.keepMem.bodies]) {
      const e = byRec.get(name);
      if (!e) { this.keepMem.release(name); continue; }
      try {
        const buf = encodeFile(headerOf(e.c, this.srcOf(e.f)), e.c.bloom, body);
        if (await writeRecord(this.recDir, name, buf, unchanged({ file: e.f, mtime: e.c.mtime, size: e.c.size }))) {
          recCache.drop(name); this.fails.delete(name); this.keepMem.release(name);
        }
      } catch { /* still failing; stay in memory */ }
    }
  }

  /** A skipped version may have been written by another window: adopt its record and clear the skip. */
  private async adoptFailed(all: FileStat[]): Promise<void> {
    for (const f of all) {
      if (this.failed.get(f.file) !== verOf(f)) { continue; }
      if ((await this.adopt(f)) === 'ok') { this.failed.delete(f.file); }
    }
  }

  private async doRefresh(cb?: IndexProgress): Promise<void> {
    await this.checkDir();
    const all = await listFiles(this.root, (w, e) => this.onError?.(w, e));
    const seen = new Set(all.map((f) => f.file));
    this.pruned = this.total() > CACHE_LIMIT;
    await this.retryPending();
    await this.adoptFailed(all);
    const todo = all.filter((f) => this.needs(f));
    this.building = this.chats.size === 0 && todo.length > 0;
    for (const [k, c] of [...this.chats]) { if (!seen.has(k)) { this.chats.delete(k); this.keepMem.release(c.rec); this.changed(); } }
    for (const k of [...this.failed.keys()]) { if (!seen.has(k)) { this.failed.delete(k); } }
    try { await this.parseAll(todo, cb); } finally { this.building = false; }
    if (this.dirty) { this.dirty = false; this.onChange?.(); }
    this.startSweep();
  }

  /** Sweep once after the first refresh, then every 6 hours; never after shutdown. */
  private startSweep(): void {
    if (this.swept || this.closed) { return; }
    this.swept = true;
    void this.sweep();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_EVERY);
    this.sweepTimer.unref();
  }

  /** Runs beside the index jobs (it reads only the disk), so a search never waits for it; one at a time. */
  sweep(): Promise<void> {
    if (this.closed) { return Promise.resolve(); }
    this.sweeping ??= sweepAll(this.dir, this.recDir, this.root, this.ages, (w, e) => this.logOnce(w, e)).catch((e) => this.logOnce('sweep', e)).finally(() => { this.sweeping = undefined; });
    return this.sweeping;
  }

  /** True while a file change is waiting for its debounced refresh. */
  get stale(): boolean { return !!this.watchTimer || !this.watcher; }

  /** Watch the projects folder (subfolders included) and refresh in the background, debounced. */
  watch(): void {
    try {
      this.watcher = fs.watch(this.root, { recursive: true }, () => {
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => { this.watchTimer = undefined; this.refresh().catch(() => undefined); }, WATCH_DELAY);
      });
      this.watcher.on('error', (e) => { this.onError?.('watch', e); this.watcher = undefined; });
    } catch (e) { this.onError?.('watch', e); } // stale stays true, so each search refreshes first
  }

  async dispose(): Promise<void> { this.shutdown(); }

  /** Sync and idempotent: close the watcher and clear timers. Touches no file. */
  shutdown(): void {
    this.closed = true;
    this.watcher?.close();
    this.watcher = undefined;
    for (const t of [this.watchTimer, this.reparseTimer, this.sweepTimer]) { clearTimeout(t); clearInterval(t); }
    this.watchTimer = this.reparseTimer = this.sweepTimer = undefined;
  }
}
