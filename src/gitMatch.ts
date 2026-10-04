import { Chat, Token } from './types';

const SHA_PREFIX = /^[0-9a-f]{4,40}$/;
const DIGITS = /^\d+$/;

/** Commits (sha prefix, 4+ hex chars), PRs (exact number) or branches (substring) of one chat that a git token matches. */
export function gitMatched(c: Chat, t: Token): string[] {
  const g = c.git;
  if (!g) { return []; }
  if (t.kind === 'sha') {
    return SHA_PREFIX.test(t.value) ? g.commits.filter(([s]) => s.startsWith(t.value)).map(([s, b]) => (b ? `${s} on ${b}` : s)) : [];
  }
  if (t.kind === 'pr') {
    return DIGITS.test(t.value) ? g.prs.filter(([n]) => n === Number(t.value)).map(([n, r]) => `#${n} ${r}`.trim()) : [];
  }
  return g.branches.filter((b) => b.toLowerCase().includes(t.value));
}
