import { startOf } from './blob';
import { ExportOpts, statusOk } from './export';
import { matchedBy } from './match';
import { Abort, Chat, Compiled, Ctx, Options, Rec, Result } from './types';
import { candidates, findIn, Found, gitView, pacer, rank, scanOf, Scan, Source, toResult } from './search';
import { mergeRanges, matches, Range } from './snippet';
import { inWin, subWinOf, topWinOf, WinOf } from './window';

export const EDITOR_MAX_RESULTS = 20000; // match occurrences listed in the editor
const MAX_LINE = 300; // characters of one listed line
const LEAD_CUT = 80;

/** One listed line: its text and the match ranges in it (null for a context line). */
export interface EdRow { t: string; r: Range[] | null; }
/** Lines of one message: n is the JSONL line number of the message (0 for a matched token), sub the subagent type when it came from one. */
export interface EdHit { n: number; sub?: string; rows: EdRow[]; }
export interface EdChat { id: string; title: string; project: string; last: number; hits: EdHit[]; }
export interface EdOut { chats: EdChat[]; results: number; totalChats: number; chatsCapped: boolean; resultsCapped: boolean; }
export type OnTick = (done: number, total: number) => void;

const has = (re: RegExp, s: string): boolean => { re.lastIndex = 0; return re.test(s); };

/** A line cut to MAX_LINE characters around its first match, ranges shifted to match. */
export function clip(t: string, r: Range[]): EdRow {
  if (t.length <= MAX_LINE) { return { t, r }; }
  const from = r.length ? Math.max(0, r[0][0] - LEAD_CUT) : 0, cut = t.slice(from, from + MAX_LINE);
  const pre = from > 0 ? '…' : '', shift = pre.length - from;
  const kept = r.filter((x) => x[0] >= from && x[1] <= from + MAX_LINE).map((x): Range => [x[0] + shift, x[1] + shift]);
  return { t: pre + cut + (from + MAX_LINE < t.length ? '…' : ''), r: kept };
}

/** Indexes of the lines holding a match; for a match that spans lines, the lines it spans. */
function hitLines(lines: string[], text: string, terms: RegExp[]): number[] {
  const hit = lines.map((l, i) => (terms.some((re) => has(re, l)) ? i : -1)).filter((i) => i >= 0);
  if (hit.length) { return hit; }
  let at: Range | undefined;
  for (const re of terms) { for (const r of matches(re, text)) { if (!at || r[0] < at[0]) { at = r; } break; } }
  if (!at) { return []; }
  const a = text.slice(0, at[0]).split('\n').length - 1, b = text.slice(0, Math.max(at[0], at[1] - 1)).split('\n').length - 1;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/** Blocks of one message: each hit line with one line of context each side; touching blocks merge. */
export function blocksOf(text: string, terms: RegExp[], n: number, sub?: string): { hits: EdHit[]; count: number } {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')), idx = hitLines(lines, text, terms);
  const show = new Set<number>(), hitSet = new Set(idx);
  for (const i of idx) { for (let k = i - 1; k <= i + 1; k++) { if (k >= 0 && k < lines.length) { show.add(k); } } }
  const hits: EdHit[] = [];
  let cur: EdHit | undefined, count = 0;
  for (const i of [...show].sort((a, b) => a - b)) {
    if (!show.has(i - 1) || !cur) { cur = { n, rows: [] }; if (sub !== undefined) { cur.sub = sub; } hits.push(cur); }
    const rg = hitSet.has(i) ? mergeRanges(terms.flatMap((re) => [...matches(re, lines[i])])) : null;
    if (rg) { count += Math.max(1, rg.length); }
    cur.rows.push(rg ? clip(lines[i], rg) : { t: lines[i].slice(0, MAX_LINE), r: null });
  }
  return { hits, count };
}

interface Src { chat: Chat; sub?: string; win?: WinOf; }

/** Lines of one chat file (own chat or subagent): its matching messages, then its matched file and command tokens. */
function fileHits(s: Src, rec: Rec, c: Compiled, ctx: Ctx, tagId: string, room: number): { hits: EdHit[]; count: number } {
  const out: EdHit[] = [], win = s.win?.(rec);
  let count = 0;
  for (let i = 0; i < rec.ts.length && count < room; i++) {
    if (win && !inWin(win, rec, i)) { continue; }
    const text = rec.text.slice(startOf(rec, i), rec.ends[i]);
    if (!c.terms.some((re) => has(re, text))) { continue; }
    const b = blocksOf(text, c.terms, rec.lines[i], s.sub);
    out.push(...b.hits); count += b.count;
  }
  for (const t of c.tokens) {
    if (t.kind === 'tag') { continue; }
    for (const m of matchedBy(s.chat, rec, t, ctx, tagId, win)) {
      const hit: EdHit = { n: 0, rows: [{ t: m, r: [[0, m.length]] }] };
      if (s.sub !== undefined) { hit.sub = s.sub; }
      out.push(hit); count++;
    }
  }
  return { hits: out, count };
}

function chatOf(sc: Scan, f: Found, room: number): { chat: EdChat; count: number } {
  const { ix, c, ctx } = sc;
  const pw = subWinOf(c.last, () => ix.rec(f.p));
  const jobs: Src[] = f.own ? [{ chat: gitView(sc, f.p, f.subs.map(([s]) => s)), win: topWinOf(c.last) }] : [];
  for (const [s] of f.subs) { jobs.push({ chat: s, sub: s.agentType ?? '', win: pw }); }
  const chat: EdChat = { id: f.p.id, title: f.p.title, project: '', last: f.p.last, hits: [] };
  let count = 0;
  for (const j of jobs) {
    const r = fileHits(j, ix.rec(j.chat), c, ctx, f.p.id, room - count);
    chat.hits.push(...r.hits); count += r.count;
  }
  return { chat, count };
}

const ctxKey = (r: Result): number => (r.ctx ? r.ctx.pct * 1e9 + r.ctx.tokens : -1);
const stampOf = (r: Result): number => (r.hits > 0 && r.snipAt ? r.snipAt : r.last);

/** Chats in the order the panel shows them for the sort key (pinned first). */
export function orderBy(rows: Array<{ f: Found; r: Result }>, sort: string, ctx: Ctx): Array<{ f: Found; r: Result }> {
  const base = rank(rows.map((w) => w.r), ctx), at = new Map(base.map((r, i) => [r, i]));
  const key: { [k: string]: (a: Result, b: Result) => number } = {
    time: (a, b) => stampOf(b) - stampOf(a), title: (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
    length: (a, b) => (b.msgs || 0) - (a.msgs || 0), cost: (a, b) => (b.cost || 0) - (a.cost || 0), context: (a, b) => ctxKey(b) - ctxKey(a),
  };
  const pin = (r: Result) => (ctx.pins.has(r.id) ? 1 : 0), cmp = key[sort];
  return rows.sort((a, b) => pin(b.r) - pin(a.r) || (cmp ? cmp(a.r, b.r) : 0) || at.get(a.r)! - at.get(b.r)!);
}

/** The same search as the panel, every matching line with one line of context each side, for the results editor. */
export async function editorIndex(
  ix: Source, c: Compiled, o: Options, folders: string[], ctx: Ctx, sig: Abort, x: Pick<ExportOpts, 'statuses'> & { sort: string; max: number }, tick: OnTick,
): Promise<EdOut> {
  const sc = scanOf(ix, c, o, ctx), todo = candidates(ix, o, folders, sc.cutoff), pace = pacer();
  const rows: Array<{ f: Found; r: Result }> = [];
  for (let i = 0; i < todo.length && !sig.aborted; i++) {
    if (ctx.archived?.has(todo[i].id)) { continue; }
    const f = findIn(sc, todo[i]);
    if (f && statusOk(x.statuses, f, ctx, sc.now)) { rows.push({ f, r: toResult(sc, f, 0) }); }
    tick(i + 1, todo.length);
    await pace();
  }
  const ordered = orderBy(rows, x.sort, ctx).slice(0, x.max), chats: EdChat[] = [];
  let results = 0, resultsCapped = false;
  for (let i = 0; i < ordered.length && !sig.aborted; i++) {
    const { chat, count } = chatOf(sc, ordered[i].f, EDITOR_MAX_RESULTS - results);
    chat.project = ordered[i].r.project;
    chats.push(chat); results += count;
    if (results >= EDITOR_MAX_RESULTS) { resultsCapped = true; break; }
    tick(i + 1, ordered.length);
    await pace();
  }
  return { chats, results, totalChats: rows.length, chatsCapped: rows.length > x.max, resultsCapped };
}
