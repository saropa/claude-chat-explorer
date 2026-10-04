import { ctxInfo } from './contextWindow';
import { cutoffOf } from './query';
import { clampMax, DEFAULT_MAX_RESULTS } from './limits';
import { candidates, Source } from './search';
import { projectOf, statFields } from './stats';
import { Chat, Options, Result } from './types';

/** Row for a chat from index metadata only (no text read): no hits and no snippet. */
export const rowOf = (ix: Source, c: Chat, subs: boolean): Result => ({
  file: ix.fileOf(c), id: c.id, title: c.title, hits: 0, last: c.last, snippet: '', ranges: [], score: 0,
  project: projectOf(c), ...statFields(c, subs ? ix.subsOf(c) : []),
});

type Cmp = (a: Chat, b: Chat) => number;
const ctxKey = (c: Chat): number => { const x = ctxInfo(c.use); return x ? x.pct * 1e9 + x.tokens : -1; }; // chats without data sort last
const BY: { [k: string]: Cmp } = {
  title: (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
  length: (a, b) => b.count - a.count,
  context: (a, b) => ctxKey(b) - ctxKey(a),
  cost: (a, b) => (b.cost?.usd ?? 0) - (a.cost?.usd ?? 0),
};

export interface SessionRows { rows: Result[]; total: number; arch: Result[]; archTotal: number; max: number; }

/** Chats in scope (When, All projects) as rows, pinned first, then by sort (Score means Time); at most maxRows each for live and archived chats. total counts the live ones in scope. */
export function sessionRows(ix: Source, o: Options, folders: string[], sort: string, pins: Set<string>, archived: Set<string> = new Set(), maxRows: number = DEFAULT_MAX_RESULTS): SessionRows {
  const max = clampMax(maxRows);
  const cutoff = cutoffOf(o.when);
  const all = candidates(ix, o, folders, cutoff).filter((c) => c.last >= cutoff);
  const by = BY[sort] ?? ((a: Chat, b: Chat) => b.last - a.last);
  const pin = (c: Chat) => (pins.has(c.id) ? 1 : 0);
  all.sort((a, b) => pin(b) - pin(a) || by(a, b));
  const live = all.filter((c) => !archived.has(c.id)), arch = all.filter((c) => archived.has(c.id));
  const rows = (a: Chat[]) => a.slice(0, max).map((c) => rowOf(ix, c, o.subs));
  return { rows: rows(live), total: live.length, arch: rows(arch), archTotal: arch.length, max };
}
