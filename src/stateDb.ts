/** One-time, read-only read of Claude Code's archived chat ids from VS Code's global state database. */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isSessionId } from './sessionId';

export type HiddenRead = { ok: true; ids: string[] } | { ok: false; reason: string };
export const KEY = 'Anthropic.claude-code';
export const SQL = `select value from ItemTable where key='${KEY}'`;
const TIMEOUT_MS = 5000;

/** The archived ids in the query output, or the reason there are none. */
export function parseHidden(out: string): HiddenRead {
  const text = out.trim();
  if (!text) { return { ok: false, reason: `The key ${KEY} was not found in the database, so Claude Code has stored nothing there yet.` }; }
  let v: any;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: `The value stored under ${KEY} is not JSON.` }; }
  const list = v && typeof v === 'object' ? v.hiddenSessionIds : undefined;
  if (!Array.isArray(list)) { return { ok: false, reason: `The value stored under ${KEY} has no hiddenSessionIds list.` }; }
  return { ok: true, ids: [...new Set(list.filter(isSessionId))] };
}

/** Copy the database and its -wal and -shm files (when present) into a fresh temp folder; returns the copied database path. */
function copyOut(db: string, tmp: string): string {
  const to = path.join(tmp, 'state.vscdb');
  fs.copyFileSync(db, to);
  for (const ext of ['-wal', '-shm']) {
    try { fs.copyFileSync(db + ext, to + ext); } catch { /* absent: nothing to copy */ }
  }
  return to;
}

type Run = (file: string, args: string[]) => Promise<string>;
const runSqlite: Run = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

/** Run the sqlite3 command-line tool read-only on a temporary copy; never touches the original, never uses a shell. */
export async function readHidden(db: string, run: Run = runSqlite): Promise<HiddenRead> {
  if (!fs.existsSync(db)) { return { ok: false, reason: `The database file ${db} does not exist.` }; }
  let tmp = '';
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-import-'));
    const out = await run('sqlite3', ['-readonly', copyOut(db, tmp), SQL]);
    return parseHidden(out);
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { killed?: boolean };
    if (err.code === 'ENOENT') { return { ok: false, reason: 'The sqlite3 command-line tool was not found on your PATH. Install it and try again.' }; }
    if (err.killed) { return { ok: false, reason: `The sqlite3 tool did not finish within ${TIMEOUT_MS / 1000} seconds.` }; }
    return { ok: false, reason: 'The sqlite3 tool failed: ' + String(err.message).split('\n')[0] };
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp folder cleanup is best effort */ } }
  }
}

/** The global state database of this VS Code build: the folder holding the per-extension storage folders. */
export const stateDbOf = (globalStorage: string): string => path.join(path.dirname(globalStorage), 'state.vscdb');
