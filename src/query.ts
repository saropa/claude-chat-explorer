import { gramsOf } from './bloom';
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

/** Required literal runs of a simple regex; none when it has alternation, groups, classes or braces. */
export function regexLiterals(src: string): string[] {
  if (/[|()[\]{}]/.test(src)) { return []; }
  const out: string[] = [];
  let run = '';
  const end = () => { if (run) { out.push(run); } run = ''; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      const nx = src[++i] ?? '';
      if (/[xucpPk0-9]/.test(nx)) { return []; } // \x41, \u00e9, \cJ, \k, \p and octal are not plain text
      if (/[A-Za-z]/.test(nx)) { end(); } else { run += nx; } // \s \w \d \b are classes; \. is a literal
    } else if (ch === '*' || ch === '?') { run = run.slice(0, -1); end(); } // the previous char is optional
    else if (ch === '+') { end(); } else if (ch === '.' || ch === '^' || ch === '$') { end(); } else { run += ch; }
  }
  end();
  return out;
}

/** Trigrams every match must contain, for the bloom prefilter. */
function gramsFor(plain: string, tokens: Token[], o: Options): number[] {
  const q = plain.trim();
  const lits = !q ? [] : o.re ? regexLiterals(q) : q.split(/\s+/).filter(Boolean);
  for (const t of tokens) { if (t.kind === 'cmd') { lits.push(t.value); } }
  return lits.flatMap((l) => gramsOf(l.toLowerCase()));
}

/** Parse and compile a query. Throws on an invalid regex. */
export function compile(query: string, o: Options): Compiled {
  const { plain, tokens } = parseQuery(query);
  return { terms: buildTerms(plain, o), tokens, grams: gramsFor(plain, tokens, o) };
}

export const isEmpty = (c: Compiled): boolean => !c.terms.length && !c.tokens.length;
