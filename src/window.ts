import { From, Rec } from './types';

/** Messages of a record that may match: index at or after from, timestamp at or after minTs, and (when set) only this role (0 user, 1 assistant). */
export interface Win { from: number; minTs: number; role?: number; }
export type WinOf = (rec: Rec) => Win;

/** Window of the final n messages of a top-level chat. */
export const topWin = (n: number, rec: Rec): Win => ({ from: Math.max(0, rec.ts.length - n), minTs: 0 });

/** Window of a subagent: messages not older than the parent's nth-last message (all when the parent is shorter). */
export function subWin(n: number, parent: Rec): Win {
  const k = parent.ts.length - n;
  return { from: 0, minTs: k >= 0 ? parent.ts[k] || 0 : 0 };
}

/** True when message i is inside the window; a missing timestamp is always inside. */
export const inWin = (w: Win, rec: Rec, i: number): boolean =>
  i >= w.from && (!w.minTs || !rec.ts[i] || rec.ts[i] >= w.minTs) && (w.role === undefined || rec.roles[i] === w.role);

/** Window factory for a top-level chat; undefined when no message limit and no author choice is set. */
export function topWinOf(n: number, from: From = 'both'): WinOf | undefined {
  if (n <= 0 && from === 'both') { return undefined; }
  const role = from === 'you' ? 0 : from === 'claude' ? 1 : undefined;
  return (rec) => ({ ...(n > 0 ? topWin(n, rec) : { from: 0, minTs: 0 }), role });
}

/** True when subagents are left out: their messages count as Claude's, so a you-only search has none. */
export const noSubs = (from: From | undefined): boolean => from === 'you';

/** Window factory for the subagents of one parent; the parent record is decoded once, on first use. */
export function subWinOf(n: number, parent: () => Rec): WinOf | undefined {
  if (n <= 0) { return undefined; }
  let rec: Rec | undefined;
  return () => subWin(n, (rec ??= parent()));
}
