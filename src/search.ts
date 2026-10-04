import { Chat, Compiled, Ctx, Expanded, ExpandItem, Msg, Options, OnFile, Abort, Result, Token } from './types';
import { cutoffOf } from './query';
import { projectOf, statFields } from './stats';

/** Maximum results kept by the scanner and the webview. */
export const MAX_RESULTS = 500;
export const EXPAND_PAGE = 20;
const DAY = 86400000;

const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');

function* matches(re: RegExp, text: string): Generator<[number, number]> {
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
  const raw: Array<[number, number]> = [];
  for (const re of terms) { for (const r of matches(re, snippet)) { raw.push(r); } }
  raw.sort((a, b) => a[0] - b[0]);
  const ranges: Array<[number, number]> = [];
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

const weightAt = (ts: number, now: number) => 1 / (1 + Math.max(0, (now - ts) / DAY) / 30);

/** Files, commands or tags of a chat matched by one token (case-insensitive substring; tags exact). */
export function matchedBy(chat: Chat, t: Token, ctx: Ctx): string[] {
  const has = (s: string) => s.toLowerCase().includes(t.value);
  if (t.kind === 'file') { return chat.files.filter((f) => has(f.path)).map((f) => f.path); }
  if (t.kind === 'edited') { return chat.files.filter((f) => f.edited && has(f.path)).map((f) => f.path); }
  if (t.kind === 'cmd') { return chat.commands.filter(has); }
  return (ctx.tags[chat.id] ?? []).includes(t.value) ? [t.value] : [];
}

interface BodyScan { counts: number[]; weightSum: number; text: string; idx: number; }

/** Per-term hit counts, recency-weighted hit sum and the newest matching message for the snippet. */
function scanBody(chat: Chat, terms: RegExp[], now: number): BodyScan {
  const r: BodyScan = { counts: terms.map(() => 0), weightSum: 0, text: '', idx: -1 };
  let sTs = -1;
  for (const m of chat.messages) {
    const w = weightAt(m.ts, now);
    let first = -1;
    terms.forEach((re, i) => {
      for (const [st] of matches(re, m.text)) {
        r.counts[i]++; r.weightSum += w;
        if (first < 0 || st < first) { first = st; }
      }
    });
    if (first >= 0 && m.ts >= sTs) { r.text = m.text; r.idx = first; sTs = m.ts; }
  }
  return r;
}

/** Snippet from the first non-tag token match when no plain term matched a message. */
function tokenSnippet(c: Compiled, found: string[][]): { snippet: string; ranges: Array<[number, number]> } {
  const i = c.tokens.findIndex((t) => t.kind !== 'tag');
  if (i < 0) { return { snippet: '', ranges: [] }; }
  const s = found[i][0], at = s.toLowerCase().indexOf(c.tokens[i].value);
  return { snippet: s, ranges: at >= 0 ? [[at, at + c.tokens[i].value.length]] : [] };
}

function scanChat(chat: Chat, c: Compiled, ctx: Ctx, now: number): Result | null {
  const found = c.tokens.map((t) => matchedBy(chat, t, ctx));
  if (found.some((f) => !f.length)) { return null; }
  const body = scanBody(chat, c.terms, now);
  if (body.counts.some((n) => n === 0)) { return null; }
  const tokenHits = found.reduce((a, f) => a + f.length, 0);
  const weightSum = body.weightSum + tokenHits * weightAt(chat.last, now);
  const snip = body.idx >= 0 ? snippetOf(body.text, body.idx, c.terms, 40, 120) : tokenSnippet(c, found);
  return {
    id: chat.id, title: chat.title, hits: body.counts.reduce((a, b) => a + b, 0) + tokenHits, last: chat.last,
    project: projectOf(chat), ...statFields(chat), ...snip,
    score: scoreOf(chat.title, c.terms, weightSum, chat.last, now),
  };
}

/** Search the in-memory index; streams one callback per chat and yields to the event loop. */
export async function searchIndex(
  chats: Chat[], c: Compiled, o: Options, folders: string[], ctx: Ctx, sig: Abort, onFile?: OnFile,
): Promise<Result[]> {
  const cutoff = cutoffOf(o.when);
  const dirs = new Set(folders.map(encode));
  const todo = chats.filter((x) => x.mtime >= cutoff && (o.all || dirs.has(x.dir)))
    .sort((a, b) => b.mtime - a.mtime);
  const out: Result[] = [];
  const now = Date.now();
  let lastYield = Date.now();
  for (let i = 0; i < todo.length && !sig.aborted; i++) {
    let r = scanChat(todo[i], c, ctx, now);
    if (r && r.last < cutoff) { r = null; }
    if (r) { out.push(r); }
    onFile?.(r, i + 1, todo.length);
    if (Date.now() - lastYield > 12) {
      await new Promise((res) => setImmediate(res));
      lastYield = Date.now();
    }
  }
  const pin = (r: Result) => (ctx.pins.has(r.id) ? 1 : 0);
  return out.sort((a, b) => pin(b) - pin(a) || b.score - a.score).slice(0, MAX_RESULTS);
}

/** Messages with a match for any term, newest first, with the earliest match offset. */
function messageHits(chat: Chat, terms: RegExp[]): Array<{ m: Msg; first: number }> {
  const hits: Array<{ m: Msg; first: number }> = [];
  for (const m of chat.messages) {
    let first = -1;
    for (const re of terms) { for (const [st] of matches(re, m.text)) { if (first < 0 || st < first) { first = st; } break; } }
    if (first >= 0) { hits.push({ m, first }); }
  }
  return hits.sort((a, b) => b.m.ts - a.m.ts);
}

/** Matching messages of one chat (newest first), and matched files/commands for active tokens. */
export function expandChat(chat: Chat, c: Compiled, ctx: Ctx, offset: number): Expanded {
  const hits = c.terms.length ? messageHits(chat, c.terms) : [];
  const items: ExpandItem[] = hits.slice(offset, offset + EXPAND_PAGE)
    .map((h) => ({ role: h.m.role, ts: h.m.ts, ...snippetOf(h.m.text, h.first, c.terms, 100, 200) }));
  const files = new Map<string, boolean>();
  const commands = new Set<string>();
  for (const t of c.tokens) {
    if (t.kind === 'cmd') { matchedBy(chat, t, ctx).forEach((s) => commands.add(s)); }
    if (t.kind === 'file' || t.kind === 'edited') {
      for (const p of matchedBy(chat, t, ctx)) { files.set(p, chat.files.some((f) => f.path === p && f.edited)); }
    }
  }
  return {
    items, total: hits.length,
    files: [...files].slice(0, 50).map(([p, edited]) => ({ path: p, edited })),
    commands: [...commands].slice(0, 50), related: [],
  };
}
