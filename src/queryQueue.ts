/** Runs a query in the panel: reveals it, and holds the query until the panel script is ready, so none is lost. */
export class QueryQueue {
  private ready = false;
  private pending?: string;

  constructor(private readonly post: (m: unknown) => void, private readonly reveal: () => PromiseLike<unknown>,
    private readonly log: (where: string, e: unknown) => void) {}

  /** The panel script is ready (true) or the panel is gone (false); a ready panel gets the held query. */
  setReady(ready: boolean): void { this.ready = ready; if (ready) { this.flush(); } }

  /** Reveal the panel and send `query`; a panel that is not ready yet gets it when it becomes ready. */
  async show(query: string): Promise<void> {
    this.pending = query;
    try { await this.reveal(); } catch (e) {
      this.log('reveal panel', e);
      if (!this.ready) { this.pending = undefined; return; } // no panel will come: do not run the query later by surprise
    }
    if (this.ready) { this.flush(); }
  }

  private flush(): void {
    const query = this.pending;
    this.pending = undefined;
    if (query !== undefined) { this.post({ type: 'setQuery', query }); }
  }
}
