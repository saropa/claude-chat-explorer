import * as fs from 'fs';
import * as path from 'path';
import { DIR_PREFIX, EXT, FORMAT } from './record';

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

/** Temp files, and record files that no current chat version names. Every delete ignores errors. */
async function sweepRecords(dir: string, keep: Set<string>, a: SweepAges): Promise<void> {
  for (const e of await list(dir)) {
    const f = path.join(dir, e.name);
    if (e.name.endsWith('.tmp')) { if (await old(f, a.tmp)) { await rm(f); } }
    else if (e.name.endsWith(EXT) && !keep.has(e.name) && await old(f, a.stale)) { await rm(f); }
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

/** Run every sweep. keep holds the record names that current chats use. */
export async function sweepAll(base: string, recDir: string, keep: Set<string>, a: SweepAges): Promise<void> {
  await sweepRecords(recDir, keep, a);
  await sweepLegacy(base, a);
}
