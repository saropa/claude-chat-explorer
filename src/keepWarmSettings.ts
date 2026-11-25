/**
 * Edit logic for the keep-warm Stop hook in ~/.claude/settings.json: no vscode import, so scripts/checks/check_keepwarm.js
 * and resources/uninstall_keepwarm.js (which runs without the vscode API) can load the compiled out/keepWarmSettings.js.
 * The pure add/remove edits are fs-free; applyEdit is the one safe writer both the extension and the uninstall script share.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Setting key that turns the feature on; the single place the literal lives on the TypeScript side. */
export const KEEP_WARM_KEY = 'saropaChats.keepWarm.enabled';
/** Folder under ~/.claude holding the stable copy of the script; the extension install path changes on every update. */
export const KEEP_WARM_STABLE_DIR = 'saropa-chats';
/** File name of the hook script, both in resources/ and in the stable folder. */
export const KEEP_WARM_SCRIPT_NAME = 'keep_warm.js';
/** Env var Claude Code honors to relocate its config dir; the single place the name lives on the TypeScript side. */
export const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';
/** Folder (under the config dir) holding the per-session state files and log.jsonl written by resources/keep_warm.js. */
export const KEEP_WARM_STATE_DIR = 'keepwarm';
/** Ping log file inside KEEP_WARM_STATE_DIR. */
export const KEEP_WARM_LOG_NAME = 'log.jsonl';
/** Heartbeat file the script writes inside KEEP_WARM_STABLE_DIR on every valid run (used to detect hook-format drift). */
export const KEEP_WARM_HEARTBEAT_NAME = 'last_run.json';
/** Hook timeout in seconds: must stay above the watcher's 62-minute self-terminate in resources/keep_warm.js. */
export const KEEP_WARM_TIMEOUT_S = 3900;

/** A hook command entry as Claude Code reads it from settings.json. */
export interface HookEntry { type: 'command'; command: string; args: string[]; asyncRewake: boolean; timeout: number }

/** The outcome of an edit: the (possibly same) settings object and whether anything changed. */
export interface HookEdit { settings: Record<string, unknown>; changed: boolean }

/**
 * The exact entry written for a given stable script path. `nodePath` is the absolute node binary resolved at enable time so
 * Claude Code's hook shell does not depend on its own PATH; the bare word 'node' is only the fallback for callers without one.
 */
export function hookEntry(scriptPath: string, nodePath: string = 'node'): HookEntry {
  return { type: 'command', command: nodePath, args: [scriptPath], asyncRewake: true, timeout: KEEP_WARM_TIMEOUT_S };
}

/** True when settings already hold an own entry (matched by script path in args, regardless of its command). */
export function hasOwnHook(settings: Record<string, unknown>, scriptPath: string): boolean {
  return (stopGroups(settings) ?? []).some((g) => g && Array.isArray(g.hooks) && (g.hooks as unknown[]).some((h) => isOwn(h, scriptPath)));
}

/** True when a hook entry is the extension's own: identified by the stable script path in args, never by position. */
function isOwn(h: unknown, scriptPath: string): boolean {
  const args = (h as { args?: unknown } | null)?.args;
  return Array.isArray(args) && args.includes(scriptPath);
}

/** The groups of hooks.Stop as a plain array of objects; anything malformed is treated as absent so it is never mangled. */
function stopGroups(settings: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) { return undefined; }
  const stop = (hooks as Record<string, unknown>).Stop;
  return Array.isArray(stop) ? (stop as Record<string, unknown>[]) : undefined;
}

/** Ensure exactly one own entry exists and matches the wanted shape; other hooks are never touched. */
export function addHook(input: Record<string, unknown>, scriptPath: string, nodePath: string = 'node'): HookEdit {
  // Work on a deep copy so a caller that discards the result leaves its object intact.
  const settings = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  // A changed nodePath (for example after an nvm switch) makes the stringified entry differ below, so the stale command is rewritten.
  const want = hookEntry(scriptPath, nodePath);
  const groups = stopGroups(settings);
  let found = false, changed = false;
  for (const g of groups ?? []) {
    const list = g && Array.isArray(g.hooks) ? (g.hooks as unknown[]) : [];
    for (let i = 0; i < list.length; i++) {
      if (!isOwn(list[i], scriptPath)) { continue; }
      if (found) { list.splice(i--, 1); changed = true; continue; } // a duplicate from an earlier bug: drop it
      found = true;
      // Rewrite a stale entry (for example an old timeout) so updates propagate; leave an identical one alone.
      if (JSON.stringify(list[i]) !== JSON.stringify(want)) { list[i] = want; changed = true; }
    }
  }
  if (found) { return { settings, changed }; }
  // No own entry: append a new group, creating hooks / hooks.Stop only when missing or unusable.
  const hooks = settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks) ? (settings.hooks as Record<string, unknown>) : {};
  const stop = Array.isArray(hooks.Stop) ? (hooks.Stop as unknown[]) : [];
  stop.push({ hooks: [want] });
  hooks.Stop = stop;
  settings.hooks = hooks;
  return { settings, changed: true };
}

/** Remove only the own entry; drop a group (and then Stop / hooks) only when this removal emptied it. */
export function removeHook(input: Record<string, unknown>, scriptPath: string): HookEdit {
  const settings = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  const groups = stopGroups(settings);
  if (!groups) { return { settings, changed: false }; }
  let changed = false;
  const kept = groups.filter((g) => {
    if (!g || !Array.isArray(g.hooks)) { return true; }
    const before = (g.hooks as unknown[]).length;
    g.hooks = (g.hooks as unknown[]).filter((h) => !isOwn(h, scriptPath));
    if ((g.hooks as unknown[]).length === before) { return true; } // untouched group: keep even if it was already empty
    changed = true;
    return (g.hooks as unknown[]).length > 0; // we emptied it: drop it
  });
  if (!changed) { return { settings, changed: false }; }
  const hooks = settings.hooks as Record<string, unknown>;
  if (kept.length > 0) { hooks.Stop = kept; } else { delete hooks.Stop; }
  if (Object.keys(hooks).length === 0) { delete settings.hooks; } // nothing else under hooks: remove the empty shell
  return { settings, changed };
}

/**
 * The Claude config dir: CLAUDE_CONFIG_DIR when set and non-blank (Claude Code relocates all its files there), else ~/.claude.
 * The one TypeScript definition; resources/keep_warm.js and resources/uninstall_keepwarm.js run standalone and each keep a
 * tiny copy of this rule that must stay in step with it.
 */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  const v = (env[CLAUDE_CONFIG_DIR_ENV] ?? '').trim();
  return v ? v : path.join(home, '.claude');
}

/** Absolute path of the Claude settings.json that holds the hooks. */
export function settingsFilePath(configDir: string = claudeConfigDir()): string {
  return path.join(configDir, 'settings.json');
}

/** Absolute stable script path for a config dir: the value the hook entry's args carry and uninstall matches on. */
export function stableScriptPath(configDir: string = claudeConfigDir()): string {
  return path.join(configDir, KEEP_WARM_STABLE_DIR, KEEP_WARM_SCRIPT_NAME);
}

/** Absolute path of the heartbeat file the script writes on every valid run. */
export function heartbeatPath(configDir: string = claudeConfigDir()): string {
  return path.join(configDir, KEEP_WARM_STABLE_DIR, KEEP_WARM_HEARTBEAT_NAME);
}

/** Absolute path of the ping log the script appends to. */
export function pingLogPath(configDir: string = claudeConfigDir()): string {
  return path.join(configDir, KEEP_WARM_STATE_DIR, KEEP_WARM_LOG_NAME);
}

/** Outcome of applyEdit: a parse failure (nothing written) or success with whether the file was rewritten. */
export type ApplyResult = { ok: true; changed: boolean } | { ok: false; why: string };

/** Read the raw file text, or undefined when it does not exist. */
function readRaw(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

/**
 * Parse settings text. A missing file (undefined) is an empty object; anything unparseable returns a reason so the caller can refuse to write.
 */
function parseRaw(raw: string | undefined): { ok: true; settings: Record<string, unknown> } | { ok: false; why: string } {
  if (raw === undefined) { return { ok: true, settings: {} }; }
  try {
    // A UTF-8 BOM (added by some Windows editors) makes JSON.parse throw; strip it.
    const v: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!v || typeof v !== 'object' || Array.isArray(v)) { return { ok: false, why: 'top level is not an object' }; }
    return { ok: true, settings: v as Record<string, unknown> };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse a settings file without writing: used to peek at what an edit would do before side effects such as copying the script. */
export function peekSettings(file: string): { ok: true; settings: Record<string, unknown> } | { ok: false; why: string } {
  return parseRaw(readRaw(file));
}

/** Pause between the two attempts is not needed: a retry re-reads fresh content, which already includes the other window's write. */
const MAX_ATTEMPTS = 2;

/**
 * Apply `edit` to a settings file safely.
 * - Parse failure: nothing is written (the user's file may be hand-edited and must never be clobbered).
 * - No change: nothing is written. Bug fixed: every window used to rewrite the file on activation, so windows raced each other.
 * - Symlinked file: the real target is resolved and the temp file is created beside it, so the link survives the rename.
 * - Unique temp name (pid + random): two windows can no longer write the same temp file.
 * - The file is re-read just before the rename; if it changed since the first read another writer got in, so this attempt is
 *   abandoned and redone once from a fresh read instead of overwriting their change.
 * - The original file mode is kept on the replacement.
 */
export function applyEdit(file: string, edit: (settings: Record<string, unknown>) => HookEdit): ApplyResult {
  // Resolve links only when the file exists: realpathSync throws on a missing path, and a new file has no link to keep.
  const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const raw = readRaw(target);
    const parsed = parseRaw(raw);
    if (!parsed.ok) { return parsed; }
    const r = edit(parsed.settings);
    if (!r.changed) { return { ok: true, changed: false }; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.saropa-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    // Keep the user's permissions (for example 0600) instead of the umask default; a new file takes the default.
    const mode = raw === undefined ? undefined : fs.statSync(target).mode & 0o777;
    fs.writeFileSync(tmp, JSON.stringify(r.settings, null, 2) + '\n', { encoding: 'utf8', mode });
    if (mode !== undefined) { fs.chmodSync(tmp, mode); } // writeFileSync's mode is masked by the umask; chmod makes it exact
    if (readRaw(target) !== raw) {
      // Another writer changed the file after our read: drop this attempt rather than overwrite their edit.
      fs.rmSync(tmp, { force: true });
      continue;
    }
    fs.renameSync(tmp, target);
    return { ok: true, changed: true };
  }
  throw new Error('settings.json kept changing while it was being updated; try again');
}
