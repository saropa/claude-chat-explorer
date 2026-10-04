import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCache, saveCache } from './cache';
import { parseChat } from './parse';
import { buildFileMap, FileMap, relatedChats } from './related';
import { Chat, Related } from './types';

export const CACHE_LIMIT = 200 * 1024 * 1024;
const PRUNE_DAYS = 90;
const PERSIST_DELAY = 30000;
const WATCH_DELAY = 2000;
const WORKERS = 4;

export const projectsRoot = (): string => path.join(os.homedir(), '.claude', 'projects');

export type IndexProgress = (done: number, total: number) => void;
interface FileStat { file: string; dir: string; mtime: number; size: number; }

/** In-memory index of every chat, cached on disk and refreshed incrementally. */
export class ChatIndex {
  private chats = new Map<string, Chat>(); // keyed by file path
  private chain: Promise<void> = Promise.resolve();
  private saving: Promise<void> = Promise.resolve();
  private pruned = false;
  private dirty = false;
  private persistTimer?: NodeJS.Timeout;
  private watchTimer?: NodeJS.Timeout;
  private watcher?: fs.FSWatcher;
  private fmap?: FileMap;
  building = false;
  onChange?: () => void;
  onError?: (where: string, e: unknown) => void;

  constructor(private readonly cacheFile: string, private readonly root: string = projectsRoot()) {}

  /** Chats that share files with this one (file map is rebuilt lazily after the index changes). */
  related(chat: Chat): Related[] {
    this.fmap ??= buildFileMap(this.list());
    return relatedChats(chat, this.fmap);
  }

  list(): Chat[] { return [...this.chats.values()]; }

  /** Newest chat with this session id, if indexed. */
  find(id: string): Chat | undefined {
    let best: Chat | undefined;
    for (const c of this.chats.values()) { if (c.id === id && (!best || c.mtime > best.mtime)) { best = c; } }
    return best;
  }

  /** Load the on-disk cache so a reload only re-parses changed files; serialized with refresh. */
  load(): Promise<void> { return this.enqueue(() => this.doLoad()); }

  /** Stat every file and re-parse only new or changed ones. Calls are serialized. */
  refresh(cb?: IndexProgress): Promise<void> { return this.enqueue(() => this.doRefresh(cb)); }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job);
    this.chain = run.catch((e) => this.onError?.('index', e));
    return run;
  }

  private async doLoad(): Promise<void> {
    const c = await loadCache(this.cacheFile);
    this.pruned = c.pruned;
    for (const x of c.chats) { if (!this.chats.has(x.file)) { this.chats.set(x.file, x); } }
    this.fmap = undefined;
  }

  private async statDir(dir: string, out: FileStat[]): Promise<void> {
    const names = (await fs.promises.readdir(path.join(this.root, dir))).filter((f) => f.endsWith('.jsonl'));
    await Promise.all(names.map(async (f) => {
      try {
        const file = path.join(this.root, dir, f);
        const st = await fs.promises.stat(file);
        if (st.isFile() && st.size > 0) { out.push({ file, dir, mtime: st.mtimeMs, size: st.size }); }
      } catch { /* deleted between readdir and stat */ }
    }));
  }

  private async listFiles(): Promise<FileStat[]> {
    const out: FileStat[] = [];
    let dirs: string[] = [];
    try {
      dirs = (await fs.promises.readdir(this.root, { withFileTypes: true }))
        .filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { return out; } // no projects folder yet
    for (const dir of dirs) {
      try { await this.statDir(dir, out); } catch (e) { this.onError?.('read ' + dir, e); }
    }
    return out;
  }

  /** Parse files with a few concurrent workers, reporting progress per file. */
  private async parseAll(todo: FileStat[], cb?: IndexProgress): Promise<void> {
    let done = 0, next = 0;
    const before = this.pruned ? Date.now() - PRUNE_DAYS * 86400000 : 0;
    const worker = async () => {
      while (next < todo.length) {
        const t = todo[next++];
        try {
          this.chats.set(t.file, await parseChat(t.file, t.dir, path.basename(t.file, '.jsonl'), t.mtime, t.size, before));
        } catch (e) { this.onError?.('parse ' + t.file, e); }
        try { cb?.(++done, todo.length); } catch (e) { this.onError?.('progress', e); }
      }
    };
    if (todo.length) { cb?.(0, todo.length); }
    await Promise.all(Array.from({ length: Math.min(WORKERS, todo.length) }, worker));
  }

  private async doRefresh(cb?: IndexProgress): Promise<void> {
    const all = await this.listFiles();
    const seen = new Set(all.map((f) => f.file));
    const todo = all.filter((f) => {
      const c = this.chats.get(f.file);
      return !c || c.mtime !== f.mtime || c.size !== f.size;
    });
    const cold = this.chats.size === 0 && todo.length > 0;
    this.building = cold; // first build: no cache existed or its version changed
    let removed = false;
    for (const k of [...this.chats.keys()]) { if (!seen.has(k)) { this.chats.delete(k); removed = true; } }
    await this.parseAll(todo, cb);
    if (todo.length || removed) {
      this.dirty = true;
      this.fmap = undefined;
      if (cold) { await this.persist(); } else { this.schedulePersist(); }
      this.onChange?.();
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) { return; }
    this.persistTimer = setTimeout(() => { this.persistTimer = undefined; void this.persist(); }, PERSIST_DELAY);
  }

  /** Write the cache; writes are serialized so two saves never share the temp file. */
  persist(): Promise<void> {
    this.saving = this.saving.then(() => this.doPersist());
    return this.saving;
  }

  /** Above the size limit keep message text for the last 90 days only. */
  private async doPersist(): Promise<void> {
    if (!this.dirty) { return; }
    this.dirty = false;
    try {
      await fs.promises.mkdir(path.dirname(this.cacheFile), { recursive: true });
      const bytes = await saveCache(this.cacheFile, this.chats.values(), this.pruned);
      if (bytes > CACHE_LIMIT && !this.pruned) {
        this.pruned = true;
        const cut = Date.now() - PRUNE_DAYS * 86400000;
        for (const c of this.chats.values()) { c.messages = c.messages.filter((m) => m.ts >= cut); }
        await saveCache(this.cacheFile, this.chats.values(), true);
      }
    } catch (e) { this.dirty = true; this.onError?.('save cache', e); }
  }

  /** Watch the projects folder and refresh in the background, debounced. */
  watch(): void {
    try {
      this.watcher = fs.watch(this.root, { recursive: true }, () => {
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => { this.refresh().catch(() => undefined); }, WATCH_DELAY);
      });
      this.watcher.on('error', (e) => this.onError?.('watch', e));
    } catch (e) { this.onError?.('watch', e); } // refresh-before-search still keeps it current
  }

  async dispose(): Promise<void> {
    this.watcher?.close();
    clearTimeout(this.watchTimer);
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    await this.persist();
  }
}
