/** Relative and absolute time text for notes. No vscode dependency. */
const UNITS: Array<[string, number]> = [['d', 86400e3], ['h', 3600e3], ['min', 60e3]];

/** Short age such as "3h ago", "2d ago" or "just now". */
export function ago(ts: number, now = Date.now()): string {
  const d = Math.max(0, now - ts);
  for (const [u, ms] of UNITS) { if (d >= ms) { return `${Math.floor(d / ms)}${u === 'min' ? ' min' : u} ago`; } }
  return 'just now';
}

/** Local "YYYY-MM-DD HH:MM". */
export function stamp(ts: number): string {
  const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
