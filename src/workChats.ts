/** Worker side of the Open Work page: the chats in scope as light rows (index metadata only). */
import { ctxInfo } from './contextWindow';
import { Source } from './search';
import { encode } from './wipChats';
import { projectOf } from './stats';
import { sumTok, TokenTotals } from './tokens';
import { Chat, CtxInfo } from './types';

const MAX_ROWS = 2000;
const DAY_MS = 86400000;

/** cwd is the working folder of the chat ('' when unknown). It stays on the host: the page only gets an opaque folder key. */
export interface OpenWorkRow { id: string; title: string; project: string; last: number; pinned: boolean; cwd: string; ctx?: CtxInfo; tok?: TokenTotals; }
export interface OpenWorkReply { indexing: boolean; rows: OpenWorkRow[]; total: number; }
export interface OpenWorkScope { days: number; now: number; live: Set<string>; archived: Set<string>; pins: Set<string>; folders?: string[]; }

/** Chats active in the last N days, plus live chats, minus archived ones; newest first, at most 2000. total counts them all. */
export function openWorkRows(ix: Source, s: OpenWorkScope): { rows: OpenWorkRow[]; total: number } {
  const since = s.now - s.days * DAY_MS;
  const all = ix.tops().filter((c) => (c.last >= since || s.live.has(c.id)) && !s.archived.has(c.id)).sort((a, b) => b.last - a.last);
  const rows = all.slice(0, MAX_ROWS).map((c): OpenWorkRow => {
    const r: OpenWorkRow = { id: c.id, title: c.title, project: projectOf(c), last: c.last, pinned: s.pins.has(c.id), cwd: c.cwd ?? (s.folders ?? []).find((f) => encode(f) === c.dir) ?? '' };
    const x = ctxInfo(c.use);
    if (x) { r.ctx = x; }
    const t = chatTotals(ix, c);
    if (t.replies) { r.tok = t; }
    return r;
  });
  return { rows, total: all.length };
}

/** Cumulative tokens of a chat: its own file plus its subagent files. Never reset by a compaction. */
export function chatTotals(ix: Source, c: Chat): TokenTotals {
  const t = sumTok([c, ...ix.subsOf(c)]);
  t.compactions = c.use?.comp ?? 0;
  return t;
}

/** Sum of the chat totals of one work item. key is a branch name, or a pull request number ("123" or "#123"); a chat belongs to it when its rows
 *  named the branch (gitBranch) or its tool calls touched it, or when it opened that pull request. undefined when no chat belongs to it. */
export function workTotals(ix: Source, key: string): TokenTotals | undefined {
  const hit = workChats(ix, key);
  if (!hit.length) { return undefined; }
  const out = sumTok([]);
  for (const c of hit) { const t = chatTotals(ix, c); out.input += t.input; out.output += t.output; out.cacheRead += t.cacheRead; out.cacheWrite += t.cacheWrite; out.replies += t.replies; out.compactions += t.compactions; }
  return out;
}

/** The top-level chats of one work item (same match as workTotals). */
export function workChats(ix: Source, key: string): Chat[] {
  const pr = /^(#?)(\d{1,9})$/.exec(key.trim());
  const br = key.trim(), byBr = (c: Chat) => !!br && ((c.seen ?? []).includes(br) || (c.git?.branches ?? []).includes(br));
  const n = pr ? Number(pr[2]) : 0, tops = ix.tops();
  const usePr = n > 0 && (!!pr![1] || !tops.some(byBr)); // a bare number is a pull request only when no chat knows a branch of that name
  return tops.filter((c) => (usePr && (c.git?.prs ?? []).some((p) => p[0] === n)) || (!(usePr && pr![1]) && byBr(c)));
}
