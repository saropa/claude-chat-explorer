/** Worker side of the Open Work page: the chats in scope as light rows (index metadata only). */
import { ctxInfo } from './contextWindow';
import { Source } from './search';
import { projectOf } from './stats';
import { CtxInfo } from './types';

const MAX_ROWS = 2000;
const DAY_MS = 86400000;

export interface OpenWorkRow { id: string; title: string; project: string; last: number; pinned: boolean; ctx?: CtxInfo; }
export interface OpenWorkReply { indexing: boolean; rows: OpenWorkRow[]; total: number; }
export interface OpenWorkScope { days: number; now: number; live: Set<string>; archived: Set<string>; pins: Set<string>; }

/** Chats active in the last N days, plus live chats, minus archived ones; newest first, at most 2000. total counts them all. */
export function openWorkRows(ix: Source, s: OpenWorkScope): { rows: OpenWorkRow[]; total: number } {
  const since = s.now - s.days * DAY_MS;
  const all = ix.tops().filter((c) => (c.last >= since || s.live.has(c.id)) && !s.archived.has(c.id)).sort((a, b) => b.last - a.last);
  const rows = all.slice(0, MAX_ROWS).map((c): OpenWorkRow => {
    const r: OpenWorkRow = { id: c.id, title: c.title, project: projectOf(c), last: c.last, pinned: s.pins.has(c.id) };
    const x = ctxInfo(c.use);
    if (x) { r.ctx = x; }
    return r;
  });
  return { rows, total: all.length };
}
