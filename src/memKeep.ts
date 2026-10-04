import { MEM_CAP, recCache } from './recCache';

export { MEM_CAP };

/** Record bodies whose write failed (capped), and brand-new chats that have neither a record nor a copy. */
export class MemKeep {
  onFree?: () => void; // called when memory is released, so skipped versions may fit again
  readonly bodies = new Map<string, Buffer>();
  readonly pend = new Set<string>();
  private bytes = 0;

  /** Keep a body when it fits under the cap. */
  add(name: string, body: Buffer): boolean {
    if (this.bytes + body.length > MEM_CAP) { return false; }
    this.bodies.set(name, body);
    this.bytes += body.length;
    recCache.reserve(this.bytes);
    return true;
  }

  release(name: string): void {
    const m = this.bodies.get(name);
    if (m) { this.bytes -= m.length; this.bodies.delete(name); recCache.reserve(this.bytes); this.onFree?.(); }
    this.pend.delete(name);
  }
}
