/** Host side of the Open Work page: one editor tab, its messages, and the chat list it shows. Never imports ./client: it gets a soft request. */
import * as vscode from 'vscode';
import { Hub } from './hub';
import { openWorkHtml, OW_TITLE } from './openWorkHtml';
import { DotMap } from './liveState';
import { isSessionId } from './sessionId';

export const OPEN_WORK_CMD = 'claudeChatExplorer.openWork';
const PANEL_TYPE = 'saropaChatExplorer.openWork';
const PREFS_KEY = 'saropaChatExplorer.openWorkPrefs';
const BANDS = ['needs', 'finish', 'waiting', 'tidy', 'idle'];
const GROUPS = ['attention', 'chat', 'repo'];
const REFRESH_DEBOUNCE_MS = 1000;
const FIND_MAX_CHARS = 80;

export interface OpenWorkRowOut { id: string; title: string; [k: string]: unknown; }
export interface OpenWorkDeps {
  softRequest: (m: object) => Promise<any>; // client.request(m, true, true): a stall rejects, never restarts the worker
  pins: () => string[];
  archived: () => string[];
  dots: () => DotMap;
  resume: (id: string) => Promise<void>;
  copyNote: (id: string, state: (id: string, s: 'busy' | 'done' | '') => void) => Promise<void>;
  setArchived: (id: string, on: boolean) => Promise<void>;
  find: (query: string) => Promise<void>;
  poke: () => void; // read the live state again
  log: (where: string, e: unknown) => void;
}
interface Prefs { group: string; hidden: string[]; }

/** Days of history shown, from the setting (1 to 90, default 14). */
export function openWorkDays(): number {
  const n = Number(vscode.workspace.getConfiguration('saropaChatExplorer').get('openWorkDays'));
  return Number.isFinite(n) ? Math.min(90, Math.max(1, Math.floor(n))) : 14;
}

export class OpenWork {
  private panel?: vscode.WebviewPanel;
  private scan = 0;
  private last?: { scan: number; msg: object };
  private titles = new Map<string, string>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly ctx: vscode.ExtensionContext, private readonly hub: Hub, private readonly d: OpenWorkDeps) {}

  private get prefs(): Prefs {
    const p = this.ctx.globalState.get<Partial<Prefs>>(PREFS_KEY) ?? {};
    return { group: GROUPS.includes(String(p.group)) ? String(p.group) : 'attention', hidden: Array.isArray(p.hidden) ? p.hidden.filter((b) => BANDS.includes(b)) : [] };
  }

  /** Open the tab, or bring the open one forward. */
  show(): void {
    if (this.panel) { this.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel(PANEL_TYPE, OW_TITLE, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    this.panel = panel;
    panel.webview.html = openWorkHtml();
    const subs = [
      panel.webview.onDidReceiveMessage((m) => { void this.onMessage(m); }),
      panel.onDidChangeViewState(() => { if (panel.visible) { this.d.poke(); } }),
      this.hub.on('dots', () => this.post({ type: 'dots', map: this.d.dots() })),
      this.hub.on('indexed', () => this.later()),
      this.hub.on('changed', () => this.later()),
      this.hub.on('archived', () => { void this.refresh(); }),
    ];
    panel.onDidDispose(() => { subs.forEach((s) => s.dispose()); clearTimeout(this.timer); this.panel = undefined; this.last = undefined; });
    // The page posts 'ready' once its listener is attached; the full model is replayed then.
  }

  private post(m: object): void {
    try { this.panel?.webview.postMessage(m).then(undefined, (e) => this.d.log('open work post', e)); } catch (e) { this.d.log('open work post', e); }
  }

  /** Index events come in bursts: one refresh a second at most. */
  private later(): void {
    if (this.timer) { return; }
    this.timer = setTimeout(() => { this.timer = undefined; void this.refresh(); }, REFRESH_DEBOUNCE_MS);
  }

  /** Ask the worker (soft) for the chats in scope and post them; a failure posts a message the page shows with Retry. */
  async refresh(): Promise<void> {
    const scan = ++this.scan;
    const days = openWorkDays();
    try {
      const dots = this.d.dots();
      const r = await this.d.softRequest({ t: 'openWork', days, pins: this.d.pins(), archived: this.d.archived(), live: Object.keys(dots) });
      if (scan !== this.scan) { return; } // a newer refresh owns the page
      const rows: OpenWorkRowOut[] = Array.isArray(r?.rows) ? r.rows : [];
      this.titles = new Map(rows.map((x) => [x.id, String(x.title ?? '')]));
      const msg = { type: 'chats', scan, rows, indexing: r?.indexing === true };
      this.last = { scan, msg };
      this.post(msg);
    } catch (e) {
      this.d.log('open work chats', e);
      if (scan === this.scan) { this.post({ type: 'chatsFailed', scan, message: 'Could not load chats' }); }
    }
  }

  private replay(): void {
    const p = this.prefs;
    this.post({ type: 'init', v: 1, days: openWorkDays(), group: p.group, hidden: p.hidden });
    this.post({ type: 'dots', map: this.d.dots() });
    if (this.last) { this.post(this.last.msg); } else { void this.refresh(); }
  }

  private async onMessage(m: any): Promise<void> {
    try {
      if (!m || typeof m !== 'object') { return; }
      if (m.type === 'ready') { this.replay(); }
      else if (m.type === 'refresh') { this.d.poke(); await this.refresh(); }
      else if (m.type === 'prefs') { void this.ctx.globalState.update(PREFS_KEY, { group: GROUPS.includes(String(m.group)) ? m.group : 'attention', hidden: Array.isArray(m.hidden) ? m.hidden.filter((b: unknown) => BANDS.includes(String(b))) : [] }); }
      else { await this.onChat(m); }
    } catch (e) { this.d.log('open work message ' + String(m?.type), e); }
  }

  /** Messages that act on one chat; the id is validated before any use. */
  private async onChat(m: any): Promise<void> {
    const id = m.id;
    if (!isSessionId(id)) { this.d.log('open work', new Error(`Ignored ${String(m.type)} with invalid id`)); return; }
    if (m.type === 'open') { await this.d.resume(id); }
    else if (m.type === 'handover') { await this.d.copyNote(id, (cid, state) => this.post({ type: 'handoverState', id: cid, state })); }
    else if (m.type === 'find') { await this.find(id); }
    else if (m.type === 'archive') { await this.archive(id, m.on !== false); }
  }

  private async find(id: string): Promise<void> {
    const q = (this.titles.get(id) ?? '').replace(/\s+/g, ' ').trim().slice(0, FIND_MAX_CHARS);
    if (q) { await this.d.find(q); }
  }

  /** Archive is reversible: the toast offers Undo. */
  private async archive(id: string, on: boolean): Promise<void> {
    await this.d.setArchived(id, on);
    if (!on) { return; }
    const pick = await vscode.window.showInformationMessage(`Archived "${this.titles.get(id) || 'chat'}".`, 'Undo');
    if (pick === 'Undo') { await this.d.setArchived(id, false); }
  }
}

/** Register the command that opens the page. */
export function registerOpenWork(ctx: vscode.ExtensionContext, page: OpenWork): void {
  ctx.subscriptions.push(vscode.commands.registerCommand(OPEN_WORK_CMD, () => page.show()));
}
