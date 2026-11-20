/** The Activity section of the session list page: a diagram under the session list that flashes a group when the current chat gets a message of that kind. */
import * as vscode from 'vscode';
import { ActivityFeed, fadeMsOf, refreshMsOf } from './activityFeed';

const SPEEDS = ['Slow', 'Medium', 'Fast'];
const CHOICES: Record<'refreshMs' | 'fadeMs', number[]> = { refreshMs: [1000, 250, 100], fadeMs: [8000, 4000, 2000] };

/** Opens a Slow / Medium / Fast pick for one Activity setting and stores the chosen value. */
async function pickSpeed(key: 'refreshMs' | 'fadeMs', title: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('saropaChats');
  const now = key === 'refreshMs' ? refreshMsOf(cfg.get('activity.refreshMs')) : fadeMsOf(cfg.get('activity.fadeMs'));
  const items = SPEEDS.map((label, i) => ({ label, description: `${CHOICES[key][i]} ms${CHOICES[key][i] === now ? '  (current)' : ''}`, ms: CHOICES[key][i] }));
  const pick = await vscode.window.showQuickPick(items, { title, placeHolder: `Current: ${now} ms (Medium is the default)` });
  if (!pick) { return; }
  const at = cfg.inspect('activity.' + key); // write where the value is already overridden, so the pick takes effect
  const target = at?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder : at?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await cfg.update('activity.' + key, pick.ms, target);
}

/** What the page host must offer: the Activity section registers itself here to hear about the page being shown or hidden and its section being opened or collapsed. */
export interface ActivityHost { activity?: { setVisible(v: boolean): void; setOpen(o: boolean): void } }

/**
 * `currentId` is the chat of this window; `post` sends a message to the page (wrapped so it cannot collide with the list page's own message types).
 * While the page is visible AND the section is open, one interval (setting `activity.refreshMs`) checks the log for appended bytes; the tab moving also triggers a check.
 * Hidden or collapsed: no interval, no work.
 */
export function registerActivity(ctx: vscode.ExtensionContext, currentId: () => string, post: (m: unknown) => void, host: ActivityHost): { poke(): void } {
  const feed = new ActivityFeed();
  let visible = false, open = true; // the section starts open, matching the page's markup
  let busy = false, again = false, shownId = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  const send = (m: unknown): void => post({ type: 'act', m });
  const poke = (): void => {
    if (!timer) { return; } // not visible or collapsed: no work
    if (busy) { again = true; return; } // run once more when the current check ends
    busy = true;
    const id = currentId();
    if (id !== shownId) { shownId = id; send({ type: 'reset' }); } // a switch of chat clears the held states and the caption
    void feed.check(id).then((events) => { if (events.length && id === currentId()) { send({ type: 'events', events }); } }).finally(() => {
      busy = false;
      if (again) { again = false; poke(); }
    });
  };
  const stop = (): void => { if (timer) { clearInterval(timer); timer = undefined; } };
  const start = (): void => {
    stop();
    if (!visible || !open) { return; }
    timer = setInterval(poke, refreshMsOf(vscode.workspace.getConfiguration('saropaChats').get('activity.refreshMs')));
  };
  const fade = (): number => fadeMsOf(vscode.workspace.getConfiguration('saropaChats').get('activity.fadeMs'));
  const show = (): void => { feed.mark(); shownId = ''; start(); poke(); }; // mark the end first: messages that arrived while hidden do not flash
  // Both inputs (page visibility, section open state) end here: only a change to "can be seen" starts a fresh look, so repeated identical reports do nothing.
  const sync = (wasSeen: boolean): void => {
    const seen = visible && open;
    if (seen && !wasSeen) { show(); } else if (!seen) { stop(); }
  };
  host.activity = {
    setVisible(v) { const was = visible && open; visible = v; sync(was); },
    setOpen(o) { const was = visible && open; open = o; sync(was); },
  };
  ctx.subscriptions.push(
    { dispose: stop },
    vscode.commands.registerCommand('saropaChats.activityRefreshSpeed', () => pickSpeed('refreshMs', 'Activity refresh speed')),
    vscode.commands.registerCommand('saropaChats.activityFadeSpeed', () => pickSpeed('fadeMs', 'Activity fade-out speed')),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('saropaChats.activity.fadeMs')) { send({ type: 'fade', ms: fade() }); }
      if (e.affectsConfiguration('saropaChats.activity.refreshMs')) { start(); }
    }));
  return { poke };
}
