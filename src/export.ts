import { startOf } from './blob';
import { matchedBy } from './match';
import { candidates, findIn, Found, pacer, rank, scanOf, Scan, Source, toResult } from './search';
import { STATUS_KEYS, statusesOf } from './status';
import { Abort, Chat, Compiled, Ctx, Options, Rec, Result } from './types';
import { inWin, subWinOf, topWinOf, WinOf } from './window';

export const MAX_EXPORT_LINES = 50000;

export interface ExportOpts { context: boolean; unique: boolean; statuses: string[]; }
export interface ExportOut { text: string; lines: number; chats: number; capped: boolean; }
export type OnTick = (done: number, total: number) => void;

const pad = (n: number) => String(n).padStart(2, '0');

/** Default save name: YYYYMMDD_HHMM_chat_search_export.txt (local time). */
export const exportName = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}_chat_search_export.txt`;

/** Local date and time, YYYY-MM-DD HH:MM:SS; "-" when unknown. */
export function localStamp(ms: number): string {
  if (!ms) { return '-'; }
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Collects output lines: optional unique-by-text, capped at MAX_EXPORT_LINES. */
export class Lines {
  readonly out: string[] = [];
  capped = false;
  private seen = new Set<string>();

  constructor(private readonly x: Pick<ExportOpts, 'context' | 'unique'>) {}

  /** Add one line; false once the cap is hit. A duplicate (unique mode) is skipped and returns true. */
  add(prefix: string, text: string): boolean {
    if (this.capped) { return false; }
    if (this.x.unique && this.seen.has(text)) { return true; }
    if (this.out.length >= MAX_EXPORT_LINES) { this.capped = true; return false; }
    if (this.x.unique) { this.seen.add(text); }
    this.out.push(this.x.context ? prefix + text : text);
    return true;
  }
}

const has = (re: RegExp, s: string): boolean => { re.lastIndex = 0; return re.test(s); };

/** Who wrote message i: You, Claude, or Subagent:<type> inside a subagent file. */
const whoOf = (rec: Rec, i: number, sub?: string): string => (sub !== undefined ? `Subagent:${sub}` : rec.roles[i] === 0 ? 'You' : 'Claude');

interface Src { chat: Chat; title: string; file: string; sub?: string; win?: WinOf; }

/** Emit every line of every windowed message that holds a match; false when the cap stopped it. */
function messageLines(s: Src, rec: Rec, c: Compiled, L: Lines): boolean {
  const win = s.win?.(rec);
  for (let i = 0; i < rec.ts.length; i++) {
    if (win && !inWin(win, rec, i)) { continue; }
    const text = rec.text.slice(startOf(rec, i), rec.ends[i]);
    if (!c.terms.some((re) => has(re, text))) { continue; }
    const prefix = `${s.file}:${rec.lines[i]}: ${s.title} | ${localStamp(rec.ts[i])} | ${whoOf(rec, i, s.sub)} | `;
    for (const ln of text.split('\n')) {
      if (c.terms.some((re) => has(re, ln)) && !L.add(prefix, ln.replace(/\r$/, ''))) { return false; }
    }
  }
  return true;
}

/** Emit the matched file paths and commands of file:, edited: and cmd: tokens as lines. */
function tokenLines(s: Src, rec: Rec, c: Compiled, ctx: Ctx, tagId: string, L: Lines): boolean {
  const who = s.sub !== undefined ? `Subagent:${s.sub}` : '-';
  const prefix = `${s.file}:0: ${s.title} | ${localStamp(s.chat.last)} | ${who} | `;
  for (const t of c.tokens) {
    if (t.kind === 'tag') { continue; }
    for (const m of matchedBy(s.chat, rec, t, ctx, tagId)) { if (!L.add(prefix, m)) { return false; } }
  }
  return true;
}

/** Every line of one found parent (its own chat, then its subagents); false when the cap stopped it. */
function emitFound(sc: Scan, f: Found, L: Lines): boolean {
  const { ix, c, ctx } = sc;
  const pw = subWinOf(c.last, () => ix.rec(f.p));
  const jobs: Src[] = f.own ? [{ chat: f.p, title: f.p.title, file: ix.fileOf(f.p), win: topWinOf(c.last) }] : [];
  for (const [s] of f.subs) { jobs.push({ chat: s, title: f.p.title, file: ix.fileOf(s), sub: s.agentType ?? '', win: pw }); }
  for (const j of jobs) {
    const rec = ix.rec(j.chat);
    if (!messageLines(j, rec, c, L) || !tokenLines(j, rec, c, ctx, f.p.id, L)) { return false; }
  }
  return true;
}

/** True when the parent passes the status filter (all statuses checked passes everything). */
function statusOk(statuses: string[], f: Found, ctx: Ctx, now: number): boolean {
  if (statuses.length >= STATUS_KEYS.length) { return true; }
  const want = new Set(statuses), p = f.p;
  return statusesOf({ msgs: p.count, last: p.last, size: p.size }, ctx.pins.has(p.id), now).some((k) => want.has(k));
}

/** Matches of the whole search with no result cap, in display order (pinned, then score). */
async function collect(sc: Scan, folders: string[], x: ExportOpts, sig: Abort, tick: OnTick): Promise<Found[]> {
  const todo = candidates(sc.ix, sc.o, folders, sc.cutoff);
  const pace = pacer();
  const rows: Array<{ f: Found; r: Result }> = [];
  for (let i = 0; i < todo.length && !sig.aborted; i++) {
    const f = findIn(sc, todo[i]);
    if (f && statusOk(x.statuses, f, sc.ctx, sc.now)) { rows.push({ f, r: toResult(sc, f, 0) }); }
    tick(i + 1, todo.length);
    await pace();
  }
  const order = new Map(rank(rows.map((w) => w.r), sc.ctx).map((r, i) => [r, i]));
  return rows.sort((a, b) => order.get(a.r)! - order.get(b.r)!).map((w) => w.f);
}

/** Re-run the search without the 500-row cap and emit one output line per matching line. */
export async function exportIndex(
  ix: Source, c: Compiled, o: Options, folders: string[], ctx: Ctx, sig: Abort, x: ExportOpts, tick: OnTick,
): Promise<ExportOut> {
  const sc = scanOf(ix, c, o, ctx);
  const found = await collect(sc, folders, x, sig, tick);
  const L = new Lines(x);
  const pace = pacer();
  let chats = 0;
  for (let i = 0; i < found.length && !sig.aborted && !L.capped; i++) {
    const before = L.out.length;
    emitFound(sc, found[i], L);
    if (L.out.length > before) { chats++; }
    tick(i + 1, found.length);
    await pace();
  }
  const text = L.out.length ? L.out.join('\n') + '\n' : '';
  return { text, lines: L.out.length, chats, capped: L.capped };
}
