/** Host side of the Account & Usage section's settings popover (gear button on its header): the display-only "Hide account email" setting. */
import * as vscode from 'vscode';
import { targetOf } from './activity';
import { guardedWrite } from './staleConfigUi';

/** Setting key (under `saropaChats.`); the one place this literal lives on the host side. Off by default (see package.json). */
export const HIDE_EMAIL_KEY = 'account.hideEmail';

/** The value in effect. Strict `=== true` so a missing or non-boolean value reads as the default (off) and the email stays visible. */
export const hideEmailOn = (): boolean => vscode.workspace.getConfiguration('saropaChats').get(HIDE_EMAIL_KEY) === true;

/**
 * A choice made in the popover. Only the known key with a boolean is written (the page is not trusted to send anything else), through the
 * same guarded write and target rule as the Activity settings. `after` runs on every path so the page shows the value actually in effect,
 * which snaps the checkbox back when a write failed or a higher-priority scope overrides it.
 */
export async function setAcctPref(key: unknown, value: unknown, after: () => void): Promise<void> {
  if (key === 'hideEmail' && typeof value === 'boolean') {
    try {
      await guardedWrite(() => vscode.workspace.getConfiguration('saropaChats').update(HIDE_EMAIL_KEY, value, targetOf(HIDE_EMAIL_KEY)));
    } catch (e) {
      // guardedWrite already prompts for a stale registry; any other failure is shown here so a click never ends silently.
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not save the Account setting: {0}', String(e instanceof Error ? e.message : e)));
    }
  }
  after();
}
