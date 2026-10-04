import { mayHave } from './bloom';
import { startOf } from './blob';
import { Chat, Compiled, Ctx, Rec, Token } from './types';
import { inWin, Win, WinOf } from './window';

const DAY = 86400000;
type Range = [number, number];

export function* matches(re: RegExp, text: string): Generator<Range> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    yield [m.index, m.index + m[0].length];
  }
}

/** Window of text around idx (whitespace flattened 1:1) plus merged match ranges for all terms. */
export function snippetOf(text: string, idx: number, terms: RegExp[], before: number, after: number) {
  const s = Math.max(0, idx - before);
  const snippet = text.slice(s, idx + after).replace(/\s/g, ' ');
  const raw: Range[] = [];
  for (const re of terms) { for (const r of matches(re, snippet)) { raw.push(r); } }
  raw.sort((a, b) => a[0] - b[0]);
  const ranges: Range[] = [];
  for (const r of raw) {
    const p = ranges[ranges.length - 1];
    if (p && r[0] <= p[1]) { p[1] = Math.max(p[1], r[1]); } else { ranges.push([r[0], r[1]]); }
  }
  return { snippet, ranges };
}

/** Title matches (x1000, +5000 if all terms hit, weighted by last-active) plus capped recency-weighted body. */
export function scoreOf(title: string, terms: RegExp[], weightSum: number, last: number, now: number): number {
  const perTerm = terms.map((re) => { let n = 0; for (const _ of matches(re, title)) { n++; } return n; });
  const n = perTerm.reduce((a, b) => a + b, 0);
  let titleScore = n * 1000 + (n > 0 && perTerm.every((c) => c > 0) ? 5000 : 0);
  const age = Math.max(0, (now - last) / DAY);
  titleScore *= 0.5 + 0.5 / (1 + age / 30);
  return titleScore + Math.min(900, weightSum * 10);
}

export const weightAt = (ts: number, now: number): number => 1 / (1 + Math.max(0, (now - ts) / DAY) / 30);

/** Files, commands or tags matched by one token (case-insensitive substring; tags exact, of tagId); commands only inside win. */
export function matchedBy(c: Chat, rec: Rec | undefined, t: Token, ctx: Ctx, tagId: string, win?: Win): string[] {
  const has = (s: string) => s.toLowerCase().includes(t.value);
  if (t.kind === 'file') { return c.files.filter((f) => has(f.path)).map((f) => f.path); }
  if (t.kind === 'edited') { return c.files.filter((f) => f.edited && has(f.path)).map((f) => f.path); }
  if (t.kind === 'cmd') { return rec ? rec.cmds.filter((x, i) => has(x) && (!win || inWin(win, rec, rec.cmdAt[i]))) : []; }
  return (ctx.tags[tagId] ?? []).includes(t.value) ? [t.value] : [];
}

/**
 * Visit every match of re inside one message of the record: fn(message index, offset in message).
 * Matches that straddle a message separator, or lie outside the window, are ignored.
 */
export function eachHit(rec: Rec, re: RegExp, fn: (i: number, at: number) => void, win?: Win): void {
  let i = 0;
  for (const [s, e] of matches(re, rec.text)) {
    while (i < rec.ends.length && rec.ends[i] < s) { i++; }
    if (i >= rec.ends.length) { return; }
    const st = startOf(rec, i);
    if (s >= st && e <= rec.ends[i] && (!win || inWin(win, rec, i))) { fn(i, s - st); }
  }
}

export interface Hit { hits: number; weightSum: number; snippet: string; ranges: Range[]; }

interface Body { counts: number[]; weightSum: number; msg: number; idx: number; }

/** Per-term counts, recency-weighted hit sum and the newest matching message (for the snippet). */
function scanBody(rec: Rec, terms: RegExp[], now: number, win?: Win): Body {
  const b: Body = { counts: terms.map(() => 0), weightSum: 0, msg: -1, idx: -1 };
  terms.forEach((re, k) => {
    eachHit(rec, re, (i, at) => {
      b.counts[k]++;
      b.weightSum += weightAt(rec.ts[i], now);
      const newer = b.msg < 0 || rec.ts[i] > rec.ts[b.msg] || (rec.ts[i] === rec.ts[b.msg] && i > b.msg);
      if (newer) { b.msg = i; b.idx = at; } else if (i === b.msg && at < b.idx) { b.idx = at; }
    }, win);
  });
  return b;
}

/** Snippet from the first non-tag token match when no plain term matched a message. */
function tokenSnippet(c: Compiled, found: string[][]): { snippet: string; ranges: Range[] } {
  const i = c.tokens.findIndex((t) => t.kind !== 'tag');
  if (i < 0) { return { snippet: '', ranges: [] }; }
  const s = found[i][0], at = s.toLowerCase().indexOf(c.tokens[i].value);
  return { snippet: s, ranges: at >= 0 ? [[at, at + c.tokens[i].value.length]] : [] };
}

/**
 * Match one chat: tokens on files and tags first, then the bloom prefilter, and only then the
 * store record. tagId is whose tags apply (a subagent uses its parent's). winOf limits matching messages.
 */
export function matchChat(c: Chat, cmp: Compiled, ctx: Ctx, tagId: string, load: (c: Chat) => Rec, now: number, winOf?: WinOf): Hit | null {
  const cheap = cmp.tokens.map((t) => (t.kind === 'cmd' ? [] : matchedBy(c, undefined, t, ctx, tagId)));
  if (cmp.tokens.some((t, i) => t.kind !== 'cmd' && !cheap[i].length)) { return null; }
  if (cmp.grams.length && !mayHave(c.bloom, cmp.grams)) { return null; }
  const need = cmp.terms.length > 0 || cmp.tokens.some((t) => t.kind === 'cmd');
  const rec = need ? load(c) : undefined; // file:, edited: and tag: alone never touch the store
  const win = rec ? winOf?.(rec) : undefined;
  const found = cmp.tokens.map((t, i) => (t.kind === 'cmd' ? matchedBy(c, rec, t, ctx, tagId, win) : cheap[i]));
  if (found.some((f) => !f.length)) { return null; }
  const body = rec ? scanBody(rec, cmp.terms, now, win) : { counts: [], weightSum: 0, msg: -1, idx: -1 };
  if (body.counts.some((n) => n === 0)) { return null; }
  const tokenHits = found.reduce((a, f) => a + f.length, 0);
  const snip = rec && body.msg >= 0
    ? snippetOf(rec.text.slice(startOf(rec, body.msg), rec.ends[body.msg]), body.idx, cmp.terms, 40, 120)
    : tokenSnippet(cmp, found);
  return {
    hits: body.counts.reduce((a, b) => a + b, 0) + tokenHits,
    weightSum: body.weightSum + tokenHits * weightAt(c.last, now), ...snip,
  };
}
