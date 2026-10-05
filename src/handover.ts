/** Hand-over note of one chat: the facts the worker knows, and the plain text built from them. No vscode dependency. */
import { ctxInfo } from './contextWindow';
import { projectRoot, relativeTo } from './fileSessions';
import { mergedGit } from './gitInfo';
import { parseQuery } from './query';
import type { GitLive } from './gitLive';
import { Chat, Related } from './types';
import { ago, stamp } from './timeText';

const MAX_FILES = 5;
export interface HandoverData {
  id: string; title: string; folder: string; branch?: string; last: number; pct?: number;
  files: Array<{ path: string; edited: boolean }>;
}
interface Source { subsOf(p: Chat): Chat[]; }

/** Files of the chat and its subagents that the query's file: and edited: tokens match (edited when any copy was edited). */
function matchedFiles(chats: Chat[], query: string): HandoverData['files'] {
  const vals = parseQuery(query).tokens.filter((t) => t.kind === 'file' || t.kind === 'edited').map((t) => t.value);
  const out = new Map<string, boolean>();
  if (!vals.length) { return []; }
  for (const c of chats) {
    for (const f of c.files) {
      if (vals.some((v) => f.path.toLowerCase().includes(v))) { out.set(f.path, (out.get(f.path) ?? false) || f.edited); }
    }
  }
  return [...out].slice(0, MAX_FILES).map(([path, edited]) => ({ path, edited }));
}

/** Facts for the note: working folder, branch, context percent and the files the current query matched. */
export function handoverData(ix: Source, chat: Chat, query: string): HandoverData {
  const subs = ix.subsOf(chat), git = mergedGit(chat, subs);
  const folder = chat.cwd ?? (chat.files[0] ? projectRoot(chat.files[0].path, chat.dir) : undefined) ?? chat.dir;
  return { id: chat.id, title: chat.title, folder, branch: git.branches[git.branches.length - 1], last: chat.last,
    pct: ctxInfo(chat.use)?.pct, files: matchedFiles([chat, ...subs], query) };
}

/** Live parts gathered at copy time; a part that failed or timed out is undefined and is written as not available. */
export interface HandoverLive {
  git?: GitLive; prUrls?: Map<number, string>; prsOn?: boolean; unc?: GitLive; unp?: GitLive; wt?: GitLive; rel?: Related[];
}
const LIST_MAX = 20;
const NA = 'Not available (could not be read in time)';

/** Lines of one live section: the heading, then the body, or one "not available" line when the part is missing or not ok. */
function section(title: string, p: GitLive | undefined, body: (g: GitLive) => string[]): string[] {
  if (!p) { return ['', `## ${title}`, NA]; }
  if (p.state !== 'ok') { return ['', `## ${title}`, `Not available: ${p.reason ?? p.state}`]; }
  return ['', `## ${title}`, ...body(p)];
}
const more = (total: number, shown: number): string[] => (total > shown ? [`(+${total - shown} more)`] : []);

function gitLines(g: GitLive, l: HandoverLive): string[] {
  const out = [`Branch: ${g.detached ? `detached at ${g.sha ?? 'HEAD'}` : (g.branch ?? 'unknown') + (g.noCommits ? ' (no commits yet)' : '')}`];
  out.push(`Upstream: ${g.upstream ?? 'none'}${g.gone ? ' (gone)' : ''}; ahead ${g.ahead}, behind ${g.behind}`);
  if (g.top) { out.push(`Folder: ${g.top}`); }
  if (g.prs.length) {
    for (const pr of g.prs) { out.push(`Pull request: #${pr.number} ${pr.title} (open${pr.draft ? ', draft' : ''}${pr.review ? ', ' + pr.review : ''})${l.prUrls?.get(pr.number) ? ' ' + l.prUrls.get(pr.number) : ''}`); }
  } else if (g.prPending) { out.push('Pull request: not available (lookup did not finish)'); }
  else if (g.prNote) { out.push(`Pull request: not available (${g.prNote})`); }
  else if (l.prsOn === false) { out.push('Pull request: lookups are turned off'); }
  else { out.push('Pull request: none open for this branch'); }
  return out;
}

function uncLines(g: GitLive): string[] {
  if (!g.fileTotal) { return ['No uncommitted files']; }
  const parts = [g.modified ? `${g.modified} modified` : '', g.staged ? `${g.staged} staged` : '', g.untracked ? `${g.untracked} new` : ''].filter(Boolean);
  const shown = g.files.slice(0, LIST_MAX);
  return [`${g.fileTotal} file${g.fileTotal === 1 ? '' : 's'} (${parts.join(', ')})`, ...shown.map((f) => `- ${f.s} ${f.p}`), ...more(g.fileTotal, shown.length)];
}

function unpLines(g: GitLive): string[] {
  if (!g.ahead) { return [g.detached ? 'Detached HEAD: no branch to push' : g.noCommits ? 'No commits yet' : g.gone ? 'The upstream branch no longer exists' : g.upstream ? 'Nothing to push' : 'This branch has no upstream branch']; }
  const shown = g.commits.slice(0, LIST_MAX);
  return [`${g.ahead} commit${g.ahead === 1 ? '' : 's'} not pushed to ${g.upstream ?? 'the upstream branch'}`, ...shown.map((c) => `- ${c.sha} ${c.subject}`), ...more(g.ahead, shown.length)];
}

function wtLines(g: GitLive): string[] {
  if (!g.worktrees.length) { return ['No worktrees found']; }
  return g.worktrees.map((w) => `- ${w.path} [${w.detached ? 'detached' : w.branch}]${w.main ? ' (main checkout)' : ''}${w.here ? " (this chat's)" : ''}${w.missing ? ' (missing)' : ''}`);
}

function relLines(rel: Related[] | undefined): string[] {
  if (!rel) { return ['', '## Related chats', NA]; }
  const rows = rel.length ? rel.map((r) => `- ${r.title.replace(/\s+/g, ' ')} (${r.id}) - ${r.shared} shared file${r.shared === 1 ? '' : 's'}`) : ['No other chat touched the same files'];
  return ['', `## Related chats (${rel.length})`, ...rows];
}

/** Markdown note; file paths are workspace-relative when inside a workspace folder. Live parts are optional. */
export function handoverText(d: HandoverData, roots: string[], now = Date.now(), live?: HandoverLive): string {
  const lines = ['# Hand-over note', '', `Chat: ${d.title.replace(/\s+/g, ' ')}`, `Session id: ${d.id}`, `Project folder: ${d.folder}`];
  if (d.branch) { lines.push(`Git branch: ${d.branch}`); }
  lines.push(`Last active: ${ago(d.last, now)} (${stamp(d.last)})`);
  if (d.pct !== undefined) { lines.push(`Context: ${d.pct}% full`); }
  for (const f of d.files) {
    lines.push(`File: ${relativeTo(f.path, roots)?.rel ?? f.path.replace(/\\/g, '/')} (${f.edited ? 'edited' : 'read'})`);
  }
  if (!live) { return lines.join('\n'); }
  lines.push(...section('Git', live.git, (g) => gitLines(g, live)));
  lines.push(...section('Uncommitted files', live.unc, uncLines));
  lines.push(...section('Unpushed commits', live.unp, unpLines));
  lines.push(...section('Worktrees', live.wt, wtLines), ...relLines(live.rel));
  return lines.join('\n');
}
