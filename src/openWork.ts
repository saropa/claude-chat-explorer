/** Host side of the Open Work page: one editor tab, its messages, the chat list it shows and the streamed git scan. Never imports ./client: it gets a soft request. */
import * as path from 'path';
import * as vscode from 'vscode';
import { Hub } from './hub';
import { openWorkHtml, OW_TITLE } from './openWorkHtml';
import { DotMap } from './liveState';
import { isSessionId } from './sessionId';
import { MAX_FOLDERS, WorkScan } from './workScan';

export const OPEN_WORK_CMD = 'claudeChatExplorer.openWork';
const PANEL_TYPE = 'saropaChatExplorer.openWork';
const PREFS_KEY = 'saropaChatExplorer.openWorkPrefs';
const DONE_KEY = 'saropaChatExplorer.openWorkDone';
const BANDS = ['needs', 'finish', 'waiting', 'tidy', 'idle'];
const GROUPS = ['attention', 'chat', 'repo'];
const REFRESH_DEBOUNCE_MS = 1000;
const FIND_MAX_CHARS = 80;
const DONE_MAX = 500;
const FP_MAX = 200;
const REVISIT_MS = 60000;
const STOPPED_RESCAN_MS = 10000;

export interface OpenWorkRowOut { id: string; title: string; last?: number; cwd?: string; fk?: string; [k: string]: unknown; }
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
  scan: WorkScan;
  workspace: () => string[];
  prsOn: () => boolean; // the setting lookupPullRequests; off means no gh call and no pull request state
}
interface Prefs { group: string; hidden: string[]; wsOnly: boolean; }
interface Model { chats?: object; notes?: object; progress?: object; end?: object; folder: Map<string, object>; repo: Map<string, object>; prs: Map<string, object>; checks: Map<string, object>; }
const newModel = (): Model => ({ folder: new Map(), repo: new Map(), prs: new Map(), checks: new Map() });

/** Days of history shown, from the setting (1 to 90, default 14). */
export function openWorkDays(): number {
  const n = Number(vscode.workspace.getConfiguration('saropaChatExplorer').get('openWorkDays'));
  return Number.isFinite(n) ? Math.min(90, Math.max(1, Math.floor(n))) : 14;
}

export class OpenWork {
  private panel?: vscode.WebviewPanel;
  private scanNo = 0;
  private reqNo = 0;
  private cap = MAX_FOLDERS;
  private scanned = new Set<string>();
  private scanning = false;
  private lastEnd = 0;
  private model: Model = newModel();
  private chatFk = new Map<string, string>();
  private prevRunning = new Set<string>();
  private titles = new Map<string, string>();
  private timer?: NodeJS.Timeout;
  private readonly rescan = new Set<NodeJS.Timeout>();

  constructor(private readonly ctx: vscode.ExtensionContext, private readonly hub: Hub, private readonly d: OpenWorkDeps) {}

  private get prefs(): Prefs {
    const p = this.ctx.globalState.get<Partial<Prefs>>(PREFS_KEY) ?? {};
    return { group: GROUPS.includes(String(p.group)) ? String(p.group) : 'attention', hidden: Array.isArray(p.hidden) ? p.hidden.filter((b) => BANDS.includes(b)) : [], wsOnly: p.wsOnly === true };
  }

  /** Marked-done chats as [id, fingerprint], oldest first. */
  private get done(): Array<[string, string]> {
    const v = this.ctx.globalState.get<unknown>(DONE_KEY);
    return Array.isArray(v) ? (v as unknown[]).filter((x): x is [string, string] => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string') : [];
  }

  /** Open the tab, or bring the open one forward. */
  show(): void {
    if (this.panel) { this.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel(PANEL_TYPE, OW_TITLE, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    this.panel = panel;
    panel.webview.html = openWorkHtml();
    const subs = [
      panel.webview.onDidReceiveMessage((m) => { void this.onMessage(m); }),
      panel.onDidChangeViewState(() => { if (panel.visible) { this.d.poke(); if (!this.scanning && Date.now() - this.lastEnd > REVISIT_MS) { void this.refresh({ restart: true }); } } }),
      this.hub.on('dots', () => this.onDots()),
      this.hub.on('indexed', () => this.later()),
      this.hub.on('changed', () => this.later()),
      this.hub.on('archived', () => { void this.refresh(); }),
      vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('saropaChatExplorer.lookupPullRequests')) { void this.refresh({ restart: true }); } }),
    ];
    panel.onDidDispose(() => { subs.forEach((s) => s.dispose()); this.close(); });
    // The page posts 'ready' once its listener is attached; the full model is replayed then.
  }

  /** Panel closed: queued git work is dropped and running git commands are killed. */
  private close(): void {
    this.d.scan.cancel();
    clearTimeout(this.timer);
    this.timer = undefined;
    this.rescan.forEach((t) => clearTimeout(t));
    this.rescan.clear();
    this.panel = undefined;
    this.scanning = false;
    this.scanned = new Set();
    this.model = newModel();
    this.reqNo++;
  }

  private post(m: object): void {
    try { this.panel?.webview.postMessage(m).then(undefined, (e) => this.d.log('open work post', e)); } catch (e) { this.d.log('open work post', e); }
  }

  /** A message of the current scan: kept for replay, then posted. */
  private postScan(m: any): void {
    const k = this.model;
    if (m.type === 'folder' || m.type === 'repo') { (m.type === 'folder' ? k.folder : k.repo).set(String(m.key), m); }
    else if (m.type === 'prs') { k.prs.set(String(m.repo), m); }
    else if (m.type === 'checks') { k.checks.set(m.repo + '|' + m.n, m); }
    else if (m.type === 'progress') { k.progress = m; }
    else if (m.type === 'end') { k.end = m; }
    this.post(m);
  }

  /** Index events come in bursts: one refresh a second at most. */
  private later(): void {
    if (this.timer) { return; }
    this.timer = setTimeout(() => { this.timer = undefined; void this.refresh(); }, REFRESH_DEBOUNCE_MS);
  }

  /** A chat that stopped running changed its folder: read that folder again 10 s later. */
  private onDots(): void {
    const dots = this.d.dots();
    this.post({ type: 'dots', map: dots });
    const now = new Set(Object.keys(dots).filter((id) => dots[id]?.s === 'running'));
    for (const id of this.prevRunning) {
      const fk = now.has(id) ? undefined : this.chatFk.get(id);
      if (!fk) { continue; }
      const t = setTimeout(() => { this.rescan.delete(t); this.d.scan.retry(fk, true); }, STOPPED_RESCAN_MS);
      this.rescan.add(t);
    }
    this.prevRunning = now;
  }

  /**
   * Ask the worker (soft) for the chats in scope and post them; a failure posts a message the page shows with Retry.
   * A git scan starts when the folders changed or when asked (restart, force); force skips the folder caches.
   */
  async refresh(o: { force?: boolean; restart?: boolean } = {}): Promise<void> {
    const req = ++this.reqNo;
    try {
      const dots = this.d.dots();
      const r = await this.d.softRequest({ t: 'openWork', days: openWorkDays(), pins: this.d.pins(), archived: this.d.archived(), live: Object.keys(dots), folders: this.d.workspace() });
      if (req !== this.reqNo) { return; } // a newer refresh owns the page
      const raw: OpenWorkRowOut[] = Array.isArray(r?.rows) ? r.rows : [];
      const all = [...new Set(raw.map((x) => String(x.cwd ?? '')).filter(Boolean))];
      const wanted = all.slice(0, this.cap);
      const same = !o.force && !o.restart && this.scanned.size > 0 && wanted.every((c) => this.scanned.has(c));
      const rows = this.rowsOut(raw);
      this.titles = new Map(rows.map((x) => [x.id, String(x.title ?? '')]));
      if (!same) { this.scanNo++; this.model = newModel(); }
      const msg = { type: 'chats', scan: this.scanNo, rows, indexing: r?.indexing === true, scanning: !same };
      this.model.chats = msg;
      this.post(msg);
      if (!same) { this.begin(raw, wanted, all.length - wanted.length, o.force === true); }
    } catch (e) {
      this.d.log('open work chats', e);
      if (req === this.reqNo) { this.post({ type: 'chatsFailed', scan: this.scanNo, message: 'Could not load chats' }); }
    }
  }

  /** Page rows: the working folder becomes an opaque key (the path stays here). */
  private rowsOut(raw: OpenWorkRowOut[]): OpenWorkRowOut[] {
    this.chatFk = new Map();
    return raw.map((x) => {
      const { cwd, ...rest } = x;
      const fk = cwd ? this.d.scan.keyOf(String(cwd)) : undefined;
      if (fk) { this.chatFk.set(x.id, fk); }
      return fk ? { ...rest, fk } : rest;
    });
  }

  private begin(raw: OpenWorkRowOut[], wanted: string[], more: number, force: boolean): void {
    this.scanned = new Set(wanted);
    const last = new Map<string, number>();
    for (const x of raw) { const c = String(x.cwd ?? ''); if (c && !last.has(c)) { last.set(c, Number(x.last) || 0); } }
    const notes = { type: 'notes', scan: this.scanNo, more, prsOn: this.d.prsOn() };
    this.model.notes = notes;
    this.post(notes);
    this.scanning = true;
    void this.d.scan.start(this.scanNo, wanted.map((cwd) => ({ cwd, last: last.get(cwd) ?? 0 })), force, (m) => this.postScan(m)).then(() => { this.scanning = false; this.lastEnd = Date.now(); });
  }

  private replay(): void {
    const p = this.prefs;
    this.post({ type: 'init', v: 3, prsOn: this.d.prsOn(), days: openWorkDays(), group: p.group, hidden: p.hidden, wsOnly: p.wsOnly, ws: this.d.workspace().length, done: Object.fromEntries(this.done) });
    this.post({ type: 'dots', map: this.d.dots() });
    const k = this.model;
    if (!k.chats) { void this.refresh(); return; }
    [k.chats, k.notes, ...k.folder.values(), ...k.repo.values(), ...k.prs.values(), ...k.checks.values(), k.progress, k.end].forEach((m) => { if (m) { this.post(m); } });
  }

  private async onMessage(m: any): Promise<void> {
    try {
      if (!m || typeof m !== 'object') { return; }
      const t = m.type;
      if (t === 'ready') { this.replay(); }
      else if (t === 'refresh') { this.d.poke(); await this.refresh({ force: m.force !== false }); }
      else if (t === 'retry') { if (typeof m.key === 'string' && /^[frp]\d{1,6}$/.test(m.key)) { this.d.scan.retry(m.key); } }
      else if (t === 'openPr' || t === 'copyPr') { await this.prLink(t === 'copyPr', String(m.repo), Number(m.n)); }
      else if (t === 'scanMore') { this.cap += MAX_FOLDERS; await this.refresh({ restart: true }); }
      else if (t === 'prefs') { void this.savePrefs(m); }
      else if (t === 'openFile') { await this.openFile(String(m.key), Number(m.i)); }
      else if (t === 'copyRemove') { await this.copyRemove(String(m.key)); }
      else if (t === 'expand') { await this.expand(String(m.id)); }
      else { await this.onChat(m); }
    } catch (e) { this.d.log('open work message ' + String(m?.type), e); }
  }

  private async savePrefs(m: any): Promise<void> {
    await this.ctx.globalState.update(PREFS_KEY, { group: GROUPS.includes(String(m.group)) ? m.group : 'attention', hidden: Array.isArray(m.hidden) ? m.hidden.filter((b: unknown) => BANDS.includes(String(b))) : [], wsOnly: m.wsOnly === true });
  }

  /** Messages that act on one chat; the id is validated before any use. */
  private async onChat(m: any): Promise<void> {
    const id = m.id;
    if (!isSessionId(id)) { this.d.log('open work', new Error(`Ignored ${String(m.type)} with invalid id`)); return; }
    if (m.type === 'open') { await this.d.resume(id); }
    else if (m.type === 'handover') { await this.d.copyNote(id, (cid, state) => this.post({ type: 'handoverState', id: cid, state })); }
    else if (m.type === 'find') { await this.find(id); }
    else if (m.type === 'archive') { await this.archive(id, m.on !== false); }
    else if (m.type === 'done') { await this.markDone(id, m.on !== false, m.fp); }
  }

  /** Mark done keeps the chat's fingerprint (at most 500, oldest dropped); the page hides the row while it still matches. */
  private async markDone(id: string, on: boolean, fp: unknown): Promise<void> {
    const rest = this.done.filter(([k]) => k !== id);
    if (on && typeof fp === 'string' && fp.length <= FP_MAX) { rest.push([id, fp]); }
    await this.ctx.globalState.update(DONE_KEY, rest.slice(-DONE_MAX));
  }

  /** The unpushed commits of a row (a chat id or a worktree key) for its expanded view. */
  private async expand(id: string): Promise<void> {
    const key = isSessionId(id) ? this.chatFk.get(id) : /^[fw]\d{1,6}$/.test(id) ? id : undefined;
    if (!key) { return; }
    const r = await this.d.scan.commits(key);
    this.post({ type: 'detail', id, commits: r.commits ?? null, reason: r.reason ?? '' });
  }

  /** Open a changed file from a row (resolved from the last scan result, never from a path the page sent). */
  private async openFile(key: string, i: number): Promise<void> {
    if (!/^[fw]\d{1,6}$/.test(key)) { return; }
    const t = this.d.scan.fileOf(key, i);
    if (!t) { return; }
    const p = path.resolve(t.top, t.file.p);
    if (!p.startsWith(t.top + path.sep)) { return; }
    try { await vscode.window.showTextDocument(vscode.Uri.file(p)); } catch { void vscode.window.showInformationMessage('That file is not available (it may be deleted).'); }
  }

  /** Open or copy a pull request link. The link is the one gh gave for that repository key and number in the last answer, https only; the page never sends a link. */
  private async prLink(copy: boolean, rk: string, n: number): Promise<void> {
    if (!/^r\d{1,6}$/.test(rk) || !Number.isInteger(n)) { return; }
    const url = this.d.scan.prUrl(rk, n);
    if (!url || !/^https:\/\/[^\s]+$/.test(url)) { void vscode.window.showInformationMessage('That pull request link is not available. Refresh and try again.'); return; }
    if (copy) { await vscode.env.clipboard.writeText(url); void vscode.window.showInformationMessage(`Copied the link to pull request #${n}.`); return; }
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  /** Copy the remove command of a finished worktree. Nothing is run: the user pastes it in a terminal. */
  private async copyRemove(key: string): Promise<void> {
    if (!/^w\d{1,6}$/.test(key)) { return; }
    const r = this.d.scan.removeText(key);
    if (!r) { void vscode.window.showInformationMessage('That worktree cannot be removed: it is the main checkout or it is locked.'); return; }
    await vscode.env.clipboard.writeText(r.text);
    void vscode.window.showInformationMessage(`Copied the remove command for ${r.name}. Run it in a terminal.`);
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
