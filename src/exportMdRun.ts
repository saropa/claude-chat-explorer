/** Host side of "Export Chat as Markdown": ask the worker for the text, ask where to save, write the file. */
import * as vscode from 'vscode';
import * as path from 'path';
import { isSessionId } from './sessionId';

export interface ExportMdDeps { request: (m: { [k: string]: any }) => Promise<any>; log: (where: string, e: unknown) => void; }

export async function exportChatMd(id: string, d: ExportMdDeps): Promise<void> {
  if (!isSessionId(id)) { return; }
  try {
    const r: { text: string; name: string } | null = await d.request({ t: 'chatMd', chat: id });
    if (!r) { void vscode.window.showInformationMessage('This session is not indexed yet. Try again in a moment.'); return; }
    const base = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const uri = await vscode.window.showSaveDialog({ defaultUri: base ? vscode.Uri.file(path.join(base, r.name)) : undefined, filters: { Markdown: ['md'] }, saveLabel: 'Export' });
    if (!uri) { return; }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(r.text, 'utf8'));
    void vscode.window.showInformationMessage('Exported session to ' + path.basename(uri.fsPath));
  } catch (e) { d.log('export session markdown', e); void vscode.window.showErrorMessage('Could not export the session: ' + (e as Error).message); }
}
