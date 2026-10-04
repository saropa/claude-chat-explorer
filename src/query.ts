import { gramsOf } from './bloom';
import { validPr, validSha } from './gitMatch';
import { Compiled, Options, Token, TokenKind } from './types';

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Earliest allowed last-active time (ms) for a time-filter value; 0 means any time. */
export function cutoffOf(when: string, now: number = Date.now()): number {
  const h: { [k: string]: number } = { '1h': 1, '2h': 2, '4h': 4, '8h': 8 };
  if (h[when]) { return now - h[when] * 3600000; }
  if (when === 'today') { return new Date(now).setHours(0, 0, 0, 0); }
  return 0;
}

// One left-to-right scan so a quoted phrase is claimed first and "see file:x" stays phrase text.
// Groups: 1 token kind, 2 quoted token value (an unclosed quote runs to the end), 3 bare token value, 4 last:<n>.
const SCAN = /(?:^|\s)(?:(file|edited|cmd|tag|sha|pr|branch):(?:"([^"]*)"?|(\S*))|last:(\d+)(?=\s|$))|"[^"]*(?:"|$)|\S+/gi;
/** A double-quoted phrase (an unclosed quote runs to the end) or a bare word. */
const PIECE = /"([^"]*)(?:"|$)|(\S+)/g;
export const MIN_QUERY_CHARS = 2;

/** Split a query into plain text, file:/edited:/cmd:/tag:/sha:/pr:/branch: tokens (values lowercased) and the last:<n> limit (0 = none). */
export function parseQuery(query: string): { plain: string; tokens: Token[]; last: number } {
  const tokens: Token[] = [];
  let last = 0;
  const plain = query.replace(SCAN, (m, k?: string, q?: string, u?: string, n?: string) => {
    if (n !== undefined) { last = Number(n) || last; return ' '; }
    if (!k) { return m; }
    const kind = k.toLowerCase() as TokenKind;
    let value = (q ?? u ?? '').trim().toLowerCase();
    if (kind === 'tag') { value = value.replace(/\s+/g, '-'); } // stored tags use dashes for spaces
    if (kind === 'pr') { value = value.replace(/^#/, ''); } // pr:#123 and pr:123 are the same
    if (value) { tokens.push({ kind, value }); }
    return ' ';
  }).trim();
  return { plain, tokens, last };
}

export interface Piece { text: string; phrase: boolean; }

/** Plain words and quoted phrases of the plain text; a phrase keeps its inner spaces. */
export function pieces(plain: string): Piece[] {
  const out: Piece[] = [];
  for (const m of plain.matchAll(PIECE)) {
    const text = (m[1] ?? m[2] ?? '').trim();
    if (text) { out.push({ text, phrase: m[1] !== undefined }); }
  }
  return out;
}

/** A valid pr: or sha: value meets the minimum on its own (pr:7 is a complete search). */
const tokenChars = (t: Token): number =>
  (t.kind === 'pr' && validPr(t.value)) || (t.kind === 'sha' && validSha(t.value)) ? Math.max(t.value.length, MIN_QUERY_CHARS) : t.value.length;

/** Characters that count toward the 2-character minimum: words, phrase text and token values (not prefixes). */
export function queryChars(query: string, re: boolean): number {
  const { plain, tokens } = parseQuery(query);
  const words = re ? plain.length : pieces(plain).reduce((a, p) => a + p.text.length, 0);
  return words + tokens.reduce((a, t) => a + tokenChars(t), 0);
}

/** Build one RegExp per required plain term (word or phrase). Throws SyntaxError on an invalid regex. */
export function buildTerms(plain: string, o: Options): RegExp[] {
  const q = plain.trim();
  if (!q) { return []; }
  const parts = o.re ? [q] : pieces(q).map((p) => escRe(p.text));
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
  const lits = !q ? [] : o.re ? regexLiterals(q) : pieces(q).map((p) => p.text);
  for (const t of tokens) { if (t.kind === 'cmd') { lits.push(t.value); } }
  return lits.flatMap((l) => gramsOf(l.toLowerCase()));
}

/** Parse and compile a query. Throws on an invalid regex. */
export function compile(query: string, o: Options): Compiled {
  const { plain, tokens, last } = parseQuery(query);
  return { terms: buildTerms(plain, o), tokens, grams: gramsFor(plain, tokens, o), last: last || o.last || 0 };
}

export const isEmpty = (c: Compiled): boolean => !c.terms.length && !c.tokens.length;
