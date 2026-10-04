/** Which VS Code window a live Claude session belongs to: its parent process is the extension host of that window. */
import { execFile } from 'child_process';

export type WinMark = 'this' | 'other';
export const PS_TIMEOUT_MS = 3000;
const PS_LINE = /^\s*(\d+)\s+(\d+)\s*$/;

/** Parent process id of every process from `ps -A -o pid=,ppid=` output; malformed lines are skipped. */
export function parsePs(out: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const line of out.split('\n')) {
    const x = PS_LINE.exec(line);
    if (x) { m.set(Number(x[1]), Number(x[2])); }
  }
  return m;
}

/** One `ps` call (no shell, 3 second limit); undefined on Windows or when ps fails. */
export function psParents(): Promise<Map<number, number> | undefined> {
  if (process.platform === 'win32') { return Promise.resolve(undefined); }
  return new Promise((resolve) => {
    try {
      execFile('ps', ['-A', '-o', 'pid=,ppid='], { timeout: PS_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
        const m = err ? undefined : parsePs(String(stdout));
        resolve(m && m.size ? m : undefined);
      });
    } catch { resolve(undefined); }
  });
}

/** What one poll learned about windows, for the marker and for Show Diagnostics. */
export interface WinInfo { hostPid: number; ps: boolean; sessions: number; here: number; other: number; parents: number[]; }

/** Per session: this window when any of its processes has the host as parent, otherwise another window; sessions whose process is not in the ps list get no mark. */
export function windowsOf(pids: Map<string, number[]>, parents: Map<number, number>, host: number): { marks: Map<string, WinMark>; info: WinInfo } {
  const marks = new Map<string, WinMark>(), found = new Set<number>();
  for (const [id, list] of pids) {
    const ps = list.map((p) => parents.get(p)).filter((p): p is number => p !== undefined);
    ps.forEach((p) => found.add(p));
    if (ps.length) { marks.set(id, ps.includes(host) ? 'this' : 'other'); }
  }
  const here = [...marks.values()].filter((v) => v === 'this').length;
  return { marks, info: { hostPid: host, ps: true, sessions: pids.size, here, other: marks.size - here, parents: [...found].sort((a, b) => a - b) } };
}
