/** Record bodies whose write failed (capped), and brand-new chats that have neither a record nor a copy. */
export const MEM_CAP = 128 * 1024 * 1024;

export class MemKeep {
  readonly bodies = new Map<string, Buffer>();
  readonly pend = new Set<string>();
  private bytes = 0;

  /** Keep a body when it fits under the cap. */
  add(name: string, body: Buffer): boolean {
    if (this.bytes + body.length > MEM_CAP) { return false; }
    this.bodies.set(name, body);
    this.bytes += body.length;
    return true;
  }

  release(name: string): void {
    const m = this.bodies.get(name);
    if (m) { this.bytes -= m.length; this.bodies.delete(name); }
    this.pend.delete(name);
  }
}
