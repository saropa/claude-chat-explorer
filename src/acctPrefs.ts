/** Host side of the Account & Usage section's settings popover (gear button on its header): the display-only "Hide account email" and "Screen-share mode" settings. */
import * as vscode from 'vscode';
import { targetOf } from './activity';
import { guardedWrite } from './staleConfigUi';

/** Setting keys (under `saropaChats.`) by the message key the page sends; the one place these literals live on the host side. Both off by default (see package.json). */
export const ACCT_KEYS = { hideEmail: 'account.hideEmail', screenShare: 'account.screenShare' } as const;
/** Kept for callers that only need the hide-email key. */
export const HIDE_EMAIL_KEY = ACCT_KEYS.hideEmail;

/** Reads one boolean display setting. Strict `=== true` so a missing or non-boolean value reads as the default (off) and nothing is hidden by accident. */
const boolPref = (k: string): boolean => vscode.workspace.getConfiguration('saropaChats').get(k) === true;

/** The hide-email value in effect. */
export const hideEmailOn = (): boolean => boolPref(ACCT_KEYS.hideEmail);

/** The screen-share value in effect (hides email, name and organization). */
export const screenShareOn = (): boolean => boolPref(ACCT_KEYS.screenShare);

/** Both display values in effect, in the shape redactAccount and the 'acctPrefs' message use. */
export const acctPrefsNow = (): { hideEmail: boolean; screenShare: boolean } => ({ hideEmail: hideEmailOn(), screenShare: screenShareOn() });

/** True when a configuration change touched either Account display setting (one list, so a new key cannot be missed by the listener). */
export const affectsAcctPrefs = (e: vscode.ConfigurationChangeEvent): boolean => Object.values(ACCT_KEYS).some((k) => e.affectsConfiguration('saropaChats.' + k));

/**
 * A choice made in the popover. Only a known key with a boolean is written (the page is not trusted to send anything else), through the
 * same guarded write and target rule as the Activity settings. `after` runs on every path so the page shows the value actually in effect,
 * which snaps the checkbox back when a write failed or a higher-priority scope overrides it.
 */
export async function setAcctPref(key: unknown, value: unknown, after: () => void): Promise<void> {
  // Own-property lookup: a key such as "constructor" must not resolve through the prototype.
  const setting = typeof key === 'string' && Object.prototype.hasOwnProperty.call(ACCT_KEYS, key) ? ACCT_KEYS[key as keyof typeof ACCT_KEYS] : undefined;
  if (setting && typeof value === 'boolean') {
    try {
      await guardedWrite(() => vscode.workspace.getConfiguration('saropaChats').update(setting, value, targetOf(setting)));
    } catch (e) {
      // guardedWrite already prompts for a stale registry; any other failure is shown here so a click never ends silently.
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not save the Account setting: {0}', String(e instanceof Error ? e.message : e)));
    }
  }
  after();
}
