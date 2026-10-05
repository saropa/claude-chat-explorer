import { Exec, ExecResult } from './wipExec';

/** ui is the sidebar (goes first, may use every slot); bg is the Open Work page (never more than bgMax slots). */
export type Lane = 'ui' | 'bg';
interface Job { lane: Lane; start: () => void; }

const aborted = (): ExecResult => ({ code: null, stdout: '', stderr: '', timedOut: false, aborted: true });
const failed = (): ExecResult => ({ code: 'EEXEC', stdout: '', stderr: '', timedOut: false, aborted: false });

/** Global limit on running commands with two lanes, so a page scan can never starve the sidebar. */
export class Limiter {
  private running = 0;
  private bgRunning = 0;
  private readonly queue: { ui: Job[]; bg: Job[] } = { ui: [], bg: [] };

  constructor(private readonly max: number, private readonly bgMax: number) {}

  /** Commands running and waiting now. */
  get load(): { running: number; bgRunning: number; waiting: number } {
    return { running: this.running, bgRunning: this.bgRunning, waiting: this.queue.ui.length + this.queue.bg.length };
  }

  /** An Exec that waits for a slot in its lane. onStart runs when the command really begins (not when it was queued). A queued command whose signal aborts never starts. */
  wrap(exec: Exec, lane: Lane, onStart?: () => void): Exec {
    return (cmd, args, o) => new Promise<ExecResult>((resolve) => {
      if (o.signal?.aborted) { resolve(aborted()); return; }
      const q = this.queue[lane];
      const onAbort = (): void => { const i = q.indexOf(job); if (i >= 0) { q.splice(i, 1); resolve(aborted()); } };
      const job: Job = {
        lane,
        start: () => {
          o.signal?.removeEventListener('abort', onAbort);
          try { onStart?.(); } catch { /* a start hook never blocks the command */ }
          exec(cmd, args, o).then(resolve, () => resolve(failed())).finally(() => this.done(lane));
        },
      };
      o.signal?.addEventListener('abort', onAbort, { once: true });
      q.push(job);
      this.pump();
    });
  }

  private done(lane: Lane): void {
    this.running--;
    if (lane === 'bg') { this.bgRunning--; }
    this.pump();
  }

  /** Start waiting commands: the sidebar lane first, the page lane only while it is under its own cap. */
  private pump(): void {
    while (this.running < this.max) {
      const job = this.queue.ui.length ? this.queue.ui.shift() : this.bgRunning < this.bgMax ? this.queue.bg.shift() : undefined;
      if (!job) { return; }
      this.running++;
      if (job.lane === 'bg') { this.bgRunning++; }
      job.start();
    }
  }
}
