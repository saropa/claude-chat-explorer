/** Worker side of the public API: the full read-only view of every indexed chat and work item. Host state (pins, tags, archive, dots) is merged on the host. */
import type { ChatBase, WorkItem } from './api';
import { ctxInfo } from './contextWindow';
import { Source } from './search';
import { projectOf } from './stats';
import { chatTotals, workChats, workTotals } from './workChats';
import { Chat } from './types';

/** One top-level chat as the API shows it, without host state and without internal paths. */
export function chatBase(ix: Source, c: Chat): ChatBase {
  const g = c.git, x = ctxInfo(c.use);
  return {
    id: c.id, title: c.title, project: projectOf(c), folder: c.cwd ?? '', folders: c.cwds ?? (c.cwd ? [c.cwd] : []),
    first: c.first, last: c.last, messages: c.count, size: c.size, subagents: ix.subsOf(c).length,
    model: x?.model ?? (c.use ? c.use.model : ''), models: c.cost?.models ?? [],
    context: c.use ? { tokens: c.use.tokens, max: c.use.max, pending: c.use.pending, compactions: c.use.comp, window: x?.window ?? 0, percent: x?.pct ?? 0, approx: x?.approx ?? false } : undefined,
    tokens: chatTotals(ix, c),
    cost: c.cost ? { usd: c.cost.usd, linesAdded: c.cost.add, linesRemoved: c.cost.rem } : undefined,
    branches: [...new Set([...(c.seen ?? []), ...(g?.branches ?? [])])],
    prs: (g?.prs ?? []).map(([number, repository]) => ({ number, repository })),
    commits: (g?.commits ?? []).map(([sha, branch]) => ({ sha, branch })),
    files: c.files.map((f) => ({ path: f.path, edited: f.edited })),
    created: (c.made ?? []).map(([kind, name]) => ({ kind: kind === 'w' ? 'worktree' as const : 'branch' as const, name })),
  };
}

export function allChats(ix: Source): ChatBase[] { return ix.tops().map((c) => chatBase(ix, c)); }

/** Every branch and pull request any chat knows, with its chats and summed tokens (same match as workTotals). */
export function allWork(ix: Source): WorkItem[] {
  const keys = new Map<string, WorkItem['kind']>();
  for (const c of ix.tops()) {
    for (const b of [...(c.seen ?? []), ...(c.git?.branches ?? [])]) { keys.set(b, 'branch'); }
    for (const [n] of c.git?.prs ?? []) { keys.set('#' + n, 'pr'); }
  }
  const out: WorkItem[] = [];
  for (const [key, kind] of keys) {
    const t = workTotals(ix, key);
    if (!t) { continue; }
    out.push({ kind, key, chatIds: workChats(ix, key).map((c) => c.id), tokens: t });
  }
  return out;
}
