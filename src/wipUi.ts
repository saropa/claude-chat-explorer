import * as vscode from 'vscode';
import { WorkerClient } from './client';
import { DotMap } from './liveState';
import { isLive, Mode, pendingCount, View } from './wipModel';
import { buildNodes, WipNode } from './wipNodes';
import { PrCache } from './wipPrs';
import { summaryText } from './wipSummary';
import { collect } from './wipCollect';
import { realExec } from './wipExec';
import { WIP_VIEW, WipTree } from './wipTree';
import { WipData } from './wipTypes';

const CMD = { refresh: 'saropaChatExplorer.wip.refresh', copy: 'saropaChatExplorer.wip.copySummary', chat: 'saropaChatExplorer.wip.groupByChat',
  worktree: 'saropaChatExplorer.wip.groupByWorktree', clean: 'saropaChatExplorer.wip.showClean' };
const KEY_MODE = 'saropaChatExplorer.wipGroup', KEY_CLEAN = 'saropaChatExplorer.wipClean';
const STALE_MS = 60000, IDLE_DEBOUNCE_MS = 10000, DAY_MS = 86400000;
const GIT_MS = 5000, GH_MS = 15000;

export interface WipHost {
  ctx: vscode.ExtensionContext; client: WorkerClient; log: (where: string, e: unknown) => void;
  dots: () => DotMap; archived: () => Set<string>; folders: () => string[];
}

const clamp = (n: unknown, lo: number, hi: number, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);

/** Owns the Work in Progress view: scans on demand, never on a timer while hidden. */
export class WipController {
  private readonly tree = new WipTree();
  private readonly view: vscode.TreeView<WipNode>;
  private readonly cache = new PrCache();
  private data?: WipData;
  private error = '';
  private mode: Mode;
  private clean: boolean;
  private running = false;
  private rerun?: { force: boolean };
  private stale = false;
  private abort = new AbortController();
  private timer?: NodeJS.Timeout;
  private running_ = new Set<string>();

  constructor(private readonly h: WipHost) {
    this.mode = h.ctx.globalState.get<Mode>(KEY_MODE) === 'worktree' ? 'worktree' : 'chat';
    this.clean = h.ctx.globalState.get<boolean>(KEY_CLEAN) === true;
    this.view = vscode.window.createTreeView(WIP_VIEW, { treeDataProvider: this.tree });
  }

  /** Register commands and visibility handling. */
  start(): void {
    const c = vscode.commands.registerCommand;
    this.setContexts();
    this.h.ctx.subscriptions.push(this.view, this.tree, { dispose: () => this.dispose() },
      c(CMD.refresh, () => this.refresh(true)), c(CMD.copy, () => this.copySummary()),
      c(CMD.chat, () => this.setMode('chat')), c(CMD.worktree, () => this.setMode('worktree')), c(CMD.clean, () => this.toggleClean()),
      this.view.onDidChangeVisibility((e) => { if (e.visible) { this.shown(); } }),
      vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('saropaChatExplorer.lookupPullRequests') || e.affectsConfiguration('saropaChatExplorer.workInProgressDays')) { this.later(); } }));
    if (this.view.visible) { this.shown(); }
  }

  private setContexts(): void {
    void vscode.commands.executeCommand('setContext', KEY_MODE, this.mode);
    void vscode.commands.executeCommand('setContext', KEY_CLEAN, this.clean);
  }

  /** The view became visible: scan when never scanned, stale, or older than a minute. */
  private shown(): void {
    if (!this.data || this.stale || Date.now() - this.data.at > STALE_MS) { void this.refresh(false); }
  }

  /** A change while hidden waits for the next time the view is shown. */
  private later(): void { if (this.view.visible) { void this.refresh(false); } else { this.stale = true; } }

  private get viewState(): View { return { mode: this.mode, clean: this.clean, now: Date.now(), dots: this.h.dots() }; }

  /** Redraw from the last scan (state colors, grouping); no new scan. */
  render(): void {
    const d = this.data;
    const nodes = d ? buildNodes(d, this.viewState) : [];
    if (this.error) { nodes.push(errorNode(this.error)); }
    this.tree.set(nodes);
    const n = d ? pendingCount(d, this.h.dots()) : 0;
    this.view.badge = n ? { value: n, tooltip: `${n} chats with work in progress` } : undefined;
  }

  /** Dots changed: redraw, and after a chat went from running to not running scan once, 10 seconds later. */
  onDots(): void {
    const now = new Set(Object.entries(this.h.dots()).filter(([, d]) => d.s === 'running').map(([id]) => id));
    const finished = [...this.running_].some((id) => !now.has(id));
    this.running_ = now;
    this.render();
    if (!finished) { return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.later(), IDLE_DEBOUNCE_MS);
  }

  /** Scan now. A scan already running is repeated once when it ends; force skips the PR cache. */
  async refresh(force: boolean): Promise<void> {
    if (this.running) { this.rerun = { force: force || !!this.rerun?.force }; return; }
    this.running = true;
    this.abort = new AbortController();
    try {
      await vscode.window.withProgress({ location: { viewId: WIP_VIEW } }, () => this.scan(force));
      this.error = '';
    } catch (e) {
      if (!this.abort.signal.aborted) { this.error = 'Could not scan'; this.h.log('work in progress', e); }
    } finally {
      this.running = false;
      this.stale = false;
      this.render();
      const again = this.rerun;
      this.rerun = undefined;
      if (again && !this.abort.signal.aborted) { void this.refresh(again.force); }
    }
  }

  private async scan(force: boolean): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('saropaChatExplorer');
    const days = clamp(cfg.get('workInProgressDays'), 1, 60, 7);
    const now = Date.now(), dots = this.h.dots();
    const live = Object.keys(dots).filter((id) => isLive(dots[id]));
    const all = await this.h.client.request({ t: 'wipChats', since: now - days * DAY_MS, live, folders: this.h.folders() }, true);
    const arch = this.h.archived();
    const chats = (Array.isArray(all) ? all : []).filter((c: { id: string }) => !arch.has(c.id));
    const ctx = { exec: realExec, signal: this.abort.signal, gitMs: GIT_MS, ghMs: GH_MS, flags: { gitMissing: false } };
    this.data = await collect(chats, { ctx, prs: cfg.get('lookupPullRequests') !== false, cache: this.cache, force, now });
  }

  private async copySummary(): Promise<void> {
    if (!this.data) { return; }
    await vscode.env.clipboard.writeText(summaryText(this.data, this.viewState));
    vscode.window.setStatusBarMessage('Work in progress summary copied', 3000);
  }

  private async setMode(m: Mode): Promise<void> {
    this.mode = m;
    await this.h.ctx.globalState.update(KEY_MODE, m);
    this.setContexts();
    this.render();
  }

  private async toggleClean(): Promise<void> {
    this.clean = !this.clean;
    await this.h.ctx.globalState.update(KEY_CLEAN, this.clean);
    this.setContexts();
    this.render();
  }

  /** Lines for Show Diagnostics. */
  diagLines(): string[] {
    const cfg = vscode.workspace.getConfiguration('saropaChatExplorer');
    const s = this.data?.stats;
    return [`work in progress: lookupPullRequests ${cfg.get('lookupPullRequests') !== false}, days ${clamp(cfg.get('workInProgressDays'), 1, 60, 7)}`,
      s ? `last scan: ${s.folders} folders, git ${s.gitMissing ? 'not found' : 'found'}, gh ${s.gh === 'missing' ? 'not found' : s.gh}, ${s.ms} ms` : 'last scan: none yet'];
  }

  dispose(): void { this.abort.abort(); clearTimeout(this.timer); }
}

/** Muted line with a click to retry. */
function errorNode(text: string): WipNode {
  return { id: 'wip:error', label: `${text}. Retry.`, icon: 'warning', open: 'none', kids: [], command: { command: CMD.refresh, args: [] } };
}
