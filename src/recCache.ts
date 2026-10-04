/** Shared budget for held bodies and the read cache. */
export const MEM_CAP = 128 * 1024 * 1024;
const LRU_CAP = 64 * 1024 * 1024;

/** Byte-capped LRU of raw record files by name; buffers are never mutated. Shares MEM_CAP with held bodies. */
export class RecCache {
  private m = new Map<string, Buffer>();
  private bytes = 0;
  private held = 0;
  /** Buffers whose body CRC passed; a buffer read from disk is always verified once. */
  readonly verified = new WeakSet<Buffer>();

  get size(): number { return this.bytes; }
  get(name: string): Buffer | undefined {
    const b = this.m.get(name);
    if (b) { this.m.delete(name); this.m.set(name, b); }
    return b;
  }

  put(name: string, b: Buffer): void {
    this.evictOne(name);
    if (b.length > this.limit()) { return; }
    this.m.set(name, b);
    this.bytes += b.length;
    this.trim();
  }

  /** Forget a record (rewritten, damaged or unreadable): its cached bytes. */
  drop(name: string): void { this.evictOne(name); }

  private evictOne(name: string): void {
    const b = this.m.get(name);
    if (b) { this.bytes -= b.length; this.m.delete(name); }
  }

  /** Bytes held by MemKeep bodies; the cache gives up room so both stay under MEM_CAP. */
  reserve(held: number): void { this.held = held; this.trim(); }

  private limit(): number { return Math.max(0, Math.min(LRU_CAP, MEM_CAP - this.held)); }
  private trim(): void {
    const cap = this.limit();
    for (const [k, b] of this.m) {
      if (this.bytes <= cap) { break; }
      this.m.delete(k);
      this.bytes -= b.length;
    }
  }
}

export const recCache = new RecCache();
