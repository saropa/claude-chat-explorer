/** Chat status definitions, shared by the extension and the webview script. Change thresholds here. */

// Not exported on purpose: statusesOf is stringified into the webview and must see bare names.
const ACTIVE_DOTS = ['running', 'waiting', 'unread']; // Active: Claude's own definition (running, waiting for you or unread)
const ABANDONED_MS = 30 * 24 * 60 * 60 * 1000; // Abandoned: last active longer ago than this
const TINY_MAX_MSGS = 3; // Tiny: this many messages or fewer (but not zero)
const HUGE_MIN_MSGS = 300; // Huge: this many messages or more
const HUGE_BYTES = 10 * 1024 * 1024; // Huge: or a file larger than this

export const STATUS_KEYS = ['normal', 'active', 'empty', 'tiny', 'huge', 'abandoned', 'pinned'];
export const STATUS_LABELS: { [k: string]: string } = {
  normal: 'Normal', active: 'Active', empty: 'Empty', tiny: 'Tiny', huge: 'Huge', abandoned: 'Abandoned', pinned: 'Pinned',
};

/** Every status of a chat; a chat can have several. 'normal' only when it has none of the others. */
export function statusesOf(r: { msgs: number; last: number; size: number }, pinned: boolean, now: number, dot?: string): string[] {
  const out: string[] = [];
  const age = now - r.last;
  if (dot && ACTIVE_DOTS.includes(dot)) { out.push('active'); }
  if (r.msgs === 0) { out.push('empty'); }
  else if (r.msgs <= TINY_MAX_MSGS) { out.push('tiny'); }
  if (r.msgs >= HUGE_MIN_MSGS || r.size > HUGE_BYTES) { out.push('huge'); }
  if (age > ABANDONED_MS) { out.push('abandoned'); }
  if (pinned) { out.push('pinned'); }
  return out.length ? out : ['normal'];
}

const PILL_ORDER = ['active', 'huge', 'empty', 'tiny', 'abandoned']; // priority of the row pill; normal and pinned never show one

/** The status a row pill shows (most important of the chat's statuses), or '' for none. */
export function pillOf(statuses: string[]): string {
  return PILL_ORDER.find((k) => statuses.includes(k)) ?? '';
}

/** Constants and function source for the webview script. */
export const STATUS_SRC = [
  'const ACTIVE_DOTS=' + JSON.stringify(ACTIVE_DOTS), 'ABANDONED_MS=' + ABANDONED_MS, 'TINY_MAX_MSGS=' + TINY_MAX_MSGS,
  'HUGE_MIN_MSGS=' + HUGE_MIN_MSGS, 'HUGE_BYTES=' + HUGE_BYTES,
  'PILL_ORDER=' + JSON.stringify(PILL_ORDER), 'STATUS_KEYS=' + JSON.stringify(STATUS_KEYS), 'STATUS_LABELS=' + JSON.stringify(STATUS_LABELS),
].join(',') + ';\n' + statusesOf.toString() + '\n' + pillOf.toString() + '\n';
