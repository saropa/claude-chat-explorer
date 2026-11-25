import * as vscode from 'vscode';
import * as fs from 'fs';
import { heartbeatPath, hasOwnHook, KEEP_WARM_KEY, peekSettings, pingLogPath, settingsFilePath, stableScriptPath } from './keepWarmSettings';
import { heartbeatStale, LOG_TAIL_BYTES, parseHeartbeat, summarizeLog } from './keepWarmLog';

/** Command id behind the status-bar click; declared in package.json contributes.commands. */
const OPEN_SETTINGS_CMD = 'saropaChats.keepWarmSettings';
/** Settings filter used when the item is clicked: shows every keep-warm setting. */
const SETTINGS_FILTER = 'saropaChats.keepWarm';
/** How often the item re-reads the log and heartbeat; pings happen at most hourly so this is plenty. */
const REFRESH_MS = 5 * 60 * 1000;

/** Tooltip and label copy; functions so vscode.l10n.t runs after the bundle loads. Third person, English text is the key. */
const MSG = {
  label: () => vscode.l10n.t('Warm'),
  title: () => vscode.l10n.t('Keep Claude sessions warm'),
  pings: (n: number) => vscode.l10n.t('Pings today: {0}', n),
  ratio: (pct: string) => vscode.l10n.t('Reads {0}% of cached context', pct),
  noTokens: () => vscode.l10n.t('No cache token counts recorded today'),
  lastRun: (when: string) => vscode.l10n.t('Hook last ran: {0}', when),
  neverRun: () => vscode.l10n.t('Hook last ran: never recorded'),
  stale: () => vscode.l10n.t('The hook has not run recently, so the Claude Code hook format may have changed.'),
  click: () => vscode.l10n.t('Click to open the keep-warm settings.'),
};

/** Read the last LOG_TAIL_BYTES of the ping log; empty string when the file is missing or unreadable. */
function readLogTail(file: string): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - LOG_TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; } // no log yet is the normal state before the first ping
}

/** File text or undefined when missing/unreadable. */
function readText(file: string): string | undefined {
  try { return fs.readFileSync(file, 'utf8'); } catch { return undefined; }
}

/**
 * Create the status-bar item and wire its refresh. Returns a refresh function so the caller can update it after the
 * hook install/remove finishes (the setting-change event fires before the settings file is rewritten).
 */
export function registerKeepWarmStatus(ctx: vscode.ExtensionContext, log: (what: string, e: unknown) => void): () => void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  item.command = OPEN_SETTINGS_CMD;
  const refresh = (): void => {
    try {
      // Shown only while the feature is on: a hidden item cannot nag users who never opted in.
      if (!vscode.workspace.getConfiguration().get<boolean>(KEEP_WARM_KEY, false)) { item.hide(); return; }
      const now = Date.now();
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0); // "today" is the user's local day
      const sum = summarizeLog(readLogTail(pingLogPath()), midnight.getTime());
      const lastRun = parseHeartbeat(readText(heartbeatPath()));
      const peeked = peekSettings(settingsFilePath());
      const installed = peeked.ok && hasOwnHook(peeked.settings, stableScriptPath());
      // Warn only when the hook is installed: a missing heartbeat with no hook is just "not set up yet", not format drift.
      const warn = installed && heartbeatStale(lastRun, now);
      item.text = `$(flame) ${MSG.label()}${sum.pings > 0 ? ` ${sum.pings}` : ''}`;
      item.backgroundColor = warn ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
      const lines = [MSG.title(), MSG.pings(sum.pings)];
      lines.push(sum.readShare === null ? MSG.noTokens() : MSG.ratio((sum.readShare * 100).toFixed(0)));
      lines.push(lastRun === undefined ? MSG.neverRun() : MSG.lastRun(new Date(lastRun).toLocaleString()));
      if (warn) { lines.push(MSG.stale()); }
      lines.push(MSG.click());
      item.tooltip = lines.join('\n');
      item.show();
    } catch (e) { log('keep-warm-status', e); } // a status glitch must never break activation
  };
  const timer = setInterval(refresh, REFRESH_MS);
  ctx.subscriptions.push(
    item,
    { dispose: () => clearInterval(timer) },
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(KEEP_WARM_KEY)) { refresh(); } }),
    // Visible outcome: Settings opens filtered to the keep-warm entries.
    vscode.commands.registerCommand(OPEN_SETTINGS_CMD, () => vscode.commands.executeCommand('workbench.action.openSettings', SETTINGS_FILTER)),
  );
  refresh();
  return refresh;
}
