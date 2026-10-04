/** Edited or read label of a chat for file: and edited: searches, and the file-only score. */
import { Chat, Compiled } from './types';

export type Touch = 'edited' | 'read';
const OFFSET: { [k in Touch]: number } = { edited: 2e13, read: 1e13 };

/** 'edited' when the chat or a matched subagent edited a file the file:/edited: tokens match, else 'read'; undefined without such tokens. */
export function touchOf(chats: Chat[], c: Compiled): Touch | undefined {
  const vals = c.tokens.filter((t) => t.kind === 'file' || t.kind === 'edited').map((t) => t.value);
  if (!vals.length) { return undefined; }
  const hit = chats.some((x) => x.files.some((f) => f.edited && vals.some((v) => f.path.toLowerCase().includes(v))));
  return hit ? 'edited' : 'read';
}

/** True for a query made only of file: tokens (no words, no other tokens). */
export const isFileOnly = (c: Compiled): boolean => !c.terms.length && c.tokens.length > 0 && c.tokens.every((t) => t.kind === 'file');

/** Score that sorts edited chats first, then read-only chats, each newest first. */
export const fileOnlyScore = (t: Touch, last: number): number => OFFSET[t] + last;

/** Result fields for a file search: the label, and the ordering score when the query is file-only. */
export function touchFields(chats: Chat[], c: Compiled, last: number): { touch?: Touch; score?: number } {
  const touch = touchOf(chats, c);
  if (!touch) { return {}; }
  return isFileOnly(c) ? { touch, score: fileOnlyScore(touch, last) } : { touch };
}
