/** Chat status definitions, shared by the extension and the webview script. Change thresholds here. */

// Not exported on purpose: statusesOf is stringified into the webview and must see bare names.
const ACTIVE_DOTS = ['running', 'waiting', 'unread']; // Active: open chats that are running, waiting for you or unread (dots exist only for open chats)
const ABANDONED_MS = 30 * 24 * 60 * 60 * 1000; // Abandoned: last active longer ago than this
const TINY_MAX_MSGS = 3; // Tiny: this many messages or fewer (but not zero)
const HUGE_MIN_MSGS = 300; // Huge: this many messages or more
const HUGE_BYTES = 10 * 1024 * 1024; // Huge: or a file larger than this
const NEARLY_PCT = 80; // Nearly full: context window this full or more

export const STATUS_KEYS = ['normal', 'active', 'empty', 'tiny', 'huge', 'nearly', 'abandoned', 'pinned'];
/** Filter list tooltips; Mid-size is the plain-words name of the key 'normal' (kept so saved filters still load). */
export const STATUS_TIPS: { [k: string]: string } = {
  normal: `Mid-size: ${TINY_MAX_MSGS + 1} to ${HUGE_MIN_MSGS - 1} messages, ${HUGE_BYTES / 1048576} MB or less, active in the last ${ABANDONED_MS / 86400000} days, context under ${NEARLY_PCT}% full, not pinned, and not running, waiting or unread`,
  active: 'Open chats that are running, waiting for you or unread',
  empty: 'No messages',
  tiny: `1 to ${TINY_MAX_MSGS} messages`,
  huge: `${HUGE_MIN_MSGS} messages or more, or a transcript over ${HUGE_BYTES / 1048576} MB`,
  nearly: `Context window ${NEARLY_PCT}% full or more`,
  abandoned: `Last active more than ${ABANDONED_MS / 86400000} days ago`,
  pinned: 'Pinned chats',
};
export const STATUS_LABELS: { [k: string]: string } = {
  normal: 'Mid-size', active: 'Active', empty: 'Empty', tiny: 'Tiny', huge: 'Huge', nearly: 'Nearly full', abandoned: 'Abandoned', pinned: 'Pinned',
};

/** Every status of a chat; a chat can have several. 'normal' (shown as Mid-size) only when it has none of the others. */
export function statusesOf(r: { msgs: number; last: number; size: number; ctx?: { pct: number } }, pinned: boolean, now: number, dot?: string): string[] {
  const out: string[] = [];
  const age = now - r.last;
  if (dot && ACTIVE_DOTS.includes(dot)) { out.push('active'); }
  if (r.msgs === 0) { out.push('empty'); }
  else if (r.msgs <= TINY_MAX_MSGS) { out.push('tiny'); }
  if (r.msgs >= HUGE_MIN_MSGS || r.size > HUGE_BYTES) { out.push('huge'); }
  if (r.ctx && r.ctx.pct >= NEARLY_PCT) { out.push('nearly'); }
  if (age > ABANDONED_MS) { out.push('abandoned'); }
  if (pinned) { out.push('pinned'); }
  return out.length ? out : ['normal'];
}

const PILL_ORDER = ['huge', 'empty', 'tiny', 'abandoned']; // priority of the row chip; normal, active and pinned never show one (the dot and star say it)

/** The status a row pill shows (most important of the chat's statuses), or '' for none. */
export function pillOf(statuses: string[]): string {
  return PILL_ORDER.find((k) => statuses.includes(k)) ?? '';
}

/** Constants and function source for the webview script. */
export const STATUS_SRC = [
  'const ACTIVE_DOTS=' + JSON.stringify(ACTIVE_DOTS), 'ABANDONED_MS=' + ABANDONED_MS, 'TINY_MAX_MSGS=' + TINY_MAX_MSGS,
  'HUGE_MIN_MSGS=' + HUGE_MIN_MSGS, 'HUGE_BYTES=' + HUGE_BYTES, 'NEARLY_PCT=' + NEARLY_PCT,
  'PILL_ORDER=' + JSON.stringify(PILL_ORDER), 'STATUS_KEYS=' + JSON.stringify(STATUS_KEYS), 'STATUS_LABELS=' + JSON.stringify(STATUS_LABELS), 'STATUS_TIPS=' + JSON.stringify(STATUS_TIPS),
].join(',') + ';\n' + statusesOf.toString() + '\n' + pillOf.toString() + '\n';
