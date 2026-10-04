import { AsyncLocalStorage } from 'async_hooks';
import * as fs from 'fs';
import * as path from 'path';
import { code, DIR_PREFIX, EXT, FORMAT, isCorrupt, readHeader } from './record';

/** Minimum ages (ms) before a file is swept; injectable so checks can use 0. */
export interface SweepAges { tmp: number; stale: number; legacy: number; oldDir: number; }
export const DEFAULT_AGES: SweepAges = { tmp: 3600e3, stale: 600e3, legacy: 86400e3, oldDir: 7 * 86400e3 };
const LEGACY = /^(meta-v\d+\.bin|store-v.*\.bin|store\.lock|index-cache\.jsonl.*|.*\.tmp)$/;
const HEADER_READS = 16;
const OLD_DIR = new RegExp(`^${DIR_PREFIX}(\\d+)$`);

/** Receives each swallowed error of one sweepAll call (the caller reports once per distinct message). */
const reporter = new AsyncLocalStorage<(where: string, e: unknown) => void>();
const swallow = (where: string) => (e: unknown): undefined => { if (code(e) !== 'ENOENT') { reporter.getStore()?.(where, e); } return undefined; };

const mtimeOf = (f: string): Promise<number> => fs.promises.stat(f).then((s) => s.mtimeMs, (e) => swallow('sweep stat')(e) ?? 0);
const old = async (f: string, age: number): Promise<boolean> => { const t = await mtimeOf(f); return t > 0 && Date.now() - t >= age; };
const rm = (f: string, recursive = false): Promise<void> =>
  fs.promises.rm(f, { force: true, recursive }).then(() => undefined, swallow('sweep remove'));
const list = (d: string): Promise<fs.Dirent[]> => fs.promises.readdir(d, { withFileTypes: true }).catch((e) => swallow('sweep list')(e) ?? []);

/** True when the record is damaged, or its source is gone or no longer the version it was built from. An I/O error keeps it. */
async function superseded(root: string, name: string, f: string): Promise<boolean> {
  let h;
  try { h = (await readHeader(f, name)).h; } catch (e) { return isCorrupt(e); }
  try { const s = await fs.promises.stat(path.join(root, h.src)); return s.mtimeMs !== h.mtime || s.size !== h.size; }
  catch (e) { return code(e) === 'ENOENT' || code(e) === 'ENOTDIR'; }
}

/** Run fn over items with a bounded number in flight. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => { while (next < items.length) { await fn(items[next++]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

/** Temp files, and records whose source version is gone (headers read 16 at a time). Nothing is swept when the projects folder is missing. */
async function sweepRecords(dir: string, root: string, a: SweepAges): Promise<void> {
  const rootThere = await fs.promises.stat(root).then(() => true, () => false);
  await pool(await list(dir), HEADER_READS, async (e) => {
    const f = path.join(dir, e.name);
    if (e.name.endsWith('.tmp')) { if (await old(f, a.tmp)) { await rm(f); } }
    else if (rootThere && e.name.endsWith(EXT) && await old(f, a.stale) && await superseded(root, e.name, f)) { await rm(f); }
  });
}

/** True when something inside the folder (or the folder) changed less than age ms ago; stops at the first such file. */
async function hasYoung(d: string, age: number): Promise<boolean> {
  if (Date.now() - await mtimeOf(d) < age) { return true; }
  for (const e of await list(d)) {
    const f = path.join(d, e.name);
    if (e.isDirectory() ? await hasYoung(f, age) : Date.now() - await mtimeOf(f) < age) { return true; }
  }
  return false;
}

/** True when nothing inside the folder changed for at least age ms. */
const folderOld = async (d: string, age: number): Promise<boolean> => !(await hasYoung(d, age));

/** Legacy 0.4.x cache files and folders of older record formats; never a newer format. */
async function sweepLegacy(base: string, a: SweepAges): Promise<void> {
  for (const e of await list(base)) {
    const f = path.join(base, e.name), m = OLD_DIR.exec(e.name);
    if (e.isDirectory()) { if (m && Number(m[1]) < FORMAT && await folderOld(f, a.oldDir)) { await rm(f, true); } }
    else if (e.isFile() && LEGACY.test(e.name) && await old(f, a.legacy)) { await rm(f); }
  }
}

/** Run every sweep. root is the projects folder the records were built from. */
export async function sweepAll(base: string, recDir: string, root: string, a: SweepAges, log?: (where: string, e: unknown) => void): Promise<void> {
  await reporter.run(log ?? (() => undefined), async () => {
    await sweepRecords(recDir, root, a);
    await sweepLegacy(base, a);
  });
}
