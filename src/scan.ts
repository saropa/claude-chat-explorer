import * as fs from 'fs';

const CHUNK = 1 << 20;

/** Called per non-empty line with its 1-based line number. */
export type OnLine = (b: Buffer, s: number, e: number, line: number) => void;
interface State { pieces: Buffer[]; line: number; }

/** Join the carried pieces of a line that spans chunks with the head of the current chunk. */
function joined(pieces: Buffer[], b: Buffer, end: number): Buffer {
  pieces.push(b.subarray(0, end));
  const out = Buffer.concat(pieces);
  pieces.length = 0;
  return out;
}

/** Feed one chunk; returns the offset after the last newline so the rest can be carried. */
function feed(b: Buffer, st: State, onLine: OnLine): number {
  let s = 0;
  let nl = b.indexOf(10, 0);
  if (nl >= 0 && st.pieces.length) {
    const line = joined(st.pieces, b, nl);
    st.line++;
    if (line.length) { onLine(line, 0, line.length, st.line); }
    s = nl + 1;
    nl = b.indexOf(10, s);
  }
  while (nl >= 0) {
    st.line++;
    if (nl > s) { onLine(b, s, nl, st.line); }
    s = nl + 1;
    nl = b.indexOf(10, s);
  }
  return s;
}

/**
 * Byte-level line scanner: reads a file in 1 MB chunks and calls onLine(buffer, start, end) per line,
 * without decoding lines to strings. The buffer is reused, so callers must not keep references.
 */
export async function scanLines(file: string, onLine: OnLine): Promise<void> {
  const fh = await fs.promises.open(file, 'r');
  const buf = Buffer.allocUnsafe(CHUNK);
  const st: State = { pieces: [], line: 0 };
  const pieces = st.pieces;
  try {
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, null);
      if (!bytesRead) { break; }
      const b = buf.subarray(0, bytesRead);
      const s = feed(b, st, onLine);
      if (s < b.length) { pieces.push(Buffer.from(b.subarray(s))); } // copy: buf is reused
    }
    if (pieces.length) {
      const last = Buffer.concat(pieces);
      if (last.length) { onLine(last, 0, last.length, st.line + 1); }
    }
  } finally { await fh.close(); }
}
