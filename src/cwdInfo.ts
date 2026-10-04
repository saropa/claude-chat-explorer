const CWD_KEY = Buffer.from('"cwd":"');
const HEAD = 4096; // cwd sits near the start of a row
const MAX_LEN = 1024;

/** The cwd value of one row (last non-empty wins); keeps cur when the row has none. */
export function takeCwd(line: Buffer, cur: string): string {
  const h = line.length > HEAD ? line.subarray(0, HEAD) : line;
  const k = h.indexOf(CWD_KEY);
  if (k < 0) { return cur; }
  const s = k + CWD_KEY.length;
  for (let i = s; i < h.length && i - s < MAX_LEN; i++) {
    if (h[i] === 92) { i++; continue; } // skip an escaped character
    if (h[i] === 34) { return decode(h.toString('utf8', s, i), cur); }
  }
  return cur;
}

/** JSON-decode the raw value (Windows paths carry escapes); an empty or broken value keeps cur. */
function decode(raw: string, cur: string): string {
  if (!raw) { return cur; }
  if (!raw.includes('\\')) { return raw; }
  try { const v = JSON.parse('"' + raw + '"'); return typeof v === 'string' && v ? v : cur; } catch { return cur; }
}
