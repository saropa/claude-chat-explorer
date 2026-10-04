import { startOf } from './blob';
import { ctxInfo } from './contextWindow';
import { matchedBy } from './match';
import { matches } from './snippet';
import { candidates, findIn, Found, gitView, pacer, rank, scanOf, Scan, Source, toResult } from './search';
import { STATUS_KEYS, statusesOf } from './status';
import { Abort, Chat, Compiled, Ctx, Options, Rec, Result } from './types';
import { inWin, subWinOf, topWinOf, WinOf } from './window';

export const MAX_EXPORT_LINES = 50000;
export const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
const JOIN_CHUNK = 5000;

export interface ExportOpts { context: boolean; unique: boolean; statuses: string[]; }
export type CapBy = '' | 'lines' | 'bytes';
export interface ExportOut { text: string; lines: number; chats: number; capped: boolean; capBy: CapBy; }
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

/** Collects output lines: optional unique-by-text, capped at MAX_EXPORT_LINES lines and MAX_EXPORT_BYTES bytes. */
export class Lines {
  readonly out: string[] = [];
  capBy: CapBy = '';
  private bytes = 0;
  private seen = new Set<string>();

  constructor(private readonly x: Pick<ExportOpts, 'context' | 'unique'>) {}

  get capped(): boolean { return this.capBy !== ''; }

  /** Add one line; false once a cap is hit. A duplicate (unique mode) is skipped and returns true. */
  add(prefix: string, text: string): boolean {
    if (this.capBy) { return false; }
    if (this.x.unique && this.seen.has(text)) { return true; }
    const line = this.x.context ? prefix + text : text, n = Buffer.byteLength(line) + 1;
    if (this.out.length >= MAX_EXPORT_LINES) { this.capBy = 'lines'; return false; }
    if (this.bytes + n > MAX_EXPORT_BYTES) { this.capBy = 'bytes'; return false; }
    if (this.x.unique) { this.seen.add(text); }
    this.bytes += n;
    this.out.push(line);
    return true;
  }
}

const has = (re: RegExp, s: string): boolean => { re.lastIndex = 0; return re.test(s); };

/** Who wrote message i: You, Claude, or Subagent:<type> inside a subagent file. */
const whoOf = (rec: Rec, i: number, sub?: string): string => (sub !== undefined ? `Subagent:${sub}` : rec.roles[i] === 0 ? 'You' : 'Claude');

interface Src { chat: Chat; title: string; file: string; sub?: string; win?: WinOf; }

/** Lines of a message to export: each line holding a match, else the lines a multi-line match spans. */
function lineTexts(text: string, terms: RegExp[]): string[] {
  const hit = text.split('\n').filter((ln) => terms.some((re) => has(re, ln)));
  if (hit.length) { return hit; }
  let at: [number, number] | undefined;
  for (const re of terms) { for (const r of matches(re, text)) { if (!at || r[0] < at[0]) { at = r; } break; } }
  if (!at) { return []; }
  const from = at[0] === 0 ? 0 : text.lastIndexOf('\n', at[0] - 1) + 1, to = text.indexOf('\n', Math.max(at[0], at[1] - 1));
  return text.slice(from, to < 0 ? undefined : to).split('\n');
}

/** Emit every line of every windowed message that holds a match; false when the cap stopped it. */
function messageLines(s: Src, rec: Rec, c: Compiled, L: Lines): boolean {
  const win = s.win?.(rec);
  for (let i = 0; i < rec.ts.length; i++) {
    if (win && !inWin(win, rec, i)) { continue; }
    const text = rec.text.slice(startOf(rec, i), rec.ends[i]);
    if (!c.terms.some((re) => has(re, text))) { continue; }
    const prefix = `${s.file}:${rec.lines[i]}: ${s.title} | ${localStamp(rec.ts[i])} | ${whoOf(rec, i, s.sub)} | `;
    for (const ln of lineTexts(text, c.terms)) { if (!L.add(prefix, ln.replace(/\r$/, ''))) { return false; } }
  }
  return true;
}

/** Emit the matched file paths and commands of file:, edited: and cmd: tokens as lines. */
function tokenLines(s: Src, rec: Rec, c: Compiled, ctx: Ctx, tagId: string, L: Lines): boolean {
  const who = s.sub !== undefined ? `Subagent:${s.sub}` : '-';
  const prefix = `${s.file}:0: ${s.title} | ${localStamp(s.chat.last)} | ${who} | `;
  for (const t of c.tokens) {
    if (t.kind === 'tag') { continue; }
    for (const m of matchedBy(s.chat, rec, t, ctx, tagId, s.win?.(rec))) { if (!L.add(prefix, m)) { return false; } }
  }
  return true;
}

/** Every line of one found parent (its own chat, then its subagents); false when the cap stopped it. */
function emitFound(sc: Scan, f: Found, L: Lines): boolean {
  const { ix, c, ctx } = sc;
  const pw = subWinOf(c.last, () => ix.rec(f.p));
  const jobs: Src[] = f.own ? [{ chat: gitView(sc, f.p, f.subs.map(([s]) => s)), title: f.p.title, file: ix.fileOf(f.p), win: topWinOf(c.last) }] : [];
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
  return statusesOf({ msgs: p.count, last: p.last, size: p.size, ctx: ctxInfo(p.use) }, ctx.pins.has(p.id), now, ctx.dots?.[p.id]).some((k) => want.has(k));
}

/** Matches of the whole search with no result cap, in display order (pinned, then score). */
async function collect(sc: Scan, folders: string[], x: ExportOpts, sig: Abort, tick: OnTick): Promise<Found[]> {
  const todo = candidates(sc.ix, sc.o, folders, sc.cutoff);
  const pace = pacer();
  const rows: Array<{ f: Found; r: Result }> = [];
  for (let i = 0; i < todo.length && !sig.aborted; i++) {
    if (sc.ctx.archived?.has(todo[i].id)) { continue; } // archived chats are not exported
    const f = findIn(sc, todo[i]);
    if (f && statusOk(x.statuses, f, sc.ctx, sc.now)) { rows.push({ f, r: toResult(sc, f, 0) }); }
    tick(i + 1, todo.length);
    await pace();
  }
  const order = new Map(rank(rows.map((w) => w.r), sc.ctx).map((r, i) => [r, i]));
  return rows.sort((a, b) => order.get(a.r)! - order.get(b.r)!).map((w) => w.f);
}

/** Join lines in chunks, yielding and ticking between them so the host's stall timer keeps resetting. */
async function joinLines(out: string[], sig: Abort, tick: OnTick): Promise<string> {
  const parts: string[] = [], pace = pacer();
  for (let i = 0; i < out.length && !sig.aborted; i += JOIN_CHUNK) {
    parts.push(out.slice(i, i + JOIN_CHUNK).join('\n'));
    tick(Math.min(i + JOIN_CHUNK, out.length), out.length);
    await pace();
  }
  return parts.length ? parts.join('\n') + '\n' : '';
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
  const text = await joinLines(L.out, sig, tick);
  return { text, lines: L.out.length, chats, capped: L.capped, capBy: L.capBy };
}
