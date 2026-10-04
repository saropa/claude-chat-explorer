/** Archive, mark-as-read and import actions, shared by the panel messages, the row context menu and the commands. */
import * as vscode from 'vscode';
import { isSessionId } from './sessionId';
import { readHidden, stateDbOf } from './stateDb';
import { Store } from './store';

export interface ActionHooks {
  changed: () => void; // archived set changed: refresh the panel and the Git Activity tree
  rebuild: () => void; // unread set changed: recompute dots
}

export class ArchiveActions {
  constructor(private readonly store: Store, private readonly globalStorage: string, private readonly hooks: ActionHooks) {}

  async setArchived(id: string, on: boolean): Promise<void> {
    await this.store.setArchived(id, on);
    this.hooks.changed();
  }

  /** Clear the unread flag of a chat (resumed, or Mark as Read). */
  async markRead(id: string): Promise<void> {
    if (!this.store.unread.has(id)) { return; }
    await this.store.clearUnread(id);
    this.hooks.rebuild();
  }

  /** Read Claude Code's archived list once and merge it into ours; says exactly what it did or why it did nothing. */
  async importArchived(): Promise<void> {
    const r = await readHidden(stateDbOf(this.globalStorage));
    if (!r.ok) { void vscode.window.showInformationMessage('Saropa Chat Explorer: nothing imported. ' + r.reason); return; }
    const { added, already } = await this.store.addArchived(r.ids);
    void vscode.window.showInformationMessage(`Imported ${added} archived chats (${already} already archived)`);
    this.hooks.changed();
  }
}

const idOf = (arg: unknown): string | undefined => {
  const id = (arg as { id?: unknown } | undefined)?.id;
  return isSessionId(id) ? id : undefined;
};

/** Commands behind the row context menu and the Command Palette. */
export function registerArchiveCommands(a: ArchiveActions): vscode.Disposable[] {
  const on = (cmd: string, fn: (id: string) => Promise<void>) =>
    vscode.commands.registerCommand(cmd, (arg?: unknown) => { const id = idOf(arg); return id ? fn(id) : undefined; });
  return [
    on('saropaChatExplorer.archive', (id) => a.setArchived(id, true)),
    on('saropaChatExplorer.unarchive', (id) => a.setArchived(id, false)),
    on('saropaChatExplorer.markRead', (id) => a.markRead(id)),
    vscode.commands.registerCommand('saropaChatExplorer.importArchived', () => a.importArchived()),
  ];
}
