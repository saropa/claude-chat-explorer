/**
 * Architecture: the index lives in a worker thread (worker.ts), so parsing and regex matching never
 * block the extension host. In memory it keeps only per-chat metadata, file lists and a trigram
 * bloom filter (bloom.ts). Each chat version is one immutable record file (record.ts) named by a hash
 * of its source path, mtime and size, so windows share the folder with no lock: a name only ever
 * holds one content. Failed writes fall back to memory; sweep.ts removes stale files.
 */
import * as fs from 'fs';
import * as path from 'path';
import { decodeRec } from './blob';
import { buildChat } from './build';
import { fileOf, FileStat, listFiles, projectsRoot } from './files';
import { chatOf, code, emptyRec, readHeaders, headerOf, quiet, unchanged } from './recChat';
import { DIR_PREFIX, encodeFile, EXT, FORMAT, Parsed, readHeader, parseRecord, readRecordSync, recName, writeRecord } from './record';
import { MemKeep } from './memKeep';
import { buildFileMap, FileMap, relatedChats } from './related';
import { DEFAULT_AGES, sweepAll, SweepAges } from './sweep';
import { Chat, Rec, Related } from './types';

export const CACHE_LIMIT = 200 * 1024 * 1024;
const PRUNE_DAYS = 90;
const WATCH_DELAY = 1000;
const CONCURRENCY = 8;
const REPARSE_DELAY = 1000;
const SWEEP_EVERY = 6 * 3600e3;

export type IndexProgress = (done: number, total: number, subs: number) => void;
type Built = { chat: Chat; body: Buffer };

export class ChatIndex {
  private chats = new Map<string, Chat>(); // keyed by source file path
  private bySub?: Map<string, Chat[]>;
  private fmap?: FileMap;
  private chain: Promise<void> = Promise.resolve();
  private keepMem = new MemKeep(); // records whose write failed
  private keep = new Set<string>(); // record names current chats use, for the sweep
  private memOnly = false;
  private warned = false;
  private swept = false;
  private pruned = false;
  private dirty = false;
  private reparseTimer?: NodeJS.Timeout;
  private watchTimer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  private watcher?: fs.FSWatcher;
  readonly recDir: string;
  ages: SweepAges = { ...DEFAULT_AGES };
  building = false;
  onChange?: () => void;
  onError?: (where: string, e: unknown) => void;

  constructor(private readonly dir: string, readonly root: string = projectsRoot()) {
    this.recDir = path.join(dir, DIR_PREFIX + FORMAT);
  }

  /** Top-level chats (subagents excluded). */
  tops(): Chat[] { return [...this.chats.values()].filter((c) => !c.parent); }
  get size(): number { return this.chats.size; }

  /** Subagent chats of a parent session (same project folder), newest first. */
  subsOf(p: Chat): Chat[] {
    if (!this.bySub) {
      const m = new Map<string, Chat[]>();
      for (const c of this.chats.values()) {
        if (!c.parent) { continue; }
        const k = c.dir + '/' + c.parent;
        (m.get(k) ?? m.set(k, []).get(k)!).push(c);
      }
      for (const l of m.values()) { l.sort((a, b) => b.last - a.last); }
      this.bySub = m;
    }
    return this.bySub.get(p.dir + '/' + p.id) ?? [];
  }

  /** Newest top-level chat with this session id. */
  find(id: string): Chat | undefined {
    let best: Chat | undefined;
    for (const c of this.chats.values()) { if (!c.parent && c.id === id && (!best || c.mtime > best.mtime)) { best = c; } }
    return best;
  }

  fileOf(c: Chat): string { return fileOf(this.root, c); }
  private srcOf(file: string): string { return path.relative(this.root, file); }

  /** Decode a chat's record; an unreadable one is evicted and re-parsed, and reads as empty. */
  rec(c: Chat): Rec {
    try {
      const m = this.keepMem.bodies.get(c.rec);
      if (m) { return decodeRec(m); }
      if (this.keepMem.pend.has(c.rec)) { return emptyRec(); }
      return decodeRec(parseRecord(readRecordSync(path.join(this.recDir, c.rec)), c.rec).body);
    } catch (e) { return this.recFailed(c, e); }
  }

  private recFailed(c: Chat, e: unknown): Rec {
    if (code(e) === 'ENOENT') {
      const r = this.reresolve(c);
      if (r) { return r; }
    } else {
      this.onError?.('record ' + c.id, e);
      try { fs.unlinkSync(path.join(this.recDir, c.rec)); } catch { /* already gone */ }
    }
    this.evict(c);
    return emptyRec();
  }

  /** The record vanished: use the one for the source's current version when it exists. */
  private reresolve(c: Chat): Rec | undefined {
    try {
      const file = fileOf(this.root, c), st = fs.statSync(file);
      const name = recName(this.srcOf(file), st.mtimeMs, st.size);
      if (name === c.rec) { return undefined; }
      const p = parseRecord(readRecordSync(path.join(this.recDir, name)), name);
      this.chats.set(file, chatOf(p, name));
      this.changed();
      return decodeRec(p.body);
    } catch { return undefined; }
  }

  /** Forget a chat and queue a refresh so it is parsed again. */
  private evict(c: Chat): void {
    const k = fileOf(this.root, c);
    if (this.chats.get(k) === c) { this.chats.delete(k); this.changed(); }
    if (this.reparseTimer) { return; }
    this.reparseTimer = setTimeout(() => { this.reparseTimer = undefined; this.refresh().catch(() => undefined); }, REPARSE_DELAY);
  }

  related(chat: Chat): Related[] {
    this.fmap ??= buildFileMap(this.tops());
    return relatedChats(chat, this.fmap);
  }

  load(): Promise<void> { return this.enqueue(() => this.doLoad()); }
  refresh(cb?: IndexProgress): Promise<void> { return this.enqueue(() => this.doRefresh(cb)); }
  /** Nothing to save: every record is written as it is built. */
  persist(): Promise<void> { return Promise.resolve(); }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job);
    this.chain = run.catch((e) => this.onError?.('index', e));
    return run;
  }

  /** Read every record header; a folder problem switches to memory only and never throws. */
  private async doLoad(): Promise<void> {
    let names: string[] = [];
    try { await fs.promises.mkdir(this.recDir, { recursive: true }); names = await fs.promises.readdir(this.recDir); }
    catch (e) { this.memOnly = true; this.warn(e); }
    this.adoptNewest(await readHeaders(this.recDir, names.filter((n) => n.endsWith(EXT))));
    this.pruned = this.total() > CACHE_LIMIT;
  }

  /** Keep the newest version per source. */
  private adoptNewest(found: Array<{ p: Parsed; name: string }>): void {
    for (const { p, name } of found) {
      const k = path.join(this.root, p.h.src), cur = this.chats.get(k);
      if (!cur || cur.mtime < p.h.mtime) { this.chats.set(k, chatOf(p, name)); }
    }
    this.changed();
  }

  private total(): number { let n = 0; for (const c of this.chats.values()) { n += c.len; } return n; }

  private warn(e: unknown): void {
    if (this.warned) { return; }
    this.warned = true;
    this.onError?.('record folder unavailable, keeping records in memory', e);
  }

  private needs(f: FileStat): boolean {
    const c = this.chats.get(f.file);
    return !c || c.mtime !== f.mtime || c.size !== f.size || (this.keepMem.pend.has(c.rec) && !this.keepMem.bodies.has(c.rec));
  }

  /** Adopt the record another window wrote for this version, when it is valid. */
  private async adopt(t: FileStat): Promise<boolean> {
    if (this.memOnly) { return false; }
    const name = recName(this.srcOf(t.file), t.mtime, t.size);
    try {
      this.chats.set(t.file, chatOf(await readHeader(path.join(this.recDir, name), name), name));
      this.changed();
      return true;
    } catch { return false; }
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
    if (await this.adopt(t)) { return; }
    await this.put(t, await buildChat(t, before), before);
  }

  /** Write the record, then switch the chat to it and delete its previous version. */
  private async put(t: FileStat, b: Built, cut: number): Promise<void> {
    const src = this.srcOf(t.file), name = recName(src, t.mtime, t.size);
    b.chat.rec = name;
    const prev = this.chats.get(t.file);
    try {
      if (this.memOnly) { throw new Error('memory only'); }
      const buf = encodeFile(headerOf(b.chat, src, cut), b.chat.bloom, b.body);
      if (!(await writeRecord(this.recDir, name, buf, unchanged(t)))) { return; } // source moved; the watcher refreshes
      this.keepMem.pend.delete(name);
      this.install(t.file, b.chat, prev);
      if (prev && prev.rec !== name) { await quiet(fs.promises.unlink(path.join(this.recDir, prev.rec))); }
    } catch (e) { this.fallback(t.file, b, prev, e); }
  }

  private install(file: string, chat: Chat, prev?: Chat): void {
    if (prev && prev.rec !== chat.rec) { this.keepMem.release(prev.rec); }
    this.chats.set(file, chat);
    this.changed();
  }

  /** A failed write keeps the body in memory (capped); over the cap an existing record stays in use. */
  private fallback(file: string, b: Built, prev: Chat | undefined, e: unknown): void {
    if (!this.memOnly || !this.warned) { this.warn(e); }
    if (this.keepMem.add(b.chat.rec, b.body)) {
      this.install(file, b.chat, prev);
    } else if (!prev) {
      this.keepMem.pend.add(b.chat.rec);
      this.install(file, b.chat);
    }
  }

  /** Retry writing records held in memory. */
  private async retryPending(): Promise<void> {
    if (this.memOnly || !this.keepMem.bodies.size) { return; }
    const byRec = new Map([...this.chats].map(([f, c]) => [c.rec, { f, c }]));
    for (const [name, body] of [...this.keepMem.bodies]) {
      const e = byRec.get(name);
      if (!e) { this.keepMem.release(name); continue; }
      const src = this.srcOf(e.f);
      try {
        const buf = encodeFile(headerOf(e.c, src, 0), e.c.bloom, body);
        if (await writeRecord(this.recDir, name, buf, unchanged({ file: e.f, mtime: e.c.mtime, size: e.c.size }))) { this.keepMem.release(name); }
      } catch { /* still failing; stay in memory */ }
    }
  }

  private changed(): void { this.dirty = true; this.bySub = undefined; this.fmap = undefined; }

  private async doRefresh(cb?: IndexProgress): Promise<void> {
    const all = await listFiles(this.root, (w, e) => this.onError?.(w, e));
    const seen = new Set(all.map((f) => f.file));
    this.pruned = this.total() > CACHE_LIMIT;
    await this.retryPending();
    const todo = all.filter((f) => this.needs(f));
    this.building = this.chats.size === 0 && todo.length > 0;
    for (const [k, c] of [...this.chats]) { if (!seen.has(k)) { this.chats.delete(k); this.keepMem.release(c.rec); this.changed(); } }
    try { await this.parseAll(todo, cb); } finally { this.building = false; }
    this.keep = new Set([...this.chats.values()].map((c) => c.rec));
    if (this.dirty) { this.dirty = false; this.onChange?.(); }
    this.startSweep();
  }

  /** Sweep once after the first refresh, then every 6 hours. */
  private startSweep(): void {
    if (this.swept) { return; }
    this.swept = true;
    void this.sweep();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_EVERY);
    this.sweepTimer.unref();
  }

  sweep(): Promise<void> { return quiet(sweepAll(this.dir, this.recDir, this.keep, this.ages)); }

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
    this.watcher?.close();
    this.watcher = undefined;
    for (const t of [this.watchTimer, this.reparseTimer, this.sweepTimer]) { clearTimeout(t); clearInterval(t); }
    this.watchTimer = this.reparseTimer = this.sweepTimer = undefined;
  }
}
