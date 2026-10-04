import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatIndex } from './index';
import { compile, isEmpty } from './query';
import { expandChat, searchIndex } from './search';
import { Store } from './store';
import { Abort, Ctx, Options, Result } from './types';
import { projectOf, statFields } from './stats';
import { html, NAME } from './webview';

const WHENS = ['any', '1h', '2h', '4h', '8h', 'today'];
const SORTS = ['score', 'time', 'title', 'length'];

function opts(m: any): Options {
  const when = WHENS.includes(m.when) ? String(m.when) : 'any';
  return { all: !!m.all, cs: !!m.cs, ww: !!m.ww, re: !!m.re, when };
}
const sortOf = (m: any): string => (SORTS.includes(m.sort) ? String(m.sort) : 'score');

async function openChat(id: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id);
    return;
  } catch { /* fall through */ }
  try {
    const ok = await vscode.env.openExternal(
      vscode.Uri.parse('vscode://anthropic.claude-code/open?session=' + id));
    if (ok) { return; }
  } catch { /* fall through */ }
  vscode.window.showErrorMessage('Could not open Claude chat ' + id);
}

class Provider implements vscode.WebviewViewProvider {
  private seq = 0;
  private sig: Abort = { aborted: false };
  private view?: vscode.WebviewView;
  private progress: { done: number; total: number } | null = null;

  constructor(private readonly store: Store, private readonly index: ChatIndex) {
    index.onChange = () => this.postMeta();
  }

  private post(m: unknown): void { void this.view?.webview.postMessage(m); }

  /** Index progress shown in the panel; null means done. */
  indexing(done: number, total: number): void {
    this.progress = done >= total ? null : { done, total };
    this.post(this.progress ? { type: 'indexing', done, total } : { type: 'indexed' });
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
    this.post({ type: 'restore', state: this.store.state, history: this.store.history });
    this.postMeta();
    if (this.progress) { this.post({ type: 'indexing', ...this.progress }); }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.title = NAME;
    view.webview.options = { enableScripts: true };
    view.webview.html = html();
    view.webview.onDidReceiveMessage((m) => { void this.onMessage(m); });
    this.restore();
  }

  private async onMessage(m: any): Promise<void> {
    try {
      const id = String(m.id ?? '');
      if (m.type === 'ready') { this.restore(); }
      else if (m.type === 'draft') {
        await this.store.setState({ ...this.store.state, ...opts(m), sort: sortOf(m), query: String(m.query ?? '') });
      } else if (m.type === 'search') { await this.search(m); }
      else if (m.type === 'open') { await openChat(id); }
      else if (m.type === 'histRemove') {
        await this.store.setHistory(this.store.history.filter((_, i) => i !== m.index));
        this.post({ type: 'history', history: this.store.history });
      } else if (m.type === 'histClear') {
        await this.store.setHistory([]);
        this.post({ type: 'history', history: [] });
      } else if (m.type === 'expand') { this.expand(m); }
      else if (m.type === 'pin') { await this.store.togglePin(id); this.postMeta(); }
      else if (m.type === 'tagAdd') { await this.store.addTag(id, String(m.tag ?? '')); this.postMeta(); }
      else if (m.type === 'tagRemove') { await this.store.removeTag(id, String(m.tag ?? '')); this.postMeta(); }
    } catch { /* never break the message loop */ }
  }

  private expand(m: any): void {
    const id = String(m.id);
    const chat = this.index.list().filter((c) => c.id === id).sort((a, b) => b.mtime - a.mtime)[0];
    if (!chat) { return; }
    let c;
    try { c = compile(String(m.query ?? ''), opts(m)); } catch { return; }
    const offset = Math.max(0, Number(m.offset) || 0);
    const related = offset === 0 ? this.index.related(chat) : []; // lazy: only on first expand
    this.post({ type: 'expanded', id, offset, ...expandChat(chat, c, this.ctx, offset), related });
  }

  private async search(m: any): Promise<void> {
    const query = String(m.query ?? '').trim();
    const o = opts(m);
    const id = ++this.seq;
    this.sig.aborted = true; // cancel the previous scan immediately
    const sig: Abort = { aborted: false };
    this.sig = sig;
    const base = { ...o, sort: sortOf(m), query };
    if (!query) {
      await this.store.setState({ ...base, results: [], searched: '' });
      this.post({ type: 'results', results: [], searched: '' });
      return;
    }
    let compiled;
    try { compiled = compile(query, o); } catch (e) {
      this.post({ type: 'error', message: (e as Error).message });
      return;
    }
    if (isEmpty(compiled)) {
      this.post({ type: 'results', results: [], searched: '' });
      return;
    }
    this.post({ type: 'start' });
    const live = () => id === this.seq && !sig.aborted;
    let pending: Result[] = [];
    let prog = { done: 0, total: 0 };
    let timer: NodeJS.Timeout | undefined;
    const flush = () => {
      timer = undefined;
      if (!live()) { return; }
      this.post({ type: 'batch', results: pending, done: prog.done, total: prog.total });
      pending = [];
    };
    try {
      await this.index.refresh((d, t) => { if (live()) { this.indexing(d, t); } });
      if (!live()) { return; }
      const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
      const results = await searchIndex(this.index.list(), compiled, o, folders, this.ctx, sig, (r, done, total) => {
        if (!live()) { return; }
        if (r) { pending.push(r); }
        prog = { done, total };
        if (!timer) { timer = setTimeout(flush, 100); }
      });
      if (timer) { clearTimeout(timer); timer = undefined; }
      if (!live()) { return; }
      flush();
      const searched = results.length ? '' : 'No matches';
      await this.store.setState({ ...base, results, searched });
      if (!live()) { return; }
      if (results.length) { this.post({ type: 'history', history: await this.store.addHistory({ query, ...o }) }); }
      this.post({ type: 'done', results, searched });
    } catch {
      if (timer) { clearTimeout(timer); }
      if (live()) { this.post({ type: 'results', results: [], searched: 'Search failed' }); }
    }
  }
}

let index: ChatIndex | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  const dir = ctx.globalStorageUri.fsPath;
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* persist() retries */ }
  index = new ChatIndex(path.join(dir, 'index-cache.jsonl'));
  const provider = new Provider(new Store(ctx), index);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeChatSearch.view', provider,
      { webviewOptions: { retainContextWhenHidden: true } }));
  const idx = index;
  // Background build: never blocks activation.
  void idx.load().then(() => idx.refresh((d, t) => provider.indexing(d, t)))
    .then(() => { provider.indexing(1, 1); idx.watch(); }).catch(() => undefined);
}

export async function deactivate(): Promise<void> { await index?.dispose(); }
