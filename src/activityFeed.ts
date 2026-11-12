/** Reads the new lines of the current chat's log and reports which Activity groups they light up. */
import * as fs from 'fs';
import { BgTracker } from './bgAgents';
import * as path from 'path';
import { ActivityEvent, Group, eventsOf, subEventsOf } from './activityMap';
import { projectsRoot } from './files';

const MAX_CHUNK = 4 * 1024 * 1024; // bytes read per check; a bigger gap is read from its tail, since only new messages flash

const SUB_FRESH_MS = 3 * 60 * 1000, SUB_MAX = 8, SUB_SCAN_MS = 2000; // only sub-agent logs written in the last 3 minutes are tailed, at most 8 of them

/** Complete lines of `tail + buf`, split on the byte 0x0a so a multi-byte character cut by a read is never broken; the unfinished last line is the new tail. */
function splitLines(tail: Buffer, buf: Buffer): { lines: string[]; tail: Buffer } {
  const all = Buffer.concat([tail, buf]), lines: string[] = [];
  let at = 0, nl: number;
  while ((nl = all.indexOf(10, at)) >= 0) { lines.push(all.toString('utf8', at, nl)); at = nl + 1; }
  return { lines, tail: all.subarray(at) };
}

export const REFRESH_MS = { def: 250, min: 100, max: 2000 };
/** The `activity.refreshMs` setting as a usable interval: a number clamped to 100..2000, else 250. */
export const refreshMsOf = (raw: unknown): number => typeof raw === 'number' && Number.isFinite(raw) ? Math.min(REFRESH_MS.max, Math.max(REFRESH_MS.min, Math.round(raw))) : REFRESH_MS.def;

export class ActivityFeed {
  private id = '';
  private size = 0;
  private tail: Buffer = Buffer.alloc(0);
  private missing?: { id: string; at: number; look: number }; // chat whose log was not found, when that was first seen, and when it was last looked for
  private gen = 0; // bumped by mark() and by a change of chat: a check started under an older value writes no state and flashes nothing
  private reqId = '';
  private subs = new Map<string, { size: number; mtime: number; tail: Buffer }>(); // sub-agent logs of the open chat being tailed
  private subGen = -1;
  private subSince = 0;
  private subScan = 0;
  private readonly pending = new Map<string, Group>(); // calls in flight: tool call id to group, so a failed result finds its node; cleared with the position
  private readonly files = new BgTracker(projectsRoot());

  /** `lookGapMs`: the least time between searches of the projects folder for a log that does not exist yet. */
  constructor(private readonly lookGapMs = 2000, private readonly scanGapMs = SUB_SCAN_MS) {}

  /** Forget the position: the next check only marks the end of the log, so nothing that arrived meanwhile flashes. */
  mark(): void { this.gen++; this.id = ''; this.size = 0; this.tail = Buffer.alloc(0); this.missing = undefined; this.pending.clear(); }

  /** New events (flashes, captions, busy and waiting states) of the chat `id` since the last call. The first call for a chat (open or switch) only marks its end, so nothing replays. */
  async check(id: string): Promise<ActivityEvent[]> {
    if (id !== this.reqId) { this.reqId = id; this.gen++; }
    const [main, sub] = await Promise.all([this.checkMain(id), this.checkSubs(id, this.gen)]);
    return main.concat(sub);
  }

  /** Tool calls and messages of the chat's sub-agents since the last call. Every log found is registered: one born before the first look (or with an unknown birth time) is marked at its end, a later one is read from its start. A folder scan (readdir, stat) runs at most every 2 s; each call only re-stats the recently written, at most 8. */
  private async checkSubs(id: string, gen: number): Promise<ActivityEvent[]> {
    const first = this.subGen !== gen, now = Date.now();
    if (first) { this.subGen = gen; this.subs = new Map(); this.subSince = now; this.subScan = 0; }
    if (!id) { return []; }
    const file = await this.files.fileOf(id);
    if (!file || gen !== this.gen) { return []; }
    const dir = path.join(path.dirname(file), id, 'subagents');
    if (first || now - this.subScan >= this.scanGapMs) {
      this.subScan = now;
      let names: string[] = [];
      try { names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.jsonl')); } catch { /* no sub-agents yet */ }
      const have = new Set(names.map((n) => path.join(dir, n)));
      for (const f of this.subs.keys()) { if (!have.has(f)) { this.subs.delete(f); } }
      for (const f of have) {
        try {
          const st = await fs.promises.stat(f), t = this.subs.get(f);
          if (t) { t.mtime = st.mtimeMs; }
          else { this.subs.set(f, { size: first || !(st.birthtimeMs > 0) || st.birthtimeMs < this.subSince ? st.size : 0, mtime: st.mtimeMs, tail: Buffer.alloc(0) }); }
        } catch { /* gone or unreadable: skipped this time */ }
      }
      if (gen !== this.gen) { return []; }
    }
    const fresh = [...this.subs].filter(([, t]) => now - t.mtime < SUB_FRESH_MS).sort((x, y) => y[1].mtime - x[1].mtime).slice(0, SUB_MAX);
    const out: ActivityEvent[] = [];
    for (const [f, t] of fresh) {
      try {
        const st = await fs.promises.stat(f);
        t.mtime = st.mtimeMs;
        if (st.size < t.size) { t.size = 0; t.tail = Buffer.alloc(0); }
        if (st.size === t.size) { continue; }
        const from = Math.max(t.size, st.size - MAX_CHUNK), buf = Buffer.alloc(st.size - from);
        const fh = await fs.promises.open(f, 'r');
        try { await fh.read(buf, 0, buf.length, from); } finally { await fh.close(); }
        if (gen !== this.gen) { return []; }
        const r = splitLines(from > t.size ? Buffer.alloc(0) : t.tail, buf);
        t.size = st.size; t.tail = r.tail;
        r.lines.forEach((l) => out.push(...subEventsOf(l)));
      } catch { /* this log only: the others still count */ }
    }
    return out.filter((e, i) => !(i && JSON.stringify(e) === JSON.stringify(out[i - 1]))); // identical neighbours flash once
  }

  private async checkMain(id: string): Promise<ActivityEvent[]> {
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
      if (st && id !== this.id && this.missing?.id === id && (st.birthtimeMs || st.ctimeMs) >= this.missing.at) { this.id = id; this.size = 0; this.tail = Buffer.alloc(0); this.pending.clear(); } // born after we first looked: its first messages are new
      else if (!file || id !== this.id || size < this.size) { this.id = id; this.size = size; this.tail = Buffer.alloc(0); this.missing = undefined; this.pending.clear(); return []; }
      this.missing = undefined;
      if (!file) { return []; }
      if (size === this.size) { return []; }
      const from = Math.max(this.size, size - MAX_CHUNK), buf = Buffer.alloc(size - from);
      const fh = await fs.promises.open(file, 'r');
      try { await fh.read(buf, 0, buf.length, from); } finally { await fh.close(); }
      if (gen !== this.gen) { return []; }
      const r = splitLines(from > this.size ? Buffer.alloc(0) : this.tail, buf);
      this.size = size;
      this.tail = r.tail; // an unfinished last line waits for the next read
      return r.lines.flatMap((l) => eventsOf(l, this.pending));
    } catch { return []; }
  }
}
