import * as vscode from 'vscode';
import { readTabs, workspaceStorageOf } from './stateDb';
import * as fs from 'fs';
import * as path from 'path';
import { ACCT_TIMEOUT_MS, TIMEOUT_MSG, WorkerClient } from './client';
import { runExpand } from './expandRun';
import { GIT_PARTS, GitLive, GitLiveService, GitPart, GitTargets, timedOutLive, withDeadline, TIMED_OUT, GIT_DEADLINE_MS } from './gitLive';
import { CardCounts } from './cardCounts';
import { ChatWork, ChatWorkFacts } from './chatWork';
import { IndexStatus } from './indexStatus';
import { maxResults, pickTotals, Totals } from './maxResults';
import { opts, sortOf } from './msgOpts';
import { gitHint } from './gitMatch';
import { registerDiagnostics } from './diagnostics';
import { ChatExplorerApi, makeApi } from './api';
import { registerFileSessions } from './fileSessionsUi';
import { copyHandover } from './handoverRun';
import { copyResume } from './copyResume';
import { exportChatMd } from './exportMdRun';
import { archiveTiny } from './archiveTiny';
import { regenTitles } from './regenTitlesRun';
import { registerOptions } from './optionsPanel';
import { registerUsage } from './usageUi';
import { QueryQueue } from './queryQueue';
import { compile, isEmpty, MIN_QUERY_CHARS, parseQuery, queryChars } from './query';
import { copyId, isSessionId, openChat } from './resume';
import { ArchiveActions, registerArchiveCommands } from './archiveActions';
import { LiveWatcher } from './liveWatcher';
import { createWarner } from './contextWarnUi';
import { sessionsDir, stateMap } from './liveState';
import { Draft, Store } from './store';
import { Compiled, Options, Result } from './types';
import { html, NAME } from './webview';
import { OPEN_EDITOR_CMD, registerEditorView } from './editorView';
import { Hub } from './hub';
import { registerHeaderCommands } from './headerCommands';
import { OpenWork, registerOpenWork } from './openWork';
import { Limiter } from './execLimit';
import { realExec } from './wipExec';
import { dotsAnimated } from './dotAnim';
import { searchContextLines } from './ctxLines';
import { currentChat } from './currentChat';
import { contextRingTokens } from './ctxRing';
import { WorkScan } from './workScan';
import { WorkPrs } from './workPrs';
import { PrCache } from './wipPrs';
import { WebSessions } from './webSessions';

const POST_GAP_MS = 100;
const REVEAL_CMD = 'workbench.view.extension.claudeChatExplorer'; // opens the Saropa Chat Explorer container and its view

type Base = Draft;

const channel = vscode.window.createOutputChannel(NAME);
const log = (msg: string): void => channel.appendLine(`[${new Date().toISOString()}] ${msg}`);
const logErr = (where: string, e: unknown): void => log(`${where}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);

/** One global limit on git processes: 4 at a time, the Open Work page at most 3 of them, the sidebar first. */
const limiter = new Limiter(4, 3);
const uiExec = limiter.wrap(realExec, 'ui');
/** One global limit on gh processes: 2 at a time (the sidebar first, the page at most 1); the pull request cache is shared by the sidebar and the Open Work page. */
const ghLimiter = new Limiter(2, 1); // the page lane keeps to 1 of the 2 slots, so a sidebar card never waits behind page lookups
const ghUiExec = ghLimiter.wrap(realExec, 'ui');
const prCache = new PrCache();
const prsOn = (): boolean => vscode.workspace.getConfiguration('saropaChatExplorer').get('lookupPullRequests') !== false;

const folderPaths = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
/** The Open Work page shows one repository: the one of the first workspace folder. */
const firstFolder = (): string[] => folderPaths().slice(0, 1);

class Provider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private progress: { done: number; total: number; subs: number; first: boolean } | null = null;
  private lastPost = 0;
  private readonly queue = new QueryQueue((m) => this.post(m), () => vscode.commands.executeCommand(REVEAL_CMD), logErr);
  watcher?: LiveWatcher; // live state of Claude sessions
  actions?: ArchiveActions;
  web?: WebSessions;
  private readonly gitLive = new GitLiveService(uiExec, ghUiExec, prCache);
  private readonly work = new ChatWork({
    request: (m) => this.client.request(m as Parameters<WorkerClient['request']>[0], true, true), exec: uiExec, ghExec: ghUiExec, cache: prCache, folders: folderPaths, prsOn,
  });
  private readonly counts = new CardCounts({
    request: (m) => this.client.request(m as Parameters<WorkerClient['request']>[0], true, true), folders: folderPaths, log: logErr,
    prsOn: () => vscode.workspace.getConfiguration('saropaChatExplorer').get('lookupPullRequests') !== false, post: (m) => this.post(m),
    work: (id) => this.work.resolve(id),
  }, this.gitLive, uiExec);
  private readonly gitTargets = new Map<string, GitTargets>(); // per chat: what a click in its Git section resolves against

  constructor(private readonly store: Store, private readonly client: WorkerClient,
    private readonly status: IndexStatus, private readonly hub: Hub) {
    client.onError = logErr;
    client.onEvent = (m) => this.onWorker(m);
  }

  post(m: unknown): void {
    try { this.view?.webview.postMessage(m).then(undefined, (e) => logErr('post', e)); } catch (e) { logErr('post', e); }
  }

  private onWorker(m: any): void {
    if (m.t === 'log') { log(String(m.msg)); }
    else if (m.t === 'fatal') { log(String(m.message)); this.post({ type: 'error', message: String(m.message) }); }
    else if (m.t === 'progress') { this.indexing(m.done, m.total, m.subs, !!m.first); }
    else if (m.t === 'indexed') { this.indexed(); this.hub.emit('indexed', logErr); }
    else if (m.t === 'changed') { void this.postMeta(); this.hub.emit('changed', logErr); }
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
      void vscode.window.showInformationMessage(`Saropa Chat Explorer: indexed ${n} sessions and ${was.subs} subagent files.`);
    }
  }

  /** Pins, tags and dots the worker needs for a search. */
  get searchCtx(): object { return this.ctxMsg; }

  private get ctxMsg() { return { pins: Object.keys(this.store.pins), tags: this.store.tags, dots: this.dotNames }; }

  /** Dot state names of chats that are not idle, for the worker. */
  get dotNames(): { [id: string]: string } { return stateMap(this.watcher?.dots ?? {}); }

  /** Push the dot map to the panel. */
  postDots(): void { this.post({ type: 'dots', map: this.watcher?.dots ?? {}, anim: dotsAnimated(), cur: this.currentId() }); this.updateBadge(); }

  /** Blue count badge on the activity-bar icon: sessions waiting for the user; cleared at 0. */
  private updateBadge(): void {
    if (!this.view) { return; }
    const n = Object.values(this.watcher?.dots ?? {}).filter((d) => d.s === 'waiting').length;
    this.view.badge = n > 0 ? { value: n, tooltip: `${n} ${n === 1 ? 'session is' : 'sessions are'} waiting for you` } : undefined;
  }

  /** The chat of this window: the focused Claude tab, else the last activated tab, else the only live session marked as this window. */
  currentId(): string {
    const w = this.watcher;
    if (!w) { return ''; }
    const t = vscode.window.tabGroups.activeTabGroup?.activeTab;
    const claude = !!t && t.input instanceof vscode.TabInputWebview && /claude/i.test(t.input.viewType);
    return currentChat({ activeLabel: claude ? t!.label : undefined, tabs: w.tabInfo, last: w.lastActive, here: w.hereIds });
  }

  /** The chat being looked at: the active tab is a Claude chat and the window is focused, else ''. */
  viewingId(): string {
    const t = vscode.window.tabGroups.activeTabGroup?.activeTab;
    return vscode.window.state.focused && !!t && t.input instanceof vscode.TabInputWebview && /claude/i.test(t.input.viewType) ? this.currentId() : '';
  }

  /** Clear unread of the chat being looked at. */
  clearViewed(): void { const id = this.viewingId(); if (id) { void this.actions?.markRead(id); } }

  /** Push the context ring limit to the panel. */
  postCtxLines(): void { this.post({ type: 'ctxlines', n: searchContextLines() }); }
  postRing(): void { this.post({ type: 'ring', max: contextRingTokens() }); }

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
      archOpen: this.store.archOpen, advOpen: this.store.advOpen });
    this.postDots();
    this.web?.announce();
    this.postCtxLines();
    this.postRing();
    void this.postMeta();
    if (this.progress) { this.post({ type: 'indexing', ...this.progress }); }
    this.queue.setReady(true);
  }

  /** Reveal the panel and run a query in it (held until a new view is ready). */
  showQuery(query: string): Promise<void> { return this.queue.show(query); }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.title = NAME;
    this.updateBadge();
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
      else if (m.type === 'draft') {
        this.store.setDraft({ ...this.store.draft, ...opts(m), sort: sortOf(m), query: String(m.query ?? '') });
      } else if (m.type === 'search') { await this.search(m); }
      else if (m.type === 'openEditor') { await vscode.commands.executeCommand(OPEN_EDITOR_CMD, m); }
      else if (m.type === 'cancel') { this.client.cancel(); }
      else if (m.type === 'sessions') { await this.sessions(m); }
      else if (m.type === 'histAdd') { this.histAdd(m); }
      else if (m.type === 'advOpen') { this.store.setAdvOpen(!!m.open); }
      else if (m.type === 'archOpen') { this.store.setArchOpen(!!m.open); }
      else if (m.type === 'acctLoad') { await this.account(); }
      else if (m.type === 'webLoad') { await this.web?.load(); }
      else if (m.type === 'webOpen') { await this.web?.open(m.id); }
      else if (m.type === 'importArchived') { await this.actions?.importArchived(); }
      else { await this.onChatMessage(m); }
    } catch (e) { logErr('message ' + String(m?.type), e); }
  }

  /** Account & Usage section: ask the worker (soft, so a slow scan never restarts it) and tell the panel. */
  private async account(): Promise<void> {
    try { this.post({ type: 'acct', ...(await this.client.request({ t: 'acct' }, true, true, ACCT_TIMEOUT_MS)) }); }
    catch (e) { logErr('account usage', e); this.post({ type: 'acct', failed: true }); }
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

  /** Messages that act on one chat; the id is validated before any use. */
  private async onChatMessage(m: any): Promise<void> {
    const id = m.id;
    if (!isSessionId(id)) { log(`Ignored ${String(m.type)} with invalid id`); return; }
    if (m.type === 'open') { await this.resume(id); }
    else if (m.type === 'read') { await this.actions?.markRead(id); }
    else if (m.type === 'copyId') { await copyId(id, log); }
    else if (m.type === 'handover') { await this.handover(id, String(m.query ?? '')); }
    else if (m.type === 'archive') { await this.actions?.setArchived(id, !!m.on); }
    else if (m.type === 'cardClosed') { this.gitTargets.delete(id); } // a closed card keeps no click targets
    else if (m.type === 'expand') { this.gitTargets.delete(id); this.work.forget(id); await this.expand(id, m); } // a reopened card starts clean
    else if (m.type === 'gitLive' && GIT_PARTS.includes(m.part)) { await this.loadGit(id, m.part as GitPart); }
    else if (m.type === 'counts') { void this.counts.run(id, Number(m.rq) || 0); } // fire and forget: never holds the message loop
    else if (m.type === 'related') { await this.loadRelated(id); }
    else if (m.type === 'gitFile') { await this.openGitFile(id, Number(m.i)); }
    else if (m.type === 'gitPr') { await this.openGitPr(id, Number(m.n)); }
    else if (m.type === 'pin') { await this.store.togglePin(id); await this.postMeta(); }
    else if (m.type === 'tagAdd') { await this.store.addTag(id, String(m.tag ?? '')); await this.postMeta(); }
    else if (m.type === 'tagRemove') { await this.store.removeTag(id, String(m.tag ?? '')); await this.postMeta(); }
  }

  /** Copy the hand-over note for another page; state reports busy and done to that page. */
  copyNote(id: string, state: (id: string, s: 'busy' | 'done' | '') => void): Promise<void> { return this.handover(id, '', state); }

  /** Copy the "cd <folder> && claude --resume <id>" command of a chat. */
  copyResumeCmd(id: string): Promise<void> {
    return copyResume(id, { cwd: async (cid) => String(await this.client.request({ t: 'chatCwd', chat: cid, folders: folderPaths() }, true, true) ?? ''), log: logErr });
  }

  /** Save one chat as a Markdown file. */
  exportMd(id: string): Promise<void> { return exportChatMd(id, { request: (m) => this.client.request(m as Parameters<WorkerClient['request']>[0], true, true), log: logErr }); }

  private async handover(id: string, query: string, state: (id: string, s: 'busy' | 'done' | '') => void = (cid, s) => this.post({ type: 'handoverState', id: cid, state: s })): Promise<void> {
    await copyHandover(id, query, { request: (m) => this.client.request(m as Parameters<WorkerClient['request']>[0], true, true), roots: folderPaths, log: logErr,
      folders: folderPaths, prsOn: () => vscode.workspace.getConfiguration('saropaChatExplorer').get('lookupPullRequests') !== false,
      gitLive: this.gitLive, work: (cid) => this.work.resolve(cid), state });
  }

  /** Load one part of a chat card (git, wt, unc or unp) and post it; the git part posts its first step (branch, counts) before the PR step; a deadline or failure posts a one-line state. */
  private async loadGit(id: string, part: GitPart): Promise<void> {
    let facts: ChatWorkFacts | undefined;
    const post = (live: GitLive, t?: GitTargets): void => {
      if (t) { this.gitTargets.set(id, { ...this.gitTargets.get(id), ...t, ...(facts?.urls.size ? { urls: new Map([...facts.urls, ...(t.urls ?? [])]) } : {}) }); }
      this.post({ type: 'gitLive', id, part, data: part === 'git' && facts?.view ? { ...live, work: facts.view } : live });
    };
    try {
      let cwd: string | typeof TIMED_OUT = '';
      const w = await withDeadline(this.work.resolve(id), GIT_DEADLINE_MS);
      if (w !== TIMED_OUT) { facts = w; cwd = w.cwd; }
      if (!cwd) { cwd = await withDeadline(this.client.request({ t: 'chatCwd', chat: id, folders: folderPaths() }, true, true), GIT_DEADLINE_MS); }
      const prs = vscode.workspace.getConfiguration('saropaChatExplorer').get('lookupPullRequests') !== false;
      if (cwd === TIMED_OUT) { post(timedOutLive()); return; }
      const r = await this.gitLive.load(typeof cwd === 'string' ? cwd : '', part, prs, (p) => post(p.live, p.targets), facts?.hint);
      post(r.live, r.targets);
    } catch (e) {
      logErr('git section ' + part, e);
      post(timedOutLive('error', 'Could not read git state'));
    }
  }

  private readonly relBusy = new Set<string>();

  /** Related chats of one chat, asked when its section is opened; one request per chat at a time (a soft request: a stall fails this card only). */
  private async loadRelated(id: string): Promise<void> {
    if (this.relBusy.has(id)) { return; }
    this.relBusy.add(id);
    try {
      const r = await this.client.request({ t: 'related', chat: id }, true, true);
      if (Array.isArray(r)) { this.post({ type: 'related', id, related: r }); } else { this.post({ type: 'relatedFailed', id, reason: 'This session is not indexed yet' }); }
    } catch (e) {
      logErr('related chats', e);
      this.post({ type: 'relatedFailed', id, reason: 'Could not load related sessions' });
    } finally { this.relBusy.delete(id); }
  }

  /** Open a changed file listed in a Git section (resolved from the last load, never from a path the panel sent). */
  private async openGitFile(id: string, i: number): Promise<void> {
    const t = this.gitTargets.get(id), f = t?.files?.[i];
    if (!t || !f) { return; }
    const p = path.resolve(t.top, f.p);
    if (!p.startsWith(t.top + path.sep)) { return; }
    try { await vscode.window.showTextDocument(vscode.Uri.file(p)); } catch { void vscode.window.showInformationMessage('That file is not available (it may be deleted).'); }
  }

  /** Open a pull request page from the Git section. */
  private async openGitPr(id: string, n: number): Promise<void> {
    const u = this.gitTargets.get(id)?.urls?.get(n);
    if (u) { await vscode.env.openExternal(vscode.Uri.parse(u)); }
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
    this.gitTargets.clear(); // a new list: old cards' click targets are stale
    const query = String(m.query ?? '').trim();
    const o = opts(m);
    const base: Base = { ...o, sort: sortOf(m), query };
    const sn = Number(m.sn) || 0;
    if (!(await this.prepare(query, o, base, sn))) { return; }
    this.post({ type: 'start', sn });
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    this.client.search({ query, o, folders, max: maxResults(), ...this.ctxMsg, archived: [...this.store.archived] }, (w) => this.onSearchMsg(w, base, sn),
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

export function activate(ctx: vscode.ExtensionContext): ChatExplorerApi {
  const dir = ctx.globalStorageUri.fsPath;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { logErr('create storage folder', e); } // the worker retries
  client = new WorkerClient(dir);
  const status = new IndexStatus();
  store = new Store(ctx, (e) => logErr('save state', e));
  const hub = new Hub();
  const provider = new Provider(store, client, status, hub);
  const changed = () => { void provider.postMeta(); hub.emit('archived', logErr); };
  provider.actions = new ArchiveActions(store, ctx.globalStorageUri.fsPath, { changed, rebuild: () => provider.watcher?.rebuild() });
  provider.web = new WebSessions(ctx, (m) => provider.post(m), logErr);
  const warner = createWarner(ctx, { request: (m, bg) => client!.request(m as Parameters<WorkerClient['request']>[0], bg), open: (id) => provider.resume(id), log, copyNote: (id) => provider.copyNote(id, () => undefined) });
  provider.watcher = new LiveWatcher({ dir: sessionsDir(), tabs: async () => { const r = await readTabs(workspaceStorageOf(ctx.globalStorageUri.fsPath), folderPaths()); return r.ok ? r : undefined; },
    viewing: () => provider.viewingId(), unread: () => store!.unread, saveUnread: (u) => store!.setUnread(u), log,
    onChange: () => { provider.postDots(); hub.emit('dots', logErr); }, onLive: (ids) => { void warner.check(ids); } });
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('saropaChatExplorer.search.contextLines')) { provider.postCtxLines(); } }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('saropaChatExplorer.contextRingTokens')) { provider.postRing(); } }));
  const tabMoved = () => { provider.clearViewed(); provider.postDots(); provider.watcher?.poke(); };
  ctx.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(tabMoved), vscode.window.tabGroups.onDidChangeTabGroups(tabMoved));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('saropaChatExplorer.animateDots')) { provider.postDots(); hub.emit('dots', logErr); } }));
  ctx.subscriptions.push(vscode.window.onDidChangeWindowState((s) => { if (s.focused) { provider.clearViewed(); provider.watcher?.poke(); } }), { dispose: () => provider.watcher?.dispose() }, ...registerArchiveCommands(provider.actions));
  ctx.subscriptions.push(channel, status,
    vscode.commands.registerCommand('claudeChatExplorer.clearHistory', () => {
      provider.clearHistory();
      void vscode.window.showInformationMessage('Search history cleared');
    }),
    vscode.window.registerWebviewViewProvider('claudeChatExplorer.view', provider,
      { webviewOptions: { retainContextWhenHidden: true } }));
  registerOptions(ctx, logErr);
  const usageRows = async () => (await client!.request({ t: 'usage' }, true, true)) ?? [];
  ctx.subscriptions.push(
    ...[['saropaChatExplorer.copyResume', (id: string) => provider.copyResumeCmd(id)], ['saropaChatExplorer.exportChatMarkdown', (id: string) => provider.exportMd(id)]].map(([cmd, fn]) =>
      vscode.commands.registerCommand(cmd as string, (arg?: { id?: unknown }) => (isSessionId(arg?.id) ? (fn as (id: string) => Promise<void>)(arg.id) : undefined))),
    vscode.commands.registerCommand('saropaChatExplorer.regenTitles', () => regenTitles({ currentId: () => provider.currentId(), refresh: () => { provider.watcher?.poke(); void provider.postMeta(); hub.emit('changed', logErr); }, log: logErr }, channel)),
    vscode.commands.registerCommand('saropaChatExplorer.archiveTiny', () => archiveTiny({ rows: usageRows, archived: () => store!.archived, pins: () => Object.keys(store!.pins), dots: () => provider.dotNames,
      archive: (ids) => provider.actions!.archiveMany(ids) })));
  registerUsage(ctx, { rows: usageRows, resume: (id) => provider.resume(id), log: logErr, onIndex: (fn) => { ctx.subscriptions.push(hub.on('indexed', fn), hub.on('changed', fn)); },
    showNearly: async () => { await vscode.commands.executeCommand(REVEAL_CMD); store!.setStatuses(['nearly']); provider.post({ type: 'setStatuses', checked: ['nearly'] }); } });
  registerHeaderCommands(ctx, { reveal: () => vscode.commands.executeCommand(REVEAL_CMD), post: (m) => provider.post(m), sort: () => store!.draft.sort, statuses: () => store!.statuses, setStatuses: (c) => store!.setStatuses(c) });
  registerEditorView(ctx, { client, ctxMsg: () => provider.searchCtx, archived: () => [...store!.archived], log: logErr, resume: (id) => provider.resume(id) },
    () => ({ ...store!.draft, statuses: store!.statuses }));
  const fileSessions = registerFileSessions(ctx, { client, log: logErr, pins: () => Object.keys(store!.pins), dots: () => provider.dotNames,
    showQuery: (q) => provider.showQuery(q), onIndex: (fn) => { ctx.subscriptions.push(hub.on('indexed', fn), hub.on('changed', fn)); } });
  registerOpenWork(ctx, new OpenWork(ctx, hub, { softRequest: (m) => client!.request(m as Parameters<WorkerClient['request']>[0], true, true), pins: () => Object.keys(store!.pins),
    archived: () => [...store!.archived], dots: () => provider.watcher?.dots ?? {}, resume: (id) => provider.resume(id), copyNote: (id, state) => provider.copyNote(id, state),
    setArchived: (id, on) => provider.actions!.setArchived(id, on), setPinned: (id, on) => provider.actions!.setPinned(id, on), find: (q) => provider.showQuery(q), poke: () => provider.watcher?.poke(), log: logErr,
    scan: new WorkScan({ exec: realExec, limiter, workspace: firstFolder, log: logErr, prsOn, prs: new WorkPrs({ exec: realExec, limiter: ghLimiter, cache: prCache, log: logErr }) }), workspace: firstFolder, prsOn }));
  registerDiagnostics(ctx, (m, bg) => client!.request(m as Parameters<WorkerClient['request']>[0], bg), String(ctx.extension?.packageJSON?.version ?? 'unknown'), () => done, () => provider.watcher?.info, () => provider.watcher, () => warner.atOrAbove80);
  provider.watcher.start();
  done = true;
  log(`activated ${String(ctx.extension?.packageJSON?.version ?? 'unknown')}`);
  client.start(); // indexing runs in the worker; activation never waits for it
  return makeApi(fileSessions);
}

export async function deactivate(): Promise<void> {
  try { await store?.flush(); } catch (e) { logErr('save state', e); }
  await client?.dispose();
}
