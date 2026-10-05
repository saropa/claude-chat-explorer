import * as vscode from 'vscode';
import { WorkerClient } from './client';
import { buildDoc, Doc, DocMeta } from './editorDoc';
import { EdOut } from './editorSearch';
import { gitHint } from './gitMatch';
import { maxResults } from './maxResults';
import { opts, sortOf } from './msgOpts';
import { compile, isEmpty, MIN_QUERY_CHARS, parseQuery, queryChars } from './query';
import { isSessionId } from './sessionId';
import { STATUS_KEYS } from './status';
import { Options } from './types';

export const OPEN_EDITOR_CMD = 'saropaChatExplorer.openResultsInEditor';
export const RESUME_CHAT_CMD = 'saropaChatExplorer.resumeChatFromResults';
const SCHEME = 'saropa-chat-results';
const KEEP_DOCS = 10; // result documents kept in memory
const TITLE_MAX = 60;

export interface EditorDeps {
  client: WorkerClient; ctxMsg: () => object; archived: () => string[]; log: (where: string, e: unknown) => void;
  resume: (id: string) => Promise<void>;
}

const docs = new Map<string, Doc>();
let seq = 0;
const highlight = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
});

const flagNames = (o: Options): string[] => [o.cs && 'Match Case', o.ww && 'Whole Word', o.any && 'Any Order', o.re && 'Regular Expression', !o.subs && 'Subagents Off', o.all && 'All Projects'].filter(Boolean) as string[];

function paint(ed: vscode.TextEditor): void {
  const d = docs.get(ed.document.uri.toString());
  if (d) { ed.setDecorations(highlight, d.spans.map((s) => new vscode.Range(s.line, s.from, s.line, s.to))); }
}

/** Open the finished results as a read-only "Search: <query>" document with highlights. */
async function show(out: EdOut, m: DocMeta): Promise<void> {
  const doc = buildDoc(out, m), name = m.query.replace(/[\\/\s]+/g, ' ').slice(0, TITLE_MAX);
  const uri = vscode.Uri.from({ scheme: SCHEME, path: `/Search: ${name}`, query: String(++seq) });
  docs.set(uri.toString(), doc);
  for (const k of [...docs.keys()].slice(0, Math.max(0, docs.size - KEEP_DOCS))) { docs.delete(k); }
  const td = await vscode.workspace.openTextDocument(uri);
  try { await vscode.languages.setTextDocumentLanguage(td, 'search-result'); } catch { /* plain text keeps the highlights */ }
  const ed = await vscode.window.showTextDocument(td, { preview: false });
  paint(ed);
}

/** Run the panel's search for the editor; progress shows while the worker builds it. */
export async function openInEditor(m: any, d: EditorDeps): Promise<void> {
  const query = String(m.query ?? '').trim(), o = opts(m);
  const hint = gitHint(parseQuery(query).tokens);
  try { if (hint || isEmpty(compile(query, o)) || queryChars(query, o) < MIN_QUERY_CHARS) { throw new Error(hint || 'Type a search in the panel first'); } }
  catch (e) { void vscode.window.showInformationMessage('Open in editor: ' + (e as Error).message); return; }
  const statuses = Array.isArray(m.statuses) ? STATUS_KEYS.filter((k) => m.statuses.includes(k)) : [...STATUS_KEYS];
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Building results for "${query}"`, cancellable: true }, (prog, tok) =>
    new Promise<void>((resolve) => {
      tok.onCancellationRequested(() => d.client.cancel('editor'));
      let seen = 0;
      const fail = (e: unknown) => { d.log('open in editor', e); void vscode.window.showErrorMessage('Open in editor failed: ' + (e as Error).message); };
      d.client.search({ query, o, folders, max: maxResults(), x: { statuses, sort: sortOf(m) }, ...d.ctxMsg(), archived: d.archived() }, (w) => {
        if (w.t === 'tick') { const p = Math.floor((100 * w.done) / Math.max(1, w.total)); prog.report({ increment: Math.max(0, p - seen) }); seen = Math.max(seen, p); }
        else if (w.t === 'done') { show(w as unknown as EdOut, { query, flags: flagNames(o) }).catch(fail); }
        else if (w.t === 'error') { fail(new Error(w.message)); }
      }, () => resolve(), 'editor');
    }));
}

/** Register the document provider, the chat header links, the highlights and the resume command. */
export function registerEditorView(ctx: vscode.ExtensionContext, d: EditorDeps, fallback: () => object): void {
  const sel: vscode.DocumentSelector = { scheme: SCHEME };
  ctx.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, { provideTextDocumentContent: (u) => docs.get(u.toString())?.text ?? 'These results are no longer available. Run the search again.' }),
    vscode.languages.registerDocumentLinkProvider(sel, {
      provideDocumentLinks: (td) => (docs.get(td.uri.toString())?.links ?? []).map((l) => {
        const k = new vscode.DocumentLink(new vscode.Range(l.line, 0, l.line, l.to), vscode.Uri.parse(`command:${RESUME_CHAT_CMD}?${encodeURIComponent(JSON.stringify([l.id]))}`));
        k.tooltip = 'Resume this chat in the Claude panel';
        return k;
      }),
    }),
    vscode.window.onDidChangeVisibleTextEditors((eds) => eds.filter((e) => e.document.uri.scheme === SCHEME).forEach(paint)),
    vscode.commands.registerCommand(RESUME_CHAT_CMD, (id: unknown) => (isSessionId(id) ? d.resume(id) : undefined)),
    vscode.commands.registerCommand(OPEN_EDITOR_CMD, (m?: object) => openInEditor(m ?? fallback(), d)),
    highlight);
}
