/** The Activity view: a diagram under the session list that flashes a group when the current chat gets a message of that kind. */
import * as vscode from 'vscode';
import { activityHtml } from './activityHtml';
import { ActivityFeed, refreshMsOf } from './activityFeed';
import { Hub } from './hub';

export const ACTIVITY_VIEW = 'claudeChatExplorer.activity';

/** `currentId` is the chat of this window. While the view is visible one interval (setting `activity.refreshMs`) checks the log for appended bytes; the tab moving also triggers a check. Collapsed or hidden: no interval, no work. */
export function registerActivity(ctx: vscode.ExtensionContext, _hub: Hub, currentId: () => string): { poke(): void } {
  let view: vscode.WebviewView | undefined;
  const feed = new ActivityFeed();
  let busy = false, again = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const poke = (): void => {
    if (!timer) { return; } // not visible: no work
    if (busy) { again = true; return; } // run once more when the current check ends
    busy = true;
    const id = currentId();
    void feed.check(id).then((groups) => { if (groups.length && id === currentId()) { void view?.webview.postMessage({ type: 'flash', groups }); } }).finally(() => {
      busy = false;
      if (again) { again = false; poke(); }
    });
  };
  const stop = (): void => { if (timer) { clearInterval(timer); timer = undefined; } };
  const start = (): void => {
    stop();
    if (!view?.visible) { return; }
    timer = setInterval(poke, refreshMsOf(vscode.workspace.getConfiguration('saropaChatExplorer').get('activity.refreshMs')));
  };
  const show = (): void => { feed.mark(); start(); poke(); }; // mark the end first: messages that arrived while hidden do not flash
  ctx.subscriptions.push(
    { dispose: stop },
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('saropaChatExplorer.activity.refreshMs')) { start(); } }),
    vscode.window.registerWebviewViewProvider(ACTIVITY_VIEW, {
      resolveWebviewView(v) {
        view = v;
        v.webview.options = { enableScripts: true };
        v.webview.html = activityHtml();
        v.onDidChangeVisibility(() => { if (v.visible) { show(); } else { stop(); } });
        v.onDidDispose(() => { if (view === v) { view = undefined; stop(); } });
        if (v.visible) { show(); }
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }));
  return { poke };
}
