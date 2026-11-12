/** The Activity view: a diagram under the session list that flashes a group when the current chat gets a message of that kind. */
import * as vscode from 'vscode';
import { activityHtml } from './activityHtml';
import { ActivityFeed } from './activityFeed';
import { Hub } from './hub';

export const ACTIVITY_VIEW = 'claudeChatExplorer.activity';

/** `currentId` is the chat of this window. The log is read when the existing watching reports a change (index refresh, live state) or the tab moves. */
export function registerActivity(ctx: vscode.ExtensionContext, hub: Hub, currentId: () => string): { poke(): void } {
  let view: vscode.WebviewView | undefined;
  const feed = new ActivityFeed();
  let busy = false, again = false;
  const poke = (): void => {
    if (busy) { again = true; return; } // run once more when the current check ends
    busy = true;
    void feed.check(currentId()).then((groups) => { if (groups.length) { void view?.webview.postMessage({ type: 'flash', groups }); } }).finally(() => {
      busy = false;
      if (again) { again = false; poke(); }
    });
  };
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ACTIVITY_VIEW, {
      resolveWebviewView(v) {
        view = v;
        v.webview.options = { enableScripts: true };
        v.webview.html = activityHtml();
        v.onDidDispose(() => { if (view === v) { view = undefined; } });
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }),
    hub.on('dots', poke), hub.on('changed', poke), hub.on('indexed', poke));
  return { poke };
}
