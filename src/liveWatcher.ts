/** Polls Claude Code's session files in the extension host and keeps the dot map and the unread set current. */
import { buildDots, DotMap, LiveStatus, nextUnread, pidAlive, readLive } from './liveState';

export const POLL_MS = 30000;
const POKE_MIN_MS = 2000;

export interface WatchHost {
  dir: string;
  unread(): Set<string>;
  saveUnread(s: Set<string>): void;
  onChange(): void; // the dot map changed
  log(msg: string): void;
}

export class LiveWatcher {
  dots: DotMap = {};
  private prev?: Map<string, LiveStatus>; // in memory only, so a restart marks nothing unread
  private live = new Map<string, LiveStatus>();
  private timer?: NodeJS.Timeout;
  private running = false;
  private at = 0;
  private warned = false;
  private sig = '{}';

  constructor(private readonly h: WatchHost, private readonly alive: (pid: number) => boolean = pidAlive) {}

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
        this.h.log(r.exists ? `Skipped ${r.bad} unreadable Claude session file(s)` : 'Claude sessions folder not found: dots show idle');
      }
      const was = this.h.unread(), un = nextUnread(this.prev, r.live, was);
      this.prev = this.live = r.live;
      if (un.size !== was.size) { this.h.saveUnread(un); }
      this.rebuild();
    } catch (e) { this.h.log('live state: ' + String(e)); }
    finally { this.running = false; }
  }

  /** Recompute the dot map (after a poll or a change to the unread set) and announce a change. */
  rebuild(): void {
    this.dots = buildDots(this.live, this.h.unread());
    const sig = JSON.stringify(this.dots);
    if (sig !== this.sig) { this.sig = sig; this.h.onChange(); }
  }

  dispose(): void { clearInterval(this.timer); }
}
