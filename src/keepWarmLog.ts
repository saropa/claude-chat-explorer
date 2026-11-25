/**
 * Pure helpers for the keep-warm status bar: summarizing the ping log and judging heartbeat freshness.
 * No vscode import so scripts/checks/check_keepwarm.js can load the compiled out/keepWarmLog.js.
 */

/** Tail window read from log.jsonl: the log grows without bound and only today's lines matter. */
export const LOG_TAIL_BYTES = 256 * 1024;
/** A heartbeat older than this means the hook has not run for a day, which suggests Claude Code's hook format changed. */
export const HEARTBEAT_STALE_MS = 24 * 60 * 60 * 1000;

/** What the tooltip shows about today's pings. readShare is null when no tokens were recorded. */
export interface LogSummary { pings: number; cacheRead: number; cacheCreation: number; readShare: number | null }

/** Finite non-negative number or 0: log fields are null when the transcript had no usage block. */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Summarize log text (JSON lines, `t` in epoch seconds) for entries at or after `sinceMs`.
 * Parsing is defensive: the tail window starts mid-line and the file may hold garbage, so any unparseable or malformed line is skipped.
 */
export function summarizeLog(text: string, sinceMs: number): LogSummary {
  let pings = 0, cacheRead = 0, cacheCreation = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { continue; }
    let e: unknown;
    try { e = JSON.parse(line); } catch { continue; } // cut first line of the tail window or a corrupt line
    if (!e || typeof e !== 'object') { continue; }
    const o = e as Record<string, unknown>;
    // Entries without a numeric timestamp cannot be placed in "today", so they are not counted.
    if (typeof o.t !== 'number' || !Number.isFinite(o.t) || o.t * 1000 < sinceMs) { continue; }
    pings++;
    cacheRead += num(o.cache_read);
    cacheCreation += num(o.cache_creation);
  }
  const total = cacheRead + cacheCreation;
  return { pings, cacheRead, cacheCreation, readShare: total > 0 ? cacheRead / total : null };
}

/** True when the heartbeat is missing (undefined) or older than HEARTBEAT_STALE_MS at `nowMs`. */
export function heartbeatStale(lastRunMs: number | undefined, nowMs: number): boolean {
  return lastRunMs === undefined || nowMs - lastRunMs > HEARTBEAT_STALE_MS;
}

/** Parse last_run.json text into epoch ms, or undefined when absent or malformed (treated as "never ran"). */
export function parseHeartbeat(text: string | undefined): number | undefined {
  if (text === undefined) { return undefined; }
  try {
    const v = JSON.parse(text) as { t?: unknown } | null;
    return v && typeof v.t === 'number' && Number.isFinite(v.t) ? v.t : undefined;
  } catch { return undefined; }
}
