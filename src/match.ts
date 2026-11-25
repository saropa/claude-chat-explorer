import { gramsOf, mayHave } from './bloom';
import { startOf } from './blob';
import { gitMatched } from './gitMatch';
import { Chat, Compiled, Ctx, Rec, Token } from './types';
import { DigestLine, digestHits } from './digest';
import { mergeRanges, matches, Range, snippetOf } from './snippet';
import { inWin, Win, WinOf } from './window';

const DAY = 86400000;

/** Title matches (x1000, +5000 if all terms hit, weighted by last-active) plus capped recency-weighted body. */
export function scoreOf(title: string, terms: RegExp[], weightSum: number, last: number, now: number): number {
  const perTerm = terms.map((re) => { let n = 0; for (const _ of matches(re, title)) { n++; } return n; });
  const n = perTerm.reduce((a, b) => a + b, 0);
  let titleScore = n * 1000 + (n > 0 && perTerm.every((c) => c > 0) ? 5000 : 0);
  const age = Math.max(0, (now - last) / DAY);
  titleScore *= 0.5 + 0.5 / (1 + age / 30);
  // Whole score decays smoothly with age (1 now, 0.5 at 90 days, floor 0.3) so recent chats lead comparable matches.
  const recency = 0.3 + 0.7 / (1 + age / 90);
  return (titleScore + Math.min(900, weightSum * 10)) * recency;
}

export const weightAt = (ts: number, now: number): number => 1 / (1 + Math.max(0, (now - ts) / DAY) / 30);

/** True when the record text or a command mentions the (lowercased) path, with either slash direction. */
function textMentions(rec: Rec, v: string): boolean {
  const alt = v.replace(/\//g, '\\');
  const lower = rec.text.toLowerCase();
  return lower.includes(v) || lower.includes(alt) || rec.cmds.some((x) => { const l = x.toLowerCase(); return l.includes(v) || l.includes(alt); });
}

/** Files, commands, tags, git facts or digest lines matched by one token (case-insensitive substring; tags exact, of tagId); commands only inside win. dg is the chat's digest text, if it has one. */
export function matchedBy(c: Chat, rec: Rec | undefined, t: Token, ctx: Ctx, tagId: string, win?: Win, dg?: DigestLine[]): string[] {
  const has = (s: string) => s.toLowerCase().includes(t.value);
  // digest: reads the stored digest only; a chat without one (or a subagent, whose facts live in the parent's digest) never matches it.
  if (t.kind === 'digest') { return dg ? digestHits(dg, t.value) : []; }
  if (t.kind === 'file') {
    const hit = c.files.filter((f) => has(f.path)).map((f) => f.path);
    if (hit.length || !rec) { return hit; }
    // Fallback: the path is only mentioned (untracked file, prose, Bash), never a tool file field.
    return textMentions(rec, t.value) ? [t.value] : [];
  }
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

/** at: time of the newest matching message (0 when only tokens matched); role: its role (0 user, 1 assistant, -1 none); mc: distinct matching messages; dig: the snippet is a digest line (a digest-only hit, no message). */
export interface Hit { hits: number; weightSum: number; snippet: string; ranges: Range[]; at: number; role: number; mc: number; dig?: boolean; }

interface Body { counts: number[]; weightSum: number; msg: number; idx: number; mc: number; }

/** Per-term counts, recency-weighted hit sum, distinct matching messages and the newest matching message (for the snippet). */
function scanBody(rec: Rec, terms: RegExp[], now: number, win?: Win): Body {
  const b: Body = { counts: terms.map(() => 0), weightSum: 0, msg: -1, idx: -1, mc: 0 };
  const seen = new Set<number>();
  terms.forEach((re, k) => {
    let cur = -1, w = 0, n = 0; // per-message weight is computed once, not once per hit
    eachHit(rec, re, (i, at) => {
      n++;
      if (i !== cur) { cur = i; w = weightAt(rec.ts[i], now); seen.add(i); }
      const newer = b.msg < 0 || rec.ts[i] > rec.ts[b.msg] || (rec.ts[i] === rec.ts[b.msg] && i > b.msg);
      if (newer) { b.msg = i; b.idx = at; } else if (i === b.msg && at < b.idx) { b.idx = at; }
      b.weightSum += w;
    }, win);
    b.counts[k] += n;
  });
  b.mc = seen.size;
  return b;
}

/** Snippet from the first non-tag token match when no plain term matched a message; dig marks a digest: token's line. */
function tokenSnippet(c: Compiled, found: string[][]): { snippet: string; ranges: Range[]; dig?: boolean } {
  const i = c.tokens.findIndex((t) => t.kind !== 'tag');
  if (i < 0) { return { snippet: '', ranges: [] }; }
  const s = found[i][0], at = s.toLowerCase().indexOf(c.tokens[i].value);
  const out: { snippet: string; ranges: Range[]; dig?: boolean } = { snippet: s, ranges: at >= 0 ? [[at, at + c.tokens[i].value.length]] : [] };
  // The row labels a digest line "Digest" and opens the card at the Digest section, so the source must travel with the snippet.
  if (c.tokens[i].kind === 'digest') { out.dig = true; }
  return out;
}

/** Plain-term hits in digest text: per-term counts and the first matching line and offset (for the snippet). */
interface DigestBody { counts: number[]; line: number; idx: number; }

/** Count each term's matches over the digest lines; the snippet line is the first line any term hits. */
function scanDigest(lines: DigestLine[], terms: RegExp[]): DigestBody {
  const b: DigestBody = { counts: terms.map(() => 0), line: -1, idx: -1 };
  terms.forEach((re, k) => {
    lines.forEach((l, j) => {
      for (const [s] of matches(re, l.t)) {
        b.counts[k]++;
        // Keep the earliest line, and the earliest offset on it, so the snippet is stable across terms.
        if (b.line < 0 || j < b.line || (j === b.line && s < b.idx)) { b.line = j; b.idx = s; }
      }
    });
  });
  return b;
}

/**
 * True when plain terms are counted against digest text: only with no message filter, because last: and from: select
 * messages and a digest is not a message. The one predicate for the matcher (matchChat) and for every listing of digest
 * lines (results editor, export), so a listing never shows a line the matcher did not count.
 */
export const digestTermsApply = (cmp: Compiled): boolean => cmp.last === 0 && cmp.from === 'both' && cmp.terms.length > 0;

/**
 * The digest lines a search matched, each with its match ranges: plain terms (when digestTermsApply) and digest: tokens
 * (lowercased substrings, the rule matchedBy uses). Shared by the results editor and the export so both list the same lines.
 */
export function digestLineHits(lines: DigestLine[], cmp: Compiled): Array<{ t: string; r: Range[] }> {
  const out: Array<{ t: string; r: Range[] }> = [];
  const plain = digestTermsApply(cmp);
  for (const l of lines) {
    const r: Range[] = [];
    if (plain) { for (const re of cmp.terms) { r.push(...matches(re, l.t)); } }
    for (const t of cmp.tokens) {
      if (t.kind !== 'digest') { continue; }
      const at = l.t.toLowerCase().indexOf(t.value);
      if (at >= 0) { r.push([at, at + t.value.length]); }
    }
    if (r.length) { out.push({ t: l.t, r: mergeRanges(r) }); }
  }
  return out;
}

/**
 * Match one chat: tokens on files, tags and digest text first, then the digest's plain-term hits, then the bloom
 * prefilter, and only then the store record. tagId is whose tags apply (a subagent uses its parent's). winOf limits
 * matching messages. dg is the chat's digest text: a plain term counts when it hits a message or the digest, so the
 * digest check runs before the bloom gate (the bloom holds chat text only and would reject a digest-only hit).
 */
export function matchChat(c: Chat, cmp: Compiled, ctx: Ctx, tagId: string, load: (c: Chat) => Rec, now: number, winOf?: WinOf, dg?: DigestLine[]): Hit | null {
  const cheap = cmp.tokens.map((t) => (t.kind === 'cmd' ? [] : matchedBy(c, undefined, t, ctx, tagId, undefined, dg)));
  // A file: token with no file-field hit falls back to the text, if the bloom says the path could be there.
  const textFile = cmp.tokens.map((t, i) => t.kind === 'file' && !cheap[i].length);
  if (cmp.tokens.some((t, i) => t.kind !== 'cmd' && !cheap[i].length && !(textFile[i] && mayHave(c.bloom, gramsOf(t.value))))) { return null; }
  // Plain terms reach the digest only when digestTermsApply says so (no message filter).
  const dgTerms = dg && digestTermsApply(cmp) ? scanDigest(dg, cmp.terms) : undefined;
  const dgAny = !!dgTerms && dgTerms.counts.some((n) => n > 0);
  const dgAll = !!dgTerms && dgTerms.counts.every((n) => n > 0);
  const bodyNeed = cmp.tokens.some((t, i) => t.kind === 'cmd' || textFile[i]);
  if (cmp.grams.length && !mayHave(c.bloom, cmp.grams)) {
    // The body cannot hold every term. With no digest hit the chat is out, as before digests existed.
    if (!dgAny) { return null; }
    // Every term is in the digest and nothing needs the body: a digest-only hit, without reading the record.
    if (dgAll && !bodyNeed) { return digestOnly(c, cmp, dg!, dgTerms!, cheap, now); }
    // Otherwise some terms may still be in the body: read it and decide per term below.
  }
  const need = cmp.terms.length > 0 || bodyNeed;
  const rec = need ? load(c) : undefined; // file:, edited:, tag: and digest: alone never touch the store
  const win = rec ? winOf?.(rec) : undefined;
  const found = cmp.tokens.map((t, i) => (t.kind === 'cmd' || textFile[i] ? matchedBy(c, rec, t, ctx, tagId, win) : cheap[i]));
  if (found.some((f) => !f.length)) { return null; }
  const body = rec ? scanBody(rec, cmp.terms, now, win) : { counts: [], weightSum: 0, msg: -1, idx: -1, mc: 0 };
  // A term must hit a message or the digest; one that hits neither drops the chat.
  if (body.counts.some((n, k) => n === 0 && !(dgTerms && dgTerms.counts[k] > 0))) { return null; }
  const tokenHits = found.reduce((a, f) => a + f.length, 0);
  const dgHits = dgTerms ? dgTerms.counts.reduce((a, b) => a + b, 0) : 0;
  // The snippet prefers a message hit; a digest line is used only when no message matched.
  const snip = rec && body.msg >= 0
    ? snippetOf(rec.text.slice(startOf(rec, body.msg), rec.ends[body.msg]), body.idx, cmp.terms)
    : dgTerms && dgTerms.line >= 0 ? { ...snippetOf(dg![dgTerms.line].t, dgTerms.idx, cmp.terms), dig: true } : tokenSnippet(cmp, found);
  return {
    hits: body.counts.reduce((a, b) => a + b, 0) + tokenHits + dgHits,
    weightSum: body.weightSum + (tokenHits + dgHits) * weightAt(c.last, now), ...snip,
    at: rec && body.msg >= 0 ? rec.ts[body.msg] : 0, role: rec && body.msg >= 0 ? rec.roles[body.msg] : -1, mc: body.mc,
  };
}

/** A hit carried by the digest alone: no message, its snippet is the first matching digest line (labeled "Digest" by the row). */
function digestOnly(c: Chat, cmp: Compiled, dg: DigestLine[], d: DigestBody, found: string[][], now: number): Hit {
  const hits = d.counts.reduce((a, b) => a + b, 0) + found.reduce((a, f) => a + f.length, 0);
  return { hits, weightSum: hits * weightAt(c.last, now), ...snippetOf(dg[d.line].t, d.idx, cmp.terms), dig: true, at: 0, role: -1, mc: 0 };
}
