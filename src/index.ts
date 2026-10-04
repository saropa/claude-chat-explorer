/**
 * Architecture: the index lives in a worker thread (worker.ts), so parsing and regex matching never
 * block the extension host. In memory it keeps only per-chat metadata, file lists and a trigram
 * bloom filter (bloom.ts). Message text and commands sit in an append-only binary store on disk
 * (blob.ts): one packed record per chat, read only for chats the bloom filter cannot reject, and
 * served from the OS page cache after the first read. Parsing (parse.ts) scans raw bytes and runs
 * JSON.parse only on message and title rows, skipping tool results. Changed chats append a new
 * record; the metadata file (metaFile.ts) is rewritten and the store compacted when over half is garbage.
 */
import * as fs from 'fs';
import * as path from 'path';
import { BlobStore, decodeRec } from './blob';
import { buildChat } from './build';
import { fileOf, FileStat, listFiles, projectsRoot } from './files';
import { loadMeta, saveMeta, VERSION } from './metaFile';
import { compactStore } from './compact';
import { acquireLock, pidAlive, privatePid, LOCK, releaseLock } from './lock';
import { buildFileMap, FileMap, relatedChats } from './related';
import { Chat, Rec, Related } from './types';

export const CACHE_LIMIT = 200 * 1024 * 1024;
const PRUNE_DAYS = 90;
const PERSIST_DELAY = 30000;
const WATCH_DELAY = 1000;
const BUILD_SAVE_MS = 15000;
const CONCURRENCY = 8;
const REPARSE_DELAY = 1000;
const OLD_CACHE = ['index-cache.jsonl', 'index-cache.jsonl.tmp'];
const META = `meta-v${VERSION}.bin`;

export type IndexProgress = (done: number, total: number, subs: number) => void;

export class ChatIndex {
  private chats = new Map<string, Chat>(); // keyed by file path
  private bySub?: Map<string, Chat[]>;
  private fmap?: FileMap;
  private store!: BlobStore;
  private chain: Promise<void> = Promise.resolve();
  private owner = false; // holds the lock on the shared cache files
  private gate: Promise<void> = Promise.resolve(); // pending while a compaction runs; adds wait on it
  private reparseTimer?: NodeJS.Timeout;
  private pruned = false;
  private dirty = false;
  private lastSave = 0;
  private persistTimer?: NodeJS.Timeout;
  private watchTimer?: NodeJS.Timeout;
  private watcher?: fs.FSWatcher;
  building = false;
  onChange?: () => void;
  onError?: (where: string, e: unknown) => void;

  constructor(private readonly dir: string, readonly root: string = projectsRoot()) {}

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
  /** Decode a chat's record; an unreadable one is evicted and re-parsed, and reads as empty. */
  rec(c: Chat): Rec {
    try { return decodeRec(this.store.read(c.off, c.len)); }
    catch (e) {
      this.onError?.('record ' + c.id, e);
      this.evict(c);
      return { text: '', ts: [], ends: [], roles: [], cmds: [], lines: new Uint32Array(0) };
    }
  }

  /** Forget a chat and queue a refresh so it is parsed again. */
  private evict(c: Chat): void {
    this.chats.delete(fileOf(this.root, c));
    this.changed();
    if (this.reparseTimer) { return; }
    this.reparseTimer = setTimeout(() => { this.reparseTimer = undefined; this.refresh().catch(() => undefined); }, REPARSE_DELAY);
  }

  related(chat: Chat): Related[] {
    this.fmap ??= buildFileMap(this.tops());
    return relatedChats(chat, this.fmap);
  }

  load(): Promise<void> { return this.enqueue(() => this.doLoad()); }
  refresh(cb?: IndexProgress): Promise<void> { return this.enqueue(() => this.doRefresh(cb)); }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job);
    this.chain = run.catch((e) => this.onError?.('index', e));
    return run;
  }

  /** Take the lock and load shared metadata, or (without the lock) start a private empty store. */
  private async doLoad(): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    this.owner = acquireLock(this.dir);
    try {
      const m = this.owner ? await loadMeta(path.join(this.dir, META)) : undefined;
      const storeName = this.owner ? (m?.head.store ?? `store-v${VERSION}-${Date.now()}.bin`)
        : `store-v${VERSION}-p${process.pid}-${Date.now()}.bin`;
      if (m) {
        this.pruned = m.head.pruned;
        for (const c of m.chats) { this.chats.set(fileOf(this.root, c), c); }
      }
      await this.cleanup(storeName);
      this.store = new BlobStore(path.join(this.dir, storeName));
      this.store.open();
      this.dropOutOfRange();
    } catch (e) { this.shutdown(); throw e; }
  }

  /** Drop chats whose record lies beyond the end of the store (missing or truncated file). */
  private dropOutOfRange(): void {
    for (const [k, c] of [...this.chats]) {
      if (c.off < 0 || c.len < 0 || c.off + c.len > this.store.size) { this.chats.delete(k); this.changed(); }
    }
  }

  /** Delete private stores of dead processes; the lock holder also deletes old caches and shared stores. */
  private async cleanup(keep: string): Promise<void> {
    for (const f of await fs.promises.readdir(this.dir)) {
      if (f === keep || f === LOCK) { continue; }
      const pp = privatePid(f);
      const stale = pp !== undefined ? pp === process.pid || !pidAlive(pp)
        : this.owner && (OLD_CACHE.includes(f) || f.startsWith('store-') || (f.startsWith('meta-') && f !== META));
      if (stale) { await fs.promises.rm(path.join(this.dir, f), { force: true }).catch(() => undefined); }
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
        try { const b = await buildChat(t, before); await this.gate; this.add(t.file, b); }
        catch (e) { this.onError?.('parse ' + t.file, e); }
        try { cb?.(++done, todo.length, subs); } catch (e) { this.onError?.('progress', e); }
        if (this.building && Date.now() - this.lastSave > BUILD_SAVE_MS) { await this.doPersist(); }
      }
    };
    if (todo.length) { cb?.(0, todo.length, subs); }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  }

  /** Append the record to the current store (sync, so a compaction cannot interleave). */
  private add(file: string, b: { chat: Chat; rec: Buffer }): void {
    b.chat.off = this.store.append(b.rec);
    this.chats.set(file, b.chat);
    this.changed();
  }

  private changed(): void { this.dirty = true; this.bySub = undefined; this.fmap = undefined; }

  private async doRefresh(cb?: IndexProgress): Promise<void> {
    const all = await listFiles(this.root, (w, e) => this.onError?.(w, e));
    const seen = new Set(all.map((f) => f.file));
    const todo = all.filter((f) => {
      const c = this.chats.get(f.file);
      return !c || c.mtime !== f.mtime || c.size !== f.size;
    });
    const cold = this.chats.size === 0 && todo.length > 0;
    this.building = cold;
    this.lastSave = Date.now();
    for (const k of [...this.chats.keys()]) { if (!seen.has(k)) { this.chats.delete(k); this.changed(); } }
    try { await this.parseAll(todo, cb); } finally { this.building = false; }
    if (this.dirty) {
      if (cold) { await this.doPersist(); } else { this.schedulePersist(); }
      this.onChange?.();
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) { return; }
    this.persistTimer = setTimeout(() => { this.persistTimer = undefined; void this.persist(); }, PERSIST_DELAY);
  }

  /** Write metadata; serialized with refresh so the store never changes underneath. */
  persist(): Promise<void> { return this.enqueue(() => this.doPersist()); }

  /** Save metadata (lock holder only), compacting first when over half the store is garbage or over the limit. */
  private async doPersist(): Promise<void> {
    if (!this.dirty) { return; }
    this.dirty = false;
    if (!this.owner) { return; } // a private store is never saved
    this.lastSave = Date.now();
    try {
      const live = [...this.chats.values()].reduce((a, c) => a + c.len, 0);
      if (live > CACHE_LIMIT && !this.pruned) { this.pruned = true; }
      const big = this.store.size > live * 2 + (1 << 20) || (this.pruned && live > CACHE_LIMIT);
      const old = big ? await this.compact() : '';
      this.store.sync(); // data must be on disk before metadata points at it
      await saveMeta(path.join(this.dir, META), { v: VERSION, store: path.basename(this.store.file), pruned: this.pruned },
        this.chats.values());
      if (old) { await fs.promises.rm(old, { force: true }); } // metadata now points at the new store
    } catch (e) { this.dirty = true; this.onError?.('save cache', e); }
  }

  /** Copy live records into a new store (async); returns the old path, or '' when compaction failed and was skipped. */
  private async compact(): Promise<string> {
    const old = this.store.file;
    const file = path.join(this.dir, `store-v${VERSION}-${Date.now()}.bin`);
    const cut = this.pruned ? Date.now() - PRUNE_DAYS * 86400000 : 0;
    let release!: () => void;
    this.gate = new Promise<void>((res) => { release = res; });
    try {
      const { store, bad } = await compactStore(this.store, file, this.chats.values(), cut);
      this.store = store;
      bad.forEach((c) => this.evict(c));
      return old;
    } catch (e) { this.onError?.('compact', e); return ''; } finally { release(); }
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

  async dispose(): Promise<void> {
    this.watcher?.close();
    clearTimeout(this.watchTimer);
    clearTimeout(this.persistTimer);
    clearTimeout(this.reparseTimer);
    this.persistTimer = undefined;
    await this.persist();
    this.shutdown();
  }

  /** Sync and idempotent: close the store, delete a private store, release the lock. */
  shutdown(): void {
    this.store?.close();
    try { if (!this.owner && this.store) { fs.rmSync(this.store.file, { force: true }); } } catch { /* cleaned at next load */ }
    if (this.owner) { releaseLock(this.dir); this.owner = false; }
  }
}
