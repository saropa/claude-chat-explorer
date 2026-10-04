import * as fs from 'fs';
import * as path from 'path';

export const LOCK = 'store.lock';
const PRIV = /^store-v\d+-p(\d+)-/;

/** True when a process with this pid exists (EPERM means it exists but is not ours). */
export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Owner pid encoded in a private store file name; undefined for shared store files. */
export const privatePid = (name: string): number | undefined => {
  const m = PRIV.exec(name);
  return m ? Number(m[1]) : undefined;
};

/** Pid in a lock file; 0 when unreadable. */
function holder(file: string): number {
  try { return Number(fs.readFileSync(file, 'utf8').trim()) || 0; } catch { return 0; }
}

/** Take the exclusive lock (wx); a lock of a dead pid, or of this host's earlier worker, is replaced once. */
export function acquireLock(dir: string): boolean {
  const file = path.join(dir, LOCK);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') { throw e; }
      const pid = holder(file);
      if (pid && pid !== process.pid && pidAlive(pid)) { return false; }
      try { fs.rmSync(file, { force: true }); } catch { return false; }
    }
  }
  return false;
}

/** Release the lock only when this process holds it. */
export function releaseLock(dir: string): void {
  const file = path.join(dir, LOCK);
  try { if (holder(file) === process.pid) { fs.rmSync(file, { force: true }); } } catch { /* best effort */ }
}
