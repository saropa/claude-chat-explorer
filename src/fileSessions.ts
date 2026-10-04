/** Chats that touched one file: exact path match, plus the same workspace-relative path in a sibling git worktree. */
import { ctxInfo } from './contextWindow';
import { mergedGit } from './gitInfo';
import { RecReader } from './recReader';
import { statusesOf } from './status';
import { Chat } from './types';

export const MAX_FILE_SESSIONS = 200;
const CASE_FOLD = process.platform === 'darwin' || process.platform === 'win32';

export interface FileSession {
  id: string; title: string; edited: boolean; last: number; status: string[];
  project: string; // project folder path when resolved, else the encoded folder name
  branch?: string; viaSub: boolean; onlySub: boolean; worktree: boolean;
}
export interface FileSessionsReply { indexing: boolean; rel?: string; total: number; edited: number; items: FileSession[]; }

/** Forward slashes, no trailing slash, case-folded where the file system is. */
export function normPath(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return CASE_FOLD ? s.toLowerCase() : s;
}
/** Claude Code's project folder name for a path: every non-alphanumeric becomes a dash. */
export const encodeDir = (p: string): string => p.replace(/[^A-Za-z0-9]/g, '-');
const fold = (s: string): string => (CASE_FOLD ? s.toLowerCase() : s);

interface Hit { chat: Chat; edited: boolean; path: string; worktree: boolean; }
interface Cache { gen: number; map: Map<string, Hit[]>; tops: Map<string, Chat>; }
const caches = new WeakMap<RecReader, Cache>();

/** Path to hits and parent lookup, rebuilt only when the index changed. */
function cacheOf(ix: RecReader): Cache {
  const hit = caches.get(ix);
  if (hit && hit.gen === ix.gen) { return hit; }
  const map = new Map<string, Hit[]>(), tops = new Map<string, Chat>();
  for (const c of ix.all()) {
    if (!c.parent) { tops.set(c.dir + '/' + c.id, c); }
    for (const f of c.files) {
      const k = normPath(f.path), h: Hit = { chat: c, edited: f.edited, path: f.path, worktree: false };
      const l = map.get(k);
      if (l) { l.push(h); } else { map.set(k, [h]); }
    }
  }
  const out = { gen: ix.gen, map, tops };
  caches.set(ix, out);
  return out;
}

/** The workspace root that contains the file, and the file's path relative to it. */
export function relativeTo(file: string, roots: string[]): { root: string; rel: string } | undefined {
  const f = normPath(file);
  for (const r of roots) {
    const n = normPath(r);
    if (f.startsWith(n + '/')) { return { root: r, rel: file.replace(/\\/g, '/').slice(n.length + 1) }; }
  }
  return undefined;
}

/** The project folder a chat ran in: the prefix of the file path whose encoding is the chat's folder name. */
export function projectRoot(filePath: string, dir: string): string | undefined {
  const p = filePath.replace(/\\/g, '/'), want = fold(dir);
  for (let i = p.lastIndexOf('/'); i > 0; i = p.lastIndexOf('/', i - 1)) {
    if (fold(encodeDir(p.slice(0, i))) === want) { return p.slice(0, i); }
  }
  return undefined;
}

/** True when base is a sibling folder of the workspace root whose name starts with the root's name (contacts-wt-x for contacts). */
function isSiblingRoot(base: string, root: string): boolean {
  const r = fold(root.replace(/\\/g, '/').replace(/\/+$/, '')), b = fold(base), cut = r.lastIndexOf('/');
  return b.startsWith(r.slice(0, cut + 1)) && !b.slice(cut + 1).includes('/') && b.slice(cut + 1).startsWith(r.slice(cut + 1) + '-');
}

/** Rule b: same relative path under a sibling worktree, found by the chat's project folder or by the file's own folder. */
function siblingHit(c: Chat, f: { path: string; edited: boolean }, tail: string, root: string): Hit | undefined {
  const p = f.path.replace(/\\/g, '/');
  if (!fold(p).endsWith(tail)) { return undefined; }
  const base = p.slice(0, p.length - tail.length);
  const byDir = fold(c.dir).startsWith(fold(encodeDir(root)) + '-') && projectRoot(p, c.dir) === base;
  return byDir || isSiblingRoot(base, root) ? { chat: c, edited: f.edited, path: f.path, worktree: true } : undefined;
}

/** Every sibling-worktree hit for the relative path (scans all chats; the file test is a cheap suffix check). */
function siblingHits(ix: RecReader, root: string, rel: string): Hit[] {
  const tail = fold('/' + rel), out: Hit[] = [];
  for (const c of ix.all()) {
    for (const f of c.files) {
      const h = siblingHit(c, f, tail, root);
      if (h) { out.push(h); }
    }
  }
  return out;
}

interface Group { top: Chat; edited: boolean; viaSub: boolean; self: boolean; worktree: boolean; path: string; sub?: Chat; }

/** One group per parent session; a subagent hit counts toward its parent once. */
function group(hits: Hit[], tops: Map<string, Chat>): Group[] {
  const by = new Map<string, Group>();
  for (const h of hits) {
    const key = h.chat.dir + '/' + (h.chat.parent ?? h.chat.id), top = tops.get(key);
    if (!top) { continue; } // no parent chat to resume
    const g = by.get(key) ?? { top, edited: false, viaSub: false, self: false, worktree: false, path: h.path };
    g.edited ||= h.edited;
    if (h.chat.parent) { g.viaSub = true; g.sub ??= h.chat; } else { g.self = true; }
    g.worktree ||= h.worktree;
    by.set(key, g);
  }
  return [...by.values()];
}

function toSession(g: Group, ix: RecReader, pins: Set<string>, now: number, dots: { [id: string]: string }): FileSession {
  const c = g.top, git = mergedGit(c, g.sub ? [g.sub] : []);
  const st = statusesOf({ msgs: c.count, last: c.last, size: c.size, ctx: ctxInfo(c.use) }, pins.has(c.id), now, dots[c.id]);
  return { id: c.id, title: c.title, edited: g.edited, last: c.last, status: st, project: projectRoot(g.path, c.dir) ?? c.dir,
    branch: git.branches[git.branches.length - 1], viaSub: g.viaSub, onlySub: g.viaSub && !g.self, worktree: g.worktree };
}

/** Chats that touched the file, edited first, each group newest first; items capped at MAX_FILE_SESSIONS. */
export function fileSessionsOf(ix: RecReader, file: string, roots: string[], pins: Set<string>, now = Date.now(), dots: { [id: string]: string } = {}): FileSessionsReply {
  const { map, tops } = cacheOf(ix), at = relativeTo(file, roots);
  const hits = [...(map.get(normPath(file)) ?? []), ...(at ? siblingHits(ix, at.root, at.rel) : [])];
  const all = group(hits, tops).map((g) => toSession(g, ix, pins, now, dots))
    .sort((a, b) => Number(b.edited) - Number(a.edited) || b.last - a.last);
  return { indexing: false, rel: at?.rel, total: all.length, edited: all.filter((s) => s.edited).length, items: all.slice(0, MAX_FILE_SESSIONS) };
}
