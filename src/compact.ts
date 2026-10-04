import * as fs from 'fs';
import { BlobStore, decodeRec, encodeRec, startOf } from './blob';
import { Chat } from './types';

/** Re-encode a record without messages older than cut. */
function pruneRec(b: Buffer, cut: number): Buffer {
  const r = decodeRec(b);
  const keep = r.ts.map((t, i) => i).filter((i) => r.ts[i] >= cut);
  return encodeRec({
    texts: keep.map((i) => r.text.slice(startOf(r, i), r.ends[i])), ts: keep.map((i) => r.ts[i]),
    roles: keep.map((i) => r.roles[i]), lines: keep.map((i) => r.lines[i]), cmds: r.cmds,
  });
}

const YIELD_MS = 8;

/** Result of a compaction: the new store, and chats whose record could not be read (dropped). */
export interface Compacted { store: BlobStore; bad: Chat[]; }

/** Copy one record; false when it is unreadable. */
function copyOne(old: BlobStore, next: BlobStore, c: Chat, cut: number, moved: Array<[Chat, number, number]>): boolean {
  try {
    let b = old.read(c.off, c.len);
    if (cut > 0) { b = pruneRec(b, cut); } else { decodeRec(b); } // validate before copying
    moved.push([c, next.append(b), b.length]);
    return true;
  } catch { return false; }
}

/**
 * Copy every live record into a new store file, yielding between chunks so searches keep running,
 * then repoint the chats (sync). On failure the new file is deleted and the error rethrown.
 */
export async function compactStore(old: BlobStore, file: string, chats: Iterable<Chat>, cut: number): Promise<Compacted> {
  const next = new BlobStore(file);
  const moved: Array<[Chat, number, number]> = [], bad: Chat[] = [];
  try {
    next.open();
    let lastYield = Date.now();
    for (const c of [...chats]) {
      if (!copyOne(old, next, c, cut, moved)) { bad.push(c); }
      if (Date.now() - lastYield > YIELD_MS) { await new Promise((r) => setImmediate(r)); lastYield = Date.now(); }
    }
    next.sync();
  } catch (e) {
    next.close();
    try { fs.rmSync(file, { force: true }); } catch { /* leftover is cleaned at next load */ }
    throw e;
  }
  for (const [c, off, len] of moved) { c.off = off; c.len = len; }
  old.close();
  return { store: next, bad };
}
