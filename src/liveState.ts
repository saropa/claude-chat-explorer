/** Live state of Claude Code sessions from its own session files, and the dot state derived from it. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isSessionId } from './sessionId';

export type LiveStatus = 'busy' | 'waiting' | 'idle';
/** Dot of one chat: s is running, waiting, unread or idle; ring means a live process has it open. */
export interface Dot { s: string; ring: boolean; }
export type DotMap = { [id: string]: Dot };
export interface LiveRead { exists: boolean; live: Map<string, LiveStatus>; bad: number; }

const MAX_FILE_BYTES = 65536;
const RANK: { [k: string]: number } = { idle: 0, busy: 1, waiting: 2 };

export const sessionsDir = (): string => path.join(os.homedir(), '.claude', 'sessions');

/** True when the process exists (EPERM means it exists but belongs to someone else). */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 2) { return false; }
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

const statusOf = (v: unknown): LiveStatus => (v === 'busy' || v === 'waiting' ? v : 'idle');

/** One session file as {id, pid, status}; undefined when unreadable or missing the needed fields. */
async function readOne(file: string, name: string): Promise<{ id: string; pid: number; status: LiveStatus } | undefined> {
  try {
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) { return undefined; }
    const j = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    const pid = typeof j.pid === 'number' ? j.pid : parseInt(name, 10);
    return isSessionId(j.sessionId) ? { id: j.sessionId, pid, status: statusOf(j.status) } : undefined;
  } catch { return undefined; }
}

/** Sessions whose process is alive, with their status; the busiest status wins when a session has several files. */
export async function readLive(dir: string, alive: (pid: number) => boolean = pidAlive): Promise<LiveRead> {
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch { return { exists: false, live: new Map(), bad: 0 }; }
  const files = names.filter((n) => /^\d+\.json$/.test(n));
  const rows = await Promise.all(files.map((n) => readOne(path.join(dir, n), n)));
  const live = new Map<string, LiveStatus>();
  rows.forEach((r) => {
    if (!r || !alive(r.pid)) { return; }
    const was = live.get(r.id);
    if (!was || RANK[r.status] > RANK[was]) { live.set(r.id, r.status); }
  });
  return { exists: true, live, bad: rows.filter((r) => !r).length };
}

/** Unread set after a poll: a session seen busy or waiting that is now idle or gone becomes unread. No previous poll marks nothing. */
export function nextUnread(prev: Map<string, LiveStatus> | undefined, next: Map<string, LiveStatus>, unread: Set<string>): Set<string> {
  if (!prev) { return unread; }
  const out = new Set(unread);
  for (const [id, was] of prev) { if (was !== 'idle' && (next.get(id) ?? 'idle') === 'idle') { out.add(id); } }
  return out;
}

/** Dot of one chat from its live status (undefined when no live process) and unread flag. */
export function dotState(live: LiveStatus | undefined, unread: boolean): Dot {
  if (live === 'busy') { return { s: 'running', ring: false }; }
  if (live === 'waiting') { return { s: 'waiting', ring: false }; }
  return { s: unread ? 'unread' : 'idle', ring: live === 'idle' };
}

/** Dots that differ from the default (idle, solid); every other chat is idle. */
export function buildDots(live: Map<string, LiveStatus>, unread: Set<string>): DotMap {
  const out: DotMap = {};
  for (const id of new Set([...live.keys(), ...unread])) {
    const d = dotState(live.get(id), unread.has(id));
    if (d.s !== 'idle' || d.ring) { out[id] = d; }
  }
  return out;
}

/** Chat id to dot state name, for the worker (Active status and export). */
export function stateMap(dots: DotMap): { [id: string]: string } {
  const out: { [id: string]: string } = {};
  for (const id of Object.keys(dots)) { out[id] = dots[id].s; }
  return out;
}
