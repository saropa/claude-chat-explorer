import * as fs from 'fs';
import * as path from 'path';
import { code, DIR_PREFIX, EXT, FORMAT, isCorrupt, readHeader } from './record';

/** Minimum ages (ms) before a file is swept; injectable so checks can use 0. */
export interface SweepAges { tmp: number; stale: number; legacy: number; oldDir: number; }
export const DEFAULT_AGES: SweepAges = { tmp: 3600e3, stale: 600e3, legacy: 86400e3, oldDir: 86400e3 };
const LEGACY = /^(meta-v\d+\.bin|store-v.*\.bin|store\.lock|index-cache\.jsonl.*|.*\.tmp)$/;
const OLD_DIR = new RegExp(`^${DIR_PREFIX}(\\d+)$`);

const old = async (f: string, age: number): Promise<boolean> => {
  try { return Date.now() - (await fs.promises.stat(f)).mtimeMs >= age; } catch { return false; }
};
const rm = (f: string, recursive = false): Promise<void> =>
  fs.promises.rm(f, { force: true, recursive }).then(() => undefined, () => undefined);
const list = (d: string): Promise<fs.Dirent[]> => fs.promises.readdir(d, { withFileTypes: true }).catch(() => []);

/** True when the record is damaged, or its source is gone or no longer the version it was built from. An I/O error keeps it. */
async function superseded(root: string, name: string, f: string): Promise<boolean> {
  let h;
  try { h = (await readHeader(f, name)).h; } catch (e) { return isCorrupt(e); }
  try { const s = await fs.promises.stat(path.join(root, h.src)); return s.mtimeMs !== h.mtime || s.size !== h.size; }
  catch (e) { return code(e) === 'ENOENT' || code(e) === 'ENOTDIR'; }
}

/** Temp files, and records whose source version is gone. Nothing is swept when the projects folder is missing. */
async function sweepRecords(dir: string, root: string, a: SweepAges): Promise<void> {
  const rootThere = await fs.promises.stat(root).then(() => true, () => false);
  for (const e of await list(dir)) {
    const f = path.join(dir, e.name);
    if (e.name.endsWith('.tmp')) { if (await old(f, a.tmp)) { await rm(f); } }
    else if (rootThere && e.name.endsWith(EXT) && await old(f, a.stale) && await superseded(root, e.name, f)) { await rm(f); }
  }
}

/** Legacy 0.4.x cache files and folders of older record formats; never a newer format. */
async function sweepLegacy(base: string, a: SweepAges): Promise<void> {
  for (const e of await list(base)) {
    const f = path.join(base, e.name), m = OLD_DIR.exec(e.name);
    if (e.isDirectory()) { if (m && Number(m[1]) < FORMAT && await old(f, a.oldDir)) { await rm(f, true); } }
    else if (e.isFile() && LEGACY.test(e.name) && await old(f, a.legacy)) { await rm(f); }
  }
}

/** Run every sweep. root is the projects folder the records were built from. */
export async function sweepAll(base: string, recDir: string, root: string, a: SweepAges): Promise<void> {
  await sweepRecords(recDir, root, a);
  await sweepLegacy(base, a);
}
