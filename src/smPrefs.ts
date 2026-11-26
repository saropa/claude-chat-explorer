/** Host side of the Session Manager header menu's "Keep Claude sessions warm" toggle. The hook install/removal and its messages stay in keepWarm.ts. */
import * as vscode from 'vscode';
import { KEEP_WARM_KEY } from './keepWarmSettings';
import { guardedWrite } from './staleConfigUi';

/** The setting key relative to the `saropaChats` section (KEEP_WARM_KEY is the full key; one source of truth for the literal). */
const SECTION = 'saropaChats';
const REL_KEY = KEEP_WARM_KEY.slice(SECTION.length + 1);

/** The value in effect. Strict `=== true` so a missing or non-boolean value reads as the default (off). */
export const keepWarmOn = (): boolean => vscode.workspace.getConfiguration(SECTION).get(REL_KEY) === true;

/**
 * Flip the setting. The setting has application scope, so it can only live in user settings (Global); a workspace target would be rejected.
 * The outcome message (hook installed or removed, Node missing, bad JSON) comes from keepWarm.ts, which reacts to this configuration change,
 * so a tap always ends visibly. A failed write is reported here. `after` runs on every path so the page shows the value actually in effect.
 */
export async function toggleKeepWarm(after: () => void): Promise<void> {
  try {
    await guardedWrite(() => vscode.workspace.getConfiguration(SECTION).update(REL_KEY, !keepWarmOn(), vscode.ConfigurationTarget.Global));
  } catch (e) {
    void vscode.window.showErrorMessage(vscode.l10n.t('Could not save the Keep Claude sessions warm setting: {0}', String(e instanceof Error ? e.message : e)));
  }
  after();
}
