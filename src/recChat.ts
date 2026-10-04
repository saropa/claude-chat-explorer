import * as fs from 'fs';
import * as path from 'path';
import { FORMAT, filesOf, Parsed, readHeader, RecHeader } from './record';
import { Chat, Rec } from './types';

export const emptyRec = (): Rec => ({ text: '', ts: [], ends: [], roles: [], cmds: [], lines: new Uint32Array(0) });
export const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;
export const quiet = (p: Promise<unknown>): Promise<void> => p.then(() => undefined, () => undefined);

export function chatOf(p: Parsed, rec: string): Chat {
  const h = p.h;
  const c: Chat = { id: h.id, dir: h.dir, mtime: h.mtime, size: h.size, title: h.title, last: h.last, first: h.first,
    count: h.count, files: filesOf(h), rec, len: p.bodyLen, bloom: p.bloom };
  if (h.parent) { c.parent = h.parent; c.agentType = h.agentType; c.desc = h.desc; }
  return c;
}

export function headerOf(c: Chat, src: string, cut: number): RecHeader {
  const h: RecHeader = { v: FORMAT, src, mtime: c.mtime, size: c.size, id: c.id, dir: c.dir, title: c.title, last: c.last,
    first: c.first, count: c.count, files: c.files.map((f) => [f.path, f.edited ? 1 : 0]), cut };
  if (c.parent) { h.parent = c.parent; h.agentType = c.agentType; h.desc = c.desc; }
  return h;
}

/** True while the source still has the stat the record was built from. */
export const unchanged = (t: { file: string; mtime: number; size: number }) => async (): Promise<boolean> => {
  try { const s = await fs.promises.stat(t.file); return s.mtimeMs === t.mtime && s.size === t.size; } catch { return false; }
};

const HEADER_READS = 32;

/** Read and verify every record header (32 in flight); a corrupt or truncated file is deleted. */
export async function readHeaders(dir: string, names: string[]): Promise<Array<{ p: Parsed; name: string }>> {
  const out: Array<{ p: Parsed; name: string }> = [];
  let next = 0;
  const reader = async () => {
    while (next < names.length) {
      const name = names[next++], f = path.join(dir, name);
      try { out.push({ p: await readHeader(f, name), name }); }
      catch (e) { if (code(e) !== 'ENOENT') { await quiet(fs.promises.unlink(f)); } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(HEADER_READS, names.length) }, reader));
  return out;
}
