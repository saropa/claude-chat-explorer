/** Anything with Memento-style update (vscode Memento satisfies it). */
export interface Sink { update(key: string, value: unknown): Thenable<void>; }

/** Coalesces writes: each put restarts the timer; only the latest value per key is written. */
export class DebouncedWriter {
  private pending = new Map<string, unknown>();
  private timer?: NodeJS.Timeout;
  onError?: (e: unknown) => void;

  constructor(private readonly sink: Sink, private readonly delay = 500) {}

  has(key: string): boolean { return this.pending.has(key); }
  get(key: string): unknown { return this.pending.get(key); }

  put(key: string, value: unknown): void {
    this.pending.set(key, value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }

  /** Write everything pending now. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const [k, v] of [...this.pending]) {
      try { await this.sink.update(k, v); } catch (e) { this.onError?.(e); }
      if (this.pending.get(k) === v) { this.pending.delete(k); } // reads see the pending value until it is written
    }
  }
}
