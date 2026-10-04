import { Chat, Token } from './types';

const SHA_PREFIX = /^[0-9a-f]{4,40}$/;
const DIGITS = /^\d+$/;
export const SHA_MIN = 4;

export const validSha = (v: string): boolean => SHA_PREFIX.test(v);
export const validPr = (v: string): boolean => DIGITS.test(v);

/** A muted hint for the first malformed sha: or pr: token, or '' when all are usable. */
export function gitHint(tokens: Token[]): string {
  for (const t of tokens) {
    if (t.kind === 'sha' && !validSha(t.value)) { return 'sha: needs 4 or more hex characters'; }
    if (t.kind === 'pr' && !validPr(t.value)) { return 'pr: needs a number'; }
  }
  return '';
}

/** True when either commit id starts with the other (a short and a full id of one commit). */
export const shaAlike = (a: string, b: string): boolean => a.startsWith(b) || b.startsWith(a);

/** Commits (either id a prefix of the other, 4+ hex chars typed), PRs (exact number, any repository) or branches (substring) a git token matches. */
export function gitMatched(c: Chat, t: Token): string[] {
  const g = c.git;
  if (!g) { return []; }
  if (t.kind === 'sha') {
    return validSha(t.value) ? g.commits.filter(([s]) => s.length >= SHA_MIN && shaAlike(s, t.value)).map(([s, b]) => (b ? `${s} on ${b}` : s)) : [];
  }
  if (t.kind === 'pr') {
    return validPr(t.value) ? g.prs.filter(([n]) => n === Number(t.value)).map(([n, r]) => `#${n} ${r}`.trim()) : [];
  }
  return g.branches.filter((b) => b.toLowerCase().includes(t.value));
}
