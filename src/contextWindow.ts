/**
 * Context window sizes by model id. When Claude ships a new model id, add it to ONE_M or K200 here;
 * an id in neither list is inferred (1,000,000 once a chat passed 200,000 tokens, else 200,000) and marked approximate.
 */
import { CtxInfo, Usage } from './types';

export const WINDOW_1M = 1000000;
export const WINDOW_200K = 200000;
const ONE_M = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5-5', 'claude-sonnet-5']);
const ONE_M_RE = /^claude-(fable|mythos)-/;
const K200 = new Set(['claude-opus-4-6', 'claude-opus-4-5', 'claude-opus-4-1', 'claude-opus-4',
  'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-haiku-4-5']);
const K200_RE = /^claude-3/;

/** Model id without the context tag and the dated suffix. */
export const baseModel = (id: string): string => id.replace(/\[.*$/, '').replace(/-\d{8}$/, '');

/** Short model id for display: opus-4-6. */
export const shortModel = (id: string): string => baseModel(id).replace(/^claude-/, '');

/** Window size for a model, and whether it was inferred. A 200,000 model that passed 200,000 tokens must be on the 1M option. */
export function windowOf(model: string, max: number): { window: number; approx: boolean } {
  const b = baseModel(model);
  if (ONE_M.has(b) || ONE_M_RE.test(b)) { return { window: WINDOW_1M, approx: false }; }
  const known = K200.has(b) || K200_RE.test(b);
  if (max > WINDOW_200K) { return { window: WINDOW_1M, approx: true }; }
  return { window: WINDOW_200K, approx: !known };
}

/** Percent of the window, rounded down, at most 100. */
export const pctOf = (tokens: number, window: number): number => Math.min(100, Math.floor((tokens / window) * 100));

/** Display facts of a chat's context usage; undefined when there is no usable figure. */
export function ctxInfo(u: Usage | undefined): CtxInfo | undefined {
  if (!u || !(u.tokens > 0)) { return undefined; }
  const w = windowOf(u.model, u.max);
  return { pct: pctOf(u.tokens, w.window), tokens: u.tokens, window: w.window, model: shortModel(u.model), comp: u.comp, pend: u.pending, approx: w.approx };
}
