import * as fs from 'fs';
import * as path from 'path';
import { collect } from './wipCollect';
import { Ctx } from './wipGit';
import { realExec } from './wipExec';
import { PrCache } from './wipPrs';
import { FileChange, PrInfo, WipChat, WipChatIn } from './wipTypes';

const GIT_MS = 5000, GH_MS = 8000, DEADLINE_MS = 10000;

/** One worktree of the chat's repository; here marks the one the chat worked in. */
export interface WtLive { path: string; branch: string; detached: boolean; main: boolean; missing: boolean; here: boolean; }
/** PR as the card shows it. */
export interface PrLive { number: number; title: string; draft: boolean; review: string; }

/** What the Git section of a chat card shows (sent to the panel). */
export interface GitLive {
  state: 'ok' | 'none' | 'error' | 'timeout'; prPending?: boolean; reason?: string;
  top?: string; branch?: string; detached?: boolean; upstream?: string; gone?: boolean; ahead: number; behind: number;
  staged: number; modified: number; untracked: number; fileTotal: number; files: FileChange[];
  worktrees: WtLive[]; prs: PrLive[]; prNote?: string;
}

/** Private part kept in the host: what a click resolves against (the panel only sends an index or a number). */
export interface GitTargets { top: string; files: FileChange[]; urls: Map<number, string>; }

export const GIT_DEADLINE_MS = DEADLINE_MS;
export const TIMED_OUT = Symbol('timed out');
/** Resolve with TIMED_OUT when p takes longer than ms; p's own failure still rejects. */
export function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let t: NodeJS.Timeout | undefined;
  const late = new Promise<typeof TIMED_OUT>((res) => { t = setTimeout(() => res(TIMED_OUT), ms); });
  return Promise.race([p, late]).finally(() => { if (t) { clearTimeout(t); } });
}

const blank = (state: GitLive['state'], reason?: string): GitLive =>
  ({ state, reason, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], worktrees: [], prs: [] });

/** True when both paths name the same folder after resolving symlinks (falls back to path.resolve). */
function samePath(a: string, b: string): boolean {
  const norm = (x: string): string => { try { return fs.realpathSync(path.resolve(x)); } catch { return path.resolve(x); } };
  return norm(a) === norm(b);
}

const NONE: { [k: string]: string } = { missing: 'The working folder no longer exists', notgit: 'The working folder is not a git folder', notscanned: 'The working folder was not scanned' };

function liveOf(c: WipChat, repos: Awaited<ReturnType<typeof collect>>['repos'], prNote: string | undefined): GitLive {
  const f = c.folder;
  if (f.state !== 'ok') { return f.state === 'unavailable' ? blank('error', `Git is unavailable: ${f.reason ?? 'error'}`) : blank('none', NONE[f.state]); }
  const repo = f.common ? repos.get(f.common) : undefined;
  const pr: PrInfo | undefined = c.pr;
  return { ...blank('ok', undefined), top: f.top, branch: f.branch, detached: f.detached, upstream: f.upstream, gone: f.gone, ahead: f.ahead, behind: f.behind,
    staged: f.staged, modified: f.modified, untracked: f.untracked, fileTotal: f.fileTotal, files: f.files, prNote,
    worktrees: (repo?.worktrees ?? []).map((w) => ({ ...w, here: samePath(w.path, f.top ?? '') })),
    prs: pr ? [{ number: pr.number, title: pr.title, draft: pr.draft, review: pr.review }] : [] };
}

type Loaded = { live: GitLive; targets?: GitTargets };
type Partial_ = (r: Loaded) => void;

/** Loads the Git section data of one chat in two steps: branch, counts and worktrees first, the PR lookup after (its failure never blocks the first step). One load per folder runs at a time and a deadline ends it. */
export class GitLiveService {
  private readonly cache = new PrCache();
  private readonly running = new Map<string, { p: Promise<Loaded>; subs: Set<Partial_> }>();

  /** Never throws and never waits past the deadline; a timed-out load is aborted and released. onPartial gets the first step before the PR lookup ends. */
  load(id: string, cwd: string, prs: boolean, onPartial?: Partial_): Promise<Loaded> {
    if (!cwd) { return Promise.resolve({ live: blank('none', 'No working folder is recorded for this chat') }); }
    const key = `${cwd}|${prs}`;
    const hit = this.running.get(key);
    if (hit) { if (onPartial) { hit.subs.add(onPartial); } return hit.p; }
    const subs = new Set<Partial_>(onPartial ? [onPartial] : []);
    const ac = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<Loaded>((res) => { timer = setTimeout(() => { ac.abort(); res({ live: blank('timeout', 'Git info timed out') }); }, DEADLINE_MS); });
    const p = Promise.race([this.run(id, cwd, prs, ac.signal, (r) => subs.forEach((f) => f(r))), late]).finally(() => {
      if (timer) { clearTimeout(timer); }
      this.running.delete(key);
    });
    this.running.set(key, { p, subs });
    return p;
  }

  private async run(id: string, cwd: string, prs: boolean, signal: AbortSignal, part: Partial_): Promise<Loaded> {
    try {
      const ctx = { exec: realExec, gitMs: GIT_MS, ghMs: GH_MS, flags: { gitMissing: false }, signal };
      const chat: WipChatIn = { id, title: '', last: Date.now(), cwd, prs: [] };
      const now = Date.now();
      const d = await collect([chat], { ctx, prs: false, cache: this.cache, force: false, now });
      if (d.gitMissing) { return { live: blank('error', 'Git was not found on this computer') }; }
      const c = d.chats[0];
      const first = this.pack(c, d, prs ? 'looking up' : undefined);
      if (!prs || first.live.state !== 'ok') { return first; }
      part(first);
      return await this.withPr(ctx, c, d, now);
    } catch {
      return { live: blank('error', 'Could not read git state') };
    }
  }

  private pack(c: WipChat, d: Awaited<ReturnType<typeof collect>>, prPending?: string): Loaded {
    const live = liveOf(c, d.repos, undefined);
    if (prPending) { live.prPending = true; }
    const urls = new Map<number, string>();
    if (c.pr?.url) { urls.set(c.pr.number, c.pr.url); }
    return { live, targets: live.top ? { top: path.resolve(live.top), files: c.folder.files, urls } : undefined };
  }

  /** The PR step: one cached gh call for the repository; any failure only sets prNote. */
  private async withPr(ctx: Ctx, c: WipChat, d: Awaited<ReturnType<typeof collect>>, now: number): Promise<Loaded> {
    const f = c.folder, repo = f.common ? d.repos.get(f.common) : undefined;
    if (!f.common || !f.branch || !repo) { return this.pack(c, d); }
    const main = repo.worktrees.find((w) => w.main && !w.missing);
    const r = await this.cache.get(ctx, f.common, main?.path ?? path.dirname(f.common), false, now);
    const pr = r.byBranch.get(f.branch);
    const withPr: WipChat = { ...c, pr };
    const out = this.pack(withPr, d);
    out.live.prNote = r.error && r.error !== 'canceled' ? r.error : undefined;
    return out;
  }
}

/** The state the card shows when the load ends without an answer. */
export const timedOutLive = (state: GitLive['state'] = 'timeout', reason = 'Git info timed out'): GitLive => blank(state, reason);
