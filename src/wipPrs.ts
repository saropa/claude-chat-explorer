import { ExecResult } from './wipExec';
import { AUTH_ARGS, Ctx, gh, git } from './wipGit';
import { PrInfo } from './wipTypes';
import { PR_ARGS, PR_ARGS_OLD } from './wipPrsArgs';

export const PR_CACHE_MS = 5 * 60 * 1000;
export { PR_ARGS, PR_ARGS_OLD };
const TITLE_MAX = 80;

/** Open PRs of one repository by branch, or why they are unavailable (short words, never raw output). */
/** byBranch lists every PR (the sidebar pill shows a fork PR too); own leaves out fork PRs (Open Work matches only this repository's branches). */
export interface PrResult { byBranch: Map<string, PrInfo>; own?: Map<string, PrInfo>; error?: string; missing?: boolean; notGithub?: boolean; }

const REVIEW: { [k: string]: string } = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes requested', REVIEW_REQUIRED: 'review requested' };
export const reviewWord = (d: string): string => REVIEW[d] ?? '';

/** Plain title text: control characters and anything that looks like a link removed. */
export const cleanTitle = (t: string): string => t.replace(/https?:\/\/\S+/gi, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);

/** The PR page address from gh, only when it is an https link. */
const safeUrl = (u: unknown): string | undefined => (typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u : undefined);

/** The owner part of a git remote address (https, ssh or scp style), lower case; undefined when it has none. */
export function ownerOfRemote(url: string): string | undefined {
  const m = /[:/]([^/:\s]+)\/[^/\s]+?(?:\.git)?\/?\s*$/.exec(url.trim());
  return m ? m[1].toLowerCase() : undefined;
}

/** True when the PR's head is this clone's own: same owner as the origin remote (a fork workflow's own PR), or in this repository itself. Unknown owners fall back to the fork flag. */
function isOwn(x: { [k: string]: unknown }, originOwner?: string): boolean {
  const o = x.headRepositoryOwner as { login?: unknown } | null | undefined;
  const head = o && typeof o.login === 'string' ? o.login.toLowerCase() : undefined;
  if (head && originOwner) { return head === originOwner; }
  return x.isCrossRepository !== true;
}

/** Map the JSON of `gh pr list` by head branch. Own pull requests beat fork ones of the same branch name; within one class the highest number wins.
 *  With ownOnly, pull requests from other owners are skipped (a foreign branch of the same name is not this clone's branch). originOwner is the owner of the origin remote. Undefined when it is not the expected shape. */
export function parsePrs(stdout: string, ownOnly = false, originOwner?: string): Map<string, PrInfo> | undefined {
  let v: unknown;
  try { v = JSON.parse(stdout); } catch { return undefined; }
  if (!Array.isArray(v)) { return undefined; }
  const m = new Map<string, PrInfo>();
  const own = new Map<string, boolean>();
  for (const x of v as Array<{ [k: string]: unknown }>) {
    if (!x || typeof x.number !== 'number' || typeof x.headRefName !== 'string') { continue; }
    const mine = isOwn(x, originOwner);
    if (ownOnly && !mine) { continue; }
    const prev = m.get(x.headRefName);
    if (prev && (own.get(x.headRefName) === mine ? prev.number > x.number : own.get(x.headRefName) === true)) { continue; }
    own.set(x.headRefName, mine);
    m.set(x.headRefName, { number: x.number, title: cleanTitle(String(x.title ?? '')), draft: x.isDraft === true, review: String(x.reviewDecision ?? ''), url: safeUrl(x.url), sha: typeof x.headRefOid === 'string' && /^[0-9a-f]{7,64}$/i.test(x.headRefOid) ? x.headRefOid : undefined });
  }
  return m;
}

/** True when gh says none of the remotes is a GitHub host (it also mentions `gh auth login`, so this is tested before the sign-in rule). */
export const isNotGithub = (r: ExecResult): boolean => /none of the git remotes|known github host|no git remotes/i.test(r.stderr);

/** Short reason why gh gave no answer. */
export function ghReason(r: ExecResult): string {
  if (r.timedOut) { return 'timed out'; }
  if (r.aborted) { return 'canceled'; }
  if (r.code === 'ENOENT') { return 'gh not installed'; }
  if (isNotGithub(r)) { return 'not a GitHub repository'; }
  const e = r.stderr.toLowerCase();
  if (/rate limit/.test(e)) { return 'GitHub rate limit reached'; } // before the sign-in rule: the rate limit text also says "authenticated"
  if (/auth|log ?in|token|credential/.test(e)) { return 'not signed in to gh'; }
  if (/connect|network|dial|resolve|offline|timeout/.test(e)) { return 'GitHub not reachable'; }
  if (/remote|github host|repository/.test(e)) { return 'not a GitHub repository'; }
  return 'gh failed';
}

/** Whether gh is installed and signed in, from `gh auth status`. The reason is a short word, never raw output. */
export interface GhAuth { state: 'ok' | 'missing' | 'unauth' | 'error'; reason: string; }
export function authState(r: ExecResult): GhAuth {
  if (r.code === 'ENOENT') { return { state: 'missing', reason: 'gh not installed' }; }
  if (r.timedOut) { return { state: 'error', reason: 'timed out' }; }
  if (r.aborted) { return { state: 'error', reason: 'canceled' }; }
  const t = (r.stdout + '\n' + r.stderr).toLowerCase();
  if (r.code === 0 || /logged in to github\.com/.test(t)) { return { state: 'ok', reason: '' }; }
  if (/rate limit/.test(t)) { return { state: 'error', reason: 'GitHub rate limit reached' }; }
  if (/connect|network|dial|resolve|offline/.test(t)) { return { state: 'error', reason: 'GitHub not reachable' }; }
  return { state: 'unauth', reason: 'not signed in to gh' };
}

/** One `gh auth status` call (read-only). */
export async function fetchAuth(c: Ctx, cwd: string): Promise<GhAuth> {
  try { return authState(await gh(c, cwd, AUTH_ARGS)); } catch { return { state: 'error', reason: 'gh failed' }; }
}

/** One gh call for a repository folder. The origin owner is read (one `git remote get-url origin`) only when a fork pull request is in the list. */
export async function fetchPrs(c: Ctx, cwd: string): Promise<PrResult> {
  let r = await gh(c, cwd, PR_ARGS);
  if (r.code !== 0 && /unknown json field/i.test(r.stderr)) { r = await gh(c, cwd, PR_ARGS_OLD); } // an older gh: ask without the newer fields
  if (r.code !== 0) { return { byBranch: new Map(), error: ghReason(r), missing: r.code === 'ENOENT', notGithub: isNotGithub(r) }; }
  const m = parsePrs(r.stdout);
  if (!m) { return { byBranch: new Map(), error: 'unreadable gh answer' }; }
  const fork = /"isCrossRepository":\s*true/.test(r.stdout);
  const o = fork ? await git(c, cwd, ['remote', 'get-url', 'origin']) : undefined;
  const owner = o && o.code === 0 ? ownerOfRemote(o.stdout) : undefined;
  return { byBranch: parsePrs(r.stdout, false, owner) ?? m, own: parsePrs(r.stdout, true, owner) };
}

interface Shared { p: Promise<PrResult>; ac: AbortController; waiters: number; }

/** Per repository cache of PR lookups (an answer is kept for five minutes; a failure or timeout never is); a forced refresh skips it.
 *  One gh call per repository is shared while it runs. The cache owns that call's abort controller: a caller whose own signal
 *  aborts stops waiting, and the call is killed only when no caller is left (or at its own timeout). */
export class PrCache {
  private m = new Map<string, { at: number; r: PrResult }>();
  private running = new Map<string, Shared>();

  async get(c: Ctx, key: string, cwd: string, force: boolean, now: number): Promise<PrResult> {
    const hit = this.m.get(key);
    if (hit && !force && now - hit.at < PR_CACHE_MS) { return hit.r; }
    const e = this.running.get(key) ?? this.start(c, key, cwd, now);
    return this.wait(e, key, c.signal);
  }

  private start(c: Ctx, key: string, cwd: string, now: number): Shared {
    const ac = new AbortController();
    const p = fetchPrs({ ...c, signal: ac.signal }, cwd).catch((): PrResult => ({ byBranch: new Map(), error: 'gh failed' })).then((r) => {
      if (!r.error || r.missing || r.notGithub) { this.m.set(key, { at: now, r }); }
      return r;
    }).finally(() => { if (this.running.get(key) === e) { this.running.delete(key); } });
    const e: Shared = { p, ac, waiters: 0 };
    this.running.set(key, e);
    return e;
  }

  /** One caller's wait: ends with the shared answer, or as canceled when this caller's signal aborts first. */
  private wait(e: Shared, key: string, signal?: AbortSignal): Promise<PrResult> {
    e.waiters++;
    return new Promise<PrResult>((resolve) => {
      let left = false;
      const leave = (): boolean => { if (left) { return false; } left = true; signal?.removeEventListener('abort', onAbort); e.waiters--; return true; };
      const onAbort = (): void => {
        if (!leave()) { return; }
        resolve({ byBranch: new Map(), error: 'canceled' });
        if (e.waiters <= 0) { if (this.running.get(key) === e) { this.running.delete(key); } e.ac.abort(); }
      };
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener('abort', onAbort, { once: true });
      void e.p.then((r) => { if (leave()) { resolve(r); } });
    });
  }
}
