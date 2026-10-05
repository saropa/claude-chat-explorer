import * as vscode from 'vscode';
import { isSessionId } from './sessionId';

export { isSessionId };

/** Resume a chat in the Claude Code panel; falls back to its URI handler, which offers install when absent. */
export async function openChat(id: string, log: (msg: string) => void): Promise<void> {
  if (!isSessionId(id)) { log('Rejected open for invalid session id'); return; }
  try {
    await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id);
    return;
  } catch (e) { log('claude-vscode.primaryEditor.open failed: ' + String(e)); }
  try {
    const uri = vscode.Uri.parse(`${vscode.env.uriScheme}://anthropic.claude-code/open?session=${encodeURIComponent(id)}`);
    if (await vscode.env.openExternal(uri)) { return; }
  } catch (e) { log('agent URI fallback failed: ' + String(e)); }
  void vscode.window.showErrorMessage('Could not open chat ' + id + '. Is the agent extension installed?');
}

/** Copy a session id to the clipboard and say so. */
export async function copyId(id: string, log: (msg: string) => void): Promise<void> {
  if (!isSessionId(id)) { log('Rejected copy for invalid session id'); return; }
  await vscode.env.clipboard.writeText(id);
  void vscode.window.showInformationMessage('Copied session id');
}
