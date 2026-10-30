/** Account and token-usage numbers for the sidebar's Account & Usage section. Pure parts here; the worker does the file reads. */
export const HOUR_MS = 3600000;
export const WINDOWS = { h5: 5 * HOUR_MS, d7: 7 * 24 * HOUR_MS };

export interface Account { email: string; name: string; org: string; plan: string; }
/** One billed assistant reply: time, then input, output, cache read and cache write tokens, then the message id ('' when absent). */
export type Ev = [number, number, number, number, number, string];
export interface Tokens { io: number; cache: number; }
export interface Totals { h5: Tokens; d7: Tokens; }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && v > 0 ? v : 0);

/** oauthAccount of ~/.claude.json text; null when it is missing, unreadable or has no email. */
export function accountOf(text: string): Account | null {
  try {
    const a = JSON.parse(text)?.oauthAccount;
    const email = str(a?.emailAddress);
    return email ? { email, name: str(a.displayName), org: str(a.organizationName), plan: str(a.seatTier) || str(a.organizationType) || str(a.billingType) } : null;
  } catch { return null; }
}

/** The usage event of one transcript line; undefined for any other line. Streamed replies repeat per message id: merge them with dedupe. */
export function eventOf(line: string): Ev | undefined {
  if (!line.includes('"usage"')) { return undefined; }
  try {
    const o = JSON.parse(line), u = o?.message?.usage, at = Date.parse(str(o?.timestamp));
    if (o?.type !== 'assistant' || !u || Number.isNaN(at)) { return undefined; }
    return [at, num(u.input_tokens), num(u.output_tokens), num(u.cache_read_input_tokens), num(u.cache_creation_input_tokens), str(o.message.id)];
  } catch { return undefined; }
}

/** One event per message id across all files (resumed or copied sessions repeat ids); of repeats the line with the most output tokens wins, as streamed lines can grow. */
export function dedupe(evs: Iterable<Ev>): Ev[] {
  const byId = new Map<string, number>(), out: Ev[] = [];
  for (const e of evs) {
    const id = e[5], at = id ? byId.get(id) : undefined;
    if (at === undefined) { if (id) { byId.set(id, out.length); } out.push(e); continue; }
    if (e[2] > out[at][2]) { out[at] = e; }
  }
  return out;
}

/** Token sums of the rolling last 5 hours and 7 days: io is input plus output, cache is cache read plus write. */
export function totals(evs: Iterable<Ev>, now: number): Totals {
  const t: Totals = { h5: { io: 0, cache: 0 }, d7: { io: 0, cache: 0 } };
  for (const [at, i, o, cr, cw] of evs) {
    if (at > now) { continue; }
    for (const k of ['h5', 'd7'] as const) {
      if (now - at < WINDOWS[k]) { t[k].io += i + o; t[k].cache += cr + cw; }
    }
  }
  return t;
}
