/** Snippet and title windows that keep the first highlighted match in view. */
export type Range = [number, number];

export const LEAD = 16; // leading context chars before the first match
export const TRAIL = 200; // trailing context chars after the match (also the longest match shown)
const ELL = '…';

export function* matches(re: RegExp, text: string): Generator<Range> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    yield [m.index, m.index + m[0].length];
  }
}

/** Sort and merge overlapping ranges. */
export function mergeRanges(raw: Range[]): Range[] {
  raw.sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const r of raw) {
    const p = out[out.length - 1];
    if (p && r[0] <= p[1]) { p[1] = Math.max(p[1], r[1]); } else { out.push([r[0], r[1]]); }
  }
  return out;
}

/** Start of the leading context: at most LEAD chars before idx, cut at a word boundary, no leading blanks. */
export function leadStart(text: string, idx: number): number {
  let s = Math.max(0, idx - LEAD);
  if (s > 0 && !/\s/.test(text[s - 1]) && !/\s/.test(text[s])) {
    while (s < idx && !/\s/.test(text[s])) { s++; } // drop the partly cut word
  }
  while (s < idx && /\s/.test(text[s])) { s++; }
  return s;
}

/** Length of the longest term match that starts exactly at idx (0 when none). */
function matchLen(text: string, idx: number, terms: RegExp[]): number {
  let best = 0;
  for (const re of terms) {
    const y = new RegExp(re.source, re.flags.replace('g', '') + 'y');
    y.lastIndex = idx;
    const m = y.exec(text);
    if (m && m[0].length > best) { best = m[0].length; }
  }
  return best;
}

/** Window of text from idx (the first match): LEAD chars before, the match, TRAIL after; whitespace flattened 1:1. */
export function snippetOf(text: string, idx: number, terms: RegExp[]): { snippet: string; ranges: Range[] } {
  const len = matchLen(text, idx, terms) || 1, mlen = Math.min(len, TRAIL);
  const s = leadStart(text, idx), e = Math.min(text.length, idx + mlen + (len > TRAIL ? 0 : TRAIL));
  const pre = s > 0 ? ELL : '', post = e < text.length ? ELL : '';
  const flat = text.slice(s, Math.min(text.length, e + 64)).replace(/\s/g, ' '); // extra tail keeps \b honest at the cut
  const raw: Range[] = [[idx - s, idx - s + mlen]];
  for (const re of terms) { for (const r of matches(re, flat)) { if (r[0] < e - s) { raw.push([r[0], Math.min(r[1], e - s)]); } } }
  const off = pre.length;
  return { snippet: pre + flat.slice(0, e - s) + post, ranges: mergeRanges(raw).map((r): Range => [r[0] + off, r[1] + off]) };
}

/** Title as shown: when the first match starts after LEAD chars, cut leading text so the match stays visible. */
export function titleView(title: string, terms: RegExp[]): { text: string; ranges: Range[] } {
  let first = -1;
  for (const re of terms) { for (const r of matches(re, title)) { if (first < 0 || r[0] < first) { first = r[0]; } break; } }
  if (first < 0) { return { text: title, ranges: [] }; }
  const s = first > LEAD ? leadStart(title, first) : 0, off = s > 0 ? 1 : 0;
  const text = (s > 0 ? ELL : '') + title.slice(s);
  const ranges = mergeRanges(terms.flatMap((re) => [...matches(re, title)]).filter((r) => r[0] >= s));
  return { text, ranges: ranges.map((r): Range => [r[0] - s + off, r[1] - s + off]) };
}
