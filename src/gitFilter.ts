import { BranchNode, GitSummary, PrNode, RepoNode } from './gitSummary';

/** The summary without archived chats: PRs, repositories, commits and branches left empty are dropped. */
export function withoutArchived(s: GitSummary, archived: Set<string>): GitSummary {
  if (!archived.size) { return s; }
  const repos: RepoNode[] = [];
  for (const r of s.repos) {
    const prs: PrNode[] = [];
    for (const p of r.prs) {
      const chats = p.chats.filter((c) => !archived.has(c.id));
      if (chats.length || p.more > 0) { prs.push({ ...p, chats }); }
    }
    if (prs.length) { repos.push({ ...r, prs }); }
  }
  const branches: BranchNode[] = [];
  for (const b of s.branches) {
    const commits = b.commits.filter((c) => !archived.has(c.chat.id));
    if (commits.length || b.more > 0) { branches.push({ ...b, commits }); }
  }
  return { repos, branches };
}
