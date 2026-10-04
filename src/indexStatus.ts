import * as vscode from 'vscode';

const TIP = 'Saropa Chat Search is indexing your chats. Search works on what is indexed so far.';
const MIN_GAP_MS = 250;

/** Left status bar item shown while chats are indexed; updates are throttled. */
export class IndexStatus implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  private last = 0;

  constructor() { this.item.tooltip = TIP; }

  update(done: number, total: number, subs = 0): void {
    const now = Date.now();
    if (now - this.last < MIN_GAP_MS) { return; }
    this.last = now;
    this.item.text = `$(sync~spin) Indexing chats ${done}/${total}` + (subs ? ` (${subs} subagent files)` : '');
    this.item.show();
  }

  hide(): void { this.last = 0; this.item.hide(); }

  dispose(): void { this.item.dispose(); }
}
