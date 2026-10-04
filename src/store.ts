import * as vscode from 'vscode';
import { STATUS_KEYS } from './status';
import { Result } from './types';

const STATE_KEY = 'saropaChatSearch.state';
const HIST_KEY = 'saropaChatSearch.history';
const PIN_KEY = 'saropaChatSearch.pins';
const STATUS_KEY = 'saropaChatSearch.statuses';
const TAG_KEY = 'saropaChatSearch.tags';
const HIST_MAX = 20;

export interface HistItem { query: string; all: boolean; cs: boolean; ww: boolean; re: boolean; when: string; }
export interface Saved extends HistItem { sort: string; results: Result[]; searched: string; }

export const normTag = (raw: string): string =>
  raw.trim().toLowerCase().replace(/^tag:/, '').replace(/\s+/g, '-').slice(0, 40);

/** Workspace state (last search, history) and global state (pins, tags). */
export class Store {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  get state(): Saved {
    return this.ctx.workspaceState.get<Saved>(STATE_KEY)
      ?? { query: '', all: false, cs: false, ww: false, re: false, when: 'any', sort: 'score', results: [], searched: '' };
  }
  setState(s: Saved): Thenable<void> { return this.ctx.workspaceState.update(STATE_KEY, s); }

  get history(): HistItem[] { return this.ctx.workspaceState.get<HistItem[]>(HIST_KEY) ?? []; }
  setHistory(h: HistItem[]): Thenable<void> { return this.ctx.workspaceState.update(HIST_KEY, h); }
  async addHistory(item: HistItem): Promise<HistItem[]> {
    const same = (a: HistItem) => a.query === item.query && a.cs === item.cs && a.ww === item.ww && a.re === item.re && a.when === item.when;
    const h = [item, ...this.history.filter((x) => !same(x))].slice(0, HIST_MAX);
    await this.setHistory(h);
    return h;
  }

  /** Checked statuses of the status filter; all of them by default. Kept out of history entries. */
  get statuses(): string[] { return this.ctx.workspaceState.get<string[]>(STATUS_KEY) ?? [...STATUS_KEYS]; }
  setStatuses(checked: unknown): Thenable<void> {
    const list = Array.isArray(checked) ? STATUS_KEYS.filter((k) => checked.includes(k)) : [...STATUS_KEYS];
    return this.ctx.workspaceState.update(STATUS_KEY, list);
  }

  get pins(): { [id: string]: number } { return this.ctx.globalState.get(PIN_KEY) ?? {}; }
  get tags(): { [id: string]: string[] } { return this.ctx.globalState.get(TAG_KEY) ?? {}; }
  get allTags(): string[] { return [...new Set(Object.values(this.tags).flat())].sort(); }

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
