import * as fs from 'fs';
import * as path from 'path';
import { collect } from './wipCollect';
import { realExec } from './wipExec';
import { PrCache } from './wipPrs';
import { FileChange, PrInfo, WipChat, WipChatIn } from './wipTypes';

const GIT_MS = 5000, GH_MS = 15000;

/** One worktree of the chat's repository; here marks the one the chat worked in. */
export interface WtLive { path: string; branch: string; detached: boolean; main: boolean; missing: boolean; here: boolean; }
/** PR as the card shows it. */
export interface PrLive { number: number; title: string; draft: boolean; review: string; }

/** What the Git section of a chat card shows (sent to the panel). */
export interface GitLive {
  state: 'ok' | 'none' | 'error'; reason?: string;
  top?: string; branch?: string; detached?: boolean; upstream?: string; gone?: boolean; ahead: number; behind: number;
  staged: number; modified: number; untracked: number; fileTotal: number; files: FileChange[];
  worktrees: WtLive[]; prs: PrLive[]; prNote?: string;
}

/** Private part kept in the host: what a click resolves against (the panel only sends an index or a number). */
export interface GitTargets { top: string; files: FileChange[]; urls: Map<number, string>; }

const blank = (state: GitLive['state'], reason?: string): GitLive =>
  ({ state, reason, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], worktrees: [], prs: [] });

/** True when both paths name the same folder after resolving symlinks (falls back to path.resolve). */
function samePath(a: string, b: string): boolean {
  const norm = (x: string): string => { try { return fs.realpathSync(path.resolve(x)); } catch { return path.resolve(x); } };
  return norm(a) === norm(b);
}

const NONE: { [k: string]: string } = { missing: 'The working folder no longer exists', notgit: 'The working folder is not a git folder', notscanned: 'The working folder was not scanned' };

function liveOf(c: WipChat, repos: Awaited<ReturnType<typeof collect>>['repos'], prNote: string | undefined): GitLive {
  const f = c.folder;
  if (f.state !== 'ok') { return f.state === 'unavailable' ? blank('error', `Git is unavailable: ${f.reason ?? 'error'}`) : blank('none', NONE[f.state]); }
  const repo = f.common ? repos.get(f.common) : undefined;
  const pr: PrInfo | undefined = c.pr;
  return { ...blank('ok', undefined), top: f.top, branch: f.branch, detached: f.detached, upstream: f.upstream, gone: f.gone, ahead: f.ahead, behind: f.behind,
    staged: f.staged, modified: f.modified, untracked: f.untracked, fileTotal: f.fileTotal, files: f.files, prNote,
    worktrees: (repo?.worktrees ?? []).map((w) => ({ ...w, here: samePath(w.path, f.top ?? '') })),
    prs: pr ? [{ number: pr.number, title: pr.title, draft: pr.draft, review: pr.review }] : [] };
}

/** Loads the Git section data of one chat: one collector call for its folder, PR answers cached for 5 minutes, calls for one folder shared while running. */
export class GitLiveService {
  private readonly cache = new PrCache();
  private readonly running = new Map<string, Promise<{ live: GitLive; targets?: GitTargets }>>();

  /** Never throws: a failure becomes a one-line error state. */
  load(id: string, cwd: string, prs: boolean): Promise<{ live: GitLive; targets?: GitTargets }> {
    if (!cwd) { return Promise.resolve({ live: blank('none', 'No working folder is recorded for this chat') }); }
    const key = `${cwd}|${prs}`;
    const hit = this.running.get(key);
    if (hit) { return hit; }
    const p = this.run(id, cwd, prs).finally(() => this.running.delete(key));
    this.running.set(key, p);
    return p;
  }

  private async run(id: string, cwd: string, prs: boolean): Promise<{ live: GitLive; targets?: GitTargets }> {
    try {
      const ctx = { exec: realExec, gitMs: GIT_MS, ghMs: GH_MS, flags: { gitMissing: false } };
      const chat: WipChatIn = { id, title: '', last: Date.now(), cwd, prs: [] };
      const d = await collect([chat], { ctx, prs, cache: this.cache, force: false, now: Date.now() });
      if (d.gitMissing) { return { live: blank('error', 'Git was not found on this computer') }; }
      const c = d.chats[0];
      const live = liveOf(c, d.repos, d.prNote);
      const urls = new Map<number, string>();
      if (c.pr?.url) { urls.set(c.pr.number, c.pr.url); }
      return { live, targets: live.top ? { top: path.resolve(live.top), files: c.folder.files, urls } : undefined };
    } catch {
      return { live: blank('error', 'Could not read git state') };
    }
  }
}
