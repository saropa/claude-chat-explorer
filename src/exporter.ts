import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExportOut, exportName, MAX_EXPORT_BYTES, MAX_EXPORT_LINES } from './export';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Toast text for a finished export. */
export function toastText(out: ExportOut, mode: string, file = ''): string {
  const what = `${plural(out.lines, 'line')} from ${plural(out.chats, 'chat')}`;
  const limit = out.capBy === 'bytes' ? `${MAX_EXPORT_BYTES / 1048576} MB` : `${MAX_EXPORT_LINES.toLocaleString('en-US')} line`;
  const cap = out.capped ? ` (stopped at the ${limit} limit)` : '';
  return (mode === 'save' ? `Saved ${what} to ${file}` : `Copied ${what}`) + cap;
}

/** Copy the text, or ask for a file and save it; shows the result toast. Returns false when the user canceled the dialog. */
export async function deliver(out: ExportOut, mode: string): Promise<boolean> {
  if (mode !== 'save') {
    await vscode.env.clipboard.writeText(out.text);
    void vscode.window.showInformationMessage(toastText(out, mode));
    return true;
  }
  const base = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(base, exportName(new Date()))), filters: { Text: ['txt'] },
  });
  if (!uri) { return false; }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(out.text, 'utf8'));
  void vscode.window.showInformationMessage(toastText(out, mode, path.basename(uri.fsPath)));
  return true;
}
