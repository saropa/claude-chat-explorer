import * as path from 'path';
import { Worker } from 'worker_threads';

export const TIMEOUT_MS = 3000;
export const TIMEOUT_MSG = 'Search timed out: simplify the pattern';

type Msg = { t: string; [k: string]: any };
interface Job { id: number; onMsg: (m: Msg) => void; onEnd: (reason: 'done' | 'cancel' | 'timeout' | 'error') => void; timer?: NodeJS.Timeout; }
interface Req { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; }

/**
 * Host side of the worker: spawns out/worker.js, routes replies, enforces the search timeout
 * (a stall of TIMEOUT_MS with no message from the worker terminates and restarts it) and
 * cancels the previous search when a new one starts.
 */
export class WorkerClient {
  private w?: Worker;
  private seq = 0;
  private job?: Job;
  private reqs = new Map<number, Req>();
  private disposed = false;
  onEvent?: (m: Msg) => void;
  onError?: (where: string, e: unknown) => void;

  constructor(private readonly dir: string, private readonly root = '') {}

  start(): void {
    if (this.disposed) { return; }
    const w = new Worker(path.join(__dirname, 'worker.js'));
    this.w = w;
    w.on('message', (m: Msg) => this.route(m));
    w.on('error', (e) => this.onError?.('worker', e));
    w.on('exit', () => { if (this.w === w) { this.w = undefined; } });
    w.postMessage({ t: 'init', dir: this.dir, root: this.root });
  }

  private route(m: Msg): void {
    if (m.t === 'reply') {
      const r = this.reqs.get(m.req);
      if (!r) { return; }
      clearTimeout(r.timer);
      this.reqs.delete(m.req);
      if (m.error) { r.reject(new Error(m.error)); } else { r.resolve(m.value); }
    } else if (m.id !== undefined && this.job && m.id === this.job.id) { this.jobMsg(this.job, m); }
    else if (m.id === undefined) { this.onEvent?.(m); }
  }

  private arm(j: Job): void {
    clearTimeout(j.timer);
    j.timer = setTimeout(() => this.timedOut(), TIMEOUT_MS);
  }

  private jobMsg(j: Job, m: Msg): void {
    this.arm(j);
    j.onMsg(m);
    if (m.t === 'done' || m.t === 'error') { this.finish(j, m.t); }
  }

  private finish(j: Job, why: 'done' | 'cancel' | 'timeout' | 'error'): void {
    clearTimeout(j.timer);
    if (this.job === j) { this.job = undefined; }
    j.onEnd(why);
  }

  /** Kill the worker and start a fresh one; pending requests fail. */
  restart(): void {
    const old = this.w;
    this.w = undefined;
    for (const r of this.reqs.values()) { clearTimeout(r.timer); r.reject(new Error(TIMEOUT_MSG)); }
    this.reqs.clear();
    void old?.terminate();
    this.start();
  }

  private timedOut(): void {
    const j = this.job;
    this.restart();
    if (j) { this.finish(j, 'timeout'); }
  }

  /** Start a search; any running search is canceled first. Returns its id. */
  search(p: { [k: string]: any }, onMsg: Job['onMsg'], onEnd: Job['onEnd']): void {
    this.cancel();
    const j: Job = { id: ++this.seq, onMsg, onEnd };
    this.job = j; // the timer starts when the worker reports 'started' (after any index wait)
    this.w?.postMessage({ ...p, t: 'search', id: j.id });
  }

  cancel(): void {
    const j = this.job;
    if (!j) { return; }
    this.w?.postMessage({ t: 'cancel', id: j.id });
    this.finish(j, 'cancel');
  }

  /** One request with its own timeout; rejects on timeout after restarting the worker. */
  request(m: Msg): Promise<any> {
    const req = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.reqs.delete(req); this.restart(); reject(new Error(TIMEOUT_MSG)); }, TIMEOUT_MS * 2);
      this.reqs.set(req, { resolve, reject, timer });
      this.w?.postMessage({ ...m, req });
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    try { await Promise.race([this.request({ t: 'dispose' }), new Promise((r) => setTimeout(r, 4000))]); } catch { /* worker gone */ }
    await this.w?.terminate();
  }
}
