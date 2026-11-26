/** The Activity section of the session list page: a diagram under the session list that flashes a group when the current chat gets a message of that kind. */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { IDLE_STRINGS, IdleDot, focusTarget, IdleGate, IdleInfo, cutTitle, idleMsg, isWorking, pickBusiest } from './activityIdle';
import { ActivityFeed, SPEED_CHOICES, SPEED_LABELS, fadeMsOf, refreshMsOf } from './activityFeed';
import { AllChatsTracker } from './activityAll';
import { BgTracker } from './bgAgents';
import { CHAT_PALETTE, ColorBook } from './chatColors';
import { projectsRoot } from './files';
import { guardedWrite } from './staleConfigUi';

// Setting: show every live chat, each in its own colour. Its manifest default is true; the default only applies when no value is set,
// so a user, workspace or folder value of `false` written before the default changed still wins (allOn reads the resolved value).
const ALL_KEY = 'activity.allChats';
const ALL_CTX = 'saropaChats.activityAll'; // context key mirroring it, so the command's toggled state stays right
const COLORS_KEY = 'saropaChats.chatColors'; // globalState key of the persisted chat-to-colour map

/** Opens a Slow / Medium / Fast pick for one Activity setting and stores the chosen value. */
async function pickSpeed(key: 'refreshMs' | 'fadeMs', title: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('saropaChats');
  const now = key === 'refreshMs' ? refreshMsOf(cfg.get('activity.refreshMs')) : fadeMsOf(cfg.get('activity.fadeMs'));
  // Labels and values come from activityFeed.ts, the same table the Activity section's settings popover is built from.
  const items = SPEED_LABELS.map((label, i) => ({ label, description: `${SPEED_CHOICES[key][i]} ms${SPEED_CHOICES[key][i] === now ? '  (current)' : ''}`, ms: SPEED_CHOICES[key][i] }));
  const pick = await vscode.window.showQuickPick(items, { title, placeHolder: `Current: ${now} ms (Medium is the default)` });
  if (!pick) { return; }
  // A rejected write (stale registry after an extension-host-only upgrade) shows the reload prompt instead of doing nothing.
  await guardedWrite(() => cfg.update('activity.' + key, pick.ms, targetOf('activity.' + key)));
}

/** Where to write an Activity setting: where it is already overridden, so the new value takes effect; else the user settings. */
export function targetOf(key: string): vscode.ConfigurationTarget {
  const at = vscode.workspace.getConfiguration('saropaChats').inspect(key);
  return at?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder : at?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

/** What the page host must offer: the Activity section registers itself here to hear about the page being shown or hidden and its section being opened or collapsed. */
export interface ActivityHost { activity?: { setVisible(v: boolean): void; setOpen(o: boolean): void; focusOther?(kind?: unknown): Promise<void>; prefs?(): void; setPref?(key: unknown, value: unknown): Promise<void> } }

/** What a click on the idle caption's "N other chats working" hint needs: the live dots, a title per chat and a way to open a chat. */
export interface FocusDeps { dots(): { [id: string]: IdleDot }; titleOf(id: string): string; open(id: string): Promise<boolean> } // open: true when the chat was opened

/**
 * `currentId` is the chat of this window; `post` sends a message to the page (wrapped so it cannot collide with the list page's own message types).
 * While the page is visible AND the section is open, one interval (setting `activity.refreshMs`) checks the log for appended bytes; the tab moving also triggers a check.
 * Hidden or collapsed: no interval, no work.
 */
export function registerActivity(ctx: vscode.ExtensionContext, currentId: () => string, post: (m: unknown) => void, host: ActivityHost, liveIds: () => string[], log: (msg: string) => void = () => undefined, idleInfo: (id: string) => IdleInfo = () => ({ title: '', dot: undefined, others: 0 }), focus?: FocusDeps): { poke(): void; idle(): void; book: ColorBook; files: BgTracker } {
  // One locator for every consumer. A launch line whose task id cannot be read is logged once: the pills would otherwise silently stop working if the log format changed.
  const files = new BgTracker(projectsRoot(), () => log('activity: a background-task launch line has no readable task id; the log format may have changed, so background pills can be missing'));
  const feed = new ActivityFeed(undefined, undefined, files);
  // All-chats mode: a tracker over one feed per tailed chat, sharing the transcript locator, plus the stable chat-to-colour book.
  const book = new ColorBook(ctx.globalState.get(COLORS_KEY), (m) => { void ctx.globalState.update(COLORS_KEY, m); }, Date.now, () => ctx.globalState.get(COLORS_KEY)); // load: re-read at write time so a second window's assignments are merged, not overwritten
  const tracker = new AllChatsTracker(files, book); // the pane's own read positions; the browser view has its own tracker over the same files and book
  // The resolved value (default, user, workspace or folder): an explicit `false` from any scope keeps the mode off despite the true default.
  const allOn = (): boolean => vscode.workspace.getConfiguration('saropaChats').get(ALL_KEY) === true;
  let all = allOn(), colorSig = '';
  let visible = false, open = true; // the section starts open, matching the page's markup
  let busy = false, again = false;
  // Which chat the page shows and the last idle message sent; owns the reset-before-idle ordering (pure, so the checks drive it directly).
  const gate = new IdleGate();
  /** The host's translator: vscode.l10n.t over the English table in activityIdle.ts (the pure formatter has no vscode import). */
  const tr = (m: string, ...a: Array<string | number>): string => vscode.l10n.t(m, ...a);
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
  /** The idle message for chat `id` (caption text plus the click label and target kind of whatever the click opens), built lazily so the gate skips it when nothing is sent. */
  const idleOf = (id: string) => () => idleMsg(idleInfo(id), tr);
  /** Dots, a title or the focused chat changed: refresh the idle caption. Hidden or collapsed sections skip it (show() re-sends on reveal). */
  const idle = (): void => {
    if (!timer) { return; }
    // The gate drops it while a chat switch is pending; poke() then sends reset first and the new chat's caption after it.
    const id = currentId();
    gate.idle(id, idleOf(id)).forEach(send);
  };
  /** Shows a one-off outcome of a click in the caption (the page holds it like a live caption, then falls back to the idle text). */
  const note = (text: string, err = false): void => send({ type: 'note', text, err });
  /** Last activity time of a chat: its transcript's mtime (0 when the file cannot be found), the "most recently active" tie-break of pickBusiest. */
  const lastAt = async (id: string): Promise<number> => {
    // No transcript found (f undefined) or a stat failure: 0, which sorts the chat as least recently active instead of failing the click.
    try { const f = await files.fileOf(id); return f ? (await fs.promises.stat(f)).mtimeMs : 0; } catch { return 0; }
  };
  /**
   * A click on the idle caption: open the chat it promised (`kind`, sent back by the page: 'self' = the followed chat, 'other' = the
   * busiest other working chat). The kind is honored, not re-decided from fresh dots: re-deciding could open a different chat than the
   * label said. When nothing is left to open (no other chat works any more, no followed chat) the "none working" note shows.
   * Every outcome is shown in the caption: opening <title>, none working, or could not open <title>. No silent path.
   */
  const focusOther = async (kind?: unknown): Promise<void> => {
    // No focus wiring (a caller that never passed it): say nothing can be opened rather than ignore the click.
    if (!focus) { note(tr(IDLE_STRINGS.noneWorking)); return; }
    const cur = currentId(), dots = focus.dots() ?? {};
    const ids = Object.keys(dots).filter((id) => id !== cur && isWorking(dots[id]));
    // Recency only matters for the 'other' pick; the self path skips the stat calls.
    const recency = kind === 'self' ? {} : Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await lastAt(id)] as const)));
    const id = focusTarget(kind, cur, dots, recency);
    // The hint can be a poll behind (the other chats went idle) or no chat is followed: say so instead of switching to the other kind.
    if (!id) { note(tr(IDLE_STRINGS.noneWorking)); return; }
    const title = cutTitle(focus.titleOf(id)) || tr(IDLE_STRINGS.untitled);
    note(tr(IDLE_STRINGS.opening, title));
    // resume() reports false when neither the panel command nor the URI fallback took the chat (it also shows its own toast); a throw
    // is unexpected and is logged. Both end in the caption's error text, so the click never ends on a stale "Opening ...".
    let ok = false;
    try { ok = await focus.open(id); } catch (e) { log('activity: could not open chat ' + id + ': ' + String(e)); }
    if (!ok) { note(tr(IDLE_STRINGS.openFailed, title), true); }
  };
  const poke = (): void => {
    if (!timer) { return; } // not visible or collapsed: no work
    if (busy) { again = true; return; } // run once more when the current check ends
    busy = true;
    const id = currentId();
    // A switch of chat clears the held states and the caption (reset first, then the new chat's idle caption); in the all-chats mode the
    // pills belong to every chat, so they stay. The idle send also covers a title or state change that arrived with the tab move.
    gate.poke(id, idleOf(id), all).forEach(send);
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
  const show = (): void => { feed.mark(); tracker.clear(); gate.forget(); start(); poke(); }; // mark the end first: messages that arrived while hidden do not flash
  // Both inputs (page visibility, section open state) end here: only a change to "can be seen" starts a fresh look, so repeated identical reports do nothing.
  const sync = (wasSeen: boolean): void => {
    const seen = visible && open;
    if (seen && !wasSeen) { show(); } else if (!seen) { stop(); }
  };
  /** Switches between the focused-chat view and the all-chats view without a reload: everything held for the old view is cleared and re-read. */
  const applyAll = (): void => {
    all = allOn();
    void vscode.commands.executeCommand('setContext', ALL_CTX, all);
    tracker.clear(); feed.mark(); gate.forget(); colorSig = '';
    send({ type: 'reset' }); // full reset, pills included
    if (!all) { sendColors(new Map()); }
    poke();
  };
  /** The section's settings popover state: the current refresh and fade times and the all-chats mode, sent on page load and on every change. */
  const prefs = (): void => {
    const cfg = vscode.workspace.getConfiguration('saropaChats');
    send({ type: 'prefs', refreshMs: refreshMsOf(cfg.get('activity.refreshMs')), fadeMs: fade(), all: allOn() });
  };
  /**
   * A choice made in the section's settings popover. Only a known key with an allowed value is written (the page is not trusted to send
   * one), through the same guarded write as the commands. Every path ends in prefs(): the page then shows the value actually in effect,
   * so a write that failed or was overridden in a higher-priority scope snaps the control back instead of leaving a false check mark.
   */
  const setPref = async (key: unknown, value: unknown): Promise<void> => {
    let at = '', v: number | boolean | undefined;
    if (key === 'allChats' && typeof value === 'boolean') { at = ALL_KEY; v = value; }
    else if ((key === 'refreshMs' || key === 'fadeMs') && typeof value === 'number' && SPEED_CHOICES[key].includes(value)) { at = 'activity.' + key; v = value; }
    if (at && v !== undefined) {
      const val = v;
      // guardedWrite shows the reload prompt for a stale registry; any other failure is shown here, so no click ends silently.
      try { await guardedWrite(() => vscode.workspace.getConfiguration('saropaChats').update(at, val, targetOf(at))); } catch (e) {
        log('activity: could not save ' + at + ': ' + String(e));
        void vscode.window.showErrorMessage(tr('Could not save the Activity setting: {0}', String(e instanceof Error ? e.message : e)));
      }
    }
    prefs();
  };
  void vscode.commands.executeCommand('setContext', ALL_CTX, all);
  host.activity = {
    setVisible(v) { const was = visible && open; visible = v; sync(was); },
    setOpen(o) { const was = visible && open; open = o; sync(was); },
    focusOther, // the page's 'actFocusOther' message (a click on the idle caption's other-chats hint) lands here with the kind the caption promised
    prefs, // the page's 'ready': the settings popover gets the current values
    setPref, // the page's 'actSet' message (a choice in the section's settings popover)
  };
  ctx.subscriptions.push(
    { dispose: stop },
    vscode.commands.registerCommand('saropaChats.activityRefreshSpeed', () => pickSpeed('refreshMs', 'Activity refresh speed')),
    vscode.commands.registerCommand('saropaChats.activityFadeSpeed', () => pickSpeed('fadeMs', 'Activity fade-out speed')),
    // The command flips the setting; the configuration listener below applies it, so the popover, Settings and settings.json stay in step.
    vscode.commands.registerCommand('saropaChats.activityAllChats', () => guardedWrite(() => vscode.workspace.getConfiguration('saropaChats').update(ALL_KEY, !allOn(), targetOf(ALL_KEY)))),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('saropaChats.activity.fadeMs')) { send({ type: 'fade', ms: fade() }); }
      if (e.affectsConfiguration('saropaChats.activity.refreshMs')) { start(); }
      if (e.affectsConfiguration('saropaChats.' + ALL_KEY)) { applyAll(); }
      // Any of the three, from the popover, Settings or settings.json: the popover shows the new values.
      if (['activity.fadeMs', 'activity.refreshMs', ALL_KEY].some((k) => e.affectsConfiguration('saropaChats.' + k))) { prefs(); }
    }));
  // The book and locator are handed out so the browser view shows each chat in the same colour as the pane.
  return { poke, idle, book, files };
}
