/** Commands for "which chats touched this file": QuickPick and status bar. */
import * as path from 'path';
import * as vscode from 'vscode';
import { FileSessionsBar, SHOW_CMD } from './fileSessionsBar';
import { showPick } from './fileSessionsPick';
import { FileSessionsService } from './fileSessionsService';

const SLOW_MS = 500;

export interface FileSessionsHost {
  client: { request(m: { [k: string]: unknown }, background?: boolean): Promise<any> };
  open: (id: string) => Promise<void>;
  showQuery: (query: string) => Promise<void>;
  log: (where: string, e: unknown) => void;
  pins: () => string[];
  dots: () => { [id: string]: string };
  onIndex: (fn: () => void) => void;
}

/** The file from a command argument (Explorer, tab or editor menu) or the active editor; undefined for non-file resources. */
function targetUri(arg: unknown): vscode.Uri | undefined {
  const u = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
  return u && u.scheme === 'file' ? u : undefined;
}
const relOf = (u: vscode.Uri): string => vscode.workspace.asRelativePath(u, false).replace(/\\/g, '/');

/** Show a progress notification only when the work takes longer than 500 ms. */
async function slowProgress<T>(work: Promise<T>, title: string): Promise<T> {
  const t = setTimeout(() => {
    void vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, () => work.then(() => undefined, () => undefined));
  }, SLOW_MS);
  try { return await work; } finally { clearTimeout(t); }
}

async function show(svc: FileSessionsService, host: FileSessionsHost, arg: unknown): Promise<void> {
  const uri = targetUri(arg), name = uri ? path.basename(uri.fsPath) : '';
  if (!uri) { void vscode.window.showInformationMessage('Open a file first.'); return; }
  try {
    const r = await slowProgress(svc.get(uri.fsPath), 'Finding Claude chats...');
    if (r.indexing) { void vscode.window.showInformationMessage('Saropa Chat Explorer is still building its index. Try again in a moment.'); }
    else if (!r.items.length) { void vscode.window.showInformationMessage(`No Claude chat has touched ${name} yet.`); }
    else { showPick(name, r.items, { open: host.open, findInPanel: host.showQuery, relPath: relOf(uri) }); }
  } catch (e) { host.log('file sessions', e); void vscode.window.showErrorMessage('Could not list chats for this file: ' + (e as Error).message); }
}

/** Register the commands and the status bar item. */
export function registerFileSessions(ctx: vscode.ExtensionContext, host: FileSessionsHost): void {
  const roots = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const svc = new FileSessionsService(host.client, roots, host.pins, host.dots);
  const bar = new FileSessionsBar(svc, host.log);
  host.onIndex(() => { svc.invalidate(); bar.schedule(); });
  ctx.subscriptions.push(bar,
    vscode.commands.registerCommand(SHOW_CMD, (arg?: unknown) => show(svc, host, arg)));
}
