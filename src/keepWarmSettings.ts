/** Pure edit logic for the keep-warm Stop hook in ~/.claude/settings.json: no vscode or fs import, so scripts/checks/check_keepwarm.js can run it. */

/** Setting key that turns the feature on; the single place the literal lives on the TypeScript side. */
export const KEEP_WARM_KEY = 'saropaChats.keepWarm.enabled';
/** Hook timeout in seconds: must stay above the watcher's 62-minute self-terminate in resources/keep_warm.js. */
export const KEEP_WARM_TIMEOUT_S = 3900;

/** A hook command entry as Claude Code reads it from settings.json. */
export interface HookEntry { type: 'command'; command: string; args: string[]; asyncRewake: boolean; timeout: number }

/** The outcome of an edit: the (possibly same) settings object and whether anything changed. */
export interface HookEdit { settings: Record<string, unknown>; changed: boolean }

/** The exact entry written for a given stable script path. */
export function hookEntry(scriptPath: string): HookEntry {
  return { type: 'command', command: 'node', args: [scriptPath], asyncRewake: true, timeout: KEEP_WARM_TIMEOUT_S };
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
export function addHook(input: Record<string, unknown>, scriptPath: string): HookEdit {
  // Work on a deep copy so a caller that discards the result leaves its object intact.
  const settings = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  const want = hookEntry(scriptPath);
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
