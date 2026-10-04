/** Search history identity and dedupe. No vscode import, so Node checks can load it. */
export interface HistItem { query: string; all: boolean; cs: boolean; ww: boolean; re: boolean; any?: boolean; when: string; subs: boolean; last: number; }

export const HIST_MAX = 20;

/** Identity of a search: trimmed query (lowercased unless Match Case) plus Match Case, Whole Word, Regex and Any order. */
export const histKey = (h: HistItem): string =>
  JSON.stringify([h.cs ? h.query.trim() : h.query.trim().toLowerCase(), !!h.cs, !!h.ww, !!h.re, !!h.any]);

/** Keep the first of each identity (newest first) and cap the list. */
export function dedupeHistory(list: HistItem[]): HistItem[] {
  const seen = new Set<string>();
  const out: HistItem[] = [];
  for (const h of list) {
    const k = histKey(h);
    if (!seen.has(k)) { seen.add(k); out.push({ ...h, any: !!h.any, subs: h.subs !== false, last: h.last || 0 }); }
  }
  return out.slice(0, HIST_MAX);
}

/** Put a search at the top; an entry with the same identity moves and takes the new When, Messages and subagents values. */
export const addToHistory = (list: HistItem[], item: HistItem): HistItem[] => dedupeHistory([item, ...list]);
