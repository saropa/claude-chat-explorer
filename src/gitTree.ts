import * as vscode from 'vscode';
import { WorkerClient } from './client';
import { dotText, shortAgo } from './group';
import { withoutArchived } from './gitFilter';
import { DotMap } from './liveState';
import { BranchNode, ChatRef, CommitNode, GitSummary, PrNode, RepoNode } from './gitSummary';

export const GIT_VIEW = 'claudeChatSearch.git';
export const OPEN_CMD = 'claudeChatSearch.openChat';
const REFRESH_MS = 1000;
const MAX_WAIT_MS = 5000;
export const RETRY_CMD = 'claudeChatSearch.gitRetry';
const DOT_COLORS: { [k: string]: string } = { running: 'saropaChatSearch.dotRunning', waiting: 'saropaChatSearch.dotWaiting', unread: 'saropaChatSearch.dotUnread', idle: 'saropaChatSearch.dotIdle' };

type Node =
  | { k: 'repo'; repo: RepoNode } | { k: 'pr'; pr: PrNode; repo: string } | { k: 'branches'; list: BranchNode[] }
  | { k: 'branch'; br: BranchNode } | { k: 'chat'; ref: ChatRef; at: string } | { k: 'commit'; c: CommitNode; branch: string }
  | { k: 'more'; n: number; at: string } | { k: 'error' };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Chat leaf: title, short age, Claude's state dot (a ring when open elsewhere); a click resumes the chat like a search result. */
function chatItem(ref: ChatRef, dots: DotMap): vscode.TreeItem {
  const d = dots[ref.id] ?? { s: 'idle', ring: false };
  const it = new vscode.TreeItem(ref.title, vscode.TreeItemCollapsibleState.None);
  it.description = shortAgo(ref.last, Date.now());
  it.iconPath = new vscode.ThemeIcon(d.ring ? 'circle-large-outline' : 'circle-filled', new vscode.ThemeColor(DOT_COLORS[d.s]));
  it.command = { command: OPEN_CMD, title: 'Resume chat', arguments: [ref.id] };
  it.tooltip = dotText(d) + '\n' + new Date(ref.last).toLocaleString();
  return it;
}

/** A tree row with a codicon and an optional grey description. */
function item(label: string, state: vscode.TreeItemCollapsibleState, icon: string, description?: string): vscode.TreeItem {
  const it = new vscode.TreeItem(label, state);
  it.description = description;
  it.iconPath = new vscode.ThemeIcon(icon);
  return it;
}

function commitItem(c: CommitNode): vscode.TreeItem {
  const it = item(c.sha.slice(0, 7), vscode.TreeItemCollapsibleState.None, 'git-commit', c.chat.title);
  it.command = { command: OPEN_CMD, title: 'Resume chat', arguments: [c.chat.id] };
  return it;
}

/** Stable id (kind, repository, number or sha, branch) so expansion survives a refresh. */
export function idOf(n: Node): string {
  switch (n.k) {
    case 'chat': return `chat:${n.at}:${n.ref.id}`;
    case 'commit': return `commit:${n.branch}:${n.c.sha}`;
    case 'more': return `more:${n.at}`;
    case 'repo': return `repo:${n.repo.name}`;
    case 'pr': return `pr:${n.repo}#${n.pr.number}`;
    case 'branches': return 'branches';
    case 'branch': return `branch:${n.br.name}`;
    case 'error': return 'error';
  }
}

function itemOf(n: Node, dots: DotMap): vscode.TreeItem {
  const C = vscode.TreeItemCollapsibleState;
  const it = baseItem(n, C, dots);
  it.id = idOf(n);
  return it;
}

function baseItem(n: Node, C: typeof vscode.TreeItemCollapsibleState, dots: DotMap): vscode.TreeItem {
  switch (n.k) {
    case 'chat': return chatItem(n.ref, dots);
    case 'commit': return commitItem(n.c);
    case 'more': return new vscode.TreeItem(`... ${n.n} more`, C.None);
    case 'repo': return item(n.repo.name, C.Expanded, 'repo', plural(n.repo.prs.length, 'PR', 'PRs'));
    case 'pr': return item('#' + n.pr.number, C.Collapsed, 'git-pull-request', plural(n.pr.chats.length + n.pr.more, 'chat', 'chats'));
    case 'branches': return item('Branches', C.Collapsed, 'git-branch', String(n.list.length));
    case 'branch': return item(n.br.name, C.Collapsed, 'git-branch', plural(n.br.commits.length + n.br.more, 'commit', 'commits'));
    case 'error': return errorItem();
  }
}

/** Shown when the load failed; a click retries. */
function errorItem(): vscode.TreeItem {
  const it = item('Could not load git activity. Retry.', vscode.TreeItemCollapsibleState.None, 'warning');
  it.command = { command: RETRY_CMD, title: 'Retry' };
  return it;
}

const withMore = (nodes: Node[], more: number, at: string): Node[] => (more > 0 ? [...nodes, { k: 'more', n: more, at }] : nodes);

/** Children of one node; the root lists repositories, then the Branches group. */
export function childrenOf(s: GitSummary, n?: Node): Node[] {
  if (!n) {
    const repos = s.repos.map((repo): Node => ({ k: 'repo', repo }));
    return s.branches.length ? [...repos, { k: 'branches', list: s.branches }] : repos;
  }
  if (n.k === 'repo') { const repo = n.repo.name; return n.repo.prs.map((pr): Node => ({ k: 'pr', pr, repo })); }
  if (n.k === 'pr') { const at = idOf(n); return withMore(n.pr.chats.map((ref): Node => ({ k: 'chat', ref, at })), n.pr.more, at); }
  if (n.k === 'branches') { return n.list.map((br): Node => ({ k: 'branch', br })); }
  if (n.k === 'branch') { const branch = n.br.name; return withMore(n.br.commits.map((c): Node => ({ k: 'commit', c, branch })), n.br.more, idOf(n)); }
  return [];
}

/** What the tree reads from the extension: dots and the archived set. */
export interface LiveView { dots: () => DotMap; archived: () => Set<string>; }

/** Git Activity tree: refreshed (debounced) when the index or the search scope changes; data loads only while the view is shown. */
export class GitTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private data?: Promise<GitSummary | undefined>;
  private timer?: NodeJS.Timeout;
  private first?: number; // when the pending refresh burst began

  constructor(private readonly client: WorkerClient, private readonly scope: () => { all: boolean; folders: string[] },
    private readonly log: (where: string, e: unknown) => void, private readonly live: LiveView) {}

  /** Redraw from the loaded data (dots or the archived set changed); no reload. */
  redraw(): void { this.changed.fire(undefined); }

  /** Reload after a 1 second pause in changes, or 5 seconds after the first change of a burst; now skips the wait. */
  refresh(now = false): void {
    const t = Date.now();
    this.first ??= t;
    clearTimeout(this.timer);
    const wait = now ? 0 : Math.min(REFRESH_MS, Math.max(0, this.first + MAX_WAIT_MS - t));
    this.timer = setTimeout(() => { this.first = undefined; this.data = undefined; this.changed.fire(undefined); }, wait);
  }

  /** The summary, or undefined after a failure (never cached, so the next refresh retries). */
  private load(): Promise<GitSummary | undefined> {
    if (this.data) { return this.data; }
    const p: Promise<GitSummary | undefined> = this.client.request({ t: 'gitSummary', ...this.scope() }, true).catch((e) => {
      this.log('git summary', e);
      if (this.data === p) { this.data = undefined; }
      return undefined;
    });
    this.data = p;
    return p;
  }

  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n, this.live.dots()); }
  async getChildren(n?: Node): Promise<Node[]> {
    const s = await this.load();
    return s ? childrenOf(withoutArchived(s, this.live.archived()), n) : n ? [] : [{ k: 'error' }];
  }
  dispose(): void { clearTimeout(this.timer); this.changed.dispose(); }
}
