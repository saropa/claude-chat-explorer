import { cutoffOf } from './query';
import { candidates, MAX_RESULTS, Source } from './search';
import { projectOf, statFields } from './stats';
import { Chat, Options, Result } from './types';

/** Row for a chat from index metadata only (no text read): no hits and no snippet. */
export const rowOf = (ix: Source, c: Chat, subs: boolean): Result => ({
  file: ix.fileOf(c), id: c.id, title: c.title, hits: 0, last: c.last, snippet: '', ranges: [], score: 0,
  project: projectOf(c), ...statFields(c, subs ? ix.subsOf(c) : []),
});

type Cmp = (a: Chat, b: Chat) => number;
const BY: { [k: string]: Cmp } = {
  title: (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
  length: (a, b) => b.count - a.count,
  cost: (a, b) => (b.cost?.usd ?? 0) - (a.cost?.usd ?? 0),
};

/** Chats in scope (When, All projects) as rows, pinned first, then by sort (Score means Time); at most MAX_RESULTS. total counts all in scope. */
export function sessionRows(ix: Source, o: Options, folders: string[], sort: string, pins: Set<string>): { rows: Result[]; total: number } {
  const cutoff = cutoffOf(o.when);
  const all = candidates(ix, o, folders, cutoff).filter((c) => c.last >= cutoff);
  const by = BY[sort] ?? ((a: Chat, b: Chat) => b.last - a.last);
  const pin = (c: Chat) => (pins.has(c.id) ? 1 : 0);
  all.sort((a, b) => pin(b) - pin(a) || by(a, b));
  return { rows: all.slice(0, MAX_RESULTS).map((c) => rowOf(ix, c, o.subs)), total: all.length };
}
