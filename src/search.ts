import { startOf } from './blob';
import { cutoffOf } from './query';
import { eachHit, Hit, matchChat, matchedBy, scoreOf, snippetOf } from './match';
import { subWinOf, topWinOf, Win } from './window';
import { mergedGit } from './gitInfo';
import { projectOf, statFields } from './stats';
import { Abort, Chat, Compiled, Ctx, Expanded, ExpandItem, Options, Rec, Result, SubResult } from './types';

/** Maximum results kept by the scanner and the webview. */
export const MAX_RESULTS = 500;
export const EXPAND_PAGE = 20;
export const MAX_SUBS = 10; // nested subagent rows sent per parent
const YIELD_MS = 8;

/** What search needs from the index. */
export interface Source { tops(): Chat[]; subsOf(p: Chat): Chat[]; rec(c: Chat): Rec; fileOf(c: Chat): string; }
export type OnResult = (r: Result | null, done: number, total: number) => void;

const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');

/** Everything one scan of the index needs. */
export interface Scan { ix: Source; c: Compiled; o: Options; ctx: Ctx; cutoff: number; now: number; }
/** A parent chat that matched: its own hit (null when only subagents matched) and its matching subagents. */
export interface Found { p: Chat; own: Hit | null; subs: Array<[Chat, Hit]>; }

export const scanOf = (ix: Source, c: Compiled, o: Options, ctx: Ctx): Scan =>
  ({ ix, c, o, ctx, cutoff: cutoffOf(o.when), now: Date.now() });

/** Lets a long scan hand the thread back every few milliseconds so cancels get through. */
export function pacer(): () => Promise<void> {
  let at = Date.now();
  return async () => {
    if (Date.now() - at <= YIELD_MS) { return; }
    await new Promise((res) => setImmediate(res));
    at = Date.now();
  };
}

/** Top-level chats in scope (time filter, project filter), newest first. */
export function candidates(ix: Source, o: Options, folders: string[], cutoff: number): Chat[] {
  const dirs = new Set(folders.map(encode));
  return ix.tops().filter((x) => x.mtime >= cutoff && (o.all || dirs.has(x.dir))).sort((a, b) => b.mtime - a.mtime);
}

function subResult(sc: Scan, s: Chat, h: Hit): SubResult {
  return {
    id: s.id, file: sc.ix.fileOf(s), type: s.agentType ?? '', desc: s.desc ?? s.title, hits: h.hits, last: s.last,
    snippet: h.snippet, ranges: h.ranges, score: scoreOf(s.desc ?? s.title, sc.c.terms, h.weightSum, s.last, sc.now),
    ...statFields(s),
  };
}

/** Matching subagents of a parent (newest first), within the time filter. */
function subHits(sc: Scan, p: Chat): Array<[Chat, Hit]> {
  const out: Array<[Chat, Hit]> = [];
  const win = subWinOf(sc.c.last, () => sc.ix.rec(p));
  for (const s of sc.ix.subsOf(p)) {
    if (s.mtime < sc.cutoff || s.last < sc.cutoff) { continue; }
    const h = matchChat(s, sc.c, sc.ctx, p.id, (x) => sc.ix.rec(x), sc.now, win);
    if (h) { out.push([s, h]); }
  }
  return out;
}

const GIT_KINDS = ['sha', 'pr', 'branch'];

/** The parent as git tokens see it: its git data plus the subagents that did not match, so a commit held by a matched subagent counts once (on the subagent). */
export function gitView(sc: Scan, p: Chat, matched: Chat[]): Chat {
  if (!sc.o.subs || !sc.c.tokens.some((t) => GIT_KINDS.includes(t.kind))) { return p; }
  return { ...p, git: mergedGit(p, sc.ix.subsOf(p).filter((s) => !matched.includes(s))) };
}

/** Match one parent chat and its subagents; null when nothing matched. */
export function findIn(sc: Scan, p: Chat): Found | null {
  const subs = sc.o.subs ? subHits(sc, p) : [];
  const own = matchChat(gitView(sc, p, subs.map(([s]) => s)), sc.c, sc.ctx, p.id, (x) => sc.ix.rec(x), sc.now, topWinOf(sc.c.last));
  const self = own && p.last >= sc.cutoff ? own : null;
  return self || subs.length ? { p, own: self, subs } : null;
}

/** One parent row: its own match plus matching subagents. Subagent hits add to hits and score. */
export function toResult(sc: Scan, f: Found, maxSubs: number = MAX_SUBS): Result {
  const { p, own, subs } = f;
  const hits = (own?.hits ?? 0) + subs.reduce((a, [, h]) => a + h.hits, 0);
  const weight = (own?.weightSum ?? 0) + subs.reduce((a, [, h]) => a + h.weightSum, 0);
  const snip = own ?? subs[0][1];
  const r: Result = {
    file: sc.ix.fileOf(p), id: p.id, title: p.title, hits, last: p.last, project: projectOf(p), ...statFields(p, sc.o.subs ? sc.ix.subsOf(p) : []),
    snippet: snip.snippet, ranges: snip.ranges, score: scoreOf(p.title, sc.c.terms, weight, p.last, sc.now), self: !!own,
  };
  if (subs.length) { r.subs = subs.slice(0, maxSubs).map(([s, h]) => subResult(sc, s, h)); r.subTotal = subs.length; }
  return r;
}

/** Pinned chats first, then score (the display order of results). */
export const rank = (rs: Result[], ctx: Ctx): Result[] => {
  const pin = (r: Result) => (ctx.pins.has(r.id) ? 1 : 0);
  return rs.sort((a, b) => pin(b) - pin(a) || b.score - a.score);
};

/** Search the index newest chat first; streams one callback per chat and yields so cancels get through. */
export async function searchIndex(
  ix: Source, c: Compiled, o: Options, folders: string[], ctx: Ctx, sig: Abort, onResult?: OnResult,
): Promise<Result[]> {
  const sc = scanOf(ix, c, o, ctx);
  const todo = candidates(ix, o, folders, sc.cutoff);
  const out: Result[] = [];
  const pace = pacer();
  for (let i = 0; i < todo.length && !sig.aborted; i++) {
    const f = findIn(sc, todo[i]);
    const r = f ? toResult(sc, f) : null;
    if (r) { out.push(r); }
    onResult?.(r, i + 1, todo.length);
    await pace();
  }
  return rank(out, ctx).slice(0, MAX_RESULTS);
}

interface MsgHit { rec: Rec; i: number; first: number; sub?: string; }

/** Messages of a record with a match for any term, with the earliest match offset. */
function messageHits(rec: Rec, terms: RegExp[], win?: Win, sub?: string): MsgHit[] {
  const first = new Map<number, number>();
  for (const re of terms) { eachHit(rec, re, (i, at) => { if (!first.has(i) || at < first.get(i)!) { first.set(i, at); } }, win); }
  return [...first].map(([i, at]) => ({ rec, i, first: at, sub }));
}

function itemOf(h: MsgHit, terms: RegExp[]): ExpandItem {
  const text = h.rec.text.slice(startOf(h.rec, h.i), h.rec.ends[h.i]);
  const it: ExpandItem = { role: h.rec.roles[h.i] === 0 ? 'user' : 'assistant', ts: h.rec.ts[h.i], ...snippetOf(text, h.first, terms, 100, 200) };
  if (h.sub !== undefined) { it.sub = h.sub; }
  return it;
}

/** Matched files and commands of one chat for the active file:, edited: and cmd: tokens. */
function tokenFinds(chat: Chat, rec: Rec, c: Compiled, ctx: Ctx, files: Map<string, boolean>, cmds: Set<string>, win?: Win): void {
  for (const t of c.tokens) {
    if (t.kind === 'cmd') { matchedBy(chat, rec, t, ctx, chat.id, win).forEach((s) => cmds.add(s)); }
    if (t.kind === 'file' || t.kind === 'edited') {
      for (const p of matchedBy(chat, rec, t, ctx, chat.id)) { files.set(p, files.get(p) || chat.files.some((f) => f.path === p && f.edited)); }
    }
  }
}

export const MAX_EXPAND_COMMITS = 100;

/** PRs and commits of a chat and its subagents for the expanded Git section (commits capped). */
function gitOf(ix: Source, chat: Chat, subs: boolean): Expanded['git'] {
  const g = mergedGit(chat, subs ? ix.subsOf(chat) : []);
  return {
    prs: g.prs.map(([number, repository]) => ({ number, repository })),
    commits: g.commits.slice(0, MAX_EXPAND_COMMITS).map(([sha, branch]) => ({ sha, branch })),
    moreCommits: Math.max(0, g.commits.length - MAX_EXPAND_COMMITS),
  };
}

/** Matching messages of a chat and its matching subagents (newest first), plus matched files and commands. */
export function expandChat(ix: Source, chat: Chat, c: Compiled, o: Options, ctx: Ctx, offset: number): Expanded {
  const now = Date.now(), cutoff = cutoffOf(o.when);
  const rec = ix.rec(chat);
  const files = new Map<string, boolean>(), commands = new Set<string>();
  const tw = topWinOf(c.last)?.(rec);
  let hits = c.terms.length ? messageHits(rec, c.terms, tw) : [];
  tokenFinds(chat, rec, c, ctx, files, commands, tw);
  const sc: Scan = { ix, c, o, ctx, cutoff, now };
  const sw = subWinOf(c.last, () => rec);
  for (const [s] of o.subs ? subHits(sc, chat) : []) {
    const sr = ix.rec(s);
    const w = sw?.(sr);
    if (c.terms.length) { hits = hits.concat(messageHits(sr, c.terms, w, s.agentType ?? '')); }
    tokenFinds(s, sr, c, ctx, files, commands, w);
  }
  hits.sort((a, b) => b.rec.ts[b.i] - a.rec.ts[a.i]);
  return {
    items: hits.slice(offset, offset + EXPAND_PAGE).map((h) => itemOf(h, c.terms)), total: hits.length,
    files: [...files].slice(0, 50).map(([p, edited]) => ({ path: p, edited })),
    commands: [...commands].slice(0, 50), related: [], git: gitOf(ix, chat, o.subs),
  };
}
