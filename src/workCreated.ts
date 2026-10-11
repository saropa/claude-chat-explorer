/** When each local branch was created: the first line of its reflog file (`<git dir>/logs/refs/heads/<branch>`), read as a plain file (no git command).
 *  Only a line that says `branch: Created` counts; a branch whose reflog expired or was never written has no creation time (0). */
import * as fs from 'fs';
import * as path from 'path';

const MAX_READ = 1024;
const SLOTS = 8;
const LINE = /^[0-9a-f]+ [0-9a-f]+ .*? (\d{9,11}) [+-]\d{4}\tbranch: Created/;

/** Unix seconds from the first reflog line, or 0. */
export function createdOfLine(line: string): number {
  const m = LINE.exec(line);
  return m ? Number(m[1]) : 0;
}

async function firstLine(file: string): Promise<string> {
  let fh: fs.promises.FileHandle | undefined;
  try {
    fh = await fs.promises.open(file, 'r');
    const b = Buffer.allocUnsafe(MAX_READ);
    const { bytesRead } = await fh.read(b, 0, MAX_READ, 0);
    return b.toString('utf8', 0, bytesRead).split('\n')[0];
  } catch { return ''; } finally { await fh?.close().catch(() => undefined); }
}

/** Creation time (unix seconds, 0 when unknown) of each named branch; at most SLOTS files are open at once. */
export async function createdOf(common: string, names: string[], signal?: AbortSignal): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const base = path.join(common, 'logs', 'refs', 'heads');
  let i = 0;
  const worker = async (): Promise<void> => {
    for (; !signal?.aborted && i < names.length;) {
      const n = names[i++];
      if (!n || n.startsWith('-') || n.split('/').some((s) => !s || s === '.' || s === '..')) { continue; }
      const t = createdOfLine(await firstLine(path.join(base, ...n.split('/'))));
      if (t) { out.set(n, t); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SLOTS, names.length) }, worker));
  return out;
}
