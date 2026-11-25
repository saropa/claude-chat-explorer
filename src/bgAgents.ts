/** Background agents and shells of a live chat, read from its transcript: a launch with no finish notice yet. */
import * as fs from 'fs';
import * as path from 'path';

const MAX_CHUNK = 8 * 1024 * 1024; // bytes read per poll per chat; a bigger gap is read over later polls
const LAUNCH_ID = /"toolUseResult":\{.*?"(agentId|backgroundTaskId)":"(\w+)"/;
/** What a background task is: an agent (launch carries `agentId`) or a shell command (launch carries `backgroundTaskId`). */
export type BgKind = 'shell' | 'agent';
const IS_LAUNCH = /"status":"async_launched"|"backgroundTaskId":"/;

/**
 * A task with no finish notice stops counting once BOTH its launch and the last write to its chat log are older than this. A finish notice can
 * be lost (the process was killed, the log was cut), and without a limit that task would show a glowing pill and a background dot forever.
 * Six hours is longer than any realistic test or build, so a genuinely running task is not dropped while its chat is idle; a chat that
 * writes again brings the pill back, since the rule needs the log itself to have been silent for the whole period.
 */
export const BG_STALE_MS = 6 * 60 * 60 * 1000;

/** A task that is still counted: its kind and the epoch ms of its launch (NaN when the launch line carried no timestamp). */
export interface BgTask { kind: BgKind; at: number; }

interface Track { size: number; mtime: number; open: Map<string, BgKind>; at: Map<string, number>; tail: string; }

/** Task ids (with their kind) launched in the background and not yet finished, per transcript; read incrementally so a poll only reads new bytes. */
export class BgTracker {
  private readonly tracks = new Map<string, Track>();
  private readonly files = new Map<string, string>();
  private drifted = false; // the drift notice goes out once, not on every poll

  /** `onDrift`: called once when a line looks like a launch but no task id can be read from it, so a changed log format is visible instead of silent. */
  constructor(private readonly root: string, private readonly onDrift?: () => void) {}

  /** Transcript path of a session id (searched once across the project folders, then cached). */
  async fileOf(id: string): Promise<string | undefined> {
    const hit = this.files.get(id);
    if (hit) { return hit; }
    let dirs: string[];
    try { dirs = await fs.promises.readdir(this.root); } catch { return undefined; }
    for (const d of dirs) {
      const f = path.join(this.root, d, id + '.jsonl');
      try { await fs.promises.access(f); this.files.set(id, f); return f; } catch { /* not in this folder */ }
    }
    return undefined;
  }

  /** Session ids (of the given ones) with at least one background task still running. */
  async running(ids: Iterable<string>): Promise<Set<string>> {
    const out = new Set<string>(), keep = new Set<string>();
    await Promise.all([...ids].map(async (id) => {
      const f = await this.fileOf(id);
      if (!f) { return; }
      keep.add(f);
      if ((await this.scan(f)).size) { out.add(id); }
    }));
    for (const f of [...this.tracks.keys()]) { if (!keep.has(f)) { this.tracks.delete(f); } } // a closed chat starts fresh if reopened
    return out;
  }

  /** Task ids launched and not finished in one transcript (kind per id), minus the stale ones (see BG_STALE_MS). */
  async scan(file: string): Promise<Map<string, BgKind>> {
    return new Map([...(await this.tasks(file))].map(([id, t]) => [id, t.kind]));
  }

  /** Like scan, with the launch time of each task, for the elapsed timer of the pills. */
  async tasks(file: string, now = Date.now()): Promise<Map<string, BgTask>> {
    const t = await this.read(file);
    const out = new Map<string, BgTask>();
    if (!t) { return out; }
    // The log counts as silent only when nothing was written for the whole limit; one write after a long pause revives the pill.
    const silent = now - t.mtime > BG_STALE_MS;
    for (const [id, kind] of t.open) {
      const at = t.at.get(id) ?? NaN;
      // A launch with no timestamp cannot be aged, so only the silent log decides for it.
      if (silent && (!Number.isFinite(at) || now - at > BG_STALE_MS)) { continue; }
      out.set(id, { kind, at });
    }
    return out;
  }

  /** Brings one transcript's track up to date by reading only the appended bytes. */
  private async read(file: string): Promise<Track | undefined> {
    let t = this.tracks.get(file);
    try {
      const st = await fs.promises.stat(file), size = st.size;
      if (!t || size < t.size) { t = { size: 0, mtime: 0, open: new Map(), at: new Map(), tail: '' }; this.tracks.set(file, t); } // new or rewritten file: read from the start
      t.mtime = st.mtimeMs;
      if (size === t.size) { return t; }
      const len = Math.min(size - t.size, MAX_CHUNK), buf = Buffer.alloc(len);
      const fh = await fs.promises.open(file, 'r');
      try { await fh.read(buf, 0, len, t.size); } finally { await fh.close(); }
      t.size += len;
      const lines = (t.tail + buf.toString('utf8')).split('\n');
      t.tail = lines.pop() ?? ''; // an unfinished last line waits for the next read
      lines.forEach((l) => feed(t!.open, l, t!.at, () => this.noteDrift()));
    } catch { /* unreadable: keep what was known */ }
    return t;
  }

  /** Reports a launch line whose task id could not be read, once. */
  private noteDrift(): void {
    if (this.drifted) { return; }
    this.drifted = true;
    this.onDrift?.();
  }
}

/**
 * Apply one transcript line: a launch adds its task id, a task-notification removes the ids it names.
 * `at` receives each launch's epoch ms (NaN without a usable timestamp); `onDrift` is called for a line that looks like a launch but has no readable id.
 */
export function feed(open: Map<string, BgKind>, line: string, at?: Map<string, number>, onDrift?: () => void): void {
  if (line.includes('<task-notification>')) {
    for (const m of line.matchAll(/<task-id>(\w+)<\/task-id>/g)) { open.delete(m[1]); at?.delete(m[1]); }
    return;
  }
  if (line.includes('"toolUseResult"') && IS_LAUNCH.test(line)) {
    const m = LAUNCH_ID.exec(line);
    if (m) {
      open.set(m[2], m[1] === 'agentId' ? 'agent' : 'shell'); // the key name tells agents from shells
      at?.set(m[2], launchTime(line));
    } else { onDrift?.(); }
  }
}

/** Epoch ms of a log line's own `timestamp`, or NaN. Parsed only for launches (rare), so the cost of a full JSON parse is paid a few times a session. */
function launchTime(line: string): number {
  try { return Date.parse(String((JSON.parse(line) as { timestamp?: unknown }).timestamp)); } catch { return NaN; }
}
