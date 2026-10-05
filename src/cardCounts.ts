import { git, Ctx } from './wipGit';
import { Exec, OVERFLOW, realExec } from './wipExec';
import { GIT_DEADLINE_MS, GitLiveService, withDeadline } from './gitLive';

const GIT_MS = 5000;
const CACHE_MS = 30000;
/** The five section parts of a chat card that show a count pill. */
export type CountPart = 'rel' | 'unc' | 'unp' | 'wt' | 'git';

/** What the counts need from the extension: worker requests, the search folders, the PR setting and a way to post. */
export interface CountDeps {
  request: (m: { [k: string]: unknown }) => Promise<any>;
  folders: () => string[];
  prsOn: () => boolean;
  post: (m: { [k: string]: unknown }) => void;
  log: (what: string, e: unknown) => void;
}

/** Entries of `git status --porcelain=v1 -z`; the extra path after a rename or copy is not counted. */
export function countStatus(out: string): number {
  const parts = out.split('\0');
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) { continue; }
    n++;
    if (e[0] === 'R' || e[0] === 'C') { i++; }
  }
  return n;
}

/** Worktrees in `git worktree list --porcelain`. */
export const countWorktrees = (out: string): number => out.split(/\r?\n/).filter((l) => l.startsWith('worktree ')).length;

/** Cheap counts for the section pills of an expanded chat card, one soft background request per card; nothing here can block a search. */
export class CardCounts {
  private readonly busy = new Map<string, Promise<number | null>>();
  private readonly done = new Map<string, { at: number; n: number }>();

  constructor(private readonly d: CountDeps, private readonly live: GitLiveService, private readonly exec: Exec = realExec) {}

  /** Post each count as it arrives (a number, or null for none); rq is echoed so the panel can drop a stale answer. */
  async run(id: string, rq: number): Promise<void> {
    const put = (part: CountPart, n: number | null): void => this.d.post({ type: 'counts', id, rq, part, n });
    const rel = this.cached(`rel|${id}`, () => this.related(id)).then((n) => put('rel', n));
    let cwd = '';
    try {
      const c = await withDeadline(this.d.request({ t: 'chatCwd', chat: id, folders: this.d.folders() }), GIT_DEADLINE_MS);
      cwd = typeof c === 'string' ? c : '';
    } catch (e) { this.d.log('counts folder', e); }
    if (!cwd) { put('unc', null); put('unp', null); put('wt', null); put('git', null); await rel; return; }
    const one = (part: 'unc' | 'unp' | 'wt'): Promise<void> => this.cached(`${part}|${cwd}`, () => this.count(cwd, part)).then((n) => put(part, n));
    await Promise.all([rel, one('unc'), one('unp'), one('wt')]);
    put('git', await this.cached(`git|${cwd}|${this.d.prsOn()}`, () => this.prs(cwd)));
  }

  /** One in-flight promise per key (shared); only a success is kept for 30 s, a failure or timeout is not. */
  private cached(key: string, fn: () => Promise<number | null>): Promise<number | null> {
    const hit = this.done.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) { return Promise.resolve(hit.n); }
    const run = this.busy.get(key);
    if (run) { return run; }
    const p = fn().catch((e) => { this.d.log('counts ' + key.split('|')[0], e); return null; }).then((n) => {
      if (n !== null) { this.done.set(key, { at: Date.now(), n }); }
      return n;
    }).finally(() => { this.busy.delete(key); });
    this.busy.set(key, p);
    return p;
  }

  private async related(id: string): Promise<number | null> {
    const r = await this.d.request({ t: 'related', chat: id });
    return Array.isArray(r) ? r.length : null;
  }

  private async count(cwd: string, part: 'unc' | 'unp' | 'wt'): Promise<number | null> {
    const ctx: Ctx = { exec: this.exec, gitMs: GIT_MS, ghMs: GIT_MS, flags: { gitMissing: false } };
    if (part === 'unc') {
      const r = await git(ctx, cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
      return r.code === 0 || (r.code === OVERFLOW && r.stdout) ? countStatus(r.stdout) : null;
    }
    if (part === 'wt') {
      const r = await git(ctx, cwd, ['worktree', 'list', '--porcelain']);
      return r.code === 0 ? countWorktrees(r.stdout) : null;
    }
    const r = await git(ctx, cwd, ['rev-list', '--count', '@{u}..HEAD']);
    if (r.code === 0) { return Number(r.stdout.trim()) || 0; }
    return !r.timedOut && !r.aborted && /upstream|unknown revision/i.test(r.stderr) ? 0 : null; // no upstream: nothing to push
  }

  /** Open pull requests of the chat's branch; null when lookups are off or failed (no pill). */
  private async prs(cwd: string): Promise<number | null> {
    if (!this.d.prsOn()) { return null; }
    const r = await this.live.load(cwd, 'git', true);
    const l = r.live;
    return l.state === 'ok' && !l.prPending && !l.prNote && l.branch ? l.prs.length : null;
  }
}
