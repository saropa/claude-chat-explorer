/** Background agents and shells of a live chat, read from its transcript: a launch with no finish notice yet. */
import * as fs from 'fs';
import * as path from 'path';

const MAX_CHUNK = 8 * 1024 * 1024; // bytes read per poll per chat; a bigger gap is read over later polls
const LAUNCH_ID = /"toolUseResult":\{.*?"(?:agentId|backgroundTaskId)":"(\w+)"/;
const IS_LAUNCH = /"status":"async_launched"|"backgroundTaskId":"/;

interface Track { size: number; open: Set<string>; tail: string; }

/** Task ids launched in the background and not yet finished, per transcript; read incrementally so a poll only reads new bytes. */
export class BgTracker {
  private readonly tracks = new Map<string, Track>();
  private readonly files = new Map<string, string>();

  constructor(private readonly root: string) {}

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

  /** Task ids launched and not finished in one transcript. */
  async scan(file: string): Promise<Set<string>> {
    let t = this.tracks.get(file);
    try {
      const size = (await fs.promises.stat(file)).size;
      if (!t || size < t.size) { t = { size: 0, open: new Set(), tail: '' }; this.tracks.set(file, t); } // new or rewritten file: read from the start
      if (size === t.size) { return t.open; }
      const len = Math.min(size - t.size, MAX_CHUNK), buf = Buffer.alloc(len);
      const fh = await fs.promises.open(file, 'r');
      try { await fh.read(buf, 0, len, t.size); } finally { await fh.close(); }
      t.size += len;
      const lines = (t.tail + buf.toString('utf8')).split('\n');
      t.tail = lines.pop() ?? ''; // an unfinished last line waits for the next read
      lines.forEach((l) => feed(t!.open, l));
    } catch { /* unreadable: keep what was known */ }
    return t?.open ?? new Set();
  }
}

/** Apply one transcript line: a launch adds its task id, a task-notification removes the ids it names. */
export function feed(open: Set<string>, line: string): void {
  if (line.includes('<task-notification>')) {
    for (const m of line.matchAll(/<task-id>(\w+)<\/task-id>/g)) { open.delete(m[1]); }
    return;
  }
  if (line.includes('"toolUseResult"') && IS_LAUNCH.test(line)) {
    const m = LAUNCH_ID.exec(line);
    if (m) { open.add(m[1]); }
  }
}
