/**
 * Per-chat colours for the all-chats Activity mode: the fixed palette (single source of truth, handed to the webviews from here)
 * and the book that gives each chat a stable colour.
 */

/**
 * 20 categorical colours that stay readable on both a dark (#1e1e1e) and a white sidebar: every entry has a WCAG contrast of at least 3:1
 * against both (measured 3.51 to 4.75; see CHANGELOG). Hues come from the programmer-standard categorical sets (Sasha Trubetskoy's 20
 * colours, Kelly's 22 colours of maximum contrast, Tableau); the pale members of those sets (pink, lavender, beige, mint, apricot) and navy
 * cannot meet 3:1 on both backgrounds, so each hue was darkened or lightened to the shared luminance band instead.
 * ORDER matters: it was chosen so that neighbours differ strongly (red, green, purple, olive, indigo ...), never a run of similar blues or
 * greens. The list is consumed in this order, so the first few chats get the most distinct colours. Names are for maintainers only.
 */
export const CHAT_PALETTE: readonly string[] = [
  '#f51b50', // red
  '#249124', // green
  '#c92afa', // purple
  '#828200', // olive
  '#6a57ff', // indigo
  '#6e8543', // khaki green
  '#eb2387', // rose
  '#158c78', // teal
  '#cf591f', // orange
  '#4e73fa', // blue
  '#967a09', // gold
  '#996bba', // violet
  '#1c86ba', // azure
  '#b86a1b', // amber
  '#bd5f8d', // mauve
  '#468c5e', // sage
  '#cc594e', // coral
  '#2b899e', // cyan
  '#9e764f', // tan
  '#737f80', // slate
];

const STORE_MAX = 500; // remembered chat colours; beyond this the oldest NON-live entries go first so the stored map cannot grow without bound
// Live chats are re-inserted as newest on every resolve (in memory); the map is written for that bump alone at most this often, so an
// unchanged set never costs a globalState write per refresh yet a long-lived chat still counts as recently seen after a reload.
const RECENCY_PERSIST_MS = 10 * 60 * 1000;

/** Chat id to palette index, as persisted. */
export type ColorMap = Record<string, number>;

/**
 * Gives every chat a colour that stays the same across reloads. While fewer than 20 chats are live, no two live chats share a colour;
 * with more, the palette is reused (the least-used colour first) rather than leaving a chat uncoloured.
 */
export class ColorBook {
  // A Map (not a plain object) so insertion order is reliable recency order whatever the ids look like.
  private map: Map<string, number>;
  private lastPersist: number;

  /**
   * `saved`: the persisted map (may be missing or damaged); `persist`: called with the new map whenever it should be written;
   * `now`: clock for the recency-write throttle (injectable so tests are deterministic).
   */
  constructor(saved: unknown, private readonly persist: (m: ColorMap) => void, private readonly now: () => number = Date.now) {
    if (saved && typeof saved === 'object') {
      for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
        // A damaged or out-of-range entry is dropped so the chat is simply assigned afresh.
        if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CHAT_PALETTE.length) { this.map.set(id, v); }
      }
    }
    this.lastPersist = this.now();
  }

  /**
   * Colour (hex) of each given live chat. A chat's FIRST assigned colour is permanent: it is saved once and never overwritten.
   * The result is independent of `liveIds` order (callers each list their own current chat first, and the pane and the browser view
   * must agree): clashes are settled by saved-entry age (oldest, i.e. least recently seen, first), newcomers are placed by id.
   * A returning chat whose saved colour is held by an older live chat shows a temporary colour for this call only, picked from entries
   * no live chat holds or has reserved; its saved entry stays untouched so it gets the colour back once the clash is gone.
   * A new chat takes a colour no live chat holds, preferring the one least used across ALL saved chats (dormant ones included).
   */
  resolve(liveIds: readonly string[]): Map<string, string> {
    const live = new Set(liveIds);
    const n = CHAT_PALETTE.length;
    const used = new Array<number>(n).fill(0); // palette index -> live chats holding it
    const reserved = new Set<number>(); // saved indexes of established live chats: a temporary pick must not steal these
    const savedUse = new Array<number>(n).fill(0); // palette index -> chats (live or dormant) that own it
    for (const v of this.map.values()) { savedUse[v]++; }
    // Map order is recency order, so this is a fixed order whatever order the caller listed the chats in.
    const established = [...this.map.keys()].filter((id) => live.has(id));
    // Brand-new chats: sorted by id so two callers listing them differently still give them the same colours.
    const fresh = [...live].filter((id) => !this.map.has(id)).sort();
    const out = new Map<string, number>();
    let changed = false;
    // Best entry by (live holders, reserved, saved popularity, lowest index): free first, then least-used; deterministic on ties.
    const pick = (): number => {
      let best = 0;
      for (let i = 1; i < n; i++) {
        const a = [used[i], reserved.has(i) ? 1 : 0, savedUse[i]], b = [used[best], reserved.has(best) ? 1 : 0, savedUse[best]];
        for (let k = 0; k < 3; k++) { if (a[k] !== b[k]) { if (a[k] < b[k]) { best = i; } break; } }
      }
      return best;
    };
    // BUG FIXED: pick() used to see only colours placed so far, so a clash loser could take the saved colour of an established chat
    // not yet placed. Every established live chat's own colour is reserved BEFORE any temporary pick.
    for (const id of established) { reserved.add(this.map.get(id) as number); }
    // Pass 1: the oldest holder of each saved colour keeps it; later claimants are losers.
    const losers: string[] = [];
    for (const id of established) {
      const idx = this.map.get(id) as number;
      if (used[idx] === 0) { used[idx]++; out.set(id, idx); } else { losers.push(id); }
    }
    // Pass 2: losers show a temporary colour; their saved entry is not touched.
    for (const id of losers) { const idx = pick(); used[idx]++; out.set(id, idx); }
    // Pass 3: newcomers; the colour is saved and permanent.
    for (const id of fresh) {
      const idx = pick();
      used[idx]++; savedUse[idx]++;
      this.map.set(id, idx);
      out.set(id, idx);
      changed = true;
    }
    // Recency: live chats are re-inserted as newest (keeping their relative order, so clash seniority is unchanged), so a chat that is
    // often live is never the "oldest" when the cap evicts. Memory only; the write is throttled below.
    for (const id of [...this.map.keys()]) {
      if (live.has(id)) { const v = this.map.get(id) as number; this.map.delete(id); this.map.set(id, v); }
    }
    // Bound the stored map: the oldest NON-live entries go first; live chats are never dropped.
    if (this.trim(live)) { changed = true; }
    // Write when assignments changed; otherwise only to carry the recency bump, and at most once per throttle window.
    const t = this.now();
    if (changed || (live.size > 0 && t - this.lastPersist >= RECENCY_PERSIST_MS)) {
      this.lastPersist = t;
      this.persist(Object.fromEntries(this.map));
    }
    return new Map([...out].map(([id, i]) => [id, CHAT_PALETTE[i]]));
  }
}  /**
   * `saved`: the persisted map (may be missing or damaged); `persist`: called with the new map whenever it should be written;
   * `now`: clock for the recency-write throttle (injectable so tests are deterministic);
   * `load`: optional read of the CURRENTLY stored value. Two VS Code windows share one store and each book writes its whole map, so
   * without this one window overwrites the other's new assignments; with it every write is merged with what is stored (see adopt()).
   */
  constructor(saved: unknown, private readonly persist: (m: ColorMap) => void, private readonly now: () => number = Date.now, private readonly load?: () => unknown) {
    this.map = ColorBook.clean(saved);
    this.lastPersist = this.now();
  }

  /** Valid entries of a stored value: a damaged or out-of-range entry is dropped so the chat is simply assigned afresh. */
  private static clean(saved: unknown): Map<string, number> {
    const out = new Map<string, number>();
    if (saved && typeof saved === 'object') {
      for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CHAT_PALETTE.length) { out.set(id, v); }
      }
    }
    return out;
  }

  /**
   * Merges the currently stored map into memory (no-op without `load`). Entries another window added are kept; an id that is already
   * stored keeps the STORED index (first writer wins, matching "a chat's first colour is permanent"). Stored-only entries go in as the
   * OLDEST, since their recency here is unknown, so the cap evicts them before anything this window has seen.
   */
  private adopt(): void {
    if (!this.load) { return; }
    const extra: Array<[string, number]> = [];
    for (const [id, v] of ColorBook.clean(this.load())) {
      const mine = this.map.get(id);
      if (mine === undefined) { extra.push([id, v]); } else if (mine !== v) { this.map.set(id, v); } // set on an existing key keeps its recency slot
    }
    if (extra.length) { this.map = new Map([...extra, ...this.map]); }
  }

  /** Drops the oldest NON-live entries beyond STORE_MAX (live chats are never dropped); true when anything was removed. */
  private trim(live: Set<string>): boolean {
    let excess = this.map.size - STORE_MAX, removed = false;
    for (const k of [...this.map.keys()]) {
      if (excess <= 0) { break; }
      if (!live.has(k)) { this.map.delete(k); excess--; removed = true; }
    }
    return removed;
  }chats Activity mode: the fixed palette (single source of truth, handed to the webviews from here)
 * and the book that gives each chat a stable colour.
 */

/**
 * 20 categorical colours that stay readable on both a dark (#1e1e1e) and a white sidebar: every entry has a WCAG contrast of at least 3:1
 * against both (measured 3.51 to 4.75; see CHANGELOG). Hues come from the programmer-standard categorical sets (Sasha Trubetskoy's 20
 * colours, Kelly's 22 colours of maximum contrast, Tableau); the pale members of those sets (pink, lavender, beige, mint, apricot) and navy
 * cannot meet 3:1 on both backgrounds, so each hue was darkened or lightened to the shared luminance band instead.
 * ORDER matters: it was chosen so that neighbours differ strongly (red, green, purple, olive, indigo ...), never a run of similar blues or
 * greens. The list is consumed in this order, so the first few chats get the most distinct colours. Names are for maintainers only.
 */
export const CHAT_PALETTE: readonly string[] = [
  '#f51b50', // red
  '#249124', // green
  '#c92afa', // purple
  '#828200', // olive
  '#6a57ff', // indigo
  '#6e8543', // khaki green
  '#eb2387', // rose
  '#158c78', // teal
  '#cf591f', // orange
  '#4e73fa', // blue
  '#967a09', // gold
  '#996bba', // violet
  '#1c86ba', // azure
  '#b86a1b', // amber
  '#bd5f8d', // mauve
  '#468c5e', // sage
  '#cc594e', // coral
  '#2b899e', // cyan
  '#9e764f', // tan
  '#737f80', // slate
];

const STORE_MAX = 500; // remembered chat colours; beyond this the oldest NON-live entries go first so the stored map cannot grow without bound
// Live chats are re-inserted as newest on every resolve (in memory); the map is written for that bump alone at most this often, so an
// unchanged set never costs a globalState write per refresh yet a long-lived chat still counts as recently seen after a reload.
const RECENCY_PERSIST_MS = 10 * 60 * 1000;

/** Chat id to palette index, as persisted. */
export type ColorMap = Record<string, number>;

/**
 * Gives every chat a colour that stays the same across reloads. While fewer than 20 chats are live, no two live chats share a colour;
 * with more, the palette is reused (the least-used colour first) rather than leaving a chat uncoloured.
 */
export class ColorBook {
  // A Map (not a plain object) so insertion order is reliable recency order whatever the ids look like.
  private map = new Map<string, number>();
  private lastPersist: number;

  /**
   * `saved`: the persisted map (may be missing or damaged); `persist`: called with the new map whenever it should be written;
   * `now`: clock for the recency-write throttle (injectable so tests are deterministic).
   */
  constructor(saved: unknown, private readonly persist: (m: ColorMap) => void, private readonly now: () => number = Date.now) {
    if (saved && typeof saved === 'object') {
      for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
        // A damaged or out-of-range entry is dropped so the chat is simply assigned afresh.
        if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CHAT_PALETTE.length) { this.map.set(id, v); }
      }
    }
    this.lastPersist = this.now();
  }

  /**
   * Colour (hex) of each given live chat. A chat's FIRST assigned colour is permanent: it is saved once and never overwritten.
   * The result is independent of `liveIds` order (callers each list their own current chat first, and the pane and the browser view
   * must agree): clashes are settled by saved-entry age (oldest, i.e. least recently seen, first), newcomers are placed by id.
   * A returning chat whose saved colour is held by an older live chat shows a temporary colour for this call only, picked from entries
   * no live chat holds or has reserved; its saved entry stays untouched so it gets the colour back once the clash is gone.
   * A new chat takes a colour no live chat holds, preferring the one least used across ALL saved chats (dormant ones included).
   */
  resolve(liveIds: readonly string[]): Map<string, string> {
    const live = new Set(liveIds);
    const n = CHAT_PALETTE.length;
    const used = new Array<number>(n).fill(0); // palette index -> live chats holding it
    const reserved = new Set<number>(); // saved indexes of established live chats: a temporary pick must not steal these
    const savedUse = new Array<number>(n).fill(0); // palette index -> chats (live or dormant) that own it
    for (const v of this.map.values()) { savedUse[v]++; }
    // Map order is recency order, so this is a fixed order whatever order the caller listed the chats in.
    const established = [...this.map.keys()].filter((id) => live.has(id));
    // Brand-new chats: sorted by id so two callers listing them differently still give them the same colours.
    const fresh = [...live].filter((id) => !this.map.has(id)).sort();
    const out = new Map<string, number>();
    let changed = false;
    // Best entry by (live holders, reserved, saved popularity, lowest index): free first, then least-used; deterministic on ties.
    const pick = (): number => {
      let best = 0;
      for (let i = 1; i < n; i++) {
        const a = [used[i], reserved.has(i) ? 1 : 0, savedUse[i]], b = [used[best], reserved.has(best) ? 1 : 0, savedUse[best]];
        for (let k = 0; k < 3; k++) { if (a[k] !== b[k]) { if (a[k] < b[k]) { best = i; } break; } }
      }
      return best;
    };
    // BUG FIXED: pick() used to see only colours placed so far, so a clash loser could take the saved colour of an established chat
    // not yet placed. Every established live chat's own colour is reserved BEFORE any temporary pick.
    for (const id of established) { reserved.add(this.map.get(id) as number); }
    // Pass 1: the oldest holder of each saved colour keeps it; later claimants are losers.
    const losers: string[] = [];
    for (const id of established) {
      const idx = this.map.get(id) as number;
      if (used[idx] === 0) { used[idx]++; out.set(id, idx); } else { losers.push(id); }
    }
    // Pass 2: losers show a temporary colour; their saved entry is not touched.
    for (const id of losers) { const idx = pick(); used[idx]++; out.set(id, idx); }
    // Pass 3: newcomers; the colour is saved and permanent.
    for (const id of fresh) {
      const idx = pick();
      used[idx]++; savedUse[idx]++;
      this.map.set(id, idx);
      out.set(id, idx);
      changed = true;
    }
    // Recency: live chats are re-inserted as newest (keeping their relative order, so clash seniority is unchanged), so a chat that is
    // often live is never the "oldest" when the cap evicts. Memory only; the write is throttled below.
    for (const id of [...this.map.keys()]) {
      if (live.has(id)) { const v = this.map.get(id) as number; this.map.delete(id); this.map.set(id, v); }
    }
    // Bound the stored map: the oldest NON-live entries go first; live chats are never dropped.
    let excess = this.map.size - STORE_MAX;
    if (excess > 0) {
      for (const k of [...this.map.keys()]) {
        if (excess <= 0) { break; }
        if (!live.has(k)) { this.map.delete(k); excess--; changed = true; }
      }
    }
    // Write when assignments changed; otherwise only to carry the recency bump, and at most once per throttle window.
    const t = this.now();
    if (changed || (live.size > 0 && t - this.lastPersist >= RECENCY_PERSIST_MS)) {
      this.lastPersist = t;
      this.persist(Object.fromEntries(this.map));
    }
    return new Map([...out].map(([id, i]) => [id, CHAT_PALETTE[i]]));
  }
}
