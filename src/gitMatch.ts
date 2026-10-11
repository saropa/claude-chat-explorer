import { Chat, Token } from './types';

const SHA_PREFIX = /^[0-9a-f]{4,40}$/;
const DIGITS = /^\d+$/;
export const SHA_MIN = 4;

export const validSha = (v: string): boolean => SHA_PREFIX.test(v);
export const validPr = (v: string): boolean => DIGITS.test(v);

/** A muted hint for the first malformed sha: or pr: token, or '' when all are usable. */
export function gitHint(tokens: Token[]): string {
  for (const t of tokens) {
    if (t.kind === 'sha' && !validSha(t.value)) { return 'sha: needs 4 to 40 hex characters'; }
    if (t.kind === 'pr' && !validPr(t.value)) { return 'pr: needs a number'; }
  }
  return '';
}

/** True when either commit id starts with the other (a short and a full id of one commit). */
export const shaAlike = (a: string, b: string): boolean => a.startsWith(b) || b.startsWith(a);

/** Commits (either id a prefix of the other, 4+ hex chars typed), PRs (exact number, any repository) or branches (substring) a git token matches. */
export function gitMatched(c: Chat, t: Token): string[] {
  const g = c.git;
  if (t.kind === 'branch') {
    // Recorded branch names, plus branches a tool call of the chat created (a creator, never a mere mention: 'i' instruction entries are skipped).
    const seen = new Set<string>(), out: string[] = [];
    for (const b of g?.branches ?? []) { if (b.toLowerCase().includes(t.value) && !seen.has(b)) { seen.add(b); out.push(b); } }
    for (const m of c.made ?? []) { if (m[0] === 'b' && m[2] && m[1].toLowerCase().includes(t.value) && !seen.has(m[1])) { seen.add(m[1]); out.push(m[1] + ' (created)'); } }
    return out;
  }
  if (!g) { return []; }
  if (t.kind === 'sha') {
    return validSha(t.value) ? g.commits.filter(([s]) => s.length >= SHA_MIN && shaAlike(s, t.value)).map(([s, b]) => (b ? `${s} on ${b}` : s)) : [];
  }
  if (t.kind === 'pr') {
    return validPr(t.value) ? g.prs.filter(([n]) => n === Number(t.value)).map(([n, r]) => `#${n} ${r}`.trim()) : [];
  }
  return [];
}
