import * as path from 'path';
import { Worker } from 'worker_threads';

export const TIMEOUT_MS = 3000;
export const TIMEOUT_MSG = 'Search timed out: simplify the pattern';

type Msg = { t: string; [k: string]: any };
interface Job { id: number; onMsg: (m: Msg) => void; onEnd: (reason: 'done' | 'cancel' | 'timeout' | 'error') => void; timer?: NodeJS.Timeout; }
interface Req { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; }

const RETRY_MAX = 3;
const RETRY_WINDOW_MS = 60000;
type End = 'done' | 'cancel' | 'timeout' | 'error';

/**
 * Host side of the worker: spawns out/worker.js, routes replies, enforces the search timeout
 * (a stall of TIMEOUT_MS with no message from the worker terminates and restarts it), cancels the
 * previous search when a new one starts, and restarts a worker that dies (at most 3 times a minute).
 */
export class WorkerClient {
  private w?: Worker;
  private seq = 0;
  private job?: Job;
  private reqs = new Map<number, Req>();
  private queue: Msg[] = []; // posts made while no worker is up; sent by start()
  private starts: number[] = [];
  private dead = false; // gave up restarting
  private disposed = false;
  onEvent?: (m: Msg) => void;
  onError?: (where: string, e: unknown) => void;

  constructor(private readonly dir: string, private readonly root = '') {}

  start(): void {
    if (this.disposed) { return; }
    const w = new Worker(path.join(__dirname, 'worker.js'));
    this.w = w;
    w.on('message', (m: Msg) => { if (this.w === w) { this.route(m); } }); // ignore a replaced worker
    w.on('error', (e) => { if (this.w === w) { this.onError?.('worker', e); } });
    w.on('exit', () => { if (this.w === w) { this.w = undefined; this.crashed(); } });
    w.postMessage({ t: 'init', dir: this.dir, root: this.root });
    for (const m of this.queue.splice(0)) { w.postMessage(m); }
  }

  /** The worker died on its own: end the search, fail requests, and start a new one within the retry limit. */
  private crashed(): void {
    if (this.disposed) { return; }
    this.failAll('error', 'Search worker stopped');
    const now = Date.now();
    this.starts = this.starts.filter((t) => now - t < RETRY_WINDOW_MS);
    if (this.starts.length >= RETRY_MAX) {
      this.dead = true;
      const message = 'The search worker keeps stopping. Reload the window to try again.';
      this.onError?.('worker', new Error(message));
      this.onEvent?.({ t: 'fatal', message });
      return;
    }
    this.starts.push(now);
    this.start();
  }

  /** End the current search (the error path shows it) and reject pending requests. */
  private failAll(why: End, message: string): void {
    const j = this.job;
    if (j) {
      try { j.onMsg({ t: 'error', id: j.id, message }); } catch (e) { this.onError?.('worker', e); }
      this.finish(j, why);
    }
    for (const r of this.reqs.values()) { clearTimeout(r.timer); r.reject(new Error(message)); }
    this.reqs.clear();
    this.queue = [];
  }

  /** Post now, or queue until the worker is up; false when the worker is gone for good. */
  private send(m: Msg): boolean {
    if (this.dead || this.disposed) { return false; }
    if (this.w) { this.w.postMessage(m); } else { this.queue.push(m); }
    return true;
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
    j.timer = setTimeout(() => void this.restart('timeout'), TIMEOUT_MS);
  }

  private jobMsg(j: Job, m: Msg): void {
    this.arm(j);
    j.onMsg(m);
    if (m.t === 'done' || m.t === 'error') { this.finish(j, m.t); }
  }

  private finish(j: Job, why: End): void {
    clearTimeout(j.timer);
    if (this.job === j) { this.job = undefined; }
    j.onEnd(why);
  }

  /** Kill the worker (awaited) and start a fresh one; the current search ends with why and pending requests fail. */
  async restart(why: End = 'error'): Promise<void> {
    const old = this.w;
    this.w = undefined; // its late messages and exit are ignored from here on
    const j = this.job;
    for (const r of this.reqs.values()) { clearTimeout(r.timer); r.reject(new Error(TIMEOUT_MSG)); }
    this.reqs.clear();
    if (j) { this.finish(j, why); }
    try { await old?.terminate(); } catch (e) { this.onError?.('worker terminate', e); }
    this.start();
  }

  /** Start a search; any running search is canceled first. */
  search(p: { [k: string]: any }, onMsg: Job['onMsg'], onEnd: Job['onEnd']): void {
    this.cancel();
    const j: Job = { id: ++this.seq, onMsg, onEnd };
    this.job = j; // the timer starts when the worker reports 'started' (after any index wait)
    if (!this.send({ ...p, t: 'search', id: j.id })) { this.failAll('error', 'Search worker is not running'); }
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
      const timer = setTimeout(() => { this.reqs.delete(req); void this.restart('error'); reject(new Error(TIMEOUT_MSG)); }, TIMEOUT_MS * 2);
      this.reqs.set(req, { resolve, reject, timer });
      if (!this.send({ ...m, req })) { clearTimeout(timer); this.reqs.delete(req); reject(new Error('Search worker is not running')); }
    });
  }

  async dispose(): Promise<void> {
    try { await Promise.race([this.request({ t: 'dispose' }), new Promise((r) => setTimeout(r, 4000))]); } catch { /* worker gone */ }
    this.disposed = true;
    const w = this.w;
    this.w = undefined;
    await w?.terminate();
  }
}
