import * as vscode from 'vscode';

/**
 * One-time migration for the rename "Saropa Chat Explorer" -> "Saropa Chats".
 * Setting keys and stored-state keys moved from the `saropaChatExplorer.` prefix to `saropaChats.`.
 * Without this, every user would silently lose their settings, pins, archive list, tags and
 * search history on upgrade. Old values are copied, never overwritten onto an explicit new value.
 */
const OLD_PREFIX = 'saropaChatExplorer.';
const NEW_PREFIX = 'saropaChats.';
// Guard key so the (cheap but pointless) scan runs once per profile, not on every activation.
const DONE_KEY = NEW_PREFIX + 'namesMigrated';

/**
 * Copy state entries (pins, archived, tags, history, ...) from old keys to new keys, then clear the old key.
 * Runs synchronously: Memento.update applies to the in-memory copy immediately, so the Store that is
 * constructed right after this call already reads the migrated values.
 */
function migrateState(memento: vscode.Memento): void {
  for (const key of memento.keys()) {
    if (!key.startsWith(OLD_PREFIX)) { continue; }
    const next = NEW_PREFIX + key.slice(OLD_PREFIX.length);
    // Only fill a gap: a value already written under the new key is newer than anything legacy.
    if (memento.get(next) === undefined) { void memento.update(next, memento.get(key)); }
    void memento.update(key, undefined);
  }
}

/**
 * Copy user and workspace setting values from `saropaChatExplorer.*` to `saropaChats.*`.
 * The old keys are no longer registered, so VS Code refuses to write them: they are left in
 * settings.json untouched (inert) and only the new keys are written.
 */
async function migrateSettings(ctx: vscode.ExtensionContext, log: (what: string, e: unknown) => void): Promise<void> {
  const props = (ctx.extension.packageJSON?.contributes?.configuration?.properties ?? {}) as Record<string, unknown>;
  const cfg = vscode.workspace.getConfiguration();
  for (const newKey of Object.keys(props)) {
    if (!newKey.startsWith(NEW_PREFIX)) { continue; }
    const oldKey = OLD_PREFIX + newKey.slice(NEW_PREFIX.length);
    const old = cfg.inspect(oldKey);
    const cur = cfg.inspect(newKey);
    // Each scope is migrated separately so a workspace override stays a workspace override.
    const scopes: Array<[unknown, unknown, vscode.ConfigurationTarget]> = [
      [old?.globalValue, cur?.globalValue, vscode.ConfigurationTarget.Global],
      [old?.workspaceValue, cur?.workspaceValue, vscode.ConfigurationTarget.Workspace],
    ];
    for (const [oldVal, curVal, target] of scopes) {
      if (oldVal === undefined || curVal !== undefined) { continue; }
      try { await cfg.update(newKey, oldVal, target); } catch (e) { log('migrate setting ' + newKey, e); }
    }
  }
}

/** Run the rename migration once; safe to call on every activation. */
export function migrateNames(ctx: vscode.ExtensionContext, log: (what: string, e: unknown) => void): void {
  if (ctx.globalState.get(DONE_KEY) === true) { return; }
  migrateState(ctx.globalState);
  migrateState(ctx.workspaceState);
  // Settings are async; the flag is set only after they are written so a failed run is retried.
  void migrateSettings(ctx, log).then(() => ctx.globalState.update(DONE_KEY, true));
}
