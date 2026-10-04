/**
 * Per-chat trigram prefilter: a one-hash bloom filter over the lowercased text, sized to about
 * 8 bits per distinct trigram. A query word of t trigrams passes a non-matching chat with
 * probability of roughly 0.12^t, so most chats are rejected without touching the store.
 */

const MIN_BITS = 512;
const MAX_BITS = 1 << 22;
const BITS_PER_GRAM = 8;
let scratch = new Uint32Array(MIN_BITS >>> 5);

/** 32-bit mix of three char codes. */
export function gram(a: number, b: number, c: number): number {
  let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b) ^ Math.imul(c, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Trigram hashes of a lowercased literal; empty when it is shorter than three chars. */
export function gramsOf(lower: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < lower.length; i++) {
    out.push(gram(lower.charCodeAt(i), lower.charCodeAt(i + 1), lower.charCodeAt(i + 2)));
  }
  return out;
}

const pow2 = (n: number): number => { let p = MIN_BITS; while (p < n && p < MAX_BITS) { p <<= 1; } return p; };

/** Set every trigram of text in a scratch bitmap of size bits; returns how many new bits were set. */
function fill(text: string, bits: number): number {
  const words = bits >>> 5;
  if (scratch.length < words) { scratch = new Uint32Array(words); } else { scratch.fill(0, 0, words); }
  const mask = bits - 1;
  let set = 0;
  for (let i = 0; i + 2 < text.length; i++) {
    const h = gram(text.charCodeAt(i), text.charCodeAt(i + 1), text.charCodeAt(i + 2)) & mask;
    const w = h >>> 5, m = 1 << (h & 31);
    if (!(scratch[w] & m)) { scratch[w] |= m; set++; }
  }
  return set;
}

/** Build the filter for lowercased text: fill a large bitmap, then fold it to the target size. */
export function buildBloom(lower: string): Uint8Array {
  const big = pow2(lower.length * 4);
  const distinct = fill(lower, big);
  const bits = Math.min(big, pow2(distinct * BITS_PER_GRAM));
  const out = new Uint32Array(bits >>> 5);
  const words = big >>> 5, n = out.length;
  for (let i = 0; i < words; i++) { out[i % n] |= scratch[i]; }
  return new Uint8Array(out.buffer);
}

/** True when every trigram may be present (false means definitely absent). */
export function mayHave(bloom: Uint8Array, grams: number[]): boolean {
  const mask = bloom.length * 8 - 1;
  for (const g of grams) {
    const h = g & mask;
    if (!(bloom[h >>> 3] & (1 << (h & 7)))) { return false; }
  }
  return true;
}
