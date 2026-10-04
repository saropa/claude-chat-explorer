import { dotText } from './group';
import { DotMap } from './liveState';
import { baseName, filesText, folderLabel, linkedOf, plural, prText, shortBranch, shownChats, stateWord, View, worktreeGroups, WtGroup } from './wipModel';
import { FolderFacts, PrInfo, RepoFacts, WipChat, WipData } from './wipTypes';

export const OPEN_CMD = 'claudeChatExplorer.openChat';
export const MAX_ROOT = 100;
const COLORS: { [k: string]: string } = { running: 'charts.green', waiting: 'charts.blue', unread: 'charts.orange' };
const IDLE_COLOR = 'descriptionForeground';

/** A tree row, independent of VS Code. open: none, collapsed or expanded. */
export interface WipNode {
  id: string; label: string; description?: string; tooltip?: string; icon: string; color?: string;
  open: 'none' | 'collapsed' | 'expanded'; command?: { command: string; args: unknown[] }; kids: WipNode[];
}

const node = (id: string, label: string, icon: string, description?: string, kids: WipNode[] = []): WipNode =>
  ({ id, label, icon, description, kids, open: kids.length ? 'collapsed' : 'none' });
const openCmd = (id: string) => ({ command: OPEN_CMD, args: [id] });
const more = (id: string, n: number): WipNode => node(`${id}:more`, `... ${n} more`, 'ellipsis');
const withMore = (kids: WipNode[], n: number, id: string): WipNode[] => (n > 0 ? [...kids, more(id, n)] : kids);

/** Files line with the first 20 files and their status letters. */
function filesNode(id: string, f: FolderFacts): WipNode | undefined {
  if (!f.fileTotal) { return undefined; }
  const kids = f.files.map((x, i) => node(`${id}:f${i}:${x.p}`, `${x.s} ${x.p}`, 'file'));
  return node(`${id}:files`, plural(f.fileTotal, 'file', 'files') + ' not checked in', 'diff', filesText(f), withMore(kids, f.fileTotal - f.files.length, `${id}:files`));
}

function commitsNode(id: string, f: FolderFacts): WipNode | undefined {
  if (f.ahead > 0) { return node(`${id}:ahead`, plural(f.ahead, 'commit', 'commits') + ' not pushed', 'git-commit', f.behind ? `behind ${f.behind}` : undefined); }
  return f.behind > 0 ? node(`${id}:behind`, `behind ${f.behind}`, 'arrow-down') : undefined;
}

const prNode = (id: string, p: PrInfo): WipNode => node(`${id}:pr${p.number}`, prText(p), 'git-pull-request');

function pending(list: Array<WipNode | undefined>): WipNode[] { return list.filter((x): x is WipNode => !!x); }

/** Tooltip: plain text, no links. */
function tip(c: WipChat, word: string, repo?: RepoFacts): string {
  const f = c.folder;
  const lines = [c.title, `Folder: ${f.top ?? f.cwd}`, f.branch ? `Branch: ${f.branch}` : '', word];
  if (f.fileTotal) { lines.push(`${plural(f.fileTotal, 'file', 'files')} not checked in (${filesText(f)})`); }
  if (f.ahead) { lines.push(`${plural(f.ahead, 'commit', 'commits')} not pushed`); }
  if (c.pr) { lines.push(prText(c.pr)); }
  if (repo) { lines.push(`Repository: ${repo.name}`); }
  return lines.filter(Boolean).join('\n');
}

/** Chat node: title, branch and state; children only when they have content. */
export function chatNode(c: WipChat, d: DotMap, d2: { now: number; repo?: RepoFacts }): WipNode {
  const dot = d[c.id], word = stateWord(dot, c.last, d2.now), f = c.folder;
  const id = `wip:chat:${f.top ?? f.cwd}|${f.branch ?? ''}|${c.id}`;
  const fl = folderLabel(f, d2.repo);
  const kids = pending([node(`${id}:folder`, fl.label, 'folder', fl.desc), filesNode(id, f), commitsNode(id, f),
    c.pr ? prNode(id, c.pr) : undefined, ...linkedOf(c).map((n) => node(`${id}:linked${n}`, `linked PR #${n}`, 'git-pull-request'))]);
  const open = node(`${id}:open`, 'Open chat', 'comment-discussion');
  open.command = openCmd(c.id);
  const n = node(id, c.title, 'circle-filled', [shortBranch(f.branch), word].filter(Boolean).join(' · '), [...kids, open]);
  n.color = COLORS[dot?.s ?? ''] ?? IDLE_COLOR;
  n.tooltip = tip(c, dot ? dotText(dot) : word, d2.repo);
  return n;
}

function wtCounts(g: WtGroup): string {
  const f = g.facts;
  const p = [f.branch ?? '', f.fileTotal ? plural(f.fileTotal, 'file', 'files') : '', f.ahead ? `${f.ahead} ahead` : ''];
  return p.filter(Boolean).join(' · ');
}

/** Worktree node: files, commits, PR, then the chats that used it. */
function worktreeNode(g: WtGroup, v: View): WipNode {
  const f = g.facts, id = `wip:wt:${g.key}|${f.branch ?? ''}`;
  const fl = folderLabel(f, g.repo);
  const pr = g.chats.find((c) => c.pr)?.pr;
  const linked = [...new Set(g.chats.flatMap((c) => linkedOf(c)))].slice(0, 3);
  const chats = g.chats.map((c) => {
    const n = node(`${id}:chat:${c.id}`, c.title, 'circle-filled', stateWord(v.dots[c.id], c.last, v.now));
    n.color = COLORS[v.dots[c.id]?.s ?? ''] ?? IDLE_COLOR;
    n.command = openCmd(c.id);
    return n;
  });
  const kids = pending([filesNode(id, f), commitsNode(id, f), pr ? prNode(id, pr) : undefined,
    ...linked.map((n) => node(`${id}:linked${n}`, `linked PR #${n}`, 'git-pull-request'))]);
  const desc = f.state === 'ok' ? wtCounts(g) : fl.desc;
  const n = node(id, `${g.repo ? g.repo.name + '/' : ''}${baseName(f.top ?? f.cwd)}`, 'repo', desc, [...kids, ...chats]);
  n.tooltip = `${f.top ?? f.cwd}\n${fl.desc}`;
  return n;
}

/** Branches ahead of their upstream (or with it gone) that no worktree has checked out, one group per repository. */
function branchGroups(d: WipData): WipNode[] {
  const out: WipNode[] = [];
  for (const r of d.repos.values()) {
    const out_ = r.branches.filter((b) => !r.worktrees.some((w) => w.branch === b.name));
    if (!out_.length) { continue; }
    const id = `wip:branches:${r.common}`;
    const kids = out_.map((b) => node(`${id}:${b.name}`, b.name, 'git-branch', [b.ahead ? `ahead ${b.ahead}` : '', b.gone ? 'upstream gone' : ''].filter(Boolean).join(', ')));
    out.push(node(id, 'Branches without a worktree', 'git-branch', r.name, kids));
  }
  return out;
}

/** Muted lines for the whole view. */
function notes(d: WipData): WipNode[] {
  const l: string[] = [];
  if (d.gitMissing) { l.push('Git not found: install git to see work in progress.'); }
  if (d.prNote) { l.push(`Open PRs unavailable: ${d.prNote}`); }
  if (d.notScanned > 0) { l.push(`${d.notScanned} more not scanned`); }
  return l.map((t, i) => { const n = node(`wip:note:${i}`, t, 'info'); n.color = IDLE_COLOR; return n; });
}

/** The whole tree for the current data and view settings. */
export function buildNodes(d: WipData, v: View): WipNode[] {
  const roots = v.mode === 'chat'
    ? shownChats(d, v).map((c) => chatNode(c, v.dots, { now: v.now, repo: c.folder.common ? d.repos.get(c.folder.common) : undefined }))
    : worktreeGroups(d, v).map((g) => worktreeNode(g, v));
  const shown = roots.slice(0, MAX_ROOT);
  const extra = roots.length - shown.length;
  const tail = v.mode === 'worktree' ? branchGroups(d) : [];
  return [...withMore(shown, extra, 'wip:root'), ...tail, ...notes(d)];
}
