import * as vscode from 'vscode';
import { DebouncedWriter } from './debounced';
import { addToHistory, dedupeHistory, HistItem } from './history';
import { STATUS_KEYS } from './status';
import { Result } from './types';

const STATE_KEY = 'saropaChatSearch.state';
const RESULTS_KEY = 'saropaChatSearch.results';
const HIST_KEY = 'saropaChatSearch.history';
const PIN_KEY = 'saropaChatSearch.pins';
const STATUS_KEY = 'saropaChatSearch.statuses';
const TAG_KEY = 'saropaChatSearch.tags';
const EXPORT_KEY = 'saropaChatSearch.export';
const ARCH_KEY = 'saropaChatSearch.archived';
const UNREAD_KEY = 'saropaChatSearch.unread';
const ARCH_OPEN_KEY = 'saropaChatSearch.archOpen';
const UNREAD_MAX = 500;

export type { HistItem };
export interface Draft extends HistItem { sort: string; }
export interface Saved extends Draft { results: Result[]; searched: string; }
export interface ExportPrefs { context: boolean; unique: boolean; }

export const normTag = (raw: string): string =>
  raw.trim().toLowerCase().replace(/^tag:/, '').replace(/\s+/g, '-').slice(0, 40);

const BLANK: Draft = { query: '', all: false, cs: false, ww: false, re: false, any: false, when: 'any', subs: true, last: 0, sort: 'score' };

/** Workspace state (last search, history) and global state (pins, tags). Workspace writes are debounced. */
export class Store {
  private readonly w: DebouncedWriter;

  constructor(private readonly ctx: vscode.ExtensionContext, onError?: (e: unknown) => void) {
    this.w = new DebouncedWriter(ctx.workspaceState);
    this.w.onError = onError;
  }

  /** Read a workspace value, preferring one still waiting to be written. */
  private read<T>(key: string): T | undefined {
    return (this.w.has(key) ? this.w.get(key) : this.ctx.workspaceState.get(key)) as T | undefined;
  }

  /** Write everything pending (deactivate). */
  flush(): Promise<void> { return this.w.flush(); }

  /** Query, options and sort as last typed. Results come from the last completed search. */
  get draft(): Draft {
    const { results: _r, searched: _s, ...s } = this.read<Saved>(STATE_KEY) ?? BLANK as Saved; // legacy states held results; drop them
    return { ...BLANK, ...s, subs: s.subs !== false, last: s.last || 0 }; // older states lack subs and last
  }
  setDraft(d: Draft): void { this.w.put(STATE_KEY, d); }

  get state(): Saved {
    const s = this.read<Saved>(STATE_KEY);
    const r = this.read<{ results: Result[]; searched: string }>(RESULTS_KEY);
    return { ...this.draft, results: r?.results ?? s?.results ?? [], searched: r?.searched ?? s?.searched ?? '' };
  }
  /** Save a completed search: its draft and its results. */
  setState(s: Saved): void {
    const { results, searched, ...d } = s;
    this.setDraft(d);
    this.w.put(RESULTS_KEY, { results, searched });
  }

  get history(): HistItem[] { return dedupeHistory(this.read<HistItem[]>(HIST_KEY) ?? []); }
  setHistory(h: HistItem[]): void { this.w.put(HIST_KEY, h); }
  addHistory(item: HistItem): HistItem[] {
    const h = addToHistory(this.history, item);
    this.setHistory(h);
    return h;
  }

  /** Checked statuses of the status filter; all of them by default. Kept out of history entries. */
  get statuses(): string[] { return this.read<string[]>(STATUS_KEY) ?? [...STATUS_KEYS]; }
  setStatuses(checked: unknown): void {
    this.w.put(STATUS_KEY, Array.isArray(checked) ? STATUS_KEYS.filter((k) => checked.includes(k)) : [...STATUS_KEYS]);
  }

  get exportPrefs(): ExportPrefs {
    const p = this.read<Partial<ExportPrefs>>(EXPORT_KEY);
    return { context: !!p?.context, unique: !!p?.unique };
  }
  setExportPrefs(p: ExportPrefs): void { this.w.put(EXPORT_KEY, { context: !!p.context, unique: !!p.unique }); }

  get pins(): { [id: string]: number } { return this.ctx.globalState.get(PIN_KEY) ?? {}; }
  get tags(): { [id: string]: string[] } { return this.ctx.globalState.get(TAG_KEY) ?? {}; }
  get allTags(): string[] { return [...new Set(Object.values(this.tags).flat())].sort(); }

  /** Archived chat ids (global, like Claude's own list). */
  get archived(): Set<string> { return new Set(this.ctx.globalState.get<string[]>(ARCH_KEY) ?? []); }
  async setArchived(id: string, on: boolean): Promise<void> {
    const a = this.archived;
    if (on) { a.add(id); } else { a.delete(id); }
    await this.ctx.globalState.update(ARCH_KEY, [...a]);
  }
  /** Merge ids into the archived set; added counts new ones. */
  async addArchived(ids: string[]): Promise<{ added: number; already: number }> {
    const a = this.archived, before = a.size;
    ids.forEach((id) => a.add(id));
    await this.ctx.globalState.update(ARCH_KEY, [...a]);
    return { added: a.size - before, already: ids.length - (a.size - before) };
  }

  /** Chats that finished while the owner was away (our approximation), newest last. */
  get unread(): Set<string> { return new Set(this.ctx.globalState.get<string[]>(UNREAD_KEY) ?? []); }
  setUnread(s: Set<string>): void { void this.ctx.globalState.update(UNREAD_KEY, [...s].slice(-UNREAD_MAX)); }
  async clearUnread(id: string): Promise<void> {
    const u = this.unread;
    u.delete(id);
    await this.ctx.globalState.update(UNREAD_KEY, [...u]);
  }

  /** Whether the Archived section is expanded in this workspace. */
  get archOpen(): boolean { return this.read<boolean>(ARCH_OPEN_KEY) === true; }
  setArchOpen(open: boolean): void { this.w.put(ARCH_OPEN_KEY, !!open); }

  async togglePin(id: string): Promise<void> {
    const p = { ...this.pins };
    if (p[id]) { delete p[id]; } else { p[id] = Date.now(); }
    await this.ctx.globalState.update(PIN_KEY, p);
  }
  async addTag(id: string, raw: string): Promise<void> {
    const t = normTag(raw);
    if (!t) { return; }
    const all = { ...this.tags };
    all[id] = [...new Set([...(all[id] ?? []), t])];
    await this.ctx.globalState.update(TAG_KEY, all);
  }
  async removeTag(id: string, tag: string): Promise<void> {
    const all = { ...this.tags };
    const left = (all[id] ?? []).filter((t) => t !== tag);
    if (left.length) { all[id] = left; } else { delete all[id]; }
    await this.ctx.globalState.update(TAG_KEY, all);
  }
}
