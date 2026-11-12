/** Reads the new lines of the current chat's log and reports which Activity groups they light up. */
import * as fs from 'fs';
import { BgTracker } from './bgAgents';
import { Flash, flashesOf } from './activityMap';
import { projectsRoot } from './files';

const MAX_CHUNK = 4 * 1024 * 1024; // bytes read per check; a bigger gap is read from its tail, since only new messages flash

export class ActivityFeed {
  private id = '';
  private size = 0;
  private tail = '';
  private missing?: { id: string; at: number }; // chat whose log was not found, and when that was first seen
  private readonly files = new BgTracker(projectsRoot());

  /** New flashes of the chat `id` since the last call. The first call for a chat (open or switch) only marks its end, so nothing replays. */
  async check(id: string): Promise<Flash[]> {
    const file = id ? await this.files.fileOf(id) : undefined;
    if (id && !file) { // log not found (yet): keep the state, so it is not read from the start when it appears
      if (this.missing?.id !== id) { this.missing = { id, at: Date.now() }; }
      return [];
    }
    try {
      const st = file ? await fs.promises.stat(file) : undefined, size = st?.size ?? 0;
      if (st && id !== this.id && this.missing?.id === id && (st.birthtimeMs || st.ctimeMs) >= this.missing.at) { this.id = id; this.size = 0; this.tail = ''; } // born after we first looked: its first messages are new
      else if (!file || id !== this.id || size < this.size) { this.id = id; this.size = size; this.tail = ''; this.missing = undefined; return []; }
      this.missing = undefined;
      if (!file) { return []; }
      if (size === this.size) { return []; }
      const from = Math.max(this.size, size - MAX_CHUNK), buf = Buffer.alloc(size - from);
      const fh = await fs.promises.open(file, 'r');
      try { await fh.read(buf, 0, buf.length, from); } finally { await fh.close(); }
      const lines = ((from > this.size ? '' : this.tail) + buf.toString('utf8')).split('\n');
      this.size = size;
      this.tail = lines.pop() ?? ''; // an unfinished last line waits for the next read
      return lines.flatMap(flashesOf);
    } catch { return []; }
  }
}
