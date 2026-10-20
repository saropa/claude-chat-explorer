/** Opt-in Web (cloud) sessions tab: settings, one-time consent, and the panel messages. Does nothing, and makes no network, keychain or credential read, unless the setting is on. */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { fetchTranscript, listSessions, readToken, WebDeps, WebSession, webMarkdown } from './webApi';
import { isSessionId } from './sessionId';

const SECTION = 'saropaChatExplorer', KEY = 'webSessions.enabled', ACK = 'webSessions.consent';
const SCHEME = 'saropa-web-session';
const WARNING = 'Web sessions use an unofficial, undocumented Anthropic API with your Claude login token (read-only; it is never stored or logged). It may break or change without notice, and may be subject to Anthropic\'s terms. Continue?';

export const webEnabled = (): boolean => vscode.workspace.getConfiguration(SECTION).get(KEY) === true;

const home = (...p: string[]) => path.join(os.homedir(), ...p);
export const realDeps = (): WebDeps => ({
  platform: process.platform, now: Date.now,
  keychain: (service) => new Promise((res, rej) => execFile('security', ['find-generic-password', '-s', service, '-w'], { timeout: 5000 }, (e, out) => (e ? rej(new Error('keychain')) : res(String(out))))),
  readFile: (n) => fs.promises.readFile(n === 'credentials' ? home('.claude', '.credentials.json') : home('.claude.json'), 'utf8'),
  fetch: async (url, headers, ms) => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { const r = await fetch(url, { headers, signal: ac.signal }); return { status: r.status, json: await r.json().catch(() => undefined) }; } finally { clearTimeout(t); }
  },
});

export class WebSessions {
  private list = new Map<string, WebSession>();
  private docs = new Map<string, string>();
  private seq = 0;

  constructor(private readonly ctx: vscode.ExtensionContext, private readonly post: (m: object) => void, private readonly log: (where: string, e: unknown) => void, private readonly deps: () => WebDeps = realDeps) {
    ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, { provideTextDocumentContent: (u) => this.docs.get(u.toString()) ?? 'This web session is no longer available.' }),
      vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(`${SECTION}.${KEY}`)) { void this.changed(); } }));
  }

  /** Tell the panel whether the Web tab exists. */
  announce(): void { this.post({ type: 'webEnabled', on: webEnabled() }); }

  /** The one-time warning; true once confirmed (remembered). Declining turns the setting back off. */
  private async consent(): Promise<boolean> {
    if (this.ctx.globalState.get<boolean>(ACK) === true) { return true; }
    const ok = (await vscode.window.showWarningMessage(WARNING, { modal: true }, 'Enable Web sessions')) === 'Enable Web sessions';
    if (ok) { await this.ctx.globalState.update(ACK, true); } else { await vscode.workspace.getConfiguration(SECTION).update(KEY, false, vscode.ConfigurationTarget.Global); }
    return ok;
  }

  private async changed(): Promise<void> {
    if (webEnabled()) { await this.consent(); } else { this.list.clear(); this.docs.clear(); }
    this.announce();
  }

  /** The panel asked for the list: nothing happens unless enabled and confirmed. */
  async load(): Promise<void> {
    if (!webEnabled() || !(await this.consent())) { this.post({ type: 'webList', notice: 'Web sessions are off. Turn on saropaChatExplorer.webSessions.enabled to use them.', rows: [] }); return; }
    try {
      const d = this.deps(), t = await readToken(d);
      if (!t.ok) { this.post({ type: 'webList', notice: t.msg, rows: [] }); return; }
      const rows = await listSessions(d, t);
      this.list = new Map(rows.map((r) => [r.id, r]));
      this.post({ type: 'webList', rows });
    } catch (e) { this.fail(e); }
  }

  /** Fetch one transcript on demand and show it as a read-only Markdown document. */
  async open(id: unknown): Promise<void> {
    const s = isSessionId(id) ? this.list.get(id) : undefined;
    if (!s || !webEnabled() || !(await this.consent())) { return; }
    try {
      const d = this.deps(), t = await readToken(d);
      if (!t.ok) { this.post({ type: 'webList', notice: t.msg, rows: [...this.list.values()] }); return; }
      const msgs = await fetchTranscript(d, t, s.id);
      const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${s.title.replace(/[\\/\s]+/g, ' ').slice(0, 60)}.md`, query: String(++this.seq) });
      this.docs.set(uri.toString(), webMarkdown(s, msgs));
      const td = await vscode.workspace.openTextDocument(uri);
      try { await vscode.languages.setTextDocumentLanguage(td, 'markdown'); } catch { /* plain text */ }
      await vscode.window.showTextDocument(td, { preview: false });
    } catch (e) { this.fail(e, [...this.list.values()]); }
  }

  /** Web-tab-only notice; the message never holds the token. */
  private fail(e: unknown, rows: WebSession[] = []): void {
    this.log('web sessions', e);
    this.post({ type: 'webList', notice: 'Web sessions unavailable: ' + ((e as Error)?.name === 'AbortError' ? 'the request timed out' : (e as Error)?.message || 'unknown error'), rows });
  }
}
