/** Context usage while one chat file is parsed: last main-thread request size, compactions and the one-turn lag flag. */
import { Usage } from './types';

const B = (s: string) => Buffer.from(s);
const BOUNDARY = B('"subtype":"compact_boundary"'), USER = B('"type":"user"'), TOOL_RESULT = B('"type":"tool_result"');
const BOUNDARY_HEAD = 400; // type and subtype sit near the start of the short boundary row
const BOUNDARY_MAX = 20000;
const USER_HEAD = 4096;

export interface UseAcc { tokens: number; model: string; max: number; at: number; pending: boolean; comp: number; seen: boolean; }
export const newUseAcc = (): UseAcc => ({ tokens: 0, model: '', max: 0, at: 0, pending: false, comp: 0, seen: false });

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** One assistant row: the latest main-thread row wins (streamed rows of one message repeat the same totals); synthetic and empty rows are skipped. */
export function takeUsage(row: any, a: UseAcc, ts: number): void {
  if (row.isSidechain === true) { return; }
  const m = row.message, u = m?.usage;
  if (!u || typeof u !== 'object') { return; }
  const total = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
  const model = typeof m.model === 'string' ? m.model : '';
  if (!total || !model || model === '<synthetic>') { return; }
  Object.assign(a, { tokens: total, model, at: ts, pending: false, seen: true, max: Math.max(a.max, total) });
}

/** A row that is not parsed as a message: a compact_boundary resets the figure until the next reply; a tool result marks the figure one turn behind. */
export function takeOther(line: Buffer, a: UseAcc): void {
  if (line.length < BOUNDARY_MAX && line.subarray(0, BOUNDARY_HEAD).indexOf(BOUNDARY) >= 0) { a.comp++; a.tokens = 0; a.pending = false; return; }
  const head = line.subarray(0, USER_HEAD);
  if (head.indexOf(USER) >= 0 && head.indexOf(TOOL_RESULT) >= 0) { a.pending = true; }
}

/** The chat's usage, or undefined when no assistant row carried a usable figure. */
export function finishUsage(a: UseAcc): Usage | undefined {
  return a.seen ? { tokens: a.tokens, model: a.model, max: a.max, at: a.at, pending: a.pending && a.tokens > 0, comp: a.comp } : undefined;
}
