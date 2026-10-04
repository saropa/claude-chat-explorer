/** Right-aligned status bar count of the chats that touched the active file. */
import * as vscode from 'vscode';
import { FileSessionsService } from './fileSessionsService';

export const SHOW_CMD = 'saropaChatSearch.fileSessions.show';
export const SETTING = 'saropaChatSearch.showFileSessionsStatusBar';
const DEBOUNCE_MS = 500;

export class FileSessionsBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  private timer?: NodeJS.Timeout;
  private readonly subs: vscode.Disposable[];

  constructor(private readonly svc: FileSessionsService, private readonly onError: (where: string, e: unknown) => void) {
    this.item.command = SHOW_CMD;
    this.subs = [vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
      vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(SETTING)) { this.schedule(); } })];
    this.schedule();
  }

  /** Refresh after 500 ms of quiet; each call restarts the wait. */
  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.refresh(); }, DEBOUNCE_MS);
  }

  private enabled(): boolean { return vscode.workspace.getConfiguration().get<boolean>(SETTING, true); }

  private async refresh(): Promise<void> {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || doc.uri.scheme !== 'file' || !this.enabled()) { this.item.hide(); return; }
    try {
      const reply = await this.svc.get(doc.uri.fsPath);
      if (vscode.window.activeTextEditor?.document !== doc) { return; } // the editor changed while waiting
      if (reply.indexing || reply.total < 1) { this.item.hide(); return; }
      const s = reply.total === 1 ? 'chat' : 'chats';
      this.item.text = `$(comment-discussion) ${reply.total}`;
      this.item.tooltip = `${reply.total} Claude ${s} touched this file (${reply.edited} edited it). Click to list them.`;
      this.item.show();
    } catch (e) { this.item.hide(); this.onError('file sessions status bar', e); }
  }

  dispose(): void { clearTimeout(this.timer); this.subs.forEach((d) => d.dispose()); this.item.dispose(); }
}
