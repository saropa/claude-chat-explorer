import * as fs from 'fs';
import * as path from 'path';
import { Exec, ExecResult, OVERFLOW } from './wipExec';
import { PR_ARGS, PR_ARGS_OLD } from './wipPrsArgs';
import { MAX_COMMITS, parseCommits, parseStatus, parseTrack, parseWorktrees, REF_FORMAT, StatusParts } from './wipParse';
import { emptyFolder, FolderFacts, RepoFacts } from './wipTypes';

/** Everything a scan needs: the runner, cancellation, timeouts and flags raised on the way. */
/** ghExec runs gh when set (gh has its own limit, not the git slots); otherwise exec runs it. */
export interface Ctx { exec: Exec; ghExec?: Exec; signal?: AbortSignal; gitMs: number; ghMs: number; flags: { gitMissing: boolean }; onStart?: () => void; }

const GIT_OK = new Set(['rev-parse', 'symbolic-ref', 'status', 'worktree', 'for-each-ref', 'rev-list', 'remote']);
/** The one other gh shape: a read-only look at one pull request's checks; the number is digits only. */
export const CHECKS_FIELDS = 'statusCheckRollup,headRefOid';
const PR_NUMBER = /^[1-9][0-9]{0,8}$/;
export const isPrNumber = (n: number): boolean => PR_NUMBER.test(String(n));
/** The one auth shape: `gh auth status`, read-only, never with --show-token or any other flag. */
export const AUTH_ARGS = ['auth', 'status'];
const isAuthStatus = (a: string[]): boolean => a.length === AUTH_ARGS.length && a.every((v, i) => v === AUTH_ARGS[i]);
const isChecksView = (a: string[]): boolean => a.length === 5 && a[0] === 'pr' && a[1] === 'view' && PR_NUMBER.test(a[2]) && a[3] === '--json' && a[4] === CHECKS_FIELDS;

/** The only list shape: exactly the argument list of wipPrs (current or older gh), nothing added, no -R, --web or -q. */
const isPrList = (a: string[]): boolean => [PR_ARGS, PR_ARGS_OLD].some((x) => x.length === a.length && x.every((v, i) => v === a[i]));

/** Run one read-only git command; a command outside the allowed list throws before anything starts. */
export async function git(c: Ctx, cwd: string, args: string[]): Promise<ExecResult> {
  if (!GIT_OK.has(args[0]) || (args[0] === 'worktree' && args[1] !== 'list') || (args[0] === 'remote' && args.join(' ') !== 'remote get-url origin')) { throw new Error('git command not allowed: ' + args[0]); }
  const r = await c.exec('git', ['--no-pager', '--no-optional-locks', ...args], { cwd, timeout: c.gitMs, signal: c.signal, onStart: c.onStart });
  if (r.code === 'ENOENT') { c.flags.gitMissing = true; }
  return r;
}

/** Run an allowed gh command: `auth status`, `pr list ...`, or `pr view <digits> --json statusCheckRollup,headRefOid`. Anything else throws before it starts. */
export function gh(c: Ctx, cwd: string, args: string[]): Promise<ExecResult> {
  if (!isPrList(args) && !isChecksView(args) && !isAuthStatus(args)) { throw new Error('gh command not allowed: ' + args[0]); }
  return (c.ghExec ?? c.exec)('gh', args, { cwd, timeout: c.ghMs, signal: c.signal, onStart: c.onStart });
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
  const wt = await git(c, cwd, ['worktree', 'list', '--porcelain', '-z']);
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

/** The newest commits of a branch that the default branch does not have, as sha, author, ISO date and subject (one read-only rev-list call, at most max). */
export async function uniqueCommitsOf(c: Ctx, top: string, def: string, branch: string, max: number): Promise<Array<{ sha: string; au: string; date: string; subject: string }> | string> {
  if (!REF_SAFE.test(def) || !REF_SAFE.test(branch)) { return 'name not usable'; }
  const r = await git(c, top, ['rev-list', '--max-count=' + max, '--format=%h%x09%an%x09%cI%x09%s', def + '..refs/heads/' + branch]);
  if (r.code !== 0) { return whyFailed(r); }
  const out: Array<{ sha: string; au: string; date: string; subject: string }> = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const p = line.split('\t');
    if (p.length >= 4 && !line.startsWith('commit ')) { out.push({ sha: p[0], au: p[1].slice(0, 60), date: p[2], subject: p.slice(3).join('\t').slice(0, 120) }); }
  }
  return out;
}
const SHA_SAFE = /^[0-9a-f]{7,64}$/;

/** The remote's default branch as `origin/main`; undefined (default branch unknown) when git has none or the name is unusual. */
export async function defaultBranchOf(c: Ctx, cwd: string): Promise<string | undefined> {
  const r = await git(c, cwd, ['rev-parse', '--abbrev-ref', 'origin/HEAD']);
  const v = r.stdout.trim();
  return r.code === 0 && v !== 'origin/HEAD' && REF_SAFE.test(v) ? v : undefined;
}

export const MAX_MERGED = 5000;

/** Local branches already merged into def (one for-each-ref call, at most MAX_MERGED names); a failed call or a longer list returns its reason. */
export async function mergedOf(c: Ctx, cwd: string, def: string): Promise<string[] | string> {
  if (!REF_SAFE.test(def)) { return 'default branch unknown'; }
  const r = await git(c, cwd, ['for-each-ref', '--merged=' + def, '--format=%(refname:lstrip=2)', 'refs/heads']);
  if (r.code === OVERFLOW) { return 'too many branches'; } // reported, never silently cut
  if (r.code !== 0) { return whyFailed(r); }
  const all = r.stdout.split(/\r?\n/).filter(Boolean);
  return all.length > MAX_MERGED ? 'too many branches' : all;
}

/** True when the commit is already inside def (`rev-list --count def..sha` is 0); undefined when it cannot be told. */
export async function commitMergedOf(c: Ctx, cwd: string, def: string, sha: string): Promise<boolean | undefined> {
  if (!REF_SAFE.test(def) || !SHA_SAFE.test(sha)) { return undefined; }
  const r = await git(c, cwd, ['rev-list', '--count', `${def}..${sha}`]);
  return r.code === 0 ? r.stdout.trim() === '0' : undefined;
}

const HEADS_SAFE = /^refs\/heads\/[^\u0000-\u001f\u007f\s~^:?*\[\\]+$/;

/** Commits a local branch (ref `refs/heads/<name>`) is ahead of and behind def: one `rev-list --left-right --count def...ref`; undefined when it cannot be told or the names are unusual. */
export async function divergeOf(c: Ctx, cwd: string, def: string, ref: string): Promise<{ ahead: number; behind: number } | undefined> {
  if (!REF_SAFE.test(def) || !HEADS_SAFE.test(ref)) { return undefined; }
  const r = await git(c, cwd, ['rev-list', '--left-right', '--count', `${def}...${ref}`]);
  const m = r.code === 0 ? /^(\d+)\s+(\d+)\s*$/.exec(r.stdout) : null;
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : undefined;
}

/** Ahead and behind def for every local branch in one call (`for-each-ref --format=%(refname:lstrip=2)%09%(ahead-behind:def)`, git 2.41 or newer); a reason when git cannot do it. */
export async function aheadBehindAll(c: Ctx, cwd: string, def: string): Promise<Map<string, { ahead: number; behind: number }> | string> {
  if (!REF_SAFE.test(def)) { return 'default branch unknown'; }
  const r = await git(c, cwd, ['for-each-ref', '--format=%(refname:lstrip=2)%09%(ahead-behind:' + def + ')', 'refs/heads']);
  if (r.code !== 0) { return whyFailed(r); }
  const m = new Map<string, { ahead: number; behind: number }>();
  for (const line of r.stdout.split(/\r?\n/)) {
    const x = /^(.+)\t(\d+) (\d+)$/.exec(line);
    if (x) { m.set(x[1], { ahead: Number(x[2]), behind: Number(x[3]) }); }
  }
  return m.size ? m : 'not supported';
}
