import { mayHave } from './bloom';
import { startOf } from './blob';
import { gitMatched } from './gitMatch';
import { Chat, Compiled, Ctx, Rec, Token } from './types';
import { matches, Range, snippetOf } from './snippet';
import { inWin, Win, WinOf } from './window';

const DAY = 86400000;

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

/** Files, commands, tags or git facts matched by one token (case-insensitive substring; tags exact, of tagId); commands only inside win. */
export function matchedBy(c: Chat, rec: Rec | undefined, t: Token, ctx: Ctx, tagId: string, win?: Win): string[] {
  const has = (s: string) => s.toLowerCase().includes(t.value);
  if (t.kind === 'file') { return c.files.filter((f) => has(f.path)).map((f) => f.path); }
  if (t.kind === 'edited') { return c.files.filter((f) => f.edited && has(f.path)).map((f) => f.path); }
  if (t.kind === 'cmd') { return rec ? rec.cmds.filter((x, i) => has(x) && (!win || inWin(win, rec, rec.cmdAt[i]))) : []; }
  if (t.kind === 'sha' || t.kind === 'pr' || t.kind === 'branch') { return gitMatched(c, t); }
  return (ctx.tags[tagId] ?? []).includes(t.value) ? [t.value] : [];
}

/**
 * Visit every match of re inside one message of the record: fn(message index, offset in message).
 * Matches that straddle a message separator, or lie outside the window, are ignored.
 */
export function eachHit(rec: Rec, re: RegExp, fn: (i: number, at: number) => void, win?: Win): void {
  const { text, ends } = rec;
  let i = 0, st = startOf(rec, 0), m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const s = m.index, len = m[0].length;
    if (len === 0) { re.lastIndex++; continue; }
    if (i < ends.length && ends[i] < s) { // advance to the message holding s
      while (i < ends.length && ends[i] < s) { i++; }
      if (i >= ends.length) { return; }
      st = startOf(rec, i);
    }
    if (i >= ends.length) { return; }
    if (s >= st && s + len <= ends[i] && (!win || inWin(win, rec, i))) { fn(i, s - st); }
  }
}

export interface Hit { hits: number; weightSum: number; snippet: string; ranges: Range[]; }

interface Body { counts: number[]; weightSum: number; msg: number; idx: number; }

/** Per-term counts, recency-weighted hit sum and the newest matching message (for the snippet). */
function scanBody(rec: Rec, terms: RegExp[], now: number, win?: Win): Body {
  const b: Body = { counts: terms.map(() => 0), weightSum: 0, msg: -1, idx: -1 };
  terms.forEach((re, k) => {
    let cur = -1, w = 0, n = 0; // per-message weight is computed once, not once per hit
    eachHit(rec, re, (i, at) => {
      n++;
      if (i !== cur) { cur = i; w = weightAt(rec.ts[i], now); }
      const newer = b.msg < 0 || rec.ts[i] > rec.ts[b.msg] || (rec.ts[i] === rec.ts[b.msg] && i > b.msg);
      if (newer) { b.msg = i; b.idx = at; } else if (i === b.msg && at < b.idx) { b.idx = at; }
      b.weightSum += w;
    }, win);
    b.counts[k] += n;
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
    ? snippetOf(rec.text.slice(startOf(rec, body.msg), rec.ends[body.msg]), body.idx, cmp.terms)
    : tokenSnippet(cmp, found);
  return {
    hits: body.counts.reduce((a, b) => a + b, 0) + tokenHits,
    weightSum: body.weightSum + tokenHits * weightAt(c.last, now), ...snip,
  };
}
