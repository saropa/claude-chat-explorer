import { startOf } from './blob';
import { cutoffOf } from './query';
import { eachHit, Hit, matchChat, matchedBy, scoreOf, snippetOf } from './match';
import { projectOf, statFields } from './stats';
import { Abort, Chat, Compiled, Ctx, Expanded, ExpandItem, Options, Rec, Result, SubResult } from './types';

/** Maximum results kept by the scanner and the webview. */
export const MAX_RESULTS = 500;
export const EXPAND_PAGE = 20;
export const MAX_SUBS = 10; // nested subagent rows sent per parent
const YIELD_MS = 8;

/** What search needs from the index. */
export interface Source { tops(): Chat[]; subsOf(id: string): Chat[]; rec(c: Chat): Rec; fileOf(c: Chat): string; }
export type OnResult = (r: Result | null, done: number, total: number) => void;

const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');

function subResult(ix: Source, s: Chat, h: Hit, c: Compiled, now: number): SubResult {
  return {
    id: s.id, file: ix.fileOf(s), type: s.agentType ?? '', desc: s.desc ?? s.title, hits: h.hits, last: s.last,
    snippet: h.snippet, ranges: h.ranges, score: scoreOf(s.desc ?? s.title, c.terms, h.weightSum, s.last, now),
    ...statFields(s),
  };
}

/** Matching subagents of a parent (newest first), within the time filter. */
function subHits(ix: Source, p: Chat, c: Compiled, ctx: Ctx, cutoff: number, now: number): Array<[Chat, Hit]> {
  const out: Array<[Chat, Hit]> = [];
  for (const s of ix.subsOf(p.id)) {
    if (s.mtime < cutoff || s.last < cutoff) { continue; }
    const h = matchChat(s, c, ctx, p.id, (x) => ix.rec(x), now);
    if (h) { out.push([s, h]); }
  }
  return out;
}

/** One parent row: its own match plus matching subagents. Subagent hits add to hits and score. */
function scanParent(ix: Source, p: Chat, c: Compiled, o: Options, ctx: Ctx, cutoff: number, now: number): Result | null {
  const own = matchChat(p, c, ctx, p.id, (x) => ix.rec(x), now);
  const self = own && p.last >= cutoff ? own : null;
  const subs = o.subs ? subHits(ix, p, c, ctx, cutoff, now) : [];
  if (!self && !subs.length) { return null; }
  const hits = (self?.hits ?? 0) + subs.reduce((a, [, h]) => a + h.hits, 0);
  const weight = (self?.weightSum ?? 0) + subs.reduce((a, [, h]) => a + h.weightSum, 0);
  const snip = self ?? subs[0][1];
  const r: Result = {
    file: ix.fileOf(p), id: p.id, title: p.title, hits, last: p.last, project: projectOf(p), ...statFields(p),
    snippet: snip.snippet, ranges: snip.ranges, score: scoreOf(p.title, c.terms, weight, p.last, now), self: !!self,
  };
  if (subs.length) { r.subs = subs.slice(0, MAX_SUBS).map(([s, h]) => subResult(ix, s, h, c, now)); r.subTotal = subs.length; }
  return r;
}

/** Search the index newest chat first; streams one callback per chat and yields so cancels get through. */
export async function searchIndex(
  ix: Source, c: Compiled, o: Options, folders: string[], ctx: Ctx, sig: Abort, onResult?: OnResult,
): Promise<Result[]> {
  const cutoff = cutoffOf(o.when);
  const dirs = new Set(folders.map(encode));
  const todo = ix.tops().filter((x) => x.mtime >= cutoff && (o.all || dirs.has(x.dir))).sort((a, b) => b.mtime - a.mtime);
  const out: Result[] = [];
  const now = Date.now();
  let lastYield = Date.now();
  for (let i = 0; i < todo.length && !sig.aborted; i++) {
    const r = scanParent(ix, todo[i], c, o, ctx, cutoff, now);
    if (r) { out.push(r); }
    onResult?.(r, i + 1, todo.length);
    if (Date.now() - lastYield > YIELD_MS) {
      await new Promise((res) => setImmediate(res));
      lastYield = Date.now();
    }
  }
  const pin = (r: Result) => (ctx.pins.has(r.id) ? 1 : 0);
  return out.sort((a, b) => pin(b) - pin(a) || b.score - a.score).slice(0, MAX_RESULTS);
}

interface MsgHit { rec: Rec; i: number; first: number; sub?: string; }

/** Messages of a record with a match for any term, with the earliest match offset. */
function messageHits(rec: Rec, terms: RegExp[], sub?: string): MsgHit[] {
  const first = new Map<number, number>();
  for (const re of terms) { eachHit(rec, re, (i, at) => { if (!first.has(i) || at < first.get(i)!) { first.set(i, at); } }); }
  return [...first].map(([i, at]) => ({ rec, i, first: at, sub }));
}

function itemOf(h: MsgHit, terms: RegExp[]): ExpandItem {
  const text = h.rec.text.slice(startOf(h.rec, h.i), h.rec.ends[h.i]);
  const it: ExpandItem = { role: h.rec.roles[h.i] === 0 ? 'user' : 'assistant', ts: h.rec.ts[h.i], ...snippetOf(text, h.first, terms, 100, 200) };
  if (h.sub !== undefined) { it.sub = h.sub; }
  return it;
}

/** Matched files and commands of one chat for the active file:, edited: and cmd: tokens. */
function tokenFinds(chat: Chat, rec: Rec, c: Compiled, ctx: Ctx, files: Map<string, boolean>, cmds: Set<string>): void {
  for (const t of c.tokens) {
    if (t.kind === 'cmd') { matchedBy(chat, rec, t, ctx, chat.id).forEach((s) => cmds.add(s)); }
    if (t.kind === 'file' || t.kind === 'edited') {
      for (const p of matchedBy(chat, rec, t, ctx, chat.id)) { files.set(p, files.get(p) || chat.files.some((f) => f.path === p && f.edited)); }
    }
  }
}

/** Matching messages of a chat and its matching subagents (newest first), plus matched files and commands. */
export function expandChat(ix: Source, chat: Chat, c: Compiled, o: Options, ctx: Ctx, offset: number): Expanded {
  const now = Date.now(), cutoff = cutoffOf(o.when);
  const rec = ix.rec(chat);
  const files = new Map<string, boolean>(), commands = new Set<string>();
  let hits = c.terms.length ? messageHits(rec, c.terms) : [];
  tokenFinds(chat, rec, c, ctx, files, commands);
  for (const [s] of o.subs ? subHits(ix, chat, c, ctx, cutoff, now) : []) {
    const sr = ix.rec(s);
    if (c.terms.length) { hits = hits.concat(messageHits(sr, c.terms, s.agentType ?? '')); }
    tokenFinds(s, sr, c, ctx, files, commands);
  }
  hits.sort((a, b) => b.rec.ts[b.i] - a.rec.ts[a.i]);
  return {
    items: hits.slice(offset, offset + EXPAND_PAGE).map((h) => itemOf(h, c.terms)), total: hits.length,
    files: [...files].slice(0, 50).map(([p, edited]) => ({ path: p, edited })),
    commands: [...commands].slice(0, 50), related: [],
  };
}
