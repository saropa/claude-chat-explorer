import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { addHook, applyEdit, hasOwnHook, KEEP_WARM_KEY, KEEP_WARM_SCRIPT_NAME, peekSettings, removeHook, settingsFilePath, stableScriptPath } from './keepWarmSettings';
import { registerKeepWarmStatus } from './keepWarmStatus';

/** Bundled script location relative to the extension root (shipped: .vscodeignore does not exclude resources/). */
const BUNDLED = ['resources', KEEP_WARM_SCRIPT_NAME];
/** How long `node --version` may take before node is treated as missing. */
const NODE_CHECK_MS = 10000;

/**
 * User-facing copy in one place; third person, no first-person voice. Functions (not constants) so vscode.l10n.t runs
 * after the bundle is loaded. The English text is the l10n key, as in digestRun.ts. No tunable numbers appear in the text:
 * the idle time and ping cap live only in resources/keep_warm.js, so a copy of them here could drift.
 */
const MSG = {
  on: () => vscode.l10n.t('Keep Claude sessions warm is on. Idle sessions get a short ping before the prompt cache expires so it stays alive.'),
  onAlready: () => vscode.l10n.t('Keep Claude sessions warm is on. The hook was already installed; the script was refreshed.'),
  off: () => vscode.l10n.t('Keep Claude sessions warm is off. The Stop hook was removed from Claude settings.'),
  offAlready: () => vscode.l10n.t('Keep Claude sessions warm is off. No hook was installed.'),
  noNode: () => vscode.l10n.t('Keep Claude sessions warm needs Node.js on the PATH, and `node` was not found. The hook was not installed. Install Node.js, then turn the setting off and on again.'),
  badJson: (file: string, why: string) => vscode.l10n.t('Keep Claude sessions warm did not change {0}: it is not valid JSON ({1}). Fix the file, then toggle the setting again.', file, why),
  failed: (why: string) => vscode.l10n.t('Keep Claude sessions warm failed: {0}', why),
};

/** Run a command and resolve its trimmed stdout, or undefined on any failure or timeout. */
function runOut(cmd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: NODE_CHECK_MS, windowsHide: true }, (err, stdout) => resolve(err ? undefined : String(stdout).trim()));
  });
}

/**
 * Absolute path of the node binary, or undefined when node is missing. The hook command is this absolute path so Claude
 * Code's hook shell does not depend on its own PATH (which can differ from VS Code's, e.g. with nvm).
 * Order: `where node` / `command -v node` (first line), then `node -p process.execPath`; the result must itself run.
 */
async function resolveNodePath(): Promise<string | undefined> {
  const found = process.platform === 'win32' ? await runOut('where', ['node']) : await runOut('sh', ['-c', 'command -v node']);
  // `where` can list several matches; the first is the one a shell would run.
  const first = found?.split(/\r?\n/)[0]?.trim();
  const candidate = first && path.isAbsolute(first) ? first : await runOut('node', ['-p', 'process.execPath']);
  if (!candidate) { return undefined; }
  // Confirm the resolved binary actually runs before it is written into the user's settings.
  return (await runOut(candidate, ['--version'])) !== undefined ? candidate : undefined;
}

/** Copy the bundled script to the stable path, overwriting so extension updates propagate. */
function copyScript(ctx: vscode.ExtensionContext): void {
  const dest = stableScriptPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const src = path.join(ctx.extensionPath, ...BUNDLED);
  // Skip an identical copy: with several windows reconciling at once, rewriting the same bytes would only risk a hook reading a half-written script.
  if (fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(src))) { return; }
  fs.copyFileSync(src, dest);
}

/**
 * Bring <claude config dir>/settings.json in line with the setting.
 * `announce` is true for user-driven toggles (always show an outcome); on activation only changes and errors are shown.
 */
async function reconcile(ctx: vscode.ExtensionContext, announce: boolean, log: (what: string, e: unknown) => void): Promise<void> {
  const enabled = vscode.workspace.getConfiguration().get<boolean>(KEEP_WARM_KEY, false);
  const file = settingsFilePath();
  const script = stableScriptPath();
  try {
    // Peek first (no write): needed to report a bad file and to know whether the node check is required before any side effect.
    const peeked = peekSettings(file);
    if (!peeked.ok) {
      // Never write an unparseable file. On activation with the feature off nothing is wanted from the file, so stay quiet instead of nagging every start.
      if (announce || enabled) { void vscode.window.showErrorMessage(MSG.badJson(file, peeked.why)); }
      return;
    }
    if (!enabled) {
      // applyEdit writes only when the hook is present, so activation in many windows does not rewrite the file.
      const r = applyEdit(file, (s) => removeHook(s, script));
      if (!r.ok) { void vscode.window.showErrorMessage(MSG.badJson(file, r.why)); return; }
      if (announce || r.changed) { void vscode.window.showInformationMessage(r.changed ? MSG.off() : MSG.offAlready()); }
      return;
    }
    // Resolve node on every enabled reconcile (not only the first install): an nvm switch changes the path and the entry must follow.
    const nodePath = await resolveNodePath();
    if (!nodePath) {
      // Without node nothing can be installed. On quiet activation with a hook already in place, leave it as is instead of nagging each start.
      if (announce || !hasOwnHook(peeked.settings, script)) { void vscode.window.showErrorMessage(MSG.noNode()); }
      return;
    }
    copyScript(ctx); // refresh every time so a new extension version updates the script the hook runs
    const r = applyEdit(file, (s) => addHook(s, script, nodePath));
    if (!r.ok) { void vscode.window.showErrorMessage(MSG.badJson(file, r.why)); return; }
    if (announce || r.changed) { void vscode.window.showInformationMessage(r.changed ? MSG.on() : MSG.onAlready()); }
  } catch (e) {
    log('keep-warm', e);
    void vscode.window.showErrorMessage(MSG.failed(e instanceof Error ? e.message : String(e)));
  }
}

/** Reconcile on activation and on every change of the setting. Runs are chained so two toggles cannot interleave their file writes. */
export function registerKeepWarm(ctx: vscode.ExtensionContext, log: (what: string, e: unknown) => void): void {
  let chain: Promise<void> = Promise.resolve();
  // The status item is refreshed after each reconcile: the setting-change event fires before the settings file is rewritten.
  const refreshStatus = registerKeepWarmStatus(ctx, log);
  const run = (announce: boolean) => { chain = chain.then(() => reconcile(ctx, announce, log)).then(refreshStatus); };
  run(false);
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(KEEP_WARM_KEY)) { run(true); } }));
}
