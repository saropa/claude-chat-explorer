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
  if (!text) { return { ok: false, reason: `The key ${KEY} was not found in the database, so the agent has stored nothing there yet.` }; }
  let v: any;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: `The value stored under ${KEY} is not JSON.` }; }
  const list = v && typeof v === 'object' ? v.hiddenSessionIds : undefined;
  if (!Array.isArray(list)) { return { ok: false, reason: `The value stored under ${KEY} has no hiddenSessionIds list.` }; }
  return { ok: true, ids: [...new Set(list.filter(isSessionId))] };
}

/** Copy the database and its -wal and -shm files (when present) into a fresh temp folder; returns the copied database path. */
export function copyOut(db: string, tmp: string): string {
  const to = path.join(tmp, 'state.vscdb');
  fs.copyFileSync(db, to);
  for (const ext of ['-wal', '-shm']) {
    try { fs.copyFileSync(db + ext, to + ext); } catch { /* absent: nothing to copy */ }
  }
  return to;
}

type Run = (file: string, args: string[]) => Promise<string>;
export const runSqlite: Run = (file, args) => new Promise((resolve, reject) => {
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

export type TabsRead = { ok: true; ids: string[]; hash: string } | { ok: false; reason: string };

/** The open tab session ids in the query output (titles are truncated, so only ids are used). */
export function parseTabs(out: string): string[] | undefined {
  try {
    const list = JSON.parse(out.trim())?.panelTabSessions;
    if (!Array.isArray(list)) { return undefined; }
    return [...new Set(list.map((t: { sessionId?: unknown }) => t?.sessionId).filter(isSessionId))] as string[];
  } catch { return undefined; }
}

/** workspaceStorage folder of this VS Code build, from the global storage folder of an extension. */
export const workspaceStorageOf = (globalStorage: string): string => path.join(path.dirname(path.dirname(globalStorage)), 'workspaceStorage');

/** Workspace storage hashes whose workspace.json folder is one of the given folder paths, most recently modified state.vscdb first. */
export function hashesFor(root: string, folders: string[]): { all: string[]; match: string[] } {
  const all: { h: string; t: number }[] = [], match: { h: string; t: number }[] = [];
  const want = new Set(folders.map((f) => f.replace(/\/+$/, '')));
  let names: string[] = [];
  try { names = fs.readdirSync(root); } catch { return { all: [], match: [] }; }
  for (const h of names) {
    try {
      const t = fs.statSync(path.join(root, h, 'state.vscdb')).mtimeMs;
      all.push({ h, t });
      const j = JSON.parse(fs.readFileSync(path.join(root, h, 'workspace.json'), 'utf8'));
      const f = typeof j.folder === 'string' ? decodeURIComponent(j.folder.replace(/^file:\/\//, '')).replace(/\/+$/, '') : '';
      if (want.has(f)) { match.push({ h, t }); }
    } catch { /* not a usable workspace folder */ }
  }
  const by = (a: { t: number }, b: { t: number }) => b.t - a.t;
  return { all: all.sort(by).map((x) => x.h), match: match.sort(by).map((x) => x.h) };
}

async function tabsOf(db: string, run: Run): Promise<string[] | undefined> {
  let tmp = '';
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-tabs-'));
    return parseTabs(await run('sqlite3', ['-readonly', copyOut(db, tmp), SQL]));
  } catch { return undefined; } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
}

/** Open tab ids of Claude Code: the newest state.vscdb whose workspace is one of the folders, else the union over every workspace that has the key. Read-only, on temporary copies. */
export async function readTabs(root: string, folders: string[], run: Run = runSqlite): Promise<TabsRead> {
  const { all, match } = hashesFor(root, folders);
  const ids = new Set<string>(), used: string[] = [];
  for (const h of match.slice(0, 1)) {
    const r = await tabsOf(path.join(root, h, 'state.vscdb'), run);
    if (r) { r.forEach((i) => ids.add(i)); used.push(h); }
  }
  if (used.length) { return { ok: true, ids: [...ids], hash: used[0] }; }
  for (const h of all) {
    const r = await tabsOf(path.join(root, h, 'state.vscdb'), run);
    if (r) { r.forEach((i) => ids.add(i)); used.push(h); }
  }
  if (!used.length) { return { ok: false, reason: 'no workspace database has the agent tab list' }; }
  return { ok: true, ids: [...ids], hash: used.join(',') + ' (all)' };
}
