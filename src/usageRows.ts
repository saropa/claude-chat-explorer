/** Worker side of the usage summary, status bar and bulk archive: one small row per indexed chat (index metadata only, no text read). */
import { ctxInfo } from './contextWindow';
import { projectOf } from './stats';
import { Chat } from './types';

export interface UsageRow { id: string; title: string; last: number; usd: number; model: string; project: string; msgs: number; size: number; pct: number; }
interface Source { tops(): Chat[]; }

/** Top-level chats as rows. Cost is the chat's own total, so a day, week or project figure counts a chat on the day it was last active; model is the costliest one (the index keeps no per-model split). pct is -1 without usage data. */
export function usageRows(ix: Source): UsageRow[] {
  return ix.tops().map((c) => ({
    id: c.id, title: c.title, last: c.last, usd: c.cost?.usd ?? 0, model: c.cost?.models[0] ?? '', project: projectOf(c), msgs: c.count, size: c.size, pct: ctxInfo(c.use)?.pct ?? -1,
  }));
}
