/** The Activity view: a diagram under the session list that flashes a group when the current chat gets a message of that kind. */
import * as vscode from 'vscode';
import { activityHtml } from './activityHtml';
import { ActivityFeed, fadeMsOf, refreshMsOf } from './activityFeed';

const SPEEDS = ['Slow', 'Medium', 'Fast'];
const CHOICES: Record<'refreshMs' | 'fadeMs', number[]> = { refreshMs: [1000, 250, 100], fadeMs: [8000, 4000, 2000] };

/** Opens a Slow / Medium / Fast pick for one Activity setting and stores the chosen value. */
async function pickSpeed(key: 'refreshMs' | 'fadeMs', title: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('saropaChatExplorer');
  const now = key === 'refreshMs' ? refreshMsOf(cfg.get('activity.refreshMs')) : fadeMsOf(cfg.get('activity.fadeMs'));
  const items = SPEEDS.map((label, i) => ({ label, description: `${CHOICES[key][i]} ms${CHOICES[key][i] === now ? '  (current)' : ''}`, ms: CHOICES[key][i] }));
  const pick = await vscode.window.showQuickPick(items, { title, placeHolder: 'Medium is the default' });
  if (pick) { await cfg.update('activity.' + key, pick.ms, vscode.ConfigurationTarget.Global); }
}

export const ACTIVITY_VIEW = 'claudeChatExplorer.activity';

/** `currentId` is the chat of this window. While the view is visible one interval (setting `activity.refreshMs`) checks the log for appended bytes; the tab moving also triggers a check. Collapsed or hidden: no interval, no work. */
export function registerActivity(ctx: vscode.ExtensionContext, currentId: () => string): { poke(): void } {
  let view: vscode.WebviewView | undefined;
  const feed = new ActivityFeed();
  let busy = false, again = false, shownId = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  const poke = (): void => {
    if (!timer) { return; } // not visible: no work
    if (busy) { again = true; return; } // run once more when the current check ends
    busy = true;
    const id = currentId();
    if (id !== shownId) { shownId = id; void view?.webview.postMessage({ type: 'reset' }); } // a switch of chat clears the held states and the caption
    void feed.check(id).then((events) => { if (events.length && id === currentId()) { void view?.webview.postMessage({ type: 'events', events }); } }).finally(() => {
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
  const fade = (): number => fadeMsOf(vscode.workspace.getConfiguration('saropaChatExplorer').get('activity.fadeMs'));
  const show = (): void => { feed.mark(); shownId = ''; start(); poke(); }; // mark the end first: messages that arrived while hidden do not flash
  ctx.subscriptions.push(
    { dispose: stop },
    vscode.commands.registerCommand('claudeChatExplorer.activityRefreshSpeed', () => pickSpeed('refreshMs', 'Activity refresh speed')),
    vscode.commands.registerCommand('claudeChatExplorer.activityFadeSpeed', () => pickSpeed('fadeMs', 'Activity fade-out speed')),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('saropaChatExplorer.activity.fadeMs')) { void view?.webview.postMessage({ type: 'fade', ms: fade() }); } if (e.affectsConfiguration('saropaChatExplorer.activity.refreshMs')) { start(); } }),
    vscode.window.registerWebviewViewProvider(ACTIVITY_VIEW, {
      resolveWebviewView(v) {
        view = v;
        v.webview.options = { enableScripts: true };
        v.webview.html = activityHtml(fade());
        v.onDidChangeVisibility(() => { if (v.visible) { show(); } else { stop(); } });
        v.onDidDispose(() => { if (view === v) { view = undefined; stop(); } });
        if (v.visible) { show(); }
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }));
  return { poke };
}
