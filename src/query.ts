import { Compiled, Options, Token, TokenKind } from './types';

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Earliest allowed last-active time (ms) for a time-filter value; 0 means any time. */
export function cutoffOf(when: string, now: number = Date.now()): number {
  const h: { [k: string]: number } = { '1h': 1, '2h': 2, '4h': 4, '8h': 8 };
  if (h[when]) { return now - h[when] * 3600000; }
  if (when === 'today') { return new Date(now).setHours(0, 0, 0, 0); }
  return 0;
}

// An unclosed quote runs to the end of the query, so typing cmd:"git pu already filters.
const TOKEN = /(^|\s)(file|edited|cmd|tag):(?:"([^"]*)"?|(\S*))/gi;

/** Split a query into plain text and file:/edited:/cmd:/tag: tokens (values lowercased). */
export function parseQuery(query: string): { plain: string; tokens: Token[] } {
  const tokens: Token[] = [];
  const plain = query.replace(TOKEN, (_m, _s, k: string, q?: string, u?: string) => {
    const kind = k.toLowerCase() as TokenKind;
    let value = (q ?? u ?? '').trim().toLowerCase();
    if (kind === 'tag') { value = value.replace(/\s+/g, '-'); } // stored tags use dashes for spaces
    if (value) { tokens.push({ kind, value }); }
    return ' ';
  }).trim();
  return { plain, tokens };
}

/** Build one RegExp per required plain term. Throws SyntaxError on an invalid regex. */
export function buildTerms(plain: string, o: Options): RegExp[] {
  const q = plain.trim();
  if (!q) { return []; }
  const parts = o.re ? [q] : q.split(/\s+/).filter(Boolean).map(escRe);
  return parts.map((p) => new RegExp(o.ww ? '\\b(?:' + p + ')\\b' : p, o.cs ? 'g' : 'gi'));
}

/** Parse and compile a query. Throws on an invalid regex. */
export function compile(query: string, o: Options): Compiled {
  const { plain, tokens } = parseQuery(query);
  return { terms: buildTerms(plain, o), tokens };
}

export const isEmpty = (c: Compiled): boolean => !c.terms.length && !c.tokens.length;
