import { CMD_SEP, SEP } from './parse';
import { Rec } from './types';

/**
 * Record layout: u32 message count n, u32 text bytes, n x f64 timestamp, n x u32 message length
 * (UTF-16 units), n x u32 JSONL line number (1-based), n x u8 role, UTF-8 text (messages joined
 * by SEP), UTF-8 commands joined by SEP, each as <message index> CMD_SEP <command>.
 */
export function encodeRec(p: { texts: string[]; ts: number[]; roles: number[]; lines: number[]; cmds: string[]; cmdAt: number[] }): Buffer {
  const { texts, ts, roles, lines, cmds, cmdAt } = p;
  const n = texts.length;
  const text = texts.join(SEP), cmd = cmds.map((c, i) => cmdAt[i] + CMD_SEP + c).join(SEP);
  const tb = Buffer.byteLength(text), cb = Buffer.byteLength(cmd);
  const head = 8 + n * 17;
  const out = Buffer.allocUnsafe(head + tb + cb);
  out.writeUInt32LE(n, 0);
  out.writeUInt32LE(tb, 4);
  for (let i = 0; i < n; i++) {
    out.writeDoubleLE(ts[i], 8 + i * 8);
    out.writeUInt32LE(texts[i].length, 8 + n * 8 + i * 4);
    out.writeUInt32LE(lines[i] ?? 0, 8 + n * 12 + i * 4);
    out[8 + n * 16 + i] = roles[i];
  }
  out.write(text, head, 'utf8');
  out.write(cmd, head + tb, 'utf8');
  return out;
}

/** Decode a record; message i spans [ends[i] - length, ends[i]) of text. */
export function decodeRec(b: Buffer): Rec {
  if (b.length < 8) { throw new Error('corrupt record'); }
  const n = b.readUInt32LE(0), tb = b.readUInt32LE(4), head = 8 + n * 17;
  if (head + tb > b.length) { throw new Error('corrupt record'); } // checked before allocating n slots
  const ts = new Array<number>(n), ends = new Array<number>(n), roles = new Array<number>(n);
  const lines = new Uint32Array(n);
  let at = 0;
  for (let i = 0; i < n; i++) {
    ts[i] = b.readDoubleLE(8 + i * 8);
    at += b.readUInt32LE(8 + n * 8 + i * 4);
    ends[i] = at;
    at += SEP.length;
    lines[i] = b.readUInt32LE(8 + n * 12 + i * 4);
    roles[i] = b[8 + n * 16 + i];
  }
  const cmd = b.toString('utf8', head + tb);
  const text = b.toString('utf8', head, head + tb);
  if (at - SEP.length > text.length) { throw new Error('corrupt record'); } // message lengths overrun the text
  const cmds: string[] = [], cmdAt: number[] = [];
  for (const e of cmd ? cmd.split(SEP) : []) { const k = e.indexOf(CMD_SEP); cmdAt.push(Number(e.slice(0, k))); cmds.push(e.slice(k + 1)); }
  return { text, ts, ends, roles, lines, cmds, cmdAt };
}

/** Start offset of message i in a record's text. */
export const startOf = (r: Rec, i: number): number => (i === 0 ? 0 : r.ends[i - 1] + SEP.length);
