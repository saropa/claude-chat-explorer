import * as vscode from 'vscode';
import { WipNode } from './wipNodes';

export const WIP_VIEW = 'claudeChatExplorer.wip';

/** TreeItem of one node: stable id, theme-colored icon, optional click command. */
export function itemOf(n: WipNode): vscode.TreeItem {
  const C = vscode.TreeItemCollapsibleState;
  const it = new vscode.TreeItem(n.label, n.open === 'none' ? C.None : n.open === 'expanded' ? C.Expanded : C.Collapsed);
  it.id = n.id;
  it.description = n.description;
  it.tooltip = n.tooltip;
  it.iconPath = new vscode.ThemeIcon(n.icon, n.color ? new vscode.ThemeColor(n.color) : undefined);
  if (n.command) { it.command = { command: n.command.command, title: n.label, arguments: n.command.args }; }
  return it;
}

/** Tree of the Work in Progress view; the controller hands it finished nodes. */
export class WipTree implements vscode.TreeDataProvider<WipNode> {
  private readonly changed = new vscode.EventEmitter<WipNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private roots: WipNode[] = [];

  set(nodes: WipNode[]): void { this.roots = nodes; this.changed.fire(undefined); }
  getTreeItem(n: WipNode): vscode.TreeItem { return itemOf(n); }
  getChildren(n?: WipNode): WipNode[] { return n ? n.kids : this.roots; }
  dispose(): void { this.changed.dispose(); }
}
