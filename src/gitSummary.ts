import { mergedGit } from './gitInfo';
import { candidates, Source } from './search';
import { Chat, Options } from './types';

export const MAX_BRANCH_COMMITS = 200;
export const MAX_PR_CHATS = 100;
const YIELD_EVERY = 200;
const NO_BRANCH = '(unknown branch)';
export const NO_REPO = '(unknown repository)';

/** A chat shown under a PR or a commit. */
export interface ChatRef { id: string; title: string; last: number; }
export interface PrNode { number: number; chats: ChatRef[]; more: number; }
export interface RepoNode { name: string; prs: PrNode[]; }
export interface CommitNode { sha: string; chat: ChatRef; }
export interface BranchNode { name: string; commits: CommitNode[]; more: number; }
/** Tree data of the Git Activity view: repositories with PRs, and branches with commits. */
export interface GitSummary { repos: RepoNode[]; branches: BranchNode[]; }

const ALL: Options = { all: true, cs: false, ww: false, re: false, any: false, when: 'any', subs: true, last: 0 };
const refOf = (c: Chat): ChatRef => ({ id: c.id, title: c.title, last: c.last });
const newest = (a: ChatRef[]): number => a.reduce((m, r) => Math.max(m, r.last), 0);
const slot = <K, V>(m: Map<K, V>, k: K, make: () => V): V => m.get(k) ?? m.set(k, make()).get(k)!;

type Prs = Map<string, Map<number, ChatRef[]>>; // repository -> PR number -> chats
type Commits = Map<string, Map<string, ChatRef>>; // branch -> sha -> chat (the newest chat that made it)

/** Sort newest chat first. */
const byLast = (a: ChatRef, b: ChatRef): number => b.last - a.last;

function repoNodes(prs: Prs): RepoNode[] {
  const out: Array<{ node: RepoNode; at: number }> = [];
  for (const [name, byNum] of prs) {
    const list: PrNode[] = [...byNum].map(([number, all]) => {
      const chats = all.sort(byLast);
      return { number, chats: chats.slice(0, MAX_PR_CHATS), more: Math.max(0, chats.length - MAX_PR_CHATS) };
    }).sort((a, b) => b.number - a.number);
    out.push({ node: { name, prs: list }, at: Math.max(...list.map((p) => newest(p.chats))) });
  }
  return out.sort((a, b) => b.at - a.at).map((x) => x.node);
}

function branchNodes(commits: Commits): BranchNode[] {
  const out: Array<{ node: BranchNode; at: number }> = [];
  for (const [name, bySha] of commits) {
    const all = [...bySha].map(([sha, chat]) => ({ sha, chat })).sort((a, b) => b.chat.last - a.chat.last);
    out.push({ node: { name, commits: all.slice(0, MAX_BRANCH_COMMITS), more: Math.max(0, all.length - MAX_BRANCH_COMMITS) }, at: all[0].chat.last });
  }
  return out.sort((a, b) => b.at - a.at).map((x) => x.node);
}

/** PRs by repository ('(unknown repository)' when a PR has none) and commits by branch, over the chats in scope. */
export async function gitSummary(ix: Source, all: boolean, folders: string[], idle: () => Promise<void> = async () => undefined): Promise<GitSummary> {
  const prs: Prs = new Map(), commits: Commits = new Map();
  let n = 0;
  for (const c of candidates(ix, { ...ALL, all }, folders, 0)) {
    if (n++ % YIELD_EVERY === 0) { await idle(); } // lets a running search or export go first and keeps its heartbeat ticking
    const g = mergedGit(c, ix.subsOf(c)), ref = refOf(c);
    for (const [n, repo] of g.prs) { slot(slot(prs, repo || NO_REPO, () => new Map()), n, () => []).push(ref); }
    for (const [sha, br] of g.commits) {
      const by = slot(commits, br || NO_BRANCH, () => new Map<string, ChatRef>());
      const prev = by.get(sha);
      if (!prev || prev.last < ref.last) { by.set(sha, ref); }
    }
  }
  return { repos: repoNodes(prs), branches: branchNodes(commits) };
}
