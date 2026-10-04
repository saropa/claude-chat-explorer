/** Context-full warnings for live sessions: pure logic with injected clock, index lookup, saved state and toast. */
import { ctxInfo } from './contextWindow';
import { Chat } from './types';

export const LEVELS = [80, 90];
export const RECENT_MS = 10 * 60 * 1000;
export const MAX_TOASTS = 3;
const REARM_GAP = 10; // warned again after the percent falls this far below the level
const MAX_SESSIONS = 200;
const TITLE_MAX = 60;

/** Saved per session: level -> compaction count when it warned. */
export type WarnState = { [id: string]: { [level: string]: number } };
export interface CtxReply { [id: string]: { pct: number; comp: number; approx: boolean; title: string } }
export interface Warning { id: string; title: string; level: number; pct: number; }

export interface WarnDeps {
  enabled(): boolean;
  now(): number;
  info(ids: string[]): Promise<CtxReply>;
  load(): WarnState;
  save(s: WarnState): void;
  show(w: Warning): void;
  log(msg: string): void;
}

/** Index answer for the given session ids: percent, compactions, approximation and title (chats without usage are left out). */
export function ctxReply(find: (id: string) => Chat | undefined, ids: string[]): CtxReply {
  const out: CtxReply = {};
  for (const id of ids) {
    const c = find(id), x = c && ctxInfo(c.use);
    if (c && x) { out[id] = { pct: x.pct, comp: x.comp, approx: x.approx, title: c.title }; }
  }
  return out;
}

/** Toast text for a level. */
export function warnText(title: string, level: number): string {
  const t = title.length > TITLE_MAX ? title.slice(0, TITLE_MAX) + '...' : title;
  return level >= 90 ? `Chat "${t}" is 90% full. Start a new chat or run /compact soon.` : `Chat "${t}" is 80% full. Claude may auto-compact soon.`;
}

/** Drop warned marks that a compaction or a fall below level minus 10 has re-armed. */
export function rearm(st: WarnState, id: string, pct: number, comp: number): boolean {
  const e = st[id];
  let changed = false;
  for (const k of Object.keys(e ?? {})) {
    if (comp > e[k] || pct < Number(k) - REARM_GAP) { delete e[k]; changed = true; }
  }
  if (e && !Object.keys(e).length) { delete st[id]; }
  return changed;
}

export class ContextWarner {
  atOrAbove80 = 0; // live sessions at 80 percent or more at the last check, for Show Diagnostics
  private recent: number[] = [];

  constructor(private readonly d: WarnDeps) {}

  /** One poll cycle: re-arm, count, and show at most one new warning (at most 3 in 10 minutes). */
  async check(live: Iterable<string>): Promise<void> {
    try {
      const ids = [...live], info = await this.d.info(ids), st = this.d.load();
      let changed = false;
      this.atOrAbove80 = Object.values(info).filter((x) => x.pct >= LEVELS[0]).length;
      for (const id of ids) { if (info[id] && rearm(st, id, info[id].pct, info[id].comp)) { changed = true; } }
      const w = this.d.enabled() && this.room() ? this.pick(ids, info, st) : undefined;
      if (w) { this.mark(st, w, info[w.id].comp); changed = true; this.recent.push(this.d.now()); this.d.show(w); }
      if (changed) { this.d.save(trim(st)); }
    } catch (e) { this.d.log('context warnings: ' + String(e)); }
  }

  private room(): boolean {
    const now = this.d.now();
    this.recent = this.recent.filter((t) => now - t < RECENT_MS);
    return this.recent.length < MAX_TOASTS;
  }

  /** The unwarned session with the highest percent; an approximate figure counts only from 90. */
  private pick(ids: string[], info: CtxReply, st: WarnState): Warning | undefined {
    const c: Warning[] = [];
    for (const id of ids) {
      const x = info[id];
      const level = x && [...LEVELS].reverse().find((l) => x.pct >= l);
      if (!x || !level || st[id]?.[level] !== undefined || (x.approx && x.pct < 90)) { continue; }
      c.push({ id, title: x.title, level, pct: x.pct });
    }
    return c.sort((a, b) => b.pct - a.pct)[0];
  }

  /** Mark the reached level and every lower one as warned. */
  private mark(st: WarnState, w: Warning, comp: number): void {
    const e = st[w.id] ?? (st[w.id] = {});
    for (const l of LEVELS) { if (l <= w.level) { e[l] = comp; } }
  }
}

const trim = (st: WarnState): WarnState => {
  const k = Object.keys(st);
  for (const id of k.slice(0, Math.max(0, k.length - MAX_SESSIONS))) { delete st[id]; }
  return st;
};
