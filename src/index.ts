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

export const projectsRoot = (): string => path.join(os.homedir(), '.claude', 'projects');

export type IndexProgress = (done: number, total: number) => void;

/** In-memory index of every chat, cached on disk and refreshed incrementally. */
export class ChatIndex {
  private chats = new Map<string, Chat>(); // keyed by file path
  private chain: Promise<void> = Promise.resolve();
  private pruned = false;
  private dirty = false;
  private persistTimer?: NodeJS.Timeout;
  private watchTimer?: NodeJS.Timeout;
  private watcher?: fs.FSWatcher;
  private fmap?: FileMap;
  cacheBytes = 0;
  onChange?: () => void;

  constructor(private readonly cacheFile: string, private readonly root: string = projectsRoot()) {}

  /** Chats that share files with this one (file map is rebuilt whenever the index changes). */
  related(chat: Chat): Related[] {
    this.fmap ??= buildFileMap(this.list());
    return relatedChats(chat, this.fmap);
  }

  list(): Chat[] { return [...this.chats.values()]; }
  get size(): number { return this.chats.size; }

  /** Load the on-disk cache so a reload only re-parses changed files. */
  async load(): Promise<void> {
    const c = await loadCache(this.cacheFile);
    this.pruned = c.pruned;
    for (const x of c.chats) { this.chats.set(x.file, x); }
    try { this.cacheBytes = (await fs.promises.stat(this.cacheFile)).size; } catch { /* none */ }
    this.fmap = buildFileMap(this.list());
  }

  /** Stat every file and re-parse only new or changed ones. Calls are serialized. */
  refresh(cb?: IndexProgress): Promise<void> {
    const run = this.chain.then(() => this.doRefresh(cb));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async listFiles(): Promise<Array<{ file: string; dir: string; mtime: number; size: number }>> {
    const out: Array<{ file: string; dir: string; mtime: number; size: number }> = [];
    let dirs: string[] = [];
    try {
      dirs = (await fs.promises.readdir(this.root, { withFileTypes: true }))
        .filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { return out; }
    for (const dir of dirs) {
      try {
        const names = (await fs.promises.readdir(path.join(this.root, dir))).filter((f) => f.endsWith('.jsonl'));
        await Promise.all(names.map(async (f) => {
          try {
            const file = path.join(this.root, dir, f);
            const st = await fs.promises.stat(file);
            if (st.size > 0) { out.push({ file, dir, mtime: st.mtimeMs, size: st.size }); }
          } catch { /* skip unreadable */ }
        }));
      } catch { continue; }
    }
    return out;
  }

  private async doRefresh(cb?: IndexProgress): Promise<void> {
    const all = await this.listFiles();
    const seen = new Set(all.map((f) => f.file));
    const todo = all.filter((f) => {
      const c = this.chats.get(f.file);
      return !c || c.mtime !== f.mtime || c.size !== f.size;
    });
    const cold = this.chats.size === 0 && todo.length > 0;
    let removed = false;
    for (const k of [...this.chats.keys()]) { if (!seen.has(k)) { this.chats.delete(k); removed = true; } }
    let done = 0, next = 0;
    const before = this.pruned ? Date.now() - PRUNE_DAYS * 86400000 : 0;
    const worker = async () => {
      while (next < todo.length) {
        const t = todo[next++];
        try {
          const id = path.basename(t.file, '.jsonl');
          this.chats.set(t.file, await parseChat(t.file, t.dir, id, t.mtime, t.size, before));
        } catch { /* skip unreadable */ }
        cb?.(++done, todo.length);
      }
    };
    if (todo.length) { cb?.(0, todo.length); }
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
    if (todo.length || removed) {
      this.dirty = true;
      this.fmap = buildFileMap(this.list());
      if (cold) { await this.persist(); } else { this.schedulePersist(); }
      this.onChange?.();
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) { return; }
    this.persistTimer = setTimeout(() => { this.persistTimer = undefined; void this.persist(); }, PERSIST_DELAY);
  }

  /** Write the cache; above the size limit keep message text for the last 90 days only. */
  async persist(): Promise<void> {
    if (!this.dirty) { return; }
    this.dirty = false;
    try {
      await fs.promises.mkdir(path.dirname(this.cacheFile), { recursive: true });
      let bytes = await saveCache(this.cacheFile, this.chats.values(), this.pruned);
      if (bytes > CACHE_LIMIT && !this.pruned) {
        this.pruned = true;
        const cut = Date.now() - PRUNE_DAYS * 86400000;
        for (const c of this.chats.values()) { c.messages = c.messages.filter((m) => m.ts >= cut); }
        bytes = await saveCache(this.cacheFile, this.chats.values(), true);
      }
      this.cacheBytes = bytes;
    } catch { this.dirty = true; }
  }

  get isPruned(): boolean { return this.pruned; }

  /** Watch the projects folder and refresh in the background, debounced. */
  watch(): void {
    try {
      this.watcher = fs.watch(this.root, { recursive: true }, () => {
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => { void this.refresh(); }, WATCH_DELAY);
      });
      this.watcher.on('error', () => undefined);
    } catch { /* unsupported platform: refresh-before-search still keeps it current */ }
  }

  async dispose(): Promise<void> {
    this.watcher?.close();
    clearTimeout(this.watchTimer);
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    await this.persist();
  }
}
