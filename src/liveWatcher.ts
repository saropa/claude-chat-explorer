/** Polls Claude Code's session files in the extension host and keeps the dot map and the unread set current. */
import { buildDots, DotMap, LiveStatus, nextUnread, openSet, pidAlive, readLive } from './liveState';
import { psParents, WinInfo, windowsOf, WinMark } from './windowMarker';

export const POLL_MS = 30000;
const POKE_MIN_MS = 2000;

export interface WatchHost {
  dir: string;
  unread(): Set<string>;
  saveUnread(s: Set<string>): void;
  tabs?(): Promise<{ ids: string[]; hash: string } | undefined>; // ids of Claude's open tabs; undefined when unreadable
  onChange(): void; // the dot map changed
  onLive?(live: Iterable<string>): void; // a poll finished: ids of live sessions
  log(msg: string): void;
}

export class LiveWatcher {
  dots: DotMap = {};
  private prev?: Map<string, LiveStatus>; // in memory only, so a restart marks nothing unread
  private live = new Map<string, LiveStatus>();
  private win = new Map<string, WinMark>();
  info: WinInfo = { hostPid: process.pid, ps: false, sessions: 0, here: 0, other: 0, parents: [] }; // last poll, for Show Diagnostics
  tabIds = new Set<string>(); // last good tab list
  tabHash = ''; // state.vscdb workspace hash it came from
  private timer?: NodeJS.Timeout;
  private running = false;
  private at = 0;
  private warned = false;
  private sig = '{}';

  constructor(private readonly h: WatchHost, private readonly alive: (pid: number) => boolean = pidAlive,
    private readonly parents: () => Promise<Map<number, number> | undefined> = psParents, private readonly hostPid: number = process.pid) {}

  start(): void {
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, POLL_MS);
  }

  /** The panel became visible: poll now unless one ran in the last 2 seconds. */
  poke(): void { if (Date.now() - this.at >= POKE_MIN_MS) { void this.poll(); } }

  async poll(): Promise<void> {
    if (this.running) { return; }
    this.running = true;
    this.at = Date.now();
    try {
      const r = await readLive(this.h.dir, this.alive);
      if (!this.warned && (r.bad || !r.exists)) {
        this.warned = true;
        this.h.log(r.exists ? `Skipped ${r.bad} unreadable agent session file(s)` : 'Agent sessions folder not found: dots show idle');
      }
      await this.markWindows(r.pids, r.live.size);
      await this.readTabs();
      const was = this.h.unread(), un = nextUnread(this.prev, r.live, was, openSet(r.live, this.tabIds));
      this.prev = this.live = r.live;
      if (un.size !== was.size || [...un].some((id) => !was.has(id))) { this.h.saveUnread(un); }
      this.rebuild();
      this.h.onLive?.(r.live.keys());
    } catch (e) { this.h.log('live state: ' + String(e)); }
    finally { this.running = false; }
  }

  /** Read the tab list; a failure keeps the last good set. */
  private async readTabs(): Promise<void> {
    try {
      const t = await this.h.tabs?.();
      if (t) { this.tabIds = new Set(t.ids); this.tabHash = t.hash; }
    } catch { /* keep the last good set */ }
  }

  /** One ps call per poll: which window each live session is open in (nothing marked when ps is unavailable). */
  private async markWindows(pids: Map<string, number[]>, sessions: number): Promise<void> {
    const par = await this.parents();
    const w = par ? windowsOf(pids, par, this.hostPid) : undefined;
    this.win = w?.marks ?? new Map();
    this.info = w?.info ?? { hostPid: this.hostPid, ps: false, sessions, here: 0, other: 0, parents: [] };
  }

  /** Recompute the dot map (after a poll or a change to the unread set) and announce a change. */
  rebuild(): void {
    this.dots = buildDots(this.live, this.h.unread(), this.win, this.tabIds);
    const sig = JSON.stringify(this.dots);
    if (sig !== this.sig) { this.sig = sig; this.h.onChange(); }
  }

  dispose(): void { clearInterval(this.timer); }
}
