import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { Cost, FileRef, Git, Usage } from './types';

/** Record layout version; bump it when the file layout or the parse output changes. */
export const FORMAT = 8;
export const DIR_PREFIX = 'records-v';
export const EXT = '.ccr';
const MAGIC = 'CCR5'; // file layout tag; FORMAT also changes when only the header or parse output does
const FIXED = 20;
const FIRST_READ = 65536;
const RETRIES = 3;
const RETRY_MS = 20;

/** Header JSON of a record file; src is relative to the projects root. */
export interface RecHeader {
  v: number; src: string; mtime: number; size: number; id: string; dir: string;
  parent?: string; agentType?: string; desc?: string; title: string; last: number; first: number; count: number;
  files: Array<[string, number]>;
  cost?: Cost; git?: Git; use?: Usage;
}
export interface Parsed { h: RecHeader; bloom: Uint8Array; bodyLen: number; }

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } t[n] = c; }
  return t;
})();

const nativeCrc = (zlib as { crc32?: (d: Uint8Array) => number }).crc32;

/** CRC-32: native zlib.crc32 when this Node has it, else the table loop. */
export function crc32(b: Uint8Array): number { return nativeCrc ? nativeCrc(b) >>> 0 : crc32Js(b); }

/** Table-driven CRC-32 (exported so a check can compare it with the native one). */
export function crc32Js(b: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) { c = TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); }
  return (c ^ -1) >>> 0;
}

/** File name of one source version: first 32 hex chars of sha1(src, mtime, size); bodies of one name can differ by prune state and are all valid. */
export function recName(src: string, mtime: number, size: number): string {
  return crypto.createHash('sha1').update(`${src}\0${mtime}\0${size}`).digest('hex').slice(0, 32) + EXT;
}

/** Serialize a record file: fixed prefix, header block (json + bloom), body. */
export function encodeFile(h: RecHeader, bloom: Uint8Array, body: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(h));
  const hl = 4 + json.length + bloom.length;
  const out = Buffer.allocUnsafe(FIXED + hl + body.length);
  out.write(MAGIC, 0, 'latin1');
  out.writeUInt32LE(hl, 4);
  out.writeUInt32LE(body.length, 8);
  out.writeUInt32LE(json.length, FIXED);
  json.copy(out, FIXED + 4);
  out.set(bloom, FIXED + 4 + json.length);
  body.copy(out, FIXED + hl);
  out.writeUInt32LE(crc32(out.subarray(FIXED, FIXED + hl)), 12);
  out.writeUInt32LE(crc32(body), 16);
  return out;
}

const bad = (): Error => Object.assign(new Error('corrupt record'), { code: 'ECORRUPT' });
/** True for a damaged record (bad length, CRC, identity or header JSON), never for an I/O error. */
export const isCorrupt = (e: unknown): boolean =>
  e instanceof SyntaxError || (e as NodeJS.ErrnoException)?.code === 'ECORRUPT' || (e as Error)?.message === 'corrupt record';

/** Validate the fixed prefix against the file size; returns header and body lengths. */
function prefix(b: Buffer, size: number): { hl: number; bl: number } {
  if (b.length < FIXED || b.toString('latin1', 0, 4) !== MAGIC) { throw bad(); }
  const hl = b.readUInt32LE(4), bl = b.readUInt32LE(8);
  if (hl < 4 || FIXED + hl + bl !== size) { throw bad(); }
  return { hl, bl };
}

const extrasOk = (h: RecHeader): boolean => (!h.cost || (typeof h.cost.usd === 'number' && Array.isArray(h.cost.models)))
  && (!h.use || (typeof h.use.tokens === 'number' && typeof h.use.model === 'string'))
  && (!h.git || (Array.isArray(h.git.commits) && Array.isArray(h.git.branches) && Array.isArray(h.git.prs)));

function validHeader(h: RecHeader): boolean {
  const s = (v: unknown) => typeof v === 'string', n = (v: unknown) => typeof v === 'number';
  return !!h && h.v === FORMAT && s(h.src) && n(h.mtime) && n(h.size) && s(h.id) && s(h.dir) && s(h.title)
    && n(h.last) && n(h.first) && n(h.count) && Array.isArray(h.files) && extrasOk(h);
}

/** Check the header block (crc, json, identity against its file name) and split off the bloom. */
function headOf(f: Buffer, crc: number, name: string): Parsed & { J: number } {
  if (crc32(f) !== crc) { throw bad(); }
  const J = f.readUInt32LE(0);
  if (4 + J > f.length) { throw bad(); }
  const h = JSON.parse(f.toString('utf8', 4, 4 + J)) as RecHeader;
  if (!validHeader(h) || recName(h.src, h.mtime, h.size) !== name) { throw bad(); }
  return { h, J, bloom: new Uint8Array(f.subarray(4 + J)), bodyLen: 0 };
}

/** Parse a whole record file; throws unless length, both CRCs and identity are correct (body CRC once per buffer when verified is given). */
export function parseRecord(b: Buffer, name: string, verified?: WeakSet<Buffer>): Parsed & { body: Buffer } {
  const { hl, bl } = prefix(b, b.length);
  const p = headOf(b.subarray(FIXED, FIXED + hl), b.readUInt32LE(12), name);
  const body = b.subarray(FIXED + hl);
  if (!verified?.has(b)) {
    if (crc32(body) !== b.readUInt32LE(16)) { throw bad(); }
    verified?.add(b);
  }
  return { h: p.h, bloom: p.bloom, bodyLen: bl, body };
}

export function readRecordSync(file: string): Buffer { return fs.readFileSync(file); }

async function readFull(fh: fs.promises.FileHandle, b: Buffer): Promise<Buffer> {
  let got = 0;
  while (got < b.length) {
    const { bytesRead } = await fh.read(b, got, b.length - got, got);
    if (!bytesRead) { throw bad(); }
    got += bytesRead;
  }
  return b;
}

/** Read and verify only the header block (one 64 KB read, a second when it is larger). */
export async function readHeader(file: string, name: string): Promise<Parsed> {
  const fh = await fs.promises.open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    let b = await readFull(fh, Buffer.allocUnsafe(Math.min(FIRST_READ, size)));
    const { hl, bl } = prefix(b, size);
    if (FIXED + hl > b.length) { b = await readFull(fh, Buffer.allocUnsafe(FIXED + hl)); }
    const p = headOf(b.subarray(FIXED, FIXED + hl), b.readUInt32LE(12), name);
    return { h: p.h, bloom: p.bloom, bodyLen: bl };
  } finally { await fh.close(); }
}

export const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;
export const quiet = (p: Promise<unknown>): Promise<void> => p.then(() => undefined, () => undefined);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Rename with retries for the Windows holds; a valid same-name target counts as success. */
async function renameInto(tmp: string, dest: string, name: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { await fs.promises.rename(tmp, dest); return; } catch (e) {
      const hold = ['EPERM', 'EBUSY', 'EACCES'].includes(code(e) ?? '');
      if (hold && i < RETRIES) { await sleep(RETRY_MS); continue; }
      if (hold && await readHeader(dest, name).then(() => true, () => false)) { await quiet(fs.promises.unlink(tmp)); return; }
      throw e;
    }
  }
}

async function writeTmp(tmp: string, data: Buffer): Promise<void> {
  const fh = await fs.promises.open(tmp, 'w');
  try { await fh.writeFile(data); } finally { await fh.close(); }
}

/** Write via a same-folder temp file and rename; false when the source moved meanwhile. A missing folder is recreated once. A failure removes only its temp. */
export async function writeRecord(dir: string, name: string, data: Buffer, current: () => Promise<boolean>): Promise<boolean> {
  const tmp = path.join(dir, `${name}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    try { await writeTmp(tmp, data); } catch (e) {
      if (code(e) !== 'ENOENT') { throw e; }
      await fs.promises.mkdir(dir, { recursive: true });
      await writeTmp(tmp, data);
    }
    if (!(await current())) { await quiet(fs.promises.unlink(tmp)); return false; }
    await renameInto(tmp, path.join(dir, name), name);
    return true;
  } catch (e) { await quiet(fs.promises.unlink(tmp)); throw e; }
}

export const filesOf = (h: RecHeader): FileRef[] => h.files.map(([p, e]) => ({ path: p, edited: e === 1 }));
