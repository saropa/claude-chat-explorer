/** Shared types of the git collector behind the chat card's Git section. */

export type FolderState = 'ok' | 'missing' | 'notgit' | 'unavailable' | 'notscanned';
export interface FileChange { s: string; p: string; }

/** What git said about one working folder. */
export interface FolderFacts {
  cwd: string; state: FolderState; reason?: string;
  top?: string; common?: string; branch?: string; detached?: boolean; sha?: string; noCommits?: boolean;
  staged: number; modified: number; untracked: number; files: FileChange[]; fileTotal: number;
  ahead: number; behind: number; upstream?: string; gone?: boolean;
}
export interface WorktreeInfo { path: string; branch: string; detached: boolean; main: boolean; missing: boolean; }
export interface BranchAhead { name: string; ahead: number; gone: boolean; }
export interface RepoFacts { common: string; name: string; main: string; worktrees: WorktreeInfo[]; branches: BranchAhead[]; }
export interface PrInfo { number: number; title: string; draft: boolean; review: string; url?: string; }

/** A chat in scope, as the worker reports it. */
export interface WipChatIn { id: string; title: string; last: number; cwd: string; prs: Array<[number, string]>; }
export interface WipChat extends WipChatIn { folder: FolderFacts; pr?: PrInfo; }

export interface WipStats { folders: number; gitMissing: boolean; gh: 'ok' | 'missing' | 'error' | 'off'; ms: number; }
/** One finished scan. */
export interface WipData {
  chats: WipChat[]; repos: Map<string, RepoFacts>; notScanned: number; gitMissing: boolean; prNote?: string; stats: WipStats; at: number;
}

export const emptyFolder = (cwd: string, state: FolderState, reason?: string): FolderFacts =>
  ({ cwd, state, reason, staged: 0, modified: 0, untracked: 0, files: [], fileTotal: 0, ahead: 0, behind: 0 });
