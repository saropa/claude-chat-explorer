import * as fs from 'fs';
import * as path from 'path';
import { Exec, ExecResult, OVERFLOW } from './wipExec';
import { MAX_COMMITS, parseCommits, parseRefs, parseStatus, parseTrack, parseWorktrees, REF_FORMAT, StatusParts } from './wipParse';
import { emptyFolder, FolderFacts, RepoFacts } from './wipTypes';

/** Everything a scan needs: the runner, cancellation, timeouts and flags raised on the way. */
export interface Ctx { exec: Exec; signal?: AbortSignal; gitMs: number; ghMs: number; flags: { gitMissing: boolean }; }

const GIT_OK = new Set(['rev-parse', 'status', 'worktree', 'for-each-ref', 'rev-list']);
const GH_OK = ['pr', 'list'];

/** Run one read-only git command; a command outside the allowed list throws before anything starts. */
export async function git(c: Ctx, cwd: string, args: string[]): Promise<ExecResult> {
  if (!GIT_OK.has(args[0]) || (args[0] === 'worktree' && args[1] !== 'list')) { throw new Error('git command not allowed: ' + args[0]); }
  const r = await c.exec('git', ['--no-pager', '--no-optional-locks', ...args], { cwd, timeout: c.gitMs, signal: c.signal });
  if (r.code === 'ENOENT') { c.flags.gitMissing = true; }
  return r;
}

/** Run the one allowed gh command (pr list). */
export function gh(c: Ctx, cwd: string, args: string[]): Promise<ExecResult> {
  if (args[0] !== GH_OK[0] || args[1] !== GH_OK[1]) { throw new Error('gh command not allowed: ' + args[0]); }
  return c.exec('gh', args, { cwd, timeout: c.ghMs, signal: c.signal });
}

/** Short reason for a failed command, never raw output. */
export const whyFailed = (r: ExecResult): string => (r.timedOut ? 'timed out' : r.aborted ? 'canceled' : r.code === 'ENOENT' ? 'git not found' : 'git error');

const real = async (p: string): Promise<string> => { try { return await fs.promises.realpath(p); } catch { return p; } };
const isDir = async (p: string): Promise<boolean> => { try { return (await fs.promises.stat(p)).isDirectory(); } catch { return false; } };

/** Folder check plus `git rev-parse`: missing, not a git folder, unavailable, or ok with top and common dir. */
export async function probe(c: Ctx, cwd: string): Promise<FolderFacts> {
  if (!(await isDir(cwd))) { return emptyFolder(cwd, 'missing'); }
  let r = await git(c, cwd, ['rev-parse', '--show-toplevel', '--git-common-dir', '--abbrev-ref', 'HEAD']);
  if (r.code !== 0 && /not a git repository/i.test(r.stderr)) { return emptyFolder(cwd, 'notgit'); }
  if (r.code !== 0 && !r.timedOut && !r.aborted && r.code !== 'ENOENT') { r = await git(c, cwd, ['rev-parse', '--show-toplevel', '--git-common-dir']); } // a repository with no commits has no HEAD
  const [top, common, head] = r.stdout.split(/\r?\n/);
  if (r.code !== 0 || !top || !common) { return emptyFolder(cwd, /not a git repository/i.test(r.stderr) ? 'notgit' : 'unavailable', whyFailed(r)); }
  return { ...emptyFolder(cwd, 'ok'), top: await real(top), common: await real(path.resolve(cwd, common)),
    branch: head && head !== 'HEAD' ? head : undefined, detached: head === 'HEAD' ? true : undefined };
}

/** `git status` of one worktree top; undefined with the reason when it failed. */
export async function statusOf(c: Ctx, top: string): Promise<StatusParts | string> {
  const r = await git(c, top, ['status', '--porcelain=v1', '--branch', '-z', '--untracked-files=normal']);
  return r.code === 0 || (r.code === OVERFLOW && r.stdout) ? parseStatus(r.stdout) : whyFailed(r);
}

/** Worktrees and the branches ahead of (or orphaned from) their upstream, for one repository. */
export async function repoOf(c: Ctx, common: string, cwd: string): Promise<RepoFacts> {
  const wt = await git(c, cwd, ['worktree', 'list', '--porcelain']);
  const worktrees = wt.code === 0 ? parseWorktrees(wt.stdout) : [];
  for (const w of worktrees) { w.missing = !(await isDir(w.path)); }
  const refs = await git(c, cwd, ['for-each-ref', '--format=' + REF_FORMAT, 'refs/heads']);
  const main = worktrees[0]?.path ?? path.dirname(common);
  const base = path.basename(common) === '.git' ? path.basename(path.dirname(common)) : path.basename(common).replace(/\.git$/, '');
  return { common, name: base || path.basename(main), main, worktrees, branches: refs.code === 0 ? parseRefs(refs.stdout) : [] };
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
