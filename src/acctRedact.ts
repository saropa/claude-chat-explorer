/**
 * Pure (no vscode import) redaction of the Account & Usage payload before it is posted to the webview. Kept apart from acctPrefs.ts so
 * a plain-node check can load it. The public API (getAccountUsage) never goes through here and still carries the email.
 */

/** Display settings that decide what the panel may receive. */
export interface AcctRedactOpts { hideEmail: boolean; screenShare: boolean }

/**
 * Returns a copy of the worker's account payload with hidden fields removed (not masked), so the webview never holds them.
 * Why host-side: a page-only filter still leaves the address in the page's memory and message log; stripping here means a
 * hidden email is never sent. Screen-share mode implies hide-email and also drops name and organization; plan and usage stay.
 * The input is never mutated: the host caches the raw payload and re-redacts it when a setting flips back.
 */
export function redactAccount<T extends { account?: { email?: string; name?: string; org?: string } | null }>(payload: T, o: AcctRedactOpts): T {
  const acc = payload.account;
  // Nothing to strip: signed out, a failed read, or nothing hidden.
  if (!acc || (!o.hideEmail && !o.screenShare)) { return payload; }
  const kept = { ...acc };
  delete kept.email; // hidden by either setting
  // Name and organization only go in screen-share mode; hide-email alone leaves them for the page's View details.
  if (o.screenShare) { delete kept.name; delete kept.org; }
  return { ...payload, account: kept };
}
