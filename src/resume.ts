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
  void vscode.window.showErrorMessage('Could not open session ' + id + '. Is the agent extension installed?');
}

/** Start a fresh Claude Code session (same as the official panel's "New session"); reports failure so the click is never silent. */
export async function newSession(log: (msg: string) => void): Promise<void> {
  try {
    // editor.open with no id opens a new conversation tab; it is the stable public command of the agent extension.
    await vscode.commands.executeCommand('claude-vscode.editor.open');
  } catch (e) {
    log('claude-vscode.editor.open failed: ' + String(e));
    void vscode.window.showErrorMessage('Could not start a new session. Is the agent extension installed?');
  }
}

/** Copy a session id to the clipboard and say so. */
export async function copyId(id: string, log: (msg: string) => void): Promise<void> {
  if (!isSessionId(id)) { log('Rejected copy for invalid session id'); return; }
  await vscode.env.clipboard.writeText(id);
  void vscode.window.showInformationMessage('Copied session id');
}
