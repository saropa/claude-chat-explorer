/** Repository layer of the Open Work scan: worktrees, default branch, merged branches, and the text of the remove command. Read-only. */
import * as fs from 'fs';
import * as path from 'path';
import { commitMergedOf, Ctx, defaultBranchOf, git, mergedOf, statusOf, whyFailed } from './wipGit';
import { parseLocalBranches, parseWorktrees, REF_FORMAT, StatusParts } from './wipParse';
import { WorktreeInfo } from './wipTypes';

export const MAX_WT_STATUS = 20;
export const REPO_GIT_SLOTS = 2; // the page lane has 3 git slots: 2 for folders, the repository layer keeps to its own share so it cannot starve them or itself

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
  const wt = await git(c, top, ['worktree', 'list', '--porcelain', '-z']);
  if (wt.code !== 0) { return whyFailed(wt); }
  const list = parseWorktrees(wt.stdout);
  const worktrees: WtOut[] = [];
  for (const w of list) { worktrees.push({ ...w, real: await real(w.path), missing: !(await isDir(w.path)), merged: null }); }
  const main = worktrees[0]?.path ?? path.dirname(common);
  const out: RepoOut = { common, name: repoName(common, main), main, merged: [], worktrees };
  onPartial?.(out); // rows show at once, even if a later step times out
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
  await capped(c, linked, async (w) => { const f = factsOf(await statusOf(c, w.path)); if (!c.signal?.aborted) { w.facts = f; } }); // after a timeout the finished worktrees keep their facts; the rest stay unread
  return out;
}

/** Run fn over the items with at most REPO_GIT_SLOTS in flight; nothing new starts once the lane is aborted. */
async function capped<T>(c: Ctx, items: T[], fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async (): Promise<void> => {
    for (; !c.signal?.aborted && i < items.length;) { await fn(items[i++]); }
  };
  await Promise.all(Array.from({ length: Math.min(REPO_GIT_SLOTS, items.length) }, worker));
}

/** Fill merged on each linked worktree: by branch name, or for a detached one by its commit. */
async function markMerged(c: Ctx, top: string, r: RepoOut, haveList: boolean): Promise<void> {
  const set = new Set(r.merged);
  await capped(c, r.worktrees.filter((w) => !w.main), async (w) => {
    if (w.detached) { const v = await commitMergedOf(c, top, r.def!, w.head); w.merged = v === undefined ? null : v; }
    else if (haveList && w.branch) { w.merged = w.branch !== r.defLocal && set.has(w.branch); }
  });
}

/** Characters a Windows shell would still act on inside quotes ($ ` % " ! ^, smart quotes, control characters): no command is built for them. */
const WIN_UNSAFE = /[$`%"!^\u0000-\u001f\u007f\u2018\u2019\u201a\u201b\u201c\u201d]/;
export const winUnsafe = (s: string): boolean => WIN_UNSAFE.test(s);

/** Quote one argument for the user's shell: single quotes on macOS and Linux and in PowerShell (a quote inside is doubled there, escaped as '\'' on POSIX). Callers never pass a Windows argument that winUnsafe accepts. */
export function quoteArg(s: string, win: boolean = process.platform === 'win32'): string {
  return win ? "'" + s.replace(/'/g, "''") + "'" : "'" + s.replace(/'/g, "'\\''") + "'";
}

/** The command to paste in a terminal for a leftover worktree; '' when it is the main checkout or locked; 'manual' when Windows would misread a character in the path or branch. It never contains --force or -D. */
export function removeCommand(r: { main: string; defLocal?: string }, w: { path: string; branch: string; main: boolean; locked: boolean; missing: boolean; merged: boolean | null }, win: boolean = process.platform === 'win32'): string {
  if (w.main || w.locked) { return ''; }
  const dropBranch = !(w.merged === true && w.branch && w.branch !== r.defLocal && !w.branch.startsWith('-'));
  if (win && (winUnsafe(r.main) || (!w.missing && (winUnsafe(w.path) || (!dropBranch && winUnsafe(w.branch)))))) { return 'manual'; }
  const g = 'git -C ' + quoteArg(r.main, win);
  if (w.missing) { return g + ' worktree prune'; }
  const lines = [g + ' worktree remove ' + quoteArg(w.path, win)];
  if (!dropBranch) { lines.push(g + ' branch -d ' + quoteArg(w.branch, win)); }
  return lines.join('\n');
}

export const MAX_BRANCH_ROWS = 50;
/** A local branch nothing uses: no worktree, no chat, not the default branch; merged into the default branch or its remote branch is gone. */
export interface BranchOut { name: string; merged: boolean; gone: boolean; }

/** Leftover local branches of one repository (one read-only for-each-ref call). inUse holds the branches of chats in scope. A failed call returns its reason. */
export async function branchesOf(c: Ctx, r: RepoOut, inUse: Set<string>): Promise<{ list: BranchOut[]; more: number } | string> {
  const top = r.worktrees.find((w) => !w.missing)?.path;
  if (!top) { return 'folder missing'; }
  const res = await git(c, top, ['for-each-ref', '--format=' + REF_FORMAT, 'refs/heads']);
  if (res.code !== 0) { return whyFailed(res); }
  const used = new Set([...inUse, ...r.worktrees.map((w) => w.branch)]);
  if (r.defLocal) { used.add(r.defLocal); }
  const merged = new Set(r.merged);
  const all = parseLocalBranches(res.stdout)
    .filter((b) => !b.name.startsWith('-') && !used.has(b.name) && (merged.has(b.name) || b.gone))
    .map((b) => ({ name: b.name, merged: merged.has(b.name), gone: b.gone }));
  return { list: all.slice(0, MAX_BRANCH_ROWS), more: Math.max(0, all.length - MAX_BRANCH_ROWS) };
}

/** The command to paste in a terminal that deletes one leftover branch ('git branch -d', which git itself refuses for an unmerged branch); '' for the default branch or an option-like name; 'manual' when Windows would misread a character. Never --force or -D. */
export function branchCommand(r: { main: string; defLocal?: string }, branch: string, win: boolean = process.platform === 'win32'): string {
  if (!branch || branch.startsWith('-') || branch === r.defLocal) { return ''; }
  if (win && (winUnsafe(r.main) || winUnsafe(branch))) { return 'manual'; }
  return 'git -C ' + quoteArg(r.main, win) + ' branch -d ' + quoteArg(branch, win);
}
