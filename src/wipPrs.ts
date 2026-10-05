import { ExecResult } from './wipExec';
import { Ctx, gh } from './wipGit';
import { PrInfo } from './wipTypes';

export const PR_CACHE_MS = 5 * 60 * 1000;
const PR_FIELDS = 'number,title,headRefName,isDraft,reviewDecision,url';
export const PR_ARGS = ['pr', 'list', '--state', 'open', '--limit', '100', '--json', PR_FIELDS + ',headRefOid,isCrossRepository'];
/** Same list without the two newer fields, for a gh that does not know them. */
export const PR_ARGS_OLD = ['pr', 'list', '--state', 'open', '--limit', '100', '--json', PR_FIELDS];
const TITLE_MAX = 80;

/** Open PRs of one repository by branch, or why they are unavailable (short words, never raw output). */
/** byBranch lists every PR (the sidebar pill shows a fork PR too); own leaves out fork PRs (Open Work matches only this repository's branches). */
export interface PrResult { byBranch: Map<string, PrInfo>; own?: Map<string, PrInfo>; error?: string; missing?: boolean; }

const REVIEW: { [k: string]: string } = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes requested', REVIEW_REQUIRED: 'review requested' };
export const reviewWord = (d: string): string => REVIEW[d] ?? '';

/** Plain title text: control characters and anything that looks like a link removed. */
export const cleanTitle = (t: string): string => t.replace(/https?:\/\/\S+/gi, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);

/** The PR page address from gh, only when it is an https link. */
const safeUrl = (u: unknown): string | undefined => (typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u : undefined);

/** Map the JSON of `gh pr list` by head branch (the highest number wins); with ownOnly, fork pull requests are skipped (a fork branch of the same name is not this repository's branch); undefined when it is not the expected shape. */
export function parsePrs(stdout: string, ownOnly = false): Map<string, PrInfo> | undefined {
  let v: unknown;
  try { v = JSON.parse(stdout); } catch { return undefined; }
  if (!Array.isArray(v)) { return undefined; }
  const m = new Map<string, PrInfo>();
  for (const x of v as Array<{ [k: string]: unknown }>) {
    if (!x || typeof x.number !== 'number' || typeof x.headRefName !== 'string' || (ownOnly && x.isCrossRepository === true)) { continue; }
    const prev = m.get(x.headRefName);
    if (prev && prev.number > x.number) { continue; }
    m.set(x.headRefName, { number: x.number, title: cleanTitle(String(x.title ?? '')), draft: x.isDraft === true, review: String(x.reviewDecision ?? ''), url: safeUrl(x.url), sha: typeof x.headRefOid === 'string' && /^[0-9a-f]{7,64}$/i.test(x.headRefOid) ? x.headRefOid : undefined });
  }
  return m;
}

/** Short reason why gh gave no answer. */
export function ghReason(r: ExecResult): string {
  if (r.timedOut) { return 'timed out'; }
  if (r.aborted) { return 'canceled'; }
  if (r.code === 'ENOENT') { return 'gh not installed'; }
  const e = r.stderr.toLowerCase();
  if (/auth|log ?in|token|credential/.test(e)) { return 'not signed in to gh'; }
  if (/connect|network|dial|resolve|offline|timeout/.test(e)) { return 'GitHub not reachable'; }
  if (/remote|github host|repository/.test(e)) { return 'not a GitHub repository'; }
  return 'gh failed';
}

/** One gh call for a repository folder. */
export async function fetchPrs(c: Ctx, cwd: string): Promise<PrResult> {
  let r = await gh(c, cwd, PR_ARGS);
  if (r.code !== 0 && /unknown json field/i.test(r.stderr)) { r = await gh(c, cwd, PR_ARGS_OLD); } // an older gh: ask without the two newer fields
  if (r.code !== 0) { return { byBranch: new Map(), error: ghReason(r), missing: r.code === 'ENOENT' }; }
  const m = parsePrs(r.stdout);
  return m ? { byBranch: m, own: parsePrs(r.stdout, true) } : { byBranch: new Map(), error: 'unreadable gh answer' };
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
      if (!r.error || r.missing) { this.m.set(key, { at: now, r }); }
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
