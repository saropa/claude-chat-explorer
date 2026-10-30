/** Cumulative token totals of one chat file: every billed assistant reply counted once, sidechain rows included, never reset by a compaction. */
import { Tok, TokenTotals } from './types';
export type { TokenTotals };

export interface TokAcc { seen: Map<string, [number, number, number, number]>; t: Tok; }
export const newTokAcc = (): TokAcc => ({ seen: new Map(), t: [0, 0, 0, 0, 0] });

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** One assistant row. Streamed rows of one message repeat its id with a growing output figure, so the last row wins: totals move by the change from that id's previous figures. */
export function takeTokens(row: any, a: TokAcc): void {
  const m = row.message, u = m?.usage;
  if (!u || typeof u !== 'object') { return; }
  const id = typeof m.id === 'string' ? m.id : '';
  const n: [number, number, number, number] = [num(u.input_tokens), num(u.output_tokens), num(u.cache_read_input_tokens), num(u.cache_creation_input_tokens)];
  if (!(n[0] + n[1] + n[2] + n[3])) { return; }
  const prev = id ? a.seen.get(id) : undefined;
  if (id) { a.seen.set(id, n); }
  for (let k = 0; k < 4; k++) { a.t[k] += n[k] - (prev ? prev[k] : 0); }
  if (!prev) { a.t[4]++; }
}

/** The chat's totals, or undefined when no reply carried tokens. */
export const finishTok = (a: TokAcc): Tok | undefined => (a.t[4] ? a.t : undefined);

export const sumTok = (list: Array<{ tok?: Tok; comp?: number }>): TokenTotals => {
  const t: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, replies: 0, compactions: 0 };
  for (const x of list) {
    if (x.tok) { t.input += x.tok[0]; t.output += x.tok[1]; t.cacheRead += x.tok[2]; t.cacheWrite += x.tok[3]; t.replies += x.tok[4]; }
    t.compactions += x.comp ?? 0;
  }
  return t;
};
