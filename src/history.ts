/** Search history identity and dedupe. No vscode import, so Node checks can load it. */
export interface HistItem { query: string; all: boolean; cs: boolean; ww: boolean; re: boolean; when: string; subs: boolean; last: number; }

export const HIST_MAX = 20;

/** Identity of a search: trimmed lowercased query plus the flags that change its results. */
export const histKey = (h: HistItem): string =>
  JSON.stringify([h.query.trim().toLowerCase(), !!h.cs, !!h.ww, !!h.re, h.when, h.last || 0, h.subs !== false]);

/** Keep the first of each identity (newest first) and cap the list. */
export function dedupeHistory(list: HistItem[]): HistItem[] {
  const seen = new Set<string>();
  const out: HistItem[] = [];
  for (const h of list) {
    const k = histKey(h);
    if (!seen.has(k)) { seen.add(k); out.push({ ...h, subs: h.subs !== false, last: h.last || 0 }); }
  }
  return out.slice(0, HIST_MAX);
}

/** Put a finished search at the top; an existing entry with the same identity moves instead of repeating. */
export const addToHistory = (list: HistItem[], item: HistItem): HistItem[] => dedupeHistory([item, ...list]);
