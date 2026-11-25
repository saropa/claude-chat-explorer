/** The "Open Activity in Browser" command: wires the local Activity server to VS Code and opens its page in the external browser. */
import * as vscode from 'vscode';
import * as path from 'path';
import { ActivityServer } from './activityServer';
import { AllChatsTracker } from './activityAll';
import { fadeMsOf, refreshMsOf } from './activityFeed';
import { BgTracker } from './bgAgents';
import { ColorBook } from './chatColors';

const TITLE_FALLBACK = 'Saropa Chats'; // shown when the window has no workspace name

/** What the command needs from the extension. */
export interface BrowserDeps {
  /** Shared with the side pane so a chat has one colour in both views. */
  book: ColorBook;
  files: BgTracker;
  currentId(): string;
  liveIds(): string[];
  titleOf(id: string): string;
  /** Reveals a chat's session in VS Code. */
  focusChat(id: string): Promise<void>;
  log(msg: string): void;
}

/** Title of the active project: the workspace name, else the first folder's name, else the extension name. */
export function projectTitle(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return vscode.workspace.name || (folder ? path.basename(folder.uri.fsPath) : '') || TITLE_FALLBACK;
}

/** Registers the command; the server is created on first use and closed with the extension. */
export function registerActivityBrowser(ctx: vscode.ExtensionContext, deps: BrowserDeps): void {
  const cfg = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('saropaChats');
  // The browser view has its own tracker (its own read positions) over the shared locator and colour book.
  const server = new ActivityServer({
    projectTitle, currentId: deps.currentId, liveIds: deps.liveIds, titleOf: deps.titleOf, focusChat: deps.focusChat, log: deps.log,
    tracker: new AllChatsTracker(deps.files, deps.book),
    refreshMs: () => refreshMsOf(cfg().get('activity.refreshMs')), fadeMs: () => fadeMsOf(cfg().get('activity.fadeMs')),
    texts: { subtitle: 'Activity of all live chats', lost: 'Connection lost. Reconnecting...', unknownChat: 'Chat', focusSent: 'Opening the chat in VS Code...', focusDone: 'Chat opened in VS Code.', focusFailed: 'Could not open the chat in VS Code.' },
  });
  ctx.subscriptions.push(server, vscode.commands.registerCommand('saropaChats.activityBrowser', async () => {
    let url: string;
    try { url = await server.start(); } catch (e) {
      // No silent failure: the user asked for a browser and gets a visible reason.
      deps.log('activity browser: server did not start: ' + String(e));
      void vscode.window.showErrorMessage('Could not start the local Activity server: ' + String(e));
      return;
    }
    try {
      // asExternalUri maps the port when VS Code runs remotely (SSH, WSL, containers); locally it returns the same address.
      const target = await vscode.env.asExternalUri(vscode.Uri.parse(url));
      // The browser sends the forwarded address as Host; the server refuses any Host it was not told about (remote windows would otherwise get 404).
      server.allowHost(target.authority);
      if (await vscode.env.openExternal(target)) { return; }
      deps.log('activity browser: openExternal returned false for ' + target.toString());
    } catch (e) { deps.log('activity browser: could not open the browser: ' + String(e)); }
    // The browser did not open: the address is shown so it can be pasted into one by hand.
    const copy = 'Copy address';
    const pick = await vscode.window.showInformationMessage('Could not open the browser. Activity address: ' + url, copy);
    if (pick === copy) { await vscode.env.clipboard.writeText(url); }
  }));
}
