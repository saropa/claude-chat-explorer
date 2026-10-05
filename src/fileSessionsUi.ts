/** Command for "which chats touched this file": opens the panel and searches file:<path>; plus the status bar. */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { fileQuery } from './fileQuery';
import { FileSessionsBar, SHOW_CMD } from './fileSessionsBar';
import { FileSessionsService } from './fileSessionsService';

export interface FileSessionsHost {
  client: { request(m: { [k: string]: unknown }, background?: boolean): Promise<any> };
  showQuery: (query: string) => Promise<void>;
  log: (where: string, e: unknown) => void;
  pins: () => string[];
  dots: () => { [id: string]: string };
  onIndex: (fn: () => void) => void;
}

const roots = (): string[] => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

/** The resource from a command argument (Explorer, tab or editor menu) or the active editor. */
function targetUri(arg: unknown): vscode.Uri | undefined {
  return arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
}

/** Open the panel with file:<path>; an untitled file or one not on disk gets the "no chat" message instead. */
async function show(host: FileSessionsHost, arg: unknown): Promise<void> {
  try {
    const uri = targetUri(arg);
    if (!uri) { void vscode.window.showInformationMessage('Open a file first.'); return; }
    if (uri.scheme !== 'file' || !fs.existsSync(uri.fsPath)) { void vscode.window.showInformationMessage('No chat has touched this file yet.'); return; }
    await host.showQuery(fileQuery(uri.fsPath, roots()));
  } catch (e) { host.log('file sessions', e); void vscode.window.showErrorMessage('Could not search chats for this file: ' + (e as Error).message); }
}

/** Register the command and the status bar item. */
export function registerFileSessions(ctx: vscode.ExtensionContext, host: FileSessionsHost): void {
  const svc = new FileSessionsService(host.client, roots, host.pins, host.dots);
  const bar = new FileSessionsBar(svc, host.log);
  host.onIndex(() => { svc.invalidate(); bar.schedule(); });
  ctx.subscriptions.push(bar, vscode.commands.registerCommand(SHOW_CMD, (arg?: unknown) => show(host, arg)));
}
