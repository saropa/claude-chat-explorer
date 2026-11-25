/** The reload prompt for a stale configuration registry (see staleConfig.ts for the cause). The one place the message text lives. */
import * as vscode from 'vscode';
import { isUnregisteredError, manifestProperties, staleKeys } from './staleConfig';

const SECTION = 'saropaChats';
let shown = false; // true only while the toast is open, so simultaneous failures do not stack toasts

/** Shows the single reload prompt; not awaited by callers, so it never delays activation or a command. */
export function promptReload(): void {
  // Several failing toggles (or the startup check plus a failed write) must not stack identical toasts while one is open.
  if (shown) { return; }
  shown = true;
  const reload = vscode.l10n.t('Reload Window');
  void vscode.window.showWarningMessage(vscode.l10n.t('This window still uses settings from an older version of Saropa Chats, so some settings cannot be saved. Reload the window to finish the update.'), reload)
    .then((pick) => {
      // Dismissed or answered: a later failed write must be able to prompt again, or the toggle would go silent (the original defect).
      shown = false;
      return pick === reload ? vscode.commands.executeCommand('workbench.action.reloadWindow') : undefined;
    }, () => { shown = false; }); // the same reset when the message promise rejects
}

/** At activation: compares the installed manifest with the window's registry and prompts when any declared setting is unknown to it. Returns the stale keys. */
export function checkStaleConfig(configuration: unknown, log: (m: string) => void): string[] {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const props = manifestProperties(configuration);
  const prefix = SECTION + '.';
  // Registry keys are looked up relative to the section; keys outside it are not ours to check.
  const mine = Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  const stale = staleKeys(mine, (k) => cfg.inspect(k)?.defaultValue).map((k) => prefix + k);
  if (stale.length) {
    log(`stale configuration registry: window does not know ${stale.join(', ')}; a window reload is needed`);
    promptReload();
  }
  return stale;
}

/** Runs a settings write; a "not a registered configuration" rejection (stale registry) shows the reload prompt and returns false. Any other error is rethrown so VS Code surfaces it as before. */
export async function guardedWrite(write: () => Thenable<void> | Promise<void>): Promise<boolean> {
  try { await write(); return true; } catch (e) {
    // Only the stale-registry error is ours to explain; swallowing others would hide real failures.
    if (!isUnregisteredError(e)) { throw e; }
    promptReload();
    return false;
  }
}
