import * as vscode from 'vscode';
import { WorkerClient } from './client';
import { dotOf, shortAgo } from './group';
import { BranchNode, ChatRef, CommitNode, GitSummary, PrNode, RepoNode } from './gitSummary';

export const GIT_VIEW = 'claudeChatSearch.git';
export const OPEN_CMD = 'claudeChatSearch.openChat';
const REFRESH_MS = 1000;
const DOT_COLORS: { [k: string]: string } = { g: 'charts.green', o: 'charts.orange', n: 'disabledForeground' };

type Node =
  | { k: 'repo'; repo: RepoNode } | { k: 'pr'; pr: PrNode } | { k: 'branches'; list: BranchNode[] }
  | { k: 'branch'; br: BranchNode } | { k: 'chat'; ref: ChatRef } | { k: 'commit'; c: CommitNode } | { k: 'more'; n: number };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Chat leaf: title, short age, a status dot; a click resumes the chat like a search result. */
function chatItem(ref: ChatRef): vscode.TreeItem {
  const it = new vscode.TreeItem(ref.title, vscode.TreeItemCollapsibleState.None);
  it.description = shortAgo(ref.last, Date.now());
  it.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(DOT_COLORS[dotOf(ref.last, Date.now())]));
  it.command = { command: OPEN_CMD, title: 'Resume chat', arguments: [ref.id] };
  it.tooltip = new Date(ref.last).toLocaleString();
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

function itemOf(n: Node): vscode.TreeItem {
  const C = vscode.TreeItemCollapsibleState;
  switch (n.k) {
    case 'chat': return chatItem(n.ref);
    case 'commit': return commitItem(n.c);
    case 'more': return new vscode.TreeItem(`... ${n.n} more`, C.None);
    case 'repo': return item(n.repo.name, C.Expanded, 'repo', plural(n.repo.prs.length, 'PR', 'PRs'));
    case 'pr': return item('#' + n.pr.number, C.Collapsed, 'git-pull-request', plural(n.pr.chats.length + n.pr.more, 'chat', 'chats'));
    case 'branches': return item('Branches', C.Collapsed, 'git-branch', String(n.list.length));
    case 'branch': return item(n.br.name, C.Collapsed, 'git-branch', plural(n.br.commits.length + n.br.more, 'commit', 'commits'));
  }
}

const withMore = (nodes: Node[], more: number): Node[] => (more > 0 ? [...nodes, { k: 'more', n: more }] : nodes);

/** Children of one node; the root lists repositories, then the Branches group. */
export function childrenOf(s: GitSummary, n?: Node): Node[] {
  if (!n) {
    const repos = s.repos.map((repo): Node => ({ k: 'repo', repo }));
    return s.branches.length ? [...repos, { k: 'branches', list: s.branches }] : repos;
  }
  if (n.k === 'repo') { return n.repo.prs.map((pr): Node => ({ k: 'pr', pr })); }
  if (n.k === 'pr') { return withMore(n.pr.chats.map((ref): Node => ({ k: 'chat', ref })), n.pr.more); }
  if (n.k === 'branches') { return n.list.map((br): Node => ({ k: 'branch', br })); }
  if (n.k === 'branch') { return withMore(n.br.commits.map((c): Node => ({ k: 'commit', c })), n.br.more); }
  return [];
}

/** Git Activity tree: refreshed (debounced) when the index or the search scope changes; data loads only while the view is shown. */
export class GitTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private data?: Promise<GitSummary>;
  private timer?: NodeJS.Timeout;

  constructor(private readonly client: WorkerClient, private readonly scope: () => { all: boolean; folders: string[] },
    private readonly log: (where: string, e: unknown) => void) {}

  /** Drop the loaded data after a 1 second pause in changes; the tree reloads on its next read. */
  refresh(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.data = undefined; this.changed.fire(undefined); }, REFRESH_MS);
  }

  private load(): Promise<GitSummary> {
    this.data ??= this.client.request({ t: 'gitSummary', ...this.scope() }).catch((e) => {
      this.log('git summary', e);
      return { repos: [], branches: [] };
    });
    return this.data;
  }

  getTreeItem(n: Node): vscode.TreeItem { return itemOf(n); }
  async getChildren(n?: Node): Promise<Node[]> { return childrenOf(await this.load(), n); }
  dispose(): void { clearTimeout(this.timer); this.changed.dispose(); }
}
