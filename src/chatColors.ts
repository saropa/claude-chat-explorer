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

const STORE_MAX = 500; // remembered chat colours; the oldest assignments go first so the stored map cannot grow without bound

/** Chat id to palette index, as persisted. */
export type ColorMap = Record<string, number>;

/**
 * Gives every chat a colour that stays the same across reloads. While fewer than 20 chats are live, no two live chats share a colour;
 * with more, the palette is reused (the least-used colour first) rather than leaving a chat uncoloured.
 */
export class ColorBook {
  private map: ColorMap;

  /** `saved`: the persisted map (may be missing or damaged); `persist`: called with the new map whenever an assignment changed. */
  constructor(saved: unknown, private readonly persist: (m: ColorMap) => void) {
    this.map = {};
    if (saved && typeof saved === 'object') {
      for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
        // A damaged or out-of-range entry is dropped so the chat is simply assigned afresh.
        if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CHAT_PALETTE.length) { this.map[id] = v; }
      }
    }
  }

  /**
   * Colour (hex) of each given live chat. Chats that already have a colour keep it unless another live chat holds it too;
   * new chats take the first palette entry no live chat holds. `liveIds` order decides who wins a clash.
   */
  resolve(liveIds: readonly string[]): Map<string, string> {
    const used = new Map<number, number>(); // palette index -> number of live chats holding it
    const out = new Map<string, number>();
    let changed = false;
    // Established chats are placed first so a newcomer never takes a colour an old chat is about to reclaim.
    const ids = [...liveIds.filter((id) => this.map[id] !== undefined), ...liveIds.filter((id) => this.map[id] === undefined)];
    for (const id of ids) {
      let idx = this.map[id];
      if (idx === undefined || used.has(idx)) {
        // New chat, or a clash with a chat already placed: take a free colour, else the least-used one.
        let best = 0, bestN = Infinity;
        for (let i = 0; i < CHAT_PALETTE.length; i++) { const n = used.get(i) ?? 0; if (n < bestN) { best = i; bestN = n; } }
        idx = best;
        delete this.map[id]; // re-insert so this assignment counts as the newest
        this.map[id] = idx;
        changed = true;
      }
      used.set(idx, (used.get(idx) ?? 0) + 1);
      out.set(id, idx);
    }
    if (changed) {
      const keys = Object.keys(this.map);
      for (const k of keys.slice(0, Math.max(0, keys.length - STORE_MAX))) { delete this.map[k]; }
      this.persist({ ...this.map });
    }
    return new Map([...out].map(([id, i]) => [id, CHAT_PALETTE[i]]));
  }
}
