import * as vscode from 'vscode';

/** Session ids are file basenames (UUIDs); anything else is rejected before it reaches a command or URI. */
export const isSessionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);

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
  } catch (e) { log('Claude Code URI fallback failed: ' + String(e)); }
  void vscode.window.showErrorMessage('Could not open Claude chat ' + id + '. Is the Claude Code extension installed?');
}
