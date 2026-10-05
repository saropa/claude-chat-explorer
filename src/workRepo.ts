/** Repository layer of the Open Work scan: worktrees, default branch, merged branches, and the text of the remove command. Read-only. */
import * as fs from 'fs';
import * as path from 'path';
import { commitMergedOf, Ctx, defaultBranchOf, git, mergedOf, statusOf, whyFailed } from './wipGit';
import { parseWorktrees, StatusParts } from './wipParse';
import { WorktreeInfo } from './wipTypes';

export const MAX_WT_STATUS = 20;

/** Git facts of one worktree as the page needs them. */
export interface WtFacts { ok: boolean; reason?: string; fileTotal: number; ahead: number; behind: number; gone: boolean; upstream?: string; files: Array<{ s: string; p: string }>; }

export interface WtOut extends WorktreeInfo {
  real: string; // path with links resolved, for matching a chat folder
  merged: boolean | null; // merged into the default branch; null when that cannot be told
  facts?: WtFacts;
}

/** What the repository layer found. */
export interface RepoOut {
  common: string; name: string; main: string; def?: string; defLocal?: string; merged: string[]; worktrees: WtOut[]; reason?: string;
}

const real = async (p: string): Promise<string> => { try { return await fs.promises.realpath(p); } catch { return p; } };
const isDir = async (p: string): Promise<boolean> => { try { return (await fs.promises.stat(p)).isDirectory(); } catch { return false; } };

export const factsOf = (s: StatusParts | string): WtFacts =>
  typeof s === 'string' ? { ok: false, reason: s, fileTotal: 0, ahead: 0, behind: 0, gone: false, files: [] }
    : { ok: true, fileTotal: s.fileTotal, ahead: s.ahead, behind: s.behind, gone: s.gone, upstream: s.upstream, files: s.files };

/** Repository name from the common git dir (`.../proj/.git` is proj, `.../proj.git` is proj). */
export function repoName(common: string, main: string): string {
  const b = path.basename(common) === '.git' ? path.basename(path.dirname(common)) : path.basename(common).replace(/\.git$/, '');
  return b || path.basename(main);
}

/** Worktrees, default branch and merged state of one repository. onPartial is called once the list is known (before the per-worktree status runs) so the page can show rows early. */
export async function readRepo(c: Ctx, common: string, top: string, onPartial?: (r: RepoOut) => void): Promise<RepoOut | string> {
  const wt = await git(c, top, ['worktree', 'list', '--porcelain']);
  if (wt.code !== 0) { return whyFailed(wt); }
  const list = parseWorktrees(wt.stdout);
  const worktrees: WtOut[] = [];
  for (const w of list) { worktrees.push({ ...w, real: await real(w.path), missing: !(await isDir(w.path)), merged: null }); }
  const main = worktrees[0]?.path ?? path.dirname(common);
  const out: RepoOut = { common, name: repoName(common, main), main, merged: [], worktrees };
  const def = await defaultBranchOf(c, top);
  if (def) {
    out.def = def;
    out.defLocal = def.replace(/^origin\//, '');
    const m = await mergedOf(c, top, def);
    if (typeof m !== 'string') { out.merged = m; }
    await markMerged(c, top, out, typeof m !== 'string');
  }
  onPartial?.(out);
  const linked = worktrees.filter((w) => !w.main && !w.missing).slice(0, MAX_WT_STATUS);
  await Promise.all(linked.map(async (w) => { w.facts = factsOf(await statusOf(c, w.path)); }));
  return out;
}

/** Fill merged on each linked worktree: by branch name, or for a detached one by its commit. */
async function markMerged(c: Ctx, top: string, r: RepoOut, haveList: boolean): Promise<void> {
  const set = new Set(r.merged);
  await Promise.all(r.worktrees.filter((w) => !w.main).map(async (w) => {
    if (w.detached) { const v = await commitMergedOf(c, top, r.def!, w.head); w.merged = v === undefined ? null : v; }
    else if (haveList && w.branch) { w.merged = w.branch !== r.defLocal && set.has(w.branch); }
  }));
}

/** Quote one argument for the user's shell: single quotes on macOS and Linux, double quotes on Windows. */
export function quoteArg(s: string, win: boolean = process.platform === 'win32'): string {
  return win ? '"' + s.replace(/"/g, '') + '"' : "'" + s.replace(/'/g, "'\\''") + "'";
}

/** The command to paste in a terminal for a leftover worktree; '' when it is the main checkout or locked. It never contains --force or -D. */
export function removeCommand(r: { main: string; defLocal?: string }, w: { path: string; branch: string; main: boolean; locked: boolean; missing: boolean; merged: boolean | null }, win?: boolean): string {
  if (w.main || w.locked) { return ''; }
  const g = 'git -C ' + quoteArg(r.main, win);
  if (w.missing) { return g + ' worktree prune'; }
  const lines = [g + ' worktree remove ' + quoteArg(w.path, win)];
  if (w.merged === true && w.branch && w.branch !== r.defLocal && !w.branch.startsWith('-')) { lines.push(g + ' branch -d ' + quoteArg(w.branch, win)); }
  return lines.join('\n');
}
