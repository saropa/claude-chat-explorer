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
import { buildFileMap, FileMap, relatedChats } from './related';
import { Chat, Rec, Related } from './types';

export const CACHE_LIMIT = 200 * 1024 * 1024;
const PRUNE_DAYS = 90;
const PERSIST_DELAY = 30000;
const WATCH_DELAY = 1000;
const BUILD_SAVE_MS = 15000;
const CONCURRENCY = 8;
const OLD_CACHE = ['index-cache.jsonl', 'index-cache.jsonl.tmp'];
const META = `meta-v${VERSION}.bin`;

export type IndexProgress = (done: number, total: number, subs: number) => void;

export class ChatIndex {
  private chats = new Map<string, Chat>(); // keyed by file path
  private bySub?: Map<string, Chat[]>;
  private fmap?: FileMap;
  private store!: BlobStore;
  private chain: Promise<void> = Promise.resolve();
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

  /** Subagent chats of a parent session, newest first. */
  subsOf(id: string): Chat[] {
    if (!this.bySub) {
      const m = new Map<string, Chat[]>();
      for (const c of this.chats.values()) { if (c.parent) { (m.get(c.parent) ?? m.set(c.parent, []).get(c.parent)!).push(c); } }
      for (const l of m.values()) { l.sort((a, b) => b.last - a.last); }
      this.bySub = m;
    }
    return this.bySub.get(id) ?? [];
  }

  /** Newest top-level chat with this session id. */
  find(id: string): Chat | undefined {
    let best: Chat | undefined;
    for (const c of this.chats.values()) { if (!c.parent && c.id === id && (!best || c.mtime > best.mtime)) { best = c; } }
    return best;
  }

  fileOf(c: Chat): string { return fileOf(this.root, c); }
  rec(c: Chat): Rec { return decodeRec(this.store.read(c.off, c.len)); }

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

  /** Load metadata, open its store, and delete caches of older versions and stray store files. */
  private async doLoad(): Promise<void> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    const m = await loadMeta(path.join(this.dir, META));
    const storeName = m?.head.store ?? `store-v${VERSION}-${Date.now()}.bin`;
    if (m) {
      this.pruned = m.head.pruned;
      for (const c of m.chats) { this.chats.set(fileOf(this.root, c), c); }
    }
    for (const f of await fs.promises.readdir(this.dir)) {
      const stale = OLD_CACHE.includes(f) || (f.startsWith('store-') && f !== storeName) || (f.startsWith('meta-') && f !== META);
      if (stale) { await fs.promises.rm(path.join(this.dir, f), { force: true }).catch(() => undefined); }
    }
    this.store = new BlobStore(path.join(this.dir, storeName));
    this.store.open();
    if (!m) { this.chats.clear(); }
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
        try { this.add(t.file, await buildChat(t, before)); }
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

  /** Save metadata, compacting first when over half the store is garbage or it exceeds the limit. */
  private async doPersist(): Promise<void> {
    if (!this.dirty) { return; }
    this.dirty = false;
    this.lastSave = Date.now();
    try {
      const live = [...this.chats.values()].reduce((a, c) => a + c.len, 0);
      if (live > CACHE_LIMIT && !this.pruned) { this.pruned = true; }
      const old = this.store.size > live * 2 + (1 << 20) || (this.pruned && live > CACHE_LIMIT) ? this.compact() : '';
      await saveMeta(path.join(this.dir, META), { v: VERSION, store: path.basename(this.store.file),
        pruned: this.pruned, garbage: 0 }, this.chats.values());
      if (old) { await fs.promises.rm(old, { force: true }); } // metadata now points at the new store
    } catch (e) { this.dirty = true; this.onError?.('save cache', e); }
  }

  /** Copy live records into a new store file (pruning old messages when over the limit); returns the old path. */
  private compact(): string {
    const old = this.store.file;
    const file = path.join(this.dir, `store-v${VERSION}-${Date.now()}.bin`);
    const cut = this.pruned ? Date.now() - PRUNE_DAYS * 86400000 : 0;
    this.store = compactStore(this.store, file, this.chats.values(), cut);
    return old;
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
    this.persistTimer = undefined;
    await this.persist();
    this.store?.close();
  }
}
