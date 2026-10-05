import { ExecResult } from './wipExec';
import { Ctx, gh } from './wipGit';
import { PrInfo } from './wipTypes';

export const PR_CACHE_MS = 5 * 60 * 1000;
export const PR_ARGS = ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,isDraft,reviewDecision,url'];
const TITLE_MAX = 80;

/** Open PRs of one repository by branch, or why they are unavailable (short words, never raw output). */
export interface PrResult { byBranch: Map<string, PrInfo>; error?: string; missing?: boolean; }

const REVIEW: { [k: string]: string } = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes requested', REVIEW_REQUIRED: 'review requested' };
export const reviewWord = (d: string): string => REVIEW[d] ?? '';

/** Plain title text: control characters and anything that looks like a link removed. */
export const cleanTitle = (t: string): string => t.replace(/https?:\/\/\S+/gi, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);

/** The PR page address from gh, only when it is an https link. */
const safeUrl = (u: unknown): string | undefined => (typeof u === 'string' && /^https:\/\/\S+$/.test(u) ? u : undefined);

/** Map the JSON of `gh pr list` by head branch (the highest number wins); undefined when it is not the expected shape. */
export function parsePrs(stdout: string): Map<string, PrInfo> | undefined {
  let v: unknown;
  try { v = JSON.parse(stdout); } catch { return undefined; }
  if (!Array.isArray(v)) { return undefined; }
  const m = new Map<string, PrInfo>();
  for (const x of v as Array<{ [k: string]: unknown }>) {
    if (!x || typeof x.number !== 'number' || typeof x.headRefName !== 'string') { continue; }
    const prev = m.get(x.headRefName);
    if (prev && prev.number > x.number) { continue; }
    m.set(x.headRefName, { number: x.number, title: cleanTitle(String(x.title ?? '')), draft: x.isDraft === true, review: String(x.reviewDecision ?? ''), url: safeUrl(x.url) });
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
  const r = await gh(c, cwd, PR_ARGS);
  if (r.code !== 0) { return { byBranch: new Map(), error: ghReason(r), missing: r.code === 'ENOENT' }; }
  const m = parsePrs(r.stdout);
  return m ? { byBranch: m } : { byBranch: new Map(), error: 'unreadable gh answer' };
}

/** Per repository cache of PR lookups (answers and failures alike) for five minutes; a forced refresh skips it; one gh call per repository is shared while running. */
export class PrCache {
  private m = new Map<string, { at: number; r: PrResult }>();
  private running = new Map<string, Promise<PrResult>>();
  async get(c: Ctx, key: string, cwd: string, force: boolean, now: number): Promise<PrResult> {
    const hit = this.m.get(key);
    if (hit && !force && now - hit.at < PR_CACHE_MS) { return hit.r; }
    const live = this.running.get(key);
    if (live) { return live; }
    const p = fetchPrs(c, cwd).then((r) => {
      if (!r.error || r.error !== 'canceled') { this.m.set(key, { at: now, r }); }
      return r;
    }).finally(() => this.running.delete(key));
    this.running.set(key, p);
    return p;
  }
}
