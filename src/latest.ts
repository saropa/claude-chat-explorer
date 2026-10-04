import { Hit } from './match';
import { Chat, Result } from './types';

/** The newest match of a found chat across the chat itself and its matching subagents. */
export interface Latest { hit: Hit; sub?: Chat; }

/** Newest match by message time (the main thread wins a tie); with no timed match (tokens only), own first, then the first subagent. */
export function latestOf(own: Hit | null, subs: Array<[Chat, Hit]>): Latest {
  let best: Latest | undefined = own ? { hit: own } : undefined;
  for (const [s, h] of subs) { if (!best || h.at > best.hit.at) { best = { hit: h, sub: s }; } }
  return best!;
}

/** Row fields of the newest match: its time, source and the matching message count of the whole row. */
export function latestFields(l: Latest, own: Hit | null, subs: Array<[Chat, Hit]>): Partial<Result> {
  const out: Partial<Result> = { mc: (own?.mc ?? 0) + subs.reduce((a, [, h]) => a + h.mc, 0) };
  if (l.hit.at > 0) { out.snipAt = l.hit.at; }
  if (l.sub) { out.snipSub = l.sub.agentType ?? ''; out.snipDesc = l.sub.desc ?? l.sub.title; }
  else if (l.hit.role >= 0) { out.snipRole = l.hit.role === 0 ? 'user' : 'assistant'; }
  return out;
}
