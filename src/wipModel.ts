import * as path from 'path';
import { shortAgo } from './group';
import { Dot, DotMap } from './liveState';
import { reviewWord } from './wipPrs';
import { FolderFacts, PrInfo, RepoFacts, WipChat, WipData } from './wipTypes';

export type Mode = 'chat' | 'worktree';
export interface View { mode: Mode; clean: boolean; now: number; dots: DotMap; }
const BRANCH_MAX = 28;

export const isLive = (d?: Dot): boolean => !!d && (d.s === 'running' || d.s === 'waiting' || d.ring);
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** State word of a chat: running, waiting, unread, else its short age. */
export function stateWord(d: Dot | undefined, last: number, now: number): string {
  return d && (d.s === 'running' || d.s === 'waiting' || d.s === 'unread') ? d.s : shortAgo(last, now);
}

export function shortBranch(b?: string): string {
  if (!b) { return ''; }
  return b.length > BRANCH_MAX ? b.slice(0, BRANCH_MAX - 1) + '…' : b;
}

/** Highest-numbered recorded PRs of a chat, shown only when no open PR matches its branch. */
export const linkedOf = (c: WipChat): number[] => (c.pr ? [] : c.prs.map((p) => p[0]).slice(0, 3));

/** Something is pending: files not checked in, commits not pushed, an open or linked PR, or a live session. */
export function pendingChat(c: WipChat, d?: Dot): boolean {
  const f = c.folder;
  return f.fileTotal > 0 || f.ahead > 0 || !!c.pr || linkedOf(c).length > 0 || isLive(d);
}

/** "3 modified, 1 staged, 2 new". */
export function filesText(f: FolderFacts): string {
  const p: string[] = [];
  if (f.modified) { p.push(`${f.modified} modified`); }
  if (f.staged) { p.push(`${f.staged} staged`); }
  if (f.untracked) { p.push(`${f.untracked} new`); }
  return p.join(', ');
}

/** "PR #123 title (draft, review requested)". */
export function prText(p: PrInfo): string {
  const tags = [p.draft ? 'draft' : '', reviewWord(p.review)].filter(Boolean).join(', ');
  return `PR #${p.number} ${p.title}`.trim() + (tags ? ` (${tags})` : '');
}

export const baseName = (p: string): string => path.basename(p) || p;

/** Chat folder labels: the repository and worktree name, and whether it is a worktree or the main checkout. */
export function folderLabel(f: FolderFacts, repo?: RepoFacts): { label: string; desc: string } {
  const name = baseName(f.top ?? f.cwd);
  if (f.state === 'missing') { return { label: `Folder: ${name}`, desc: 'folder missing' }; }
  if (f.state === 'notgit') { return { label: `Folder: ${name}`, desc: 'not a git folder' }; }
  if (f.state === 'notscanned') { return { label: `Folder: ${name}`, desc: 'not scanned' }; }
  if (f.state === 'unavailable') { return { label: `Folder: ${name}`, desc: `unavailable: ${f.reason ?? 'error'}` }; }
  const main = repo?.worktrees.find((w) => w.main)?.path === f.top;
  return { label: `Folder: ${repo ? repo.name + '/' : ''}${name}`, desc: main ? 'main checkout' : 'worktree' };
}

/** Chats that pass the pending filter (all of them with clean on), newest first. */
export function shownChats(d: WipData, v: View): WipChat[] {
  return d.chats.filter((c) => v.clean || pendingChat(c, v.dots[c.id])).sort((a, b) => b.last - a.last);
}

/** Chats that used one worktree (or one folder that is not a worktree). */
export interface WtGroup { key: string; facts: FolderFacts; repo?: RepoFacts; chats: WipChat[]; }

export function worktreeGroups(d: WipData, v: View): WtGroup[] {
  const by = new Map<string, WtGroup>();
  for (const c of shownChats(d, v)) {
    const key = c.folder.top ?? c.folder.cwd;
    const g = by.get(key) ?? { key, facts: c.folder, repo: c.folder.common ? d.repos.get(c.folder.common) : undefined, chats: [] };
    g.chats.push(c);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.chats[0].last - a.chats[0].last);
}

/** Pending chats: the badge count. */
export const pendingCount = (d: WipData, dots: DotMap): number => d.chats.filter((c) => pendingChat(c, dots[c.id])).length;
