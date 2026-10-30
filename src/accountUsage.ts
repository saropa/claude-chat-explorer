/** Account and token-usage numbers for the sidebar's Account & Usage section. Pure parts here; the worker does the file reads. */
export const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
export const WINDOWS = { h5: 5 * HOUR_MS, d3: 3 * DAY_MS, d5: 5 * DAY_MS, d7: 7 * DAY_MS };

export interface Account { email: string; name: string; org: string; plan: string; }
/** One billed assistant reply: time, then input, output, cache read and cache write tokens, then the message id ('' when absent) and the model name ('' when absent). */
export type Ev = [number, number, number, number, number, string, string];
/** io is input plus output, cache is cache read plus write; i, o, cr and cw are the four parts. */
export interface Tokens { io: number; cache: number; i: number; o: number; cr: number; cw: number; }
/** model is the short name; id the full model id of its first event. */
export interface ModelTokens { model: string; id: string; io: number; }
export interface Totals { h5: Tokens; today: Tokens; yest: Tokens; d3: Tokens; d5: Tokens; d7: Tokens; models: ModelTokens[]; }

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
    return [at, num(u.input_tokens), num(u.output_tokens), num(u.cache_read_input_tokens), num(u.cache_creation_input_tokens), str(o.message.id), str(o.message.model)];
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

/** Short model name: opus, sonnet, haiku, fable, else the name without a "claude-" prefix; "unknown" when absent. */
export function shortModel(m: string): string {
  const hit = /opus|sonnet|haiku|fable/i.exec(m);
  return hit ? hit[0].toLowerCase() : m.replace(/^claude-/, '') || 'unknown';
}

const zero = (): Tokens => ({ io: 0, cache: 0, i: 0, o: 0, cr: 0, cw: 0 });
const MAX_MODELS = 4;

/** Token sums per window: rolling last 5 hours, 3, 5 and 7 days (ending now), today since local midnight, and yesterday (the previous local calendar day, midnight to midnight). Models: top 4 of the 7 days. */
export function totals(evs: Iterable<Ev>, now: number): Totals {
  const t: Totals = { h5: zero(), today: zero(), yest: zero(), d3: zero(), d5: zero(), d7: zero(), models: [] };
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const midnight = d.getTime();
  d.setDate(d.getDate() - 1);
  const yesterday = d.getTime();
  const byModel = new Map<string, ModelTokens>();
  for (const [at, i, o, cr, cw, , model] of evs) {
    if (at > now) { continue; }
    const hit: Tokens[] = [];
    if (now - at < WINDOWS.h5) { hit.push(t.h5); }
    if (at >= midnight) { hit.push(t.today); } else if (at >= yesterday) { hit.push(t.yest); }
    if (now - at < WINDOWS.d3) { hit.push(t.d3); }
    if (now - at < WINDOWS.d5) { hit.push(t.d5); }
    if (now - at < WINDOWS.d7) {
      hit.push(t.d7);
      if (i + o > 0) { const n = shortModel(model), m = byModel.get(n) ?? { model: n, id: model || n, io: 0 }; m.io += i + o; byModel.set(n, m); }
    }
    for (const w of hit) { w.i += i; w.o += o; w.cr += cr; w.cw += cw; w.io += i + o; w.cache += cr + cw; }
  }
  t.models = [...byModel.values()].sort((a, b) => b.io - a.io).slice(0, MAX_MODELS);
  return t;
}
