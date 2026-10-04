import * as vscode from 'vscode';
import * as fs from 'fs';
import { TIMEOUT_MSG, WorkerClient } from './client';
import { runExpand } from './expandRun';
import { GIT_VIEW, GitTree, OPEN_CMD, RETRY_CMD } from './gitTree';
import { IndexStatus } from './indexStatus';
import { runExport } from './exportRun';
import { maxResults, pickTotals, Totals } from './maxResults';
import { opts, sortOf } from './msgOpts';
import { gitHint } from './gitMatch';
import { registerDiagnostics } from './diagnostics';
import { registerFileSessions } from './fileSessionsUi';
import { copyHandover } from './handoverRun';
import { QueryQueue } from './queryQueue';
import { compile, isEmpty, MIN_QUERY_CHARS, parseQuery, queryChars } from './query';
import { copyId, isSessionId, openChat } from './resume';
import { ArchiveActions, registerArchiveCommands } from './archiveActions';
import { LiveWatcher } from './liveWatcher';
import { WipController } from './wipUi';
import { createWarner } from './contextWarnUi';
import { sessionsDir, stateMap } from './liveState';
import { Draft, Store } from './store';
import { Compiled, Options, Result } from './types';
import { html, NAME } from './webview';

const POST_GAP_MS = 100;
const REVEAL_CMD = 'workbench.view.extension.claudeChatExplorer'; // opens the Saropa Chat Explorer container and its view

type Base = Draft;

const channel = vscode.window.createOutputChannel(NAME);
const log = (msg: string): void => channel.appendLine(`[${new Date().toISOString()}] ${msg}`);
const logErr = (where: string, e: unknown): void => log(`${where}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);

const folderPaths = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

class Provider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private progress: { done: number; total: number; subs: number; first: boolean } | null = null;
  private lastPost = 0;
  onIndex?: () => void; // the index changed: refresh the Git Activity tree
  onScope?: () => void; // the All projects option changed
  private readonly queue = new QueryQueue((m) => this.post(m), () => vscode.commands.executeCommand(REVEAL_CMD), logErr);
  watcher?: LiveWatcher; // live state of Claude sessions
  actions?: ArchiveActions;

  constructor(private readonly store: Store, private readonly client: WorkerClient,
    private readonly status: IndexStatus) {
    client.onError = logErr;
    client.onEvent = (m) => this.onWorker(m);
  }

  private post(m: unknown): void {
    try { this.view?.webview.postMessage(m).then(undefined, (e) => logErr('post', e)); } catch (e) { logErr('post', e); }
  }

  private onWorker(m: any): void {
    if (m.t === 'log') { log(String(m.msg)); }
    else if (m.t === 'fatal') { log(String(m.message)); this.post({ type: 'error', message: String(m.message) }); }
    else if (m.t === 'progress') { this.indexing(m.done, m.total, m.subs, !!m.first); }
    else if (m.t === 'indexed') { this.indexed(); this.onIndex?.(); }
    else if (m.t === 'changed') { void this.postMeta(); this.onIndex?.(); }
  }

  /** Index progress shown in the panel and status bar. */
  private indexing(done: number, total: number, subs: number, first: boolean): void {
    this.progress = { done, total, subs, first: first || !!this.progress?.first };
    this.status.update(done, total, subs);
    const now = Date.now();
    if (now - this.lastPost < POST_GAP_MS && done < total) { return; } // one webview message per file is wasteful
    this.lastPost = now;
    this.post({ type: 'indexing', ...this.progress });
  }

  private indexed(): void {
    const was = this.progress;
    this.progress = null;
    this.status.hide();
    this.post({ type: 'indexed' });
    if (was?.first) {
      const n = was.total - was.subs;
      void vscode.window.showInformationMessage(`Saropa Chat Explorer: indexed ${n} chats and ${was.subs} subagent files.`);
    }
  }

  private get ctxMsg() { return { pins: Object.keys(this.store.pins), tags: this.store.tags, dots: this.dotNames }; }

  /** Dot state names of chats that are not idle, for the worker. */
  get dotNames(): { [id: string]: string } { return stateMap(this.watcher?.dots ?? {}); }

  /** Push the dot map to the panel. */
  postDots(): void { this.post({ type: 'dots', map: this.watcher?.dots ?? {} }); }

  /** Resume a chat and clear its unread flag. */
  async resume(id: string): Promise<void> {
    void this.actions?.markRead(id);
    await openChat(id, log);
  }

  async postMeta(): Promise<void> {
    try {
      const pinned = await this.client.request({ t: 'pinned', ids: Object.keys(this.store.pins), subs: this.store.state.subs !== false }, true);
      this.post({ type: 'meta', pins: Object.keys(this.store.pins), tags: this.store.tags, all: this.store.allTags, pinned, arch: [...this.store.archived] });
    } catch (e) { logErr('meta', e); }
  }

  private restore(): void {
    this.post({ type: 'restore', max: maxResults(), state: this.store.state, history: this.store.history, statuses: this.store.statuses,
      export: this.store.exportPrefs, archOpen: this.store.archOpen, advOpen: this.store.advOpen });
    this.postDots();
    void this.postMeta();
    if (this.progress) { this.post({ type: 'indexing', ...this.progress }); }
    this.queue.setReady(true);
  }

  /** Reveal the panel and run a query in it (held until a new view is ready). */
  showQuery(query: string): Promise<void> { return this.queue.show(query); }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.title = NAME;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = html();
    const sub = view.webview.onDidReceiveMessage((m) => { void this.onMessage(m); });
    view.onDidChangeVisibility(() => { if (view.visible) { this.watcher?.poke(); } });
    view.onDidDispose(() => { sub.dispose(); this.queue.setReady(false); if (this.view === view) { this.view = undefined; } });
    // The script posts 'ready' once its listener is attached; restore() runs then.
  }

  private async onMessage(m: any): Promise<void> {
    try {
      if (!m || typeof m !== 'object') { return; }
      if (m.type === 'ready') { this.restore(); }
      else if (m.type === 'status') { this.store.setStatuses(m.checked); }
      else if (m.type === 'exportPrefs') { this.store.setExportPrefs({ context: !!m.context, unique: !!m.unique }); }
      else if (m.type === 'export') { await runExport(m, { client: this.client, store: this.store, post: (x) => this.post(x), logErr, ctxMsg: this.ctxMsg }); }
      else if (m.type === 'draft') {
        const prev = this.store.draft.all;
        this.store.setDraft({ ...this.store.draft, ...opts(m), sort: sortOf(m), query: String(m.query ?? '') });
        this.scopeChanged(prev);
      } else if (m.type === 'search') { await this.search(m); }
      else if (m.type === 'cancel') { this.client.cancel(); }
      else if (m.type === 'sessions') { await this.sessions(m); }
      else if (m.type === 'histAdd') { this.histAdd(m); }
      else if (m.type === 'advOpen') { this.store.setAdvOpen(!!m.open); }
      else if (m.type === 'archOpen') { this.store.setArchOpen(!!m.open); }
      else if (m.type === 'importArchived') { await this.actions?.importArchived(); }
      else { await this.onChatMessage(m); }
    } catch (e) { logErr('message ' + String(m?.type), e); }
  }

  /** Empty the search history (Clear Search History command) and tell the panel. */
  clearHistory(): void {
    this.store.setHistory([]);
    this.post({ type: 'history', history: [] });
  }

  /** The panel decided a search is worth remembering (Enter, a click on a result, or 2 idle seconds). */
  private histAdd(m: any): void {
    const query = String(m.query ?? '').trim();
    if (!query) { return; }
    this.post({ type: 'history', history: this.store.addHistory({ ...opts(m), query }) });
  }

  /** Chats in scope as rows for the empty query and the no-match list; the reply carries the search number so stale ones are dropped. */
  private async sessions(m: any): Promise<void> {
    try {
      const r = await this.client.request({ t: 'sessions', max: maxResults(), o: opts(m), sort: sortOf(m), folders: folderPaths(), pins: Object.keys(this.store.pins), archived: [...this.store.archived], dots: this.dotNames }, true);
      this.post({ type: 'sessions', sn: m.sn, rows: r?.rows ?? [], total: r?.total ?? 0, arch: r?.arch ?? [], archTotal: r?.archTotal ?? 0, max: r?.max ?? maxResults() });
    } catch (e) { logErr('sessions', e); }
  }

  /** The All projects option flipped: the Git Activity tree reloads for the new scope. */
  private scopeChanged(was: boolean): void { if (this.store.draft.all !== was) { this.onScope?.(); } }

  /** Messages that act on one chat; the id is validated before any use. */
  private async onChatMessage(m: any): Promise<void> {
    const id = m.id;
    if (!isSessionId(id)) { log(`Ignored ${String(m.type)} with invalid id`); return; }
    if (m.type === 'open') { await this.resume(id); }
    else if (m.type === 'read') { await this.actions?.markRead(id); }
    else if (m.type === 'copyId') { await copyId(id, log); }
    else if (m.type === 'handover') { await this.handover(id, String(m.query ?? '')); }
    else if (m.type === 'archive') { await this.actions?.setArchived(id, !!m.on); }
    else if (m.type === 'expand') { await this.expand(id, m); }
    else if (m.type === 'pin') { await this.store.togglePin(id); await this.postMeta(); }
    else if (m.type === 'tagAdd') { await this.store.addTag(id, String(m.tag ?? '')); await this.postMeta(); }
    else if (m.type === 'tagRemove') { await this.store.removeTag(id, String(m.tag ?? '')); await this.postMeta(); }
  }

  private async handover(id: string, query: string): Promise<void> {
    await copyHandover(id, query, { request: (m) => this.client.request(m as Parameters<WorkerClient['request']>[0], true), roots: folderPaths, log: logErr });
  }

  private async expand(id: string, m: any): Promise<void> {
    await runExpand(this.client, id, m, this.ctxMsg, (x) => this.post(x), logErr);
  }

  /** Compile the query, or post the empty or error outcome and return undefined. */
  private async prepare(query: string, o: Options, base: Base, sn: number): Promise<Compiled | undefined> {
    if (!query) {
      this.client.cancel();
      this.store.setState({ ...base, results: [], searched: '' });
      this.post({ type: 'results', sn, results: [], searched: '' });
      return undefined;
    }
    const hint = gitHint(parseQuery(query).tokens);
    if (hint || queryChars(query, o) < MIN_QUERY_CHARS) {
      this.client.cancel();
      this.post({ type: 'short', sn, message: hint });
      return undefined;
    }
    let compiled;
    try { compiled = compile(query, o); } catch (e) {
      this.post({ type: 'error', sn, message: (e as Error).message });
      return undefined;
    }
    if (isEmpty(compiled)) { this.post({ type: 'results', sn, results: [], searched: '' }); return undefined; }
    return compiled;
  }

  private async search(m: any): Promise<void> {
    const query = String(m.query ?? '').trim();
    const o = opts(m);
    const base: Base = { ...o, sort: sortOf(m), query };
    const sn = Number(m.sn) || 0;
    if (!(await this.prepare(query, o, base, sn))) { return; }
    this.post({ type: 'start', sn });
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    this.client.search({ query, o, folders, max: maxResults(), ...this.ctxMsg }, (w) => this.onSearchMsg(w, base, sn),
      (why) => { if (why === 'timeout') { this.post({ type: 'error', sn, message: TIMEOUT_MSG }); } });
  }

  /** Forward worker batches as they come (stamped with the search number); the final message saves state. */
  private onSearchMsg(w: any, base: Base, sn: number): void {
    if (w.t === 'batch') { this.post({ type: 'batch', sn, results: w.results, done: w.done, total: w.total, totals: pickTotals(w) }); }
    else if (w.t === 'error') { logErr('search', w.message); this.post({ type: 'results', sn, results: [], searched: 'Search failed' }); }
    else if (w.t === 'done') { void this.finish(w.results, base, sn, pickTotals(w)); }
  }

  private async finish(results: Result[], base: Base, sn: number, totals: Totals): Promise<void> {
    const searched = results.length ? '' : 'No matches';
    this.post({ type: 'done', sn, results, searched, totals });
    try { this.store.setState({ ...base, results, searched, totals }); } catch (e) { logErr('save search', e); }
  }
}

let client: WorkerClient | undefined;
let store: Store | undefined;
let done = false; // set at the end of activate()

export function activate(ctx: vscode.ExtensionContext): void {
  const dir = ctx.globalStorageUri.fsPath;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { logErr('create storage folder', e); } // the worker retries
  client = new WorkerClient(dir);
  const status = new IndexStatus();
  store = new Store(ctx, (e) => logErr('save state', e));
  const provider = new Provider(store, client, status);
  const live = { dots: () => provider.watcher?.dots ?? {}, archived: () => store!.archived };
  const tree = new GitTree(client, () => ({ all: store!.draft.all, folders: folderPaths() }), logErr, live);
  provider.onIndex = provider.onScope = () => tree.refresh();
  const changed = () => { void provider.postMeta(); tree.redraw(); };
  provider.actions = new ArchiveActions(store, ctx.globalStorageUri.fsPath, { changed, rebuild: () => provider.watcher?.rebuild() });
  const warner = createWarner(ctx, { request: (m, bg) => client!.request(m as Parameters<WorkerClient['request']>[0], bg), open: (id) => provider.resume(id), log });
  let wip: WipController | undefined;
  provider.watcher = new LiveWatcher({ dir: sessionsDir(), unread: () => store!.unread, saveUnread: (u) => store!.setUnread(u), log,
    onChange: () => { provider.postDots(); tree.redraw(); wip?.onDots(); }, onLive: (ids) => { void warner.check(ids); } });
  ctx.subscriptions.push({ dispose: () => provider.watcher?.dispose() }, ...registerArchiveCommands(provider.actions));
  ctx.subscriptions.push(channel, status, tree, vscode.workspace.onDidChangeWorkspaceFolders(() => provider.onScope?.()),
    vscode.commands.registerCommand('claudeChatExplorer.clearHistory', () => {
      provider.clearHistory();
      void vscode.window.showInformationMessage('Search history cleared');
    }),
    vscode.commands.registerCommand(RETRY_CMD, () => tree.refresh(true)),
    vscode.window.registerTreeDataProvider(GIT_VIEW, tree),
    vscode.commands.registerCommand(OPEN_CMD, (id: unknown) => (isSessionId(id) ? provider.resume(id) : undefined)),
    vscode.window.registerWebviewViewProvider('claudeChatExplorer.view', provider,
      { webviewOptions: { retainContextWhenHidden: true } }));
  registerFileSessions(ctx, { client, log: logErr, pins: () => Object.keys(store!.pins), dots: () => provider.dotNames,
    showQuery: (q) => provider.showQuery(q), onIndex: (fn) => { const was = provider.onIndex; provider.onIndex = () => { was?.(); fn(); }; } });
  registerDiagnostics(ctx, (m, bg) => client!.request(m as Parameters<WorkerClient['request']>[0], bg), String(ctx.extension?.packageJSON?.version ?? 'unknown'), () => done, () => provider.watcher?.info, () => warner.atOrAbove80, () => wip?.diagLines() ?? []);
  wip = new WipController({ ctx, client, log: logErr, dots: live.dots, archived: live.archived, folders: folderPaths });
  wip.start();
  provider.watcher.start();
  done = true;
  log(`activated ${String(ctx.extension?.packageJSON?.version ?? 'unknown')}`);
  client.start(); // indexing runs in the worker; activation never waits for it
}

export async function deactivate(): Promise<void> {
  try { await store?.flush(); } catch (e) { logErr('save state', e); }
  await client?.dispose();
}
