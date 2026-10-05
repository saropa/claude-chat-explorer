import { ChildProcess, execFile } from 'child_process';

export interface ExecResult { code: number | string | null; stdout: string; stderr: string; timedOut: boolean; aborted: boolean; }
export interface ExecOpts { cwd: string; timeout: number; signal?: AbortSignal; }
export type Exec = (cmd: string, args: string[], o: ExecOpts) => Promise<ExecResult>;

const MAX_BUFFER = 4 * 1024 * 1024; // output read is capped; an overflow keeps the part read and kills the child
export const OVERFLOW = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
const blank = (code: number | string | null): ExecResult => ({ code, stdout: '', stderr: '', timedOut: false, aborted: false });

/** Run a program without a shell. The timeout resolves at once, so a child that holds its pipes cannot stall the caller. */
export const realExec: Exec = (cmd, args, o) => new Promise((resolve) => {
  let child: ChildProcess | undefined;
  let done = false;
  const fin = (r: ExecResult): void => {
    if (done) { return; }
    done = true;
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
    resolve(r);
  };
  const stop = (r: Partial<ExecResult>): void => { try { child?.kill('SIGKILL'); } catch { /* already gone */ } fin({ ...blank(null), ...r }); };
  const onAbort = (): void => stop({ aborted: true });
  const timer = setTimeout(() => stop({ timedOut: true }), o.timeout);
  if (o.signal?.aborted) { onAbort(); return; }
  o.signal?.addEventListener('abort', onAbort);
  try {
    const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GIT_PAGER: 'cat', PAGER: 'cat', GH_PAGER: 'cat', NO_COLOR: '1' };
    child = execFile(cmd, args, { cwd: o.cwd, env, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err ? ((err as NodeJS.ErrnoException).code ?? null) : 0;
      fin({ code: code as number | string | null, stdout: String(stdout), stderr: String(stderr), timedOut: false, aborted: false });
    });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(); // stdin closed at once: nothing can wait for input
  } catch { fin(blank('ENOENT')); }
});

/** Run fn over items with at most n in flight; results keep the item order; items not started after stop() are undefined. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>, stop?: () => boolean): Promise<Array<R | undefined>> {
  const out: Array<R | undefined> = new Array(items.length).fill(undefined);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && !stop?.()) { const i = next++; out[i] = await fn(items[i]); }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
