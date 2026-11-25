import * as vscode from 'vscode';
import { isSessionId } from './sessionId';

export { isSessionId };

/**
 * Resume a chat in the Claude Code panel; falls back to its URI handler, which offers install when absent.
 * Resolves true when one of the two ways took the request, false when both failed or the id was invalid. The toast and log lines are
 * unchanged, so callers that ignore the result behave as before; the Activity caption uses it to show "Could not open" on the spot.
 */
export async function openChat(id: string, log: (msg: string) => void): Promise<boolean> {
  // A malformed id never reaches a command or a URI (it came from a webview message); it is a failure, not an open.
  if (!isSessionId(id)) { log('Rejected open for invalid session id'); return false; }
  try {
    await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id);
    return true;
  } catch (e) { log('claude-vscode.primaryEditor.open failed: ' + String(e)); }
  try {
    const uri = vscode.Uri.parse(`${vscode.env.uriScheme}://anthropic.claude-code/open?session=${encodeURIComponent(id)}`);
    // openExternal resolves false when VS Code did not hand the URI over; only true counts as opened.
    if (await vscode.env.openExternal(uri)) { return true; }
  } catch (e) { log('agent URI fallback failed: ' + String(e)); }
  void vscode.window.showErrorMessage('Could not open session ' + id + '. Is the agent extension installed?');
  return false;
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
