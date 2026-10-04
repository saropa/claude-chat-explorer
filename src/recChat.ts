import * as fs from 'fs';
import * as path from 'path';
import { code, FORMAT, filesOf, isCorrupt, Parsed, quiet, readHeader, RecHeader } from './record';
import { Chat, Rec } from './types';

export const emptyRec = (): Rec => ({ text: '', ts: [], ends: [], roles: [], cmds: [], cmdAt: [], lines: new Uint32Array(0) });
export { code };

export function chatOf(p: Parsed, rec: string): Chat {
  const h = p.h;
  const c: Chat = { id: h.id, dir: h.dir, mtime: h.mtime, size: h.size, title: h.title, last: h.last, first: h.first,
    count: h.count, files: filesOf(h), rec, len: p.bodyLen, bloom: p.bloom };
  if (h.parent) { c.parent = h.parent; c.agentType = h.agentType; c.desc = h.desc; }
  if (h.cost) { c.cost = h.cost; }
  if (h.git) { c.git = h.git; }
  if (h.use) { c.use = h.use; }
  if (h.cwd) { c.cwd = h.cwd; }
  return c;
}

export function headerOf(c: Chat, src: string): RecHeader {
  const h: RecHeader = { v: FORMAT, src, mtime: c.mtime, size: c.size, id: c.id, dir: c.dir, title: c.title, last: c.last,
    first: c.first, count: c.count, files: c.files.map((f) => [f.path, f.edited ? 1 : 0]) };
  if (c.parent) { h.parent = c.parent; h.agentType = c.agentType; h.desc = c.desc; }
  if (c.cost) { h.cost = c.cost; }
  if (c.git) { h.git = c.git; }
  if (c.use) { h.use = c.use; }
  if (c.cwd) { h.cwd = c.cwd; }
  return h;
}

/** True while the source still has the stat the record was built from. */
export const unchanged = (t: { file: string; mtime: number; size: number }) => async (): Promise<boolean> => {
  try { const s = await fs.promises.stat(t.file); return s.mtimeMs === t.mtime && s.size === t.size; } catch { return false; }
};

const HEADER_READS = 32;

/** Read and verify every record header (32 in flight), handing each to accept at once. Only a corrupt file is deleted; an I/O error keeps it. */
export async function readHeaders(dir: string, names: string[], accept: (p: Parsed, name: string) => void): Promise<void> {
  let next = 0;
  const reader = async () => {
    while (next < names.length) {
      const name = names[next++], f = path.join(dir, name);
      try { accept(await readHeader(f, name), name); }
      catch (e) { if (isCorrupt(e)) { await quiet(fs.promises.unlink(f)); } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(HEADER_READS, names.length) }, reader));
}
