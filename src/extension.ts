import * as vscode from 'vscode';
import * as fs from 'fs';
import { TIMEOUT_MSG, WorkerClient } from './client';
import { IndexStatus } from './indexStatus';
import { compile, isEmpty } from './query';
import { isSessionId, openChat } from './resume';
import { Saved, Store } from './store';
import { Compiled, Options, Result } from './types';
import { html, NAME } from './webview';

const WHENS = ['any', '1h', '2h', '4h', '8h', 'today'];
const SORTS = ['score', 'time', 'title', 'length'];
const POST_GAP_MS = 100;

type Base = Omit<Saved, 'results' | 'searched'>;

function opts(m: any): Options {
  const when = WHENS.includes(m.when) ? String(m.when) : 'any';
  return { all: !!m.all, cs: !!m.cs, ww: !!m.ww, re: !!m.re, when, subs: m.subs !== false };
}
const sortOf = (m: any): string => (SORTS.includes(m.sort) ? String(m.sort) : 'score');

const channel = vscode.window.createOutputChannel(NAME);
const log = (msg: string): void => channel.appendLine(`[${new Date().toISOString()}] ${msg}`);
const logErr = (where: string, e: unknown): void => log(`${where}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);

class Provider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private progress: { done: number; total: number; subs: number; first: boolean } | null = null;
  private lastPost = 0;

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
    else if (m.t === 'indexed') { this.indexed(); }
    else if (m.t === 'changed') { void this.postMeta(); }
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
      void vscode.window.showInformationMessage(`Saropa Chat Search: indexed ${n} chats and ${was.subs} subagent files.`);
    }
  }

  private get ctxMsg() { return { pins: Object.keys(this.store.pins), tags: this.store.tags }; }

  private async postMeta(): Promise<void> {
    try {
      const pinned = await this.client.request({ t: 'pinned', ids: Object.keys(this.store.pins) });
      this.post({ type: 'meta', pins: Object.keys(this.store.pins), tags: this.store.tags, all: this.store.allTags, pinned });
    } catch (e) { logErr('meta', e); }
  }

  private restore(): void {
    this.post({ type: 'restore', state: this.store.state, history: this.store.history, statuses: this.store.statuses });
    void this.postMeta();
    if (this.progress) { this.post({ type: 'indexing', ...this.progress }); }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.title = NAME;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = html();
    const sub = view.webview.onDidReceiveMessage((m) => { void this.onMessage(m); });
    view.onDidDispose(() => { sub.dispose(); if (this.view === view) { this.view = undefined; } });
    // The script posts 'ready' once its listener is attached; restore() runs then.
  }

  private async onMessage(m: any): Promise<void> {
    try {
      if (!m || typeof m !== 'object') { return; }
      if (m.type === 'ready') { this.restore(); }
      else if (m.type === 'status') { await this.store.setStatuses(m.checked); }
      else if (m.type === 'draft') {
        await this.store.setState({ ...this.store.state, ...opts(m), sort: sortOf(m), query: String(m.query ?? '') });
      } else if (m.type === 'search') { await this.search(m); }
      else if (m.type === 'histRemove') {
        await this.store.setHistory(this.store.history.filter((_, i) => i !== m.index));
        this.post({ type: 'history', history: this.store.history });
      } else if (m.type === 'histClear') {
        await this.store.setHistory([]);
        this.post({ type: 'history', history: [] });
      } else { await this.onChatMessage(m); }
    } catch (e) { logErr('message ' + String(m?.type), e); }
  }

  /** Messages that act on one chat; the id is validated before any use. */
  private async onChatMessage(m: any): Promise<void> {
    const id = m.id;
    if (!isSessionId(id)) { log(`Ignored ${String(m.type)} with invalid id`); return; }
    if (m.type === 'open') { await openChat(id, log); }
    else if (m.type === 'expand') { await this.expand(id, m); }
    else if (m.type === 'pin') { await this.store.togglePin(id); await this.postMeta(); }
    else if (m.type === 'tagAdd') { await this.store.addTag(id, String(m.tag ?? '')); await this.postMeta(); }
    else if (m.type === 'tagRemove') { await this.store.removeTag(id, String(m.tag ?? '')); await this.postMeta(); }
  }

  private async expand(id: string, m: any): Promise<void> {
    const o = opts(m), query = String(m.query ?? '');
    try { compile(query, o); } catch { return; } // invalid regex: search shows the error
    const offset = Math.max(0, Number(m.offset) || 0);
    try {
      const ex = await this.client.request({ t: 'expand', chat: id, query, o, offset, ...this.ctxMsg });
      if (ex) { this.post({ type: 'expanded', id, offset, ...ex }); }
    } catch (e) {
      logErr('expand', e);
      if ((e as Error).message === TIMEOUT_MSG) { this.post({ type: 'error', message: TIMEOUT_MSG }); }
    }
  }

  /** Compile the query, or post the empty or error outcome and return undefined. */
  private async prepare(query: string, o: Options, base: Base): Promise<Compiled | undefined> {
    if (!query) {
      this.client.cancel();
      await this.store.setState({ ...base, results: [], searched: '' });
      this.post({ type: 'results', results: [], searched: '' });
      return undefined;
    }
    let compiled;
    try { compiled = compile(query, o); } catch (e) {
      this.post({ type: 'error', message: (e as Error).message });
      return undefined;
    }
    if (isEmpty(compiled)) { this.post({ type: 'results', results: [], searched: '' }); return undefined; }
    return compiled;
  }

  private async search(m: any): Promise<void> {
    const query = String(m.query ?? '').trim();
    const o = opts(m);
    const base: Base = { ...o, sort: sortOf(m), query };
    if (!(await this.prepare(query, o, base))) { return; }
    this.post({ type: 'start' });
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    this.client.search({ query, o, folders, ...this.ctxMsg }, (w) => this.onSearchMsg(w, base),
      (why) => { if (why === 'timeout') { this.post({ type: 'error', message: TIMEOUT_MSG }); } });
  }

  /** Forward worker batches as they come; the final message saves state and history. */
  private onSearchMsg(w: any, base: Base): void {
    if (w.t === 'batch') { this.post({ type: 'batch', results: w.results, done: w.done, total: w.total }); }
    else if (w.t === 'error') { logErr('search', w.message); this.post({ type: 'results', results: [], searched: 'Search failed' }); }
    else if (w.t === 'done') { void this.finish(w.results, base); }
  }

  private async finish(results: Result[], base: Base): Promise<void> {
    const searched = results.length ? '' : 'No matches';
    this.post({ type: 'done', results, searched });
    try {
      await this.store.setState({ ...base, results, searched });
      if (results.length) {
        const { sort: _s, ...h } = base;
        this.post({ type: 'history', history: await this.store.addHistory(h) });
      }
    } catch (e) { logErr('save search', e); }
  }
}

let client: WorkerClient | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const dir = ctx.globalStorageUri.fsPath;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { logErr('create storage folder', e); } // the worker retries
  client = new WorkerClient(dir);
  const status = new IndexStatus();
  const provider = new Provider(new Store(ctx), client, status);
  ctx.subscriptions.push(channel, status,
    vscode.window.registerWebviewViewProvider('claudeChatSearch.view', provider,
      { webviewOptions: { retainContextWhenHidden: true } }));
  client.start(); // indexing runs in the worker; activation never waits for it
}

export async function deactivate(): Promise<void> { await client?.dispose(); }
