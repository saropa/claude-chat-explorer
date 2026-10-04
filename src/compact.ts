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

/** Copy every live record into a new store file and repoint the chats; returns the new store. */
export function compactStore(old: BlobStore, file: string, chats: Iterable<Chat>, cut: number): BlobStore {
  const next = new BlobStore(file);
  next.open();
  const moved: Array<[Chat, number, number]> = [];
  try {
    for (const c of chats) {
      let b = old.read(c.off, c.len);
      if (cut > 0) { b = pruneRec(b, cut); }
      moved.push([c, next.append(b), b.length]);
    }
  } catch (e) { next.close(); throw e; } // chats still point at the old store
  for (const [c, off, len] of moved) { c.off = off; c.len = len; }
  old.close();
  return next;
}
