import * as vscode from 'vscode';
import { SORT_LIST, TIPS } from './headerData';
import { STATUS_KEYS, STATUS_LABELS, STATUS_TIPS } from './status';

/** Host side of the view title-bar buttons (Search tips, Sort, Status filter): each opens a quick pick and posts the choice to the sidebar webview. */
export interface HeaderHost {
  reveal(): Thenable<unknown>;
  post(m: unknown): void;
  sort(): string;
  statuses(): string[];
  setStatuses(checked: string[]): void;
}

export const TIPS_CMD = 'claudeChatExplorer.searchTips';
export const SORT_CMD = 'claudeChatExplorer.sortResults';
export const STATUS_CMD = 'claudeChatExplorer.filterStatus';

export function registerHeaderCommands(ctx: vscode.ExtensionContext, h: HeaderHost): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand(TIPS_CMD, async () => {
      await h.reveal();
      const items: (vscode.QuickPickItem & { query?: string })[] = [];
      for (const [group, rows] of TIPS) {
        items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
        for (const [what, ex] of rows) { items.push({ label: ex, description: what, query: ex }); }
      }
      const pick = await vscode.window.showQuickPick(items, { title: 'Search tips', placeHolder: 'Pick an example to try it. Put a value in quotes to include spaces.', matchOnDescription: true });
      if (pick?.query !== undefined) { h.post({ type: 'setQuery', query: pick.query }); }
    }),
    vscode.commands.registerCommand(SORT_CMD, async () => {
      await h.reveal();
      const cur = h.sort();
      const items = SORT_LIST.map(([key, label]) => ({ label, description: key === cur ? 'current' : '', picked: key === cur, key }));
      const pick = await vscode.window.showQuickPick(items, { title: 'Sort results', placeHolder: `Sort results by (now: ${SORT_LIST.find((s) => s[0] === cur)?.[1] ?? 'Score'})` });
      if (pick) { h.post({ type: 'setSort', sort: pick.key }); }
    }),
    vscode.commands.registerCommand(STATUS_CMD, async () => {
      await h.reveal();
      const on = new Set(h.statuses());
      const items = STATUS_KEYS.map((k) => ({ label: STATUS_LABELS[k], detail: STATUS_TIPS[k], picked: on.has(k), key: k }));
      const off = STATUS_KEYS.length - on.size;
      const picks = await vscode.window.showQuickPick(items, { title: 'Filter by status', canPickMany: true, placeHolder: off ? `Show chats that are (${off} of ${STATUS_KEYS.length} turned off)` : 'Show chats that are' });
      if (!picks) { return; }
      const checked = picks.map((p) => p.key);
      h.setStatuses(checked);
      h.post({ type: 'setStatuses', checked });
    }),
  );
}
