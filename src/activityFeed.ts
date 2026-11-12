/** Reads the new lines of the current chat's log and reports which Activity groups they light up. */
import * as fs from 'fs';
import { BgTracker } from './bgAgents';
import { ActivityEvent, Group, eventsOf } from './activityMap';
import { projectsRoot } from './files';

const MAX_CHUNK = 4 * 1024 * 1024; // bytes read per check; a bigger gap is read from its tail, since only new messages flash

export const REFRESH_MS = { def: 250, min: 100, max: 2000 };
/** The `activity.refreshMs` setting as a usable interval: a number clamped to 100..2000, else 250. */
export const refreshMsOf = (raw: unknown): number => typeof raw === 'number' && Number.isFinite(raw) ? Math.min(REFRESH_MS.max, Math.max(REFRESH_MS.min, Math.round(raw))) : REFRESH_MS.def;

export class ActivityFeed {
  private id = '';
  private size = 0;
  private tail = '';
  private missing?: { id: string; at: number; look: number }; // chat whose log was not found, when that was first seen, and when it was last looked for
  private gen = 0; // bumped by mark() and by a change of chat: a check started under an older value writes no state and flashes nothing
  private reqId = '';
  private readonly pending = new Map<string, Group>(); // calls in flight: tool call id to group, so a failed result finds its node; cleared with the position
  private readonly files = new BgTracker(projectsRoot());

  /** `lookGapMs`: the least time between searches of the projects folder for a log that does not exist yet. */
  constructor(private readonly lookGapMs = 2000) {}

  /** Forget the position: the next check only marks the end of the log, so nothing that arrived meanwhile flashes. */
  mark(): void { this.gen++; this.id = ''; this.size = 0; this.tail = ''; this.missing = undefined; this.pending.clear(); }

  /** New events (flashes, captions, busy and waiting states) of the chat `id` since the last call. The first call for a chat (open or switch) only marks its end, so nothing replays. */
  async check(id: string): Promise<ActivityEvent[]> {
    if (id !== this.reqId) { this.reqId = id; this.gen++; }
    const gen = this.gen;
    if (id && this.missing?.id === id && Date.now() - this.missing.look < this.lookGapMs) { return []; } // a missing log is searched for only now and then
    const file = id ? await this.files.fileOf(id) : undefined;
    if (gen !== this.gen) { return []; }
    if (id && !file) { // log not found (yet): keep the state, so it is not read from the start when it appears
      const now = Date.now();
      if (this.missing?.id !== id) { this.missing = { id, at: now, look: now }; } else { this.missing.look = now; }
      return [];
    }
    try {
      const st = file ? await fs.promises.stat(file) : undefined, size = st?.size ?? 0;
      if (gen !== this.gen) { return []; }
      if (st && id !== this.id && this.missing?.id === id && (st.birthtimeMs || st.ctimeMs) >= this.missing.at) { this.id = id; this.size = 0; this.tail = ''; this.pending.clear(); } // born after we first looked: its first messages are new
      else if (!file || id !== this.id || size < this.size) { this.id = id; this.size = size; this.tail = ''; this.missing = undefined; this.pending.clear(); return []; }
      this.missing = undefined;
      if (!file) { return []; }
      if (size === this.size) { return []; }
      const from = Math.max(this.size, size - MAX_CHUNK), buf = Buffer.alloc(size - from);
      const fh = await fs.promises.open(file, 'r');
      try { await fh.read(buf, 0, buf.length, from); } finally { await fh.close(); }
      if (gen !== this.gen) { return []; }
      const lines = ((from > this.size ? '' : this.tail) + buf.toString('utf8')).split('\n');
      this.size = size;
      this.tail = lines.pop() ?? ''; // an unfinished last line waits for the next read
      return lines.flatMap((l) => eventsOf(l, this.pending));
    } catch { return []; }
  }
}
