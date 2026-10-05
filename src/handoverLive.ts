/** Gathers the live sections of the hand-over note (the same services as the chat card). No vscode dependency. */
import { GitLiveService, GitPart, withDeadline } from './gitLive';
import { HandoverLive } from './handover';

export interface LiveDeps {
  request: (m: { [k: string]: unknown }) => Promise<any>; log: (where: string, e: unknown) => void;
  folders: () => string[]; prsOn: () => boolean; gitLive: Pick<GitLiveService, 'load'>;
}

/** One overall budget for every live section; whatever has not arrived by then is written as not available. */
export const HANDOVER_LIVE_MS = 5000;

/** Gather the card's Git, Uncommitted, Unpushed, Worktrees and Related parts in parallel; never throws, never waits past the budget. */
export async function gatherLive(id: string, d: LiveDeps, budgetMs = HANDOVER_LIVE_MS): Promise<HandoverLive> {
  const out: HandoverLive = { prsOn: d.prsOn() };
  const cwd = d.request({ t: 'chatCwd', chat: id, folders: d.folders() }).then((c) => (typeof c === 'string' ? c : ''));
  const part = async (p: GitPart): Promise<void> => {
    const onPartial = p === 'git' ? (x: { live: NonNullable<HandoverLive['git']> }): void => { out.git = x.live; } : undefined;
    const r = await d.gitLive.load(await cwd, p, p === 'git' && out.prsOn === true, onPartial);
    out[p] = r.live;
    if (p === 'git') { out.prUrls = r.targets?.urls; }
  };
  const rel = d.request({ t: 'related', chat: id }).then((r) => { if (Array.isArray(r)) { out.rel = r; } });
  const jobs = [part('git'), part('unc'), part('unp'), part('wt'), rel].map((j) => j.catch((e) => d.log('hand-over live part', e)));
  await withDeadline(Promise.all(jobs), budgetMs);
  return { ...out }; // snapshot: a part finishing later must not change the note being written
}

