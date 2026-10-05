/** Small event fan-out so more than one page can listen to dots, index, and archive changes. */
export type HubEvent = 'dots' | 'indexed' | 'changed' | 'archived';

export class Hub {
  private readonly subs = new Map<HubEvent, Set<() => void>>();

  /** Subscribe to an event; the returned object stops the subscription. */
  on(evt: HubEvent, fn: () => void): { dispose(): void } {
    const set = this.subs.get(evt) ?? new Set<() => void>();
    set.add(fn);
    this.subs.set(evt, set);
    return { dispose: () => { set.delete(fn); } };
  }

  /** Call every subscriber; one that throws never stops the others. */
  emit(evt: HubEvent, onError?: (where: string, e: unknown) => void): void {
    for (const fn of [...(this.subs.get(evt) ?? [])]) {
      try { fn(); } catch (e) { onError?.('hub ' + evt, e); }
    }
  }
}
