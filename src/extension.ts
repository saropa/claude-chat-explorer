import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatIndex } from './index';
import { IndexStatus } from './indexStatus';
import { compile, isEmpty } from './query';
import { isSessionId, openChat } from './resume';
import { expandChat, searchIndex } from './search';
import { Saved, Store } from './store';
import { Abort, Compiled, Ctx, Options, Result } from './types';
import { projectOf, statFields } from './stats';
import { html, NAME } from './webview';

const WHENS = ['any', '1h', '2h', '4h', '8h', 'today'];
const SORTS = ['score', 'time', 'title', 'length'];
const POST_GAP_MS = 100;

type Base = Omit<Saved, 'results' | 'searched'>;

function opts(m: any): Options {
  const when = WHENS.includes(m.when) ? String(m.when) : 'any';
  return { all: !!m.all, cs: !!m.cs, ww: !!m.ww, re: !!m.re, when };
}
const sortOf = (m: any): string => (SORTS.includes(m.sort) ? String(m.sort) : 'score');

const channel = vscode.window.createOutputChannel(NAME);
const log = (msg: string): void => channel.appendLine(`[${new Date().toISOString()}] ${msg}`);
const logErr = (where: string, e: unknown): void => log(`${where}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);

class Provider implements vscode.WebviewViewProvider {
  private seq = 0;
  private sig: Abort = { aborted: false };
  private view?: vscode.WebviewView;
  private progress: { done: number; total: number; first: boolean } | null = null;
  private lastPost = 0;

  constructor(private readonly store: Store, private readonly index: ChatIndex,
    private readonly status: IndexStatus) {
    index.onChange = () => this.postMeta();
  }

  private post(m: unknown): void {
    try { this.view?.webview.postMessage(m).then(undefined, (e) => logErr('post', e)); } catch (e) { logErr('post', e); }
  }

  /** Index progress shown in the panel and status bar; done >= total means finished. */
  indexing(done: number, total: number): void {
    const was = this.progress;
    if (done >= total) {
      this.progress = null;
      this.status.hide();
      this.post({ type: 'indexed' });
      if (was?.first) { void vscode.window.showInformationMessage(`Saropa Chat Search: indexed ${total} chats.`); }
      return;
    }
    this.progress = { done, total, first: this.index.building };
    this.status.update(done, total);
    const now = Date.now();
    if (now - this.lastPost < POST_GAP_MS) { return; } // one webview message per file is wasteful
    this.lastPost = now;
    this.post({ type: 'indexing', ...this.progress });
  }

  private get ctx(): Ctx { return { pins: new Set(Object.keys(this.store.pins)), tags: this.store.tags }; }

  private meta() {
    const pins = this.store.pins;
    const pinned: Result[] = this.index.list().filter((c) => pins[c.id]).sort((a, b) => b.last - a.last)
      .map((c) => ({ id: c.id, title: c.title, hits: 0, last: c.last, snippet: '', ranges: [], score: 0,
        project: projectOf(c), ...statFields(c) }));
    return { type: 'meta', pins: Object.keys(pins), tags: this.store.tags, all: this.store.allTags, pinned };
  }
  private postMeta(): void { this.post(this.meta()); }

  private restore(): void {
    this.post({ type: 'restore', state: this.store.state, history: this.store.history,
      statuses: this.store.statuses });
    this.postMeta();
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
    else if (m.type === 'expand') { this.expand(id, m); }
    else if (m.type === 'pin') { await this.store.togglePin(id); this.postMeta(); }
    else if (m.type === 'tagAdd') { await this.store.addTag(id, String(m.tag ?? '')); this.postMeta(); }
    else if (m.type === 'tagRemove') { await this.store.removeTag(id, String(m.tag ?? '')); this.postMeta(); }
  }

  private expand(id: string, m: any): void {
    const chat = this.index.find(id);
    if (!chat) { return; }
    let c;
    try { c = compile(String(m.query ?? ''), opts(m)); } catch { return; } // invalid regex: search shows the error
    const offset = Math.max(0, Number(m.offset) || 0);
    const related = offset === 0 ? this.index.related(chat) : []; // lazy: only on first expand
    this.post({ type: 'expanded', id, offset, ...expandChat(chat, c, this.ctx, offset), related });
  }

  /** Compile the query, or post the empty or error outcome and return undefined. */
  private async prepare(query: string, o: Options, base: Base): Promise<Compiled | undefined> {
    if (!query) {
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
    const id = ++this.seq;
    this.sig.aborted = true; // cancel the previous scan immediately
    const sig: Abort = { aborted: false };
    this.sig = sig;
    const base: Base = { ...o, sort: sortOf(m), query };
    const compiled = await this.prepare(query, o, base);
    if (!compiled) { return; }
    this.post({ type: 'start' });
    const live = () => id === this.seq && !sig.aborted;
    try { await this.run(compiled, o, sig, live, base); } catch (e) {
      logErr('search', e);
      if (live()) { this.post({ type: 'results', results: [], searched: 'Search failed' }); }
    }
  }

  /** Refresh (unless an index pass is already running), scan and stream batches every 100 ms. */
  private async run(compiled: Compiled, o: Options, sig: Abort, live: () => boolean, base: Base): Promise<void> {
    // While indexing progress shows, search what is indexed so far; the panel reruns when it finishes.
    if (!this.progress) { await this.index.refresh((d, t) => this.indexing(d, t)); }
    if (!live()) { return; }
    let pending: Result[] = [];
    let prog = { done: 0, total: 0 };
    let timer: NodeJS.Timeout | undefined;
    const flush = () => {
      timer = undefined;
      if (live()) { this.post({ type: 'batch', results: pending, done: prog.done, total: prog.total }); }
      pending = [];
    };
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    try {
      const results = await searchIndex(this.index.list(), compiled, o, folders, this.ctx, sig, (r, done, total) => {
        if (!live()) { return; }
        if (r) { pending.push(r); }
        prog = { done, total };
        timer ??= setTimeout(flush, POST_GAP_MS);
      });
      if (!live()) { return; }
      clearTimeout(timer);
      flush();
      const searched = results.length ? '' : 'No matches';
      await this.store.setState({ ...base, results, searched });
      if (!live()) { return; }
      if (results.length) { this.post({ type: 'history', history: await this.store.addHistory({ query: base.query, ...o }) }); }
      this.post({ type: 'done', results, searched });
    } finally { clearTimeout(timer); }
  }
}

let index: ChatIndex | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const dir = ctx.globalStorageUri.fsPath;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { logErr('create storage folder', e); } // persist() retries
  index = new ChatIndex(path.join(dir, 'index-cache.jsonl'));
  index.onError = logErr;
  const status = new IndexStatus();
  const provider = new Provider(new Store(ctx), index, status);
  ctx.subscriptions.push(channel, status,
    vscode.window.registerWebviewViewProvider('claudeChatSearch.view', provider,
      { webviewOptions: { retainContextWhenHidden: true } }));
  const idx = index;
  // Background build: never blocks activation.
  void idx.load().then(() => idx.refresh((d, t) => provider.indexing(d, t)))
    .catch((e) => logErr('initial index', e))
    .finally(() => { provider.indexing(1, 1); idx.watch(); });
}

export async function deactivate(): Promise<void> { await index?.dispose(); }
