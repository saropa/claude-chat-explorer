import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { addHook, KEEP_WARM_KEY, removeHook } from './keepWarmSettings';

/** Folder under ~/.claude holding the stable copy of the script; the extension install path changes on every update. */
const STABLE_DIR = 'saropa-chats';
const SCRIPT_NAME = 'keep_warm.js';
/** Bundled script location relative to the extension root (shipped: .vscodeignore does not exclude resources/). */
const BUNDLED = ['resources', SCRIPT_NAME];
/** How long `node --version` may take before node is treated as missing. */
const NODE_CHECK_MS = 10000;

/** User-facing copy in one place; third person, no first-person voice. */
const MSG = {
  on: 'Keep Claude sessions warm is on. Idle sessions get a short ping after 50 minutes so the prompt cache stays alive.',
  onAlready: 'Keep Claude sessions warm is on. The hook was already installed; the script was refreshed.',
  off: 'Keep Claude sessions warm is off. The Stop hook was removed from Claude settings.',
  offAlready: 'Keep Claude sessions warm is off. No hook was installed.',
  noNode: 'Keep Claude sessions warm needs Node.js on the PATH, and `node` was not found. The hook was not installed. Install Node.js, then turn the setting off and on again.',
  badJson: (file: string, why: string) => `Keep Claude sessions warm did not change ${file}: it is not valid JSON (${why}). Fix the file, then toggle the setting again.`,
  failed: (why: string) => `Keep Claude sessions warm failed: ${why}`,
};

const claudeDir = () => path.join(os.homedir(), '.claude');
const settingsFile = () => path.join(claudeDir(), 'settings.json');
const stableScript = () => path.join(claudeDir(), STABLE_DIR, SCRIPT_NAME);

/** Whether `node` runs from PATH: the hook command is the bare word `node`, so it must resolve for Claude Code too. */
function nodeOnPath(): Promise<boolean> {
  return new Promise((resolve) => { execFile('node', ['--version'], { timeout: NODE_CHECK_MS, windowsHide: true }, (err) => resolve(!err)); });
}

/** Parse result: missing file is an empty object; a parse failure carries the reason and must block any write. */
type Loaded = { ok: true; settings: Record<string, unknown>; existed: boolean } | { ok: false; why: string };

/** Read and parse ~/.claude/settings.json without ever writing. */
function load(file: string): Loaded {
  if (!fs.existsSync(file)) { return { ok: true, settings: {}, existed: false }; }
  try {
    // A UTF-8 BOM (added by some Windows editors) makes JSON.parse throw; strip it.
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (!v || typeof v !== 'object' || Array.isArray(v)) { return { ok: false, why: 'top level is not an object' }; }
    return { ok: true, settings: v as Record<string, unknown>, existed: true };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

/** Write via a temp file and rename so a crash cannot leave the user's settings truncated. */
function save(file: string, settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.saropa-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** Copy the bundled script to the stable path, overwriting so extension updates propagate. */
function copyScript(ctx: vscode.ExtensionContext): void {
  const dest = stableScript();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ctx.extensionPath, ...BUNDLED), dest);
}

/**
 * Bring ~/.claude/settings.json in line with the setting.
 * `announce` is true for user-driven toggles (always show an outcome); on activation only changes and errors are shown.
 */
async function reconcile(ctx: vscode.ExtensionContext, announce: boolean, log: (what: string, e: unknown) => void): Promise<void> {
  const enabled = vscode.workspace.getConfiguration().get<boolean>(KEEP_WARM_KEY, false);
  const file = settingsFile();
  const script = stableScript();
  try {
    const loaded = load(file);
    if (!loaded.ok) {
      // Never write an unparseable file. On activation with the feature off nothing is wanted from the file, so stay quiet instead of nagging every start.
      if (announce || enabled) { void vscode.window.showErrorMessage(MSG.badJson(file, loaded.why)); }
      return;
    }
    if (!enabled) {
      const r = removeHook(loaded.settings, script);
      if (r.changed) { save(file, r.settings); }
      if (announce || r.changed) { void vscode.window.showInformationMessage(r.changed ? MSG.off : MSG.offAlready); }
      return;
    }
    const r = addHook(loaded.settings, script);
    // Installing needs node: check before copying or writing anything. An already-installed hook skips the check on quiet activation.
    if ((r.changed || announce) && !(await nodeOnPath())) { void vscode.window.showErrorMessage(MSG.noNode); return; }
    copyScript(ctx); // refresh every time so a new extension version updates the script the hook runs
    if (r.changed) { save(file, r.settings); }
    if (announce || r.changed) { void vscode.window.showInformationMessage(r.changed ? MSG.on : MSG.onAlready); }
  } catch (e) {
    log('keep-warm', e);
    void vscode.window.showErrorMessage(MSG.failed(e instanceof Error ? e.message : String(e)));
  }
}

/** Reconcile on activation and on every change of the setting. Runs are chained so two toggles cannot interleave their file writes. */
export function registerKeepWarm(ctx: vscode.ExtensionContext, log: (what: string, e: unknown) => void): void {
  let chain: Promise<void> = Promise.resolve();
  const run = (announce: boolean) => { chain = chain.then(() => reconcile(ctx, announce, log)); };
  run(false);
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(KEEP_WARM_KEY)) { run(true); } }));
}
