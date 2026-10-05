import * as fs from 'fs';
import * as path from 'path';
import { Exec, ExecResult, OVERFLOW } from './wipExec';
import { MAX_COMMITS, parseCommits, parseStatus, parseTrack, parseWorktrees, REF_FORMAT, StatusParts } from './wipParse';
import { emptyFolder, FolderFacts, RepoFacts } from './wipTypes';

/** Everything a scan needs: the runner, cancellation, timeouts and flags raised on the way. */
/** ghExec runs gh when set (gh has its own limit, not the git slots); otherwise exec runs it. */
export interface Ctx { exec: Exec; ghExec?: Exec; signal?: AbortSignal; gitMs: number; ghMs: number; flags: { gitMissing: boolean }; }

const GIT_OK = new Set(['rev-parse', 'symbolic-ref', 'status', 'worktree', 'for-each-ref', 'rev-list']);
const GH_OK = ['pr', 'list'];
/** The one other gh shape: a read-only look at one pull request's checks; the number is digits only. */
export const CHECKS_FIELDS = 'statusCheckRollup,headRefOid';
const PR_NUMBER = /^[1-9][0-9]{0,8}$/;
const isChecksView = (a: string[]): boolean => a.length === 5 && a[0] === 'pr' && a[1] === 'view' && PR_NUMBER.test(a[2]) && a[3] === '--json' && a[4] === CHECKS_FIELDS;

/** Run one read-only git command; a command outside the allowed list throws before anything starts. */
export async function git(c: Ctx, cwd: string, args: string[]): Promise<ExecResult> {
  if (!GIT_OK.has(args[0]) || (args[0] === 'worktree' && args[1] !== 'list')) { throw new Error('git command not allowed: ' + args[0]); }
  const r = await c.exec('git', ['--no-pager', '--no-optional-locks', ...args], { cwd, timeout: c.gitMs, signal: c.signal });
  if (r.code === 'ENOENT') { c.flags.gitMissing = true; }
  return r;
}

/** Run an allowed gh command: `pr list ...`, or `pr view <digits> --json statusCheckRollup,headRefOid`. Anything else throws before it starts. */
export function gh(c: Ctx, cwd: string, args: string[]): Promise<ExecResult> {
  if (!(args[0] === GH_OK[0] && args[1] === GH_OK[1]) && !isChecksView(args)) { throw new Error('gh command not allowed: ' + args[0]); }
  return (c.ghExec ?? c.exec)('gh', args, { cwd, timeout: c.ghMs, signal: c.signal });
}

/** Short reason for a failed command, never raw output. */
export const whyFailed = (r: ExecResult): string => (r.timedOut ? 'timed out' : r.aborted ? 'canceled' : r.code === 'ENOENT' ? 'git not found' : 'git error');

const real = async (p: string): Promise<string> => { try { return await fs.promises.realpath(p); } catch { return p; } };
const isDir = async (p: string): Promise<boolean> => { try { return (await fs.promises.stat(p)).isDirectory(); } catch { return false; } };

/** Folder check plus `git rev-parse`: missing, not a git folder, unavailable, or ok with top and common dir. */
export async function probe(c: Ctx, cwd: string): Promise<FolderFacts> {
  if (!(await isDir(cwd))) { return emptyFolder(cwd, 'missing'); }
  let r = await git(c, cwd, ['rev-parse', '--show-toplevel', '--git-common-dir', '--symbolic-full-name', 'HEAD']);
  if (r.code !== 0 && /not a git repository/i.test(r.stderr)) { return emptyFolder(cwd, 'notgit'); }
  let noCommits = false;
  if (r.code !== 0 && !r.timedOut && !r.aborted && r.code !== 'ENOENT') { r = await git(c, cwd, ['rev-parse', '--show-toplevel', '--git-common-dir']); noCommits = r.code === 0; } // a repository with no commits has no HEAD
  const [top, common, head] = r.stdout.split(/\r?\n/);
  if (r.code !== 0 || !top || !common) { return emptyFolder(cwd, /not a git repository/i.test(r.stderr) ? 'notgit' : 'unavailable', whyFailed(r)); }
  const f: FolderFacts = { ...emptyFolder(cwd, 'ok'), top: await real(top), common: await real(path.resolve(cwd, common)) };
  if (noCommits) {
    const n = await git(c, cwd, ['symbolic-ref', '--short', 'HEAD']);
    return { ...f, noCommits: true, branch: n.code === 0 ? n.stdout.trim() || undefined : undefined };
  }
  if (head === 'HEAD') {
    const s = await git(c, cwd, ['rev-parse', '--short', 'HEAD']);
    return { ...f, detached: true, sha: s.code === 0 ? s.stdout.trim() || undefined : undefined };
  }
  return { ...f, branch: head?.startsWith('refs/heads/') ? head.slice('refs/heads/'.length) : undefined };
}

/** `git status` of one worktree top; undefined with the reason when it failed. */
export async function statusOf(c: Ctx, top: string): Promise<StatusParts | string> {
  const r = await git(c, top, ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=normal']);
  return r.code === 0 || (r.code === OVERFLOW && r.stdout) ? parseStatus(r.stdout) : whyFailed(r);
}

/** Worktrees for one repository; a failed `worktree list` returns its reason so the caller can show an error and Retry. */
export async function repoOf(c: Ctx, common: string, cwd: string): Promise<RepoFacts | string> {
  const wt = await git(c, cwd, ['worktree', 'list', '--porcelain']);
  if (wt.code !== 0) { return whyFailed(wt); }
  const worktrees = parseWorktrees(wt.stdout);
  for (const w of worktrees) { w.missing = !(await isDir(w.path)); }
  const main = worktrees[0]?.path ?? path.dirname(common);
  const base = path.basename(common) === '.git' ? path.basename(path.dirname(common)) : path.basename(common).replace(/\.git$/, '');
  return { common, name: base || path.basename(main), main, worktrees, branches: [] };
}

/** Upstream, ahead and behind of one branch (one cheap for-each-ref call; no working tree scan). */
export async function trackOf(c: Ctx, top: string, branch: string): Promise<ReturnType<typeof parseTrack> | string> {
  const r = await git(c, top, ['for-each-ref', '--format=' + REF_FORMAT, 'refs/heads/' + branch]);
  return r.code === 0 ? parseTrack(r.stdout) : whyFailed(r);
}

/** The commits on HEAD that the upstream does not have (newest first, capped), with the short id and subject. */
export async function unpushedOf(c: Ctx, top: string): Promise<Array<{ sha: string; subject: string }> | string> {
  const r = await git(c, top, ['rev-list', '--max-count=' + MAX_COMMITS, '--format=%h%x09%s', '@{u}..HEAD']);
  return r.code === 0 ? parseCommits(r.stdout) : whyFailed(r);
}

const REF_SAFE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
const SHA_SAFE = /^[0-9a-f]{7,64}$/;

/** The remote's default branch as `origin/main`; undefined (default branch unknown) when git has none or the name is unusual. */
export async function defaultBranchOf(c: Ctx, cwd: string): Promise<string | undefined> {
  const r = await git(c, cwd, ['rev-parse', '--abbrev-ref', 'origin/HEAD']);
  const v = r.stdout.trim();
  return r.code === 0 && v !== 'origin/HEAD' && REF_SAFE.test(v) ? v : undefined;
}

export const MAX_MERGED = 500;

/** Local branches already merged into def (one for-each-ref call); a failed call returns its reason. */
export async function mergedOf(c: Ctx, cwd: string, def: string): Promise<string[] | string> {
  if (!REF_SAFE.test(def)) { return 'default branch unknown'; }
  const r = await git(c, cwd, ['for-each-ref', '--merged=' + def, '--format=%(refname:short)', 'refs/heads']);
  return r.code === 0 ? r.stdout.split(/\r?\n/).filter(Boolean).slice(0, MAX_MERGED) : whyFailed(r);
}

/** True when the commit is already inside def (`rev-list --count def..sha` is 0); undefined when it cannot be told. */
export async function commitMergedOf(c: Ctx, cwd: string, def: string, sha: string): Promise<boolean | undefined> {
  if (!REF_SAFE.test(def) || !SHA_SAFE.test(sha)) { return undefined; }
  const r = await git(c, cwd, ['rev-list', '--count', `${def}..${sha}`]);
  return r.code === 0 ? r.stdout.trim() === '0' : undefined;
}
