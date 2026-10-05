import * as fs from 'fs';
import * as path from 'path';
import { Ctx, probe, repoOf, statusOf, trackOf, unpushedOf } from './wipGit';
import { Exec, realExec } from './wipExec';
import { PrCache } from './wipPrs';
import { FileChange, FolderFacts } from './wipTypes';

const GIT_MS = 5000, GH_MS = 8000, DEADLINE_MS = 10000, QUEUE_GRACE_MS = 60000;

/** Each part of a chat card is its own on-demand request: git (branch, ahead/behind, PR), wt (worktrees), unc (uncommitted files), unp (unpushed commits). */
export type GitPart = 'git' | 'wt' | 'unc' | 'unp';
export const GIT_PARTS: readonly GitPart[] = ['git', 'wt', 'unc', 'unp'];

/** One worktree of the chat's repository; here marks the one the chat worked in. */
export interface WtLive { path: string; branch: string; detached: boolean; main: boolean; missing: boolean; here: boolean; }
/** PR as the card shows it. */
export interface PrLive { number: number; title: string; draft: boolean; review: string; }
export interface CommitLive { sha: string; subject: string; }

/** What one part of a chat card shows (sent to the panel); only the fields of the requested part are filled. */
export interface GitLive {
  state: 'ok' | 'none' | 'error' | 'timeout'; prPending?: boolean; reason?: string;
  top?: string; branch?: string; detached?: boolean; sha?: string; noCommits?: boolean; upstream?: string; gone?: boolean; ahead: number; behind: number;
  staged: number; modified: number; untracked: number; fileTotal: number; files: FileChange[];
  worktrees: WtLive[]; prs: PrLive[]; prNote?: string; commits: CommitLive[];
}

/** Private part kept in the host: what a click resolves against (the panel only sends an index or a number). */
export interface GitTargets { top: string; files?: FileChange[]; urls?: Map<number, string>; }

export const GIT_DEADLINE_MS = DEADLINE_MS;
export const TIMED_OUT = Symbol('timed out');
/** Resolve with TIMED_OUT when p takes longer than ms; p's own failure still rejects. */
export function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let t: NodeJS.Timeout | undefined;
  const late = new Promise<typeof TIMED_OUT>((res) => { t = setTimeout(() => res(TIMED_OUT), ms); });
  return Promise.race([p, late]).finally(() => { if (t) { clearTimeout(t); } });
}

const blank = (state: GitLive['state'], reason?: string): GitLive =>
  ({ state, reason, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], worktrees: [], prs: [], commits: [] });

/** True when both paths name the same folder after resolving symlinks (falls back to path.resolve). */
function samePath(a: string, b: string): boolean {
  const norm = (x: string): string => { try { return fs.realpathSync(path.resolve(x)); } catch { return path.resolve(x); } };
  return norm(a) === norm(b);
}

const NONE: { [k: string]: string } = { missing: 'The working folder no longer exists', notgit: 'The working folder is not a git folder', notscanned: 'The working folder was not scanned' };

type Loaded = { live: GitLive; targets?: GitTargets };
type Partial_ = (r: Loaded) => void;
const fail = (why: string): Loaded => ({ live: blank('error', `Could not read git state: ${why}`) });

/** The deadline of one card load. It counts only the time the load's own commands run: a command waiting for a slot in a limiter is covered by a long grace instead,
 *  and the clock restarts (with what is left) when the limiter really starts it. An exec that never reports a start counts from the call. */
class LoadClock {
  private timer: NodeJS.Timeout | undefined;
  private spent = 0;
  private active = 0;
  private since = 0;

  constructor(private readonly expire: () => void) { this.set(DEADLINE_MS + QUEUE_GRACE_MS); }

  private set(ms: number): void { clearTimeout(this.timer); this.timer = setTimeout(this.expire, Math.max(0, ms)); }

  /** An exec that tells this clock when each command is called and when it ends; a runner that is not limiter-wrapped starts at once. */
  wrap(exec: Exec): Exec {
    const limited = (exec as Exec & { limited?: boolean }).limited === true;
    return (cmd, args, o) => {
      if (this.active++ === 0) { this.set(DEADLINE_MS + QUEUE_GRACE_MS - this.spent); }
      const begin = (): void => { this.since = Date.now(); this.set(DEADLINE_MS - this.spent); };
      if (!limited) { begin(); }
      return exec(cmd, args, { ...o, onStart: () => { begin(); o.onStart?.(); } }).finally(() => {
        if (--this.active === 0) { if (this.since) { this.spent += Date.now() - this.since; this.since = 0; } this.set(DEADLINE_MS + QUEUE_GRACE_MS - this.spent); }
      });
    };
  }

  stop(): void { clearTimeout(this.timer); }
}

/** Loads one part of a chat card on demand. One load per folder and part runs at a time and a deadline ends it. */
export class GitLiveService {
  private readonly running = new Map<string, { p: Promise<Loaded>; subs: Set<Partial_> }>();

  /** exec runs git (the sidebar lane of the shared limiter in the extension, a plain runner elsewhere); ghExec runs gh; cache is the PR cache shared with the Open Work page. */
  constructor(private readonly exec: Exec = realExec, private readonly ghExec: Exec = realExec, private readonly cache: PrCache = new PrCache()) {}

  /** Never throws and never waits past the deadline; a timed-out load is aborted and released. onPartial gets the git part's first step before the PR lookup ends. */
  load(cwd: string, part: GitPart, prs: boolean, onPartial?: Partial_): Promise<Loaded> {
    if (!cwd) { return Promise.resolve({ live: blank('none', 'No working folder is recorded for this chat') }); }
    const key = `${cwd}|${part}|${prs}`;
    const hit = this.running.get(key);
    if (hit) { if (onPartial) { hit.subs.add(onPartial); } return hit.p; }
    const subs = new Set<Partial_>(onPartial ? [onPartial] : []);
    const ac = new AbortController();
    const clock = new LoadClock(() => { ac.abort(); fire(); });
    let fire: () => void = () => undefined;
    const late = new Promise<Loaded>((res) => { fire = () => res({ live: blank('timeout', 'Git info timed out') }); });
    const p = Promise.race([this.run(cwd, part, prs, ac.signal, (r) => subs.forEach((f) => f(r)), clock), late]).finally(() => {
      clock.stop();
      this.running.delete(key);
    });
    this.running.set(key, { p, subs });
    return p;
  }

  private async run(cwd: string, part: GitPart, prs: boolean, signal: AbortSignal, onPart: Partial_, clock: LoadClock): Promise<Loaded> {
    try {
      const ctx: Ctx = { exec: clock.wrap(this.exec), ghExec: clock.wrap(this.ghExec), gitMs: GIT_MS, ghMs: GH_MS, flags: { gitMissing: false }, signal };
      const f = await probe(ctx, cwd);
      if (ctx.flags.gitMissing) { return { live: blank('error', 'Git was not found on this computer') }; }
      if (f.state !== 'ok' || !f.top) { return { live: f.state === 'unavailable' ? blank('error', `Git is unavailable: ${f.reason ?? 'error'}`) : blank('none', NONE[f.state]) }; }
      if (part === 'unc') { return await this.uncommitted(ctx, f); }
      if (part === 'unp') { return await this.unpushed(ctx, f); }
      if (part === 'wt') { return await this.worktrees(ctx, f); }
      return await this.gitPart(ctx, f, prs, onPart);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'error');
    }
  }

  private base(f: FolderFacts): GitLive { return { ...blank('ok'), top: f.top, branch: f.branch, detached: f.detached, sha: f.sha, noCommits: f.noCommits }; }

  private async uncommitted(ctx: Ctx, f: FolderFacts): Promise<Loaded> {
    const s = await statusOf(ctx, f.top!);
    if (typeof s === 'string') { return fail(s); }
    const live = { ...this.base(f), staged: s.staged, modified: s.modified, untracked: s.untracked, fileTotal: s.fileTotal, files: s.files };
    return { live, targets: { top: path.resolve(f.top!), files: s.files } };
  }

  private async unpushed(ctx: Ctx, f: FolderFacts): Promise<Loaded> {
    if (!f.branch || f.noCommits) { return { live: this.base(f) }; }
    const t = await trackOf(ctx, f.top!, f.branch);
    if (typeof t === 'string') { return fail(t); }
    if (!t.upstream || t.gone || !t.ahead) { return { live: { ...this.base(f), upstream: t.upstream, gone: t.gone } }; }
    const c = await unpushedOf(ctx, f.top!);
    if (typeof c === 'string') { return fail(c); }
    return { live: { ...this.base(f), upstream: t.upstream, ahead: t.ahead, commits: c } };
  }

  private async worktrees(ctx: Ctx, f: FolderFacts): Promise<Loaded> {
    const repo = await repoOf(ctx, f.common ?? f.top!, f.top!);
    if (typeof repo === 'string') { return fail(repo); }
    return { live: { ...this.base(f), worktrees: repo.worktrees.map((w) => ({ ...w, here: samePath(w.path, f.top!) })) } };
  }

  /** Branch, upstream and ahead/behind first (cheap), then the PR lookup; the PR step's failure only sets prNote. */
  private async gitPart(ctx: Ctx, f: FolderFacts, prs: boolean, onPart: Partial_): Promise<Loaded> {
    const t = f.branch ? await trackOf(ctx, f.top!, f.branch) : undefined;
    if (typeof t === 'string') { return fail(t); }
    const live: GitLive = { ...this.base(f), ...(t ? { upstream: t.upstream, ahead: t.ahead, behind: t.behind, gone: t.gone } : {}) };
    const targets = { top: path.resolve(f.top!) };
    if (!prs || !f.branch || !f.common) { return { live, targets }; }
    onPart({ live: { ...live, prPending: true }, targets });
    const r = await this.cache.get(ctx, f.common, f.top!, false, Date.now());
    const pr = r.byBranch.get(f.branch);
    const urls = new Map<number, string>();
    if (pr?.url) { urls.set(pr.number, pr.url); }
    return { live: { ...live, prs: pr ? [{ number: pr.number, title: pr.title, draft: pr.draft, review: pr.review }] : [], prNote: r.error && r.error !== 'canceled' ? r.error : undefined }, targets: { ...targets, urls } };
  }
}

/** The state the card shows when the load ends without an answer. */
export const timedOutLive = (state: GitLive['state'] = 'timeout', reason = 'Git info timed out'): GitLive => blank(state, reason);
