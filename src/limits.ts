/** Result caps shared by the worker, the host and the panel. */
export const DEFAULT_MAX_RESULTS = 500;
export const MIN_MAX_RESULTS = 50;
export const MAX_MAX_RESULTS = 2000;
export const HIT_DISPLAY_CAP = 9999; // a chat shows "9,999+" above this
export const HIT_TOTAL_CAP = 1000000; // counting of all hits stops here

/** The setting value as a whole number inside its allowed range; the default for anything else. */
export function clampMax(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) { return DEFAULT_MAX_RESULTS; }
  return Math.min(MAX_MAX_RESULTS, Math.max(MIN_MAX_RESULTS, n));
}

/** Running totals of a scan: every matching chat and hit, counted even past the row cap. */
export interface Tally { chats: number; hits: number; hitsCapped: boolean; }
export const newTally = (): Tally => ({ chats: 0, hits: 0, hitsCapped: false });

/** Add one chat's hits to the tally; the total stops at HIT_TOTAL_CAP. */
export function tallyAdd(t: Tally, hits: number): void {
  t.chats++;
  if (t.hits + hits > HIT_TOTAL_CAP) { t.hits = HIT_TOTAL_CAP; t.hitsCapped = true; } else { t.hits += hits; }
}

/** Totals as sent to the panel; capped when matching chats exceed max. */
export const totalsOf = (t: Tally, max: number) => ({ totalChats: t.chats, totalHits: t.hits, capped: t.chats > max, hitsCapped: t.hitsCapped, max });
