import * as fs from 'fs';
import { Chat } from './types';

export const VERSION = 3;
const MAGIC = 'CCS3';

export interface MetaHeader { v: number; store: string; pruned: boolean; garbage: number; }

type Row = [string, string, string, string, string, number, number, string, number, number, number,
  Array<[string, number]>, number, number];

function toRow(c: Chat): Row {
  return [c.id, c.dir, c.parent ?? '', c.agentType ?? '', c.desc ?? '', c.mtime, c.size, c.title, c.last,
    c.first, c.count, c.files.map((f) => [f.path, f.edited ? 1 : 0]), c.off, c.len];
}

function fromRow(r: Row, bloom: Uint8Array): Chat | undefined {
  if (!Array.isArray(r) || r.length !== 14 || typeof r[0] !== 'string' || !Array.isArray(r[11])) { return undefined; }
  const c: Chat = { id: r[0], dir: r[1], mtime: r[5], size: r[6], title: r[7], last: r[8], first: r[9], count: r[10],
    files: r[11].map(([path, e]) => ({ path, edited: e === 1 })), off: r[12], len: r[13], bloom };
  if (r[2]) { c.parent = r[2]; c.agentType = r[3] || undefined; c.desc = r[4] || undefined; }
  return c;
}

const u32 = (n: number): Buffer => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; };

/** Write the metadata file atomically: magic, header, then JSON row plus bloom bytes per chat. */
export async function saveMeta(file: string, head: MetaHeader, chats: Iterable<Chat>): Promise<void> {
  const parts: Buffer[] = [Buffer.from(MAGIC)];
  const put = (b: Buffer) => { parts.push(u32(b.length), b); };
  put(Buffer.from(JSON.stringify(head)));
  for (const c of chats) {
    put(Buffer.from(JSON.stringify(toRow(c))));
    put(Buffer.from(c.bloom.buffer, c.bloom.byteOffset, c.bloom.byteLength));
  }
  const tmp = file + '.tmp';
  try {
    await fs.promises.writeFile(tmp, Buffer.concat(parts));
    await fs.promises.rename(tmp, file);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

/** Read the metadata file; undefined when missing, corrupt or from another version. Blooms are views. */
export async function loadMeta(file: string): Promise<{ head: MetaHeader; chats: Chat[] } | undefined> {
  let b: Buffer;
  try { b = await fs.promises.readFile(file); } catch { return undefined; }
  if (b.length < 8 || b.toString('latin1', 0, 4) !== MAGIC) { return undefined; }
  let at = 4;
  const next = (): Buffer | undefined => {
    if (at + 4 > b.length) { return undefined; }
    const n = b.readUInt32LE(at);
    if (at + 4 + n > b.length) { return undefined; }
    const out = b.subarray(at + 4, at + 4 + n);
    at += 4 + n;
    return out;
  };
  try {
    const head = JSON.parse(next()?.toString('utf8') ?? 'null') as MetaHeader;
    if (!head || head.v !== VERSION || typeof head.store !== 'string') { return undefined; }
    const chats: Chat[] = [];
    for (let row = next(), bl = next(); row && bl; row = next(), bl = next()) {
      const c = fromRow(JSON.parse(row.toString('utf8')), new Uint8Array(bl.buffer, bl.byteOffset, bl.byteLength));
      if (c) { chats.push(c); }
    }
    return { head, chats };
  } catch { return undefined; }
}
