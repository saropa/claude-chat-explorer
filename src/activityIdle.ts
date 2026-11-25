/** The Activity diagram's idle caption: which chat the diagram follows and what that chat is doing, shown while no live event caption is up. No vscode import, so the node check script can drive it; the host passes vscode.l10n.t in as the translator. */
import { DriftTr, fillPlain } from './digestMd';

/** The dot as far as the caption cares: `s` is the winning state, `also` the lower-priority states that were outranked (liveState.ts dotState). */
export interface IdleDot { s: string; also?: string[] }

/** What the host knows when it builds the text: the followed chat's title ('' when none), its dot (undefined when it has no dot) and how many OTHER chats are working. */
export interface IdleInfo { title: string; dot: IdleDot | undefined; others: number }

/**
 * The English source of every caption string, with {0}-style placeholders: the ONE table the host (through vscode.l10n.t) and
 * the checks (English directly) read. Singular and plural are whole strings so each language can inflect them. No first-person voice.
 */
export const IDLE_STRINGS = {
  running: 'working',
  waiting: 'waiting for you',
  background: 'background tasks running',
  idle: 'idle', // also the fallback: a followed chat with no dot (closed tab / no live process) or an unknown state
  withBackground: '{0} · background tasks running', // a higher-priority state won the dot but background tasks are still running
  titled: '{0} — {1}', // title, then its state
  withOthers: '{0} · {1}', // the caption so far, then the other-chats hint
  otherOne: '1 other chat working',
  otherMany: '{0} other chats working',
  // Click-to-focus on the other-chats hint: the tooltip / accessible name, and the outcomes a click can have (every click shows one).
  focusOther: 'Open the busiest other working chat',
  looking: 'Finding the busiest other chat…', // shown by the page the moment the caption is clicked, before the host answers
  opening: 'Opening {0}…',
  openFailed: 'Could not open {0}',
  noneWorking: 'No other chat is working now',
  untitled: 'untitled chat', // the target chat has no known title yet
} as const;

const STATE_KEYS = ['running', 'waiting', 'background', 'idle'] as const; // the dot states that have their own wording ('unread' reads as idle)
const MAX_TITLE = 60; // the caption is one line; long titles are cut here so the state text after them stays readable

/**
 * Every state name a dot carries, primary first, read defensively: the dot map comes from the live watcher and over the webview/IPC
 * boundary, so a missing dot, a non-string `s`, a missing or non-array `also` or non-string entries in it must never throw. Anything
 * unreadable is simply left out, so such a dot reads as idle.
 */
function statesOf(dot: unknown): string[] {
  if (!dot || typeof dot !== 'object') { return []; } // no dot, or not an object: no states, so it reads as idle
  const d = dot as { s?: unknown; also?: unknown };
  const also = Array.isArray(d.also) ? d.also.filter((x): x is string => typeof x === 'string') : [];
  return typeof d.s === 'string' ? [d.s, ...also] : also;
}

/**
 * True when the dot says the chat is working: it runs, or it still has background tasks. Looks at `also` too, because
 * dotState puts 'background' there when waiting/unread wins the primary slot; reading only `s` would miss those chats.
 * A chat waiting for the user (with nothing else going on) is not working. A malformed dot is not working.
 */
export function isWorking(dot: IdleDot | undefined): boolean {
  return statesOf(dot).some((k) => k === 'running' || k === 'background');
}

/** Counts the chats other than `cur` that are working, from the dots map (id to dot). A missing map counts nothing. */
export function othersWorking(dots: { [id: string]: IdleDot } | undefined, cur: string): number {
  // A missing or non-object map (watcher not started yet) means no chat is known to work.
  if (!dots || typeof dots !== 'object') { return 0; }
  return Object.entries(dots).filter(([id, d]) => id !== cur && isWorking(d)).length;
}

/**
 * The chat a click on the "N other chats working" hint opens: among the working chats other than `cur`, one that is running beats
 * one that only has background tasks (a running chat is where the user's attention is most likely needed next), and within a rank
 * the most recently active one wins (`recency`: id to last-activity time in ms, e.g. the transcript's mtime; missing counts as 0).
 * Ties fall back to the id so the pick is deterministic. '' when no other chat is working.
 */
export function pickBusiest(dots: { [id: string]: IdleDot } | undefined, cur: string, recency: { [id: string]: number } = {}): string {
  // No dots map yet: nothing can be working.
  if (!dots || typeof dots !== 'object') { return ''; }
  // Rank of a working chat: running (2) outranks background tasks only (1); statesOf reads s and also, so background behind waiting counts.
  const rank = (d: IdleDot): number => { const st = statesOf(d); return st.includes('running') ? 2 : st.includes('background') ? 1 : 0; };
  const at = (id: string): number => { const t = Number(recency[id]); return Number.isFinite(t) ? t : 0; }; // a non-number time sorts as oldest
  const pool = Object.entries(dots).filter(([id, d]) => id !== cur && isWorking(d));
  // Higher rank first, then newer activity, then the id (object key order is not a stable tie-break across dot updates).
  pool.sort(([a, da], [b, db]) => rank(db) - rank(da) || at(b) - at(a) || (a < b ? -1 : a > b ? 1 : 0));
  return pool.length ? pool[0][0] : ''; // empty pool: no other chat is working
}

/** The state wording of one dot: its primary state, plus "background tasks running" when that is hidden in `also` behind a higher-priority state. */
function stateText(dot: IdleDot | undefined, tr: DriftTr): string {
  const st = statesOf(dot), s = typeof (dot as { s?: unknown } | undefined)?.s === 'string' ? dot!.s : '';
  // An unknown or unreadable primary state reads as idle (the fallback the caption promises), never as a raw key.
  const key = (STATE_KEYS as readonly string[]).includes(s) ? (s as typeof STATE_KEYS[number]) : 'idle';
  const base = tr(IDLE_STRINGS[key]);
  // Background only in `also`: without this the caption says "waiting for you" while a sub-agent is still working. 'running' + background
  // is left as "working" (background tasks are implied by a busy chat), and a primary 'background' already says it.
  return key !== 'running' && key !== 'background' && st.slice(s ? 1 : 0).includes('background') ? tr(IDLE_STRINGS.withBackground, base) : base;
}

/** Cuts a title to MAX_TITLE code points, not UTF-16 units: slicing units can split an emoji's surrogate pair and leave a broken glyph. */
export function cutTitle(title: string): string {
  const chars = Array.from(String(title ?? ''));
  // Over the limit: keep MAX_TITLE - 1 code points and mark the cut with an ellipsis, so the result is exactly MAX_TITLE long.
  return chars.length > MAX_TITLE ? chars.slice(0, MAX_TITLE - 1).join('') + '…' : chars.join('');
}

/** The caption text: "<title> — <state>" plus "· N other chats working"; '' when there is nothing to say (no followed chat and no others working). `tr` localizes (default: English). */
export function idleText(i: IdleInfo, tr: DriftTr = fillPlain): string {
  const others = i.others > 0 ? (i.others === 1 ? tr(IDLE_STRINGS.otherOne) : tr(IDLE_STRINGS.otherMany, i.others)) : '';
  const title = cutTitle(i.title);
  // No followed chat: only the busy-chats hint can be said, without the leading separator.
  if (!title) { return others; }
  const line = tr(IDLE_STRINGS.titled, title, stateText(i.dot, tr));
  return others ? tr(IDLE_STRINGS.withOthers, line, others) : line;
}

/** The 'idle' message the page gets: the caption text and, only while other chats work, the click label and the click-time text (both '' otherwise, which keeps the caption plain). */
export interface IdleMsg { type: 'idle'; text: string; go: string; looking: string }

/** Builds the idle message from what the host knows. The hint (and so the click target) exists only when `others` > 0. */
export function idleMsg(i: IdleInfo, tr: DriftTr = fillPlain): IdleMsg {
  const click = i.others > 0; // the caption is a button only when it names other working chats
  return { type: 'idle', text: idleText(i, tr), go: click ? tr(IDLE_STRINGS.focusOther) : '', looking: click ? tr(IDLE_STRINGS.looking) : '' };
}

/**
 * The ordering rules between the chat-switch reset and the idle caption, kept out of activity.ts (which needs vscode) so the node
 * checks can drive them. `shown` is the chat the page currently shows; `sig` the last idle message sent, so an unchanged one is not re-sent.
 */
export class IdleGate {
  shown = '';
  private sig = '';

  /** A poll tick for chat `cur`: a switch of chat first resets the page (and forgets the sent caption, which the page drops on reset), then the idle message follows. */
  poke(cur: string, msg: () => IdleMsg, keepPills: boolean): unknown[] {
    const out: unknown[] = [];
    // A new chat: the page still shows the old one, so it must be reset before any caption for the new one arrives.
    if (cur !== this.shown) { this.shown = cur; this.sig = ''; out.push({ type: 'reset', keepPills }); }
    const m = this.fresh(msg());
    if (m) { out.push(m); } // undefined = same caption as last sent: nothing to add after a possible reset
    return out;
  }

  /**
   * Dots changed: the idle message for `cur`, unless a chat switch is pending (the page still shows the old chat). Sending it then would
   * flash the new chat's text over the old chat's diagram, and the reset that follows would wipe it anyway; poke() does reset-then-idle.
   */
  idle(cur: string, msg: () => IdleMsg): unknown[] {
    if (cur !== this.shown) { return []; }
    const m = this.fresh(msg());
    return m ? [m] : []; // unchanged caption: nothing to send
  }

  /** The page was (or will be) fully reset by someone else: start over, so the next poke resets and re-sends. */
  forget(): void { this.shown = ''; this.sig = ''; }

  /** The message if it differs from the last one sent, else undefined (no re-render for an unchanged caption). */
  private fresh(m: IdleMsg): IdleMsg | undefined {
    const sig = JSON.stringify(m);
    if (sig === this.sig) { return undefined; }
    this.sig = sig;
    return m;
  }
}

/**
 * Session titles for chats that have no open tab (the tab title is the only synchronous source). Each id is looked up through `fetch`
 * (the worker index, async) and cached; `onTitle` fires when a new or changed title arrives so the caption can be re-sent.
 * - A hit older than `ttlMs` is still returned but refreshed in the background: the index title can change (a rename, the auto-titler).
 * - `set` writes a title the host learned directly (the auto-titler's rename) and `set(id, '')` drops it, so a rename shows at once.
 * - A lookup that fails or finds no title (e.g. a brand-new chat the index has not read yet) is retried at most once per `retryMs`, so a
 *   poll every 250 ms never turns into a worker request every 250 ms.
 * - `prune(keep)` forgets every other id, so the maps hold only the chats the host still cares about instead of every chat ever seen.
 */
export class TitleCache {
  // id -> title and when it was learned; `at` drives the ttlMs refresh, so a renamed chat does not keep its first title forever.
  private readonly got = new Map<string, { title: string; at: number }>();
  // ids with a lookup in flight: get() runs on every poll, and without this each poll would start another request for the same id.
  private readonly busy = new Set<string>();
  // id -> time of the last lookup that found no title or failed, so such an id waits retryMs before the next request.
  private readonly missAt = new Map<string, number>();

  constructor(private readonly fetch: (id: string) => Promise<string | undefined>, private readonly onTitle: (id: string) => void,
    private readonly retryMs = 30000, private readonly now: () => number = Date.now, private readonly ttlMs = 300000) {}

  /** The cached title of `id`, or '' while unknown (which starts a lookup unless one is in flight or a recent one missed). */
  get(id: string): string {
    // No followed chat: there is nothing to look up, and an empty id must never reach the worker.
    if (!id) { return ''; }
    const hit = this.got.get(id);
    // A cached title is shown right away; once it is older than ttlMs a background lookup refreshes it (the old one stays until then).
    if (hit) {
      if (this.now() - hit.at >= this.ttlMs) { this.load(id); }
      return hit.title;
    }
    this.load(id);
    return '';
  }

  /** A title the host learned without asking (the auto-titler renamed the chat): cached as fresh. An empty title drops the entry so the next get looks it up. */
  set(id: string, title: string): void {
    // An empty id has no entry to write.
    if (!id) { return; }
    // A real title replaces the cached one; an empty one means "unknown again", so the entry goes and get() fetches anew.
    if (title) { this.got.set(id, { title, at: this.now() }); } else { this.got.delete(id); }
    this.missAt.delete(id); // a known (or freshly invalidated) title ends any miss back-off
  }

  /** Forgets every id not in `keep` (the live chats plus the followed one), so the cache stays the size of what is on screen. */
  prune(keep: Iterable<string>): void {
    const k = new Set(keep);
    for (const id of [...this.got.keys()]) { if (!k.has(id)) { this.got.delete(id); } } // a chat that is gone needs no title
    for (const id of [...this.missAt.keys()]) { if (!k.has(id)) { this.missAt.delete(id); } } // nor its back-off time
    // `busy` is left alone: it empties itself when each lookup ends, and dropping an id there would let a second request start meanwhile.
  }

  /** Starts one lookup for `id`, unless one is already running or the last one missed less than `retryMs` ago. */
  private load(id: string): void {
    const missed = this.missAt.get(id);
    // In flight already, or missed too recently: no second request (see busy / missAt).
    if (this.busy.has(id) || (missed !== undefined && this.now() - missed < this.retryMs)) { return; }
    this.busy.add(id);
    const miss = (): void => { this.missAt.set(id, this.now()); };
    void this.fetch(id).then((title) => {
      // Only a real title is cached; an empty answer is a miss (a stale hit is kept and shown until a later refresh finds one).
      if (typeof title === 'string' && title) {
        const was = this.got.get(id)?.title;
        this.got.set(id, { title, at: this.now() });
        this.missAt.delete(id);
        // Announce only a new or changed title: a TTL refresh that finds the same title must not re-send the caption.
        if (was !== title) { this.onTitle(id); }
      } else { miss(); }
    }, miss).finally(() => { this.busy.delete(id); });
  }
}
