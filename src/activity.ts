/** The Activity section of the session list page: a diagram under the session list that flashes a group when the current chat gets a message of that kind. */
import * as vscode from 'vscode';
import { idleText, IdleInfo } from './activityIdle';
import { ActivityFeed, fadeMsOf, refreshMsOf } from './activityFeed';
import { AllChatsTracker } from './activityAll';
import { BgTracker } from './bgAgents';
import { CHAT_PALETTE, ColorBook } from './chatColors';
import { projectsRoot } from './files';

const ALL_KEY = 'activity.allChats'; // setting: show every live chat, each in its own colour
const ALL_CTX = 'saropaChats.activityAll'; // context key mirroring it, so the menu entry shows a check mark
const COLORS_KEY = 'saropaChats.chatColors'; // globalState key of the persisted chat-to-colour map

const SPEEDS = ['Slow', 'Medium', 'Fast'];
const CHOICES: Record<'refreshMs' | 'fadeMs', number[]> = { refreshMs: [1000, 250, 100], fadeMs: [8000, 4000, 2000] };

/** Opens a Slow / Medium / Fast pick for one Activity setting and stores the chosen value. */
async function pickSpeed(key: 'refreshMs' | 'fadeMs', title: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('saropaChats');
  const now = key === 'refreshMs' ? refreshMsOf(cfg.get('activity.refreshMs')) : fadeMsOf(cfg.get('activity.fadeMs'));
  const items = SPEEDS.map((label, i) => ({ label, description: `${CHOICES[key][i]} ms${CHOICES[key][i] === now ? '  (current)' : ''}`, ms: CHOICES[key][i] }));
  const pick = await vscode.window.showQuickPick(items, { title, placeHolder: `Current: ${now} ms (Medium is the default)` });
  if (!pick) { return; }
  await cfg.update('activity.' + key, pick.ms, targetOf('activity.' + key));
}

/** Where to write an Activity setting: where it is already overridden, so the new value takes effect; else the user settings. */
function targetOf(key: string): vscode.ConfigurationTarget {
  const at = vscode.workspace.getConfiguration('saropaChats').inspect(key);
  return at?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder : at?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

/** What the page host must offer: the Activity section registers itself here to hear about the page being shown or hidden and its section being opened or collapsed. */
export interface ActivityHost { activity?: { setVisible(v: boolean): void; setOpen(o: boolean): void } }

/**
 * `currentId` is the chat of this window; `post` sends a message to the page (wrapped so it cannot collide with the list page's own message types).
 * While the page is visible AND the section is open, one interval (setting `activity.refreshMs`) checks the log for appended bytes; the tab moving also triggers a check.
 * Hidden or collapsed: no interval, no work.
 */
export function registerActivity(ctx: vscode.ExtensionContext, currentId: () => string, post: (m: unknown) => void, host: ActivityHost, liveIds: () => string[], log: (msg: string) => void = () => undefined, idleInfo: (id: string) => IdleInfo = () => ({ title: '', state: undefined, others: 0 })): { poke(): void; idle(): void; book: ColorBook; files: BgTracker } {
  // One locator for every consumer. A launch line whose task id cannot be read is logged once: the pills would otherwise silently stop working if the log format changed.
  const files = new BgTracker(projectsRoot(), () => log('activity: a background-task launch line has no readable task id; the log format may have changed, so background pills can be missing'));
  const feed = new ActivityFeed(undefined, undefined, files);
  // All-chats mode: a tracker over one feed per tailed chat, sharing the transcript locator, plus the stable chat-to-colour book.
  const book = new ColorBook(ctx.globalState.get(COLORS_KEY), (m) => { void ctx.globalState.update(COLORS_KEY, m); });
  const tracker = new AllChatsTracker(files, book); // the pane's own read positions; the browser view has its own tracker over the same files and book
  const allOn = (): boolean => vscode.workspace.getConfiguration('saropaChats').get(ALL_KEY) === true;
  let all = allOn(), colorSig = '', idleSig = ''; // idleSig: the last idle caption sent, so an unchanged text is not re-sent
  let visible = false, open = true; // the section starts open, matching the page's markup
  let busy = false, again = false, shownId = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  const send = (m: unknown): void => post({ type: 'act', m });
  /** Tells the session list which chats have which colour (an empty map when the mode is off, which removes the bars). */
  const sendColors = (map: Map<string, string>): void => {
    // The list page gets palette indexes (its CSS holds the colours as classes: the page's CSP allows no inline style attributes).
    const obj = Object.fromEntries([...map].map(([id, hex]) => [id, CHAT_PALETTE.indexOf(hex)])), sig = JSON.stringify(obj);
    if (sig === colorSig) { return; } // unchanged: no message, no re-render of the list
    colorSig = sig;
    post({ type: 'chatColors', map: obj });
  };
  /** One all-chats refresh: every tailed chat is checked, its events tagged with its colour and sent in one batch. */
  const checkAll = async (cur: string): Promise<void> => {
    const r = await tracker.check(cur, liveIds());
    sendColors(r.colors);
    // Mode switched off meanwhile: the events belong to a view that is gone.
    if (!r.events.length || !all) { return; }
    // Focus moved meanwhile: tracker.check already advanced every read position, so dropping the batch would lose flashes and background-pill
    // changes for good (a pill is re-sent only when its count changes). Those carry their chat's colour and stay valid; the caption, busy ring
    // and waiting state belong to the chat that WAS focused and the page was just reset for the new one, so only those are dropped.
    const moved = cur !== currentId(), events = moved ? r.events.filter((e) => e.t === 'flash' || e.t === 'sub' || e.t === 'bg') : r.events;
    if (events.length) { send({ type: 'events', events }); }
  };
  /** Sends the idle caption (followed chat + state + other busy chats) when its text changed. The page shows it only while no live caption is up. */
  const sendIdle = (): void => {
    const text = idleText(idleInfo(currentId()));
    if (text === idleSig) { return; } // unchanged: no message
    idleSig = text;
    send({ type: 'idle', text });
  };
  /** Dots or the focused chat changed: refresh the idle caption. Hidden or collapsed sections skip it (show() re-sends on reveal). */
  const idle = (): void => { if (timer) { sendIdle(); } };
  const poke = (): void => {
    if (!timer) { return; } // not visible or collapsed: no work
    if (busy) { again = true; return; } // run once more when the current check ends
    busy = true;
    const id = currentId();
    // A switch of chat clears the held states and the caption; in the all-chats mode the pills belong to every chat, so they stay.
    if (id !== shownId) {
      shownId = id; idleSig = ''; // the page drops its idle text on reset, so the dedupe must forget it too
      send({ type: 'reset', keepPills: all });
    }
    sendIdle(); // also covers a title or state change that arrived with the tab move
    const run = all ? checkAll(id) : feed.check(id).then((events) => { if (events.length && id === currentId()) { send({ type: 'events', events }); } });
    void run.catch(() => { /* a failed check shows nothing this round; the next interval tries again */ }).finally(() => {
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
  const show = (): void => { feed.mark(); tracker.clear(); shownId = ''; start(); poke(); }; // mark the end first: messages that arrived while hidden do not flash
  // Both inputs (page visibility, section open state) end here: only a change to "can be seen" starts a fresh look, so repeated identical reports do nothing.
  const sync = (wasSeen: boolean): void => {
    const seen = visible && open;
    if (seen && !wasSeen) { show(); } else if (!seen) { stop(); }
  };
  /** Switches between the focused-chat view and the all-chats view without a reload: everything held for the old view is cleared and re-read. */
  const applyAll = (): void => {
    all = allOn();
    void vscode.commands.executeCommand('setContext', ALL_CTX, all);
    tracker.clear(); feed.mark(); shownId = ''; colorSig = ''; idleSig = '';
    send({ type: 'reset' }); // full reset, pills included
    if (!all) { sendColors(new Map()); }
    poke();
  };
  void vscode.commands.executeCommand('setContext', ALL_CTX, all);
  host.activity = {
    setVisible(v) { const was = visible && open; visible = v; sync(was); },
    setOpen(o) { const was = visible && open; open = o; sync(was); },
  };
  ctx.subscriptions.push(
    { dispose: stop },
    vscode.commands.registerCommand('saropaChats.activityRefreshSpeed', () => pickSpeed('refreshMs', 'Activity refresh speed')),
    vscode.commands.registerCommand('saropaChats.activityFadeSpeed', () => pickSpeed('fadeMs', 'Activity fade-out speed')),
    // The menu entry flips the setting; the configuration listener below applies it, so the menu, Settings and settings.json stay in step.
    vscode.commands.registerCommand('saropaChats.activityAllChats', () => vscode.workspace.getConfiguration('saropaChats').update(ALL_KEY, !allOn(), targetOf(ALL_KEY))),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('saropaChats.activity.fadeMs')) { send({ type: 'fade', ms: fade() }); }
      if (e.affectsConfiguration('saropaChats.activity.refreshMs')) { start(); }
      if (e.affectsConfiguration('saropaChats.' + ALL_KEY)) { applyAll(); }
    }));
  // The book and locator are handed out so the browser view shows each chat in the same colour as the pane.
  return { poke, idle, book, files };
}
