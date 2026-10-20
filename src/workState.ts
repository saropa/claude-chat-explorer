/** Saved state of the Project status page (state chips, filter box, sort, open sections), cleaned. Pure: no vscode import, so a check can drive it.
 *  The version is bumped when an older build could have saved something that hides rows: a state saved by another version is ignored and everything defaults on. */
export const STATE_VER = 3;
const SORTS = ['recent', 'name'];
const FIND_MAX_CHARS = 80;

export interface View { q: string; f: { pr: boolean; fail: boolean; dirty: boolean; push: boolean }; sort: string; density: string; sec: { [k: string]: boolean }; }

/** The state chips the user turned off: only for state saved by this version; anything older (or malformed) means none, so every chip starts on. */
export function prefsHidden(p: any, bands: string[]): string[] {
  return p && typeof p === 'object' && p.v === STATE_VER && Array.isArray(p.hidden) ? p.hidden.filter((b: unknown) => typeof b === 'string' && bands.includes(b)) : [];
}

/** Open or closed state the user chose per section (band key or 'br'); at most 120 entries, boolean values only. */
function secOf(x: any): { [k: string]: boolean } {
  const o: { [k: string]: boolean } = {};
  if (x && typeof x === 'object') { for (const k of Object.keys(x).slice(0, 120)) { if (k.length <= 80 && typeof x[k] === 'boolean') { o[k] = x[k]; } } }
  return o;
}

/** A stored or posted view, cleaned: text up to 80 characters, booleans for the four state filters, a known sort. */
export function cleanView(v: any): View {
  const f = v && typeof v.f === 'object' && v.f ? v.f : {};
  return { q: typeof v?.q === 'string' ? v.q.slice(0, FIND_MAX_CHARS) : '', f: { pr: f.pr === true, fail: f.fail === true, dirty: f.dirty === true, push: f.push === true }, sort: SORTS.includes(String(v?.sort)) ? String(v.sort) : 'recent', density: v?.density === 'compact' ? 'compact' : 'relaxed', sec: secOf(v?.sec) };
}

/** The stored view, or the default (no filter, everything on) when it was saved by another version. */
export function savedView(v: any): View { return cleanView(v && typeof v === 'object' && v.v === STATE_VER ? v : {}); }
