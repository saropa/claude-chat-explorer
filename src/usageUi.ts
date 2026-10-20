/** Usage Summary command (quick pick) and the usage status bar item (count of chats at 80% context or more, hidden at 0). */
import * as vscode from 'vscode';
import { nearlyFull, summarize, usd, Group } from './usageSummary';
import { UsageRow } from './usageRows';

export const SUMMARY_CMD = 'saropaChatExplorer.usageSummary';
export const BAR_CMD = 'saropaChatExplorer.usageBar.show';
export const BAR_SETTING = 'saropaChatExplorer.showUsageStatusBar';
const NEARLY_PCT = 80;
const DEBOUNCE_MS = 1000;
const when = (ms: number): string => new Date(ms).toLocaleDateString();

export interface UsageDeps {
  rows: () => Promise<UsageRow[]>;
  resume: (id: string) => Promise<void>;
  showNearly: () => Promise<void>; // open the sidebar with only the Nearly full status
  onIndex: (fn: () => void) => void;
  log: (where: string, e: unknown) => void;
}

type Item = vscode.QuickPickItem & { id?: string };
const section = (label: string, gs: Group[]): Item[] => (gs.length
  ? [{ label, kind: vscode.QuickPickItemKind.Separator }, ...gs.map((g) => ({ label: g.label, description: usd(g.usd), detail: `${g.chats} ${g.chats === 1 ? 'session' : 'sessions'}` }))]
  : []);

async function showSummary(d: UsageDeps): Promise<void> {
  const s = summarize(await d.rows(), Date.now());
  if (!s.total) { void vscode.window.showInformationMessage('No session cost has been indexed yet.'); return; }
  const top: Item[] = s.top.length ? [{ label: 'Priciest sessions (click to resume)', kind: vscode.QuickPickItemKind.Separator },
    ...s.top.map((r) => ({ label: r.title, description: usd(r.usd), detail: `${r.project} - last active ${when(r.last)}`, id: r.id }))] : [];
  const items: Item[] = [...section('Per day', s.days), ...section('Per week', s.weeks), ...section('Per project', s.projects), ...section('Per model (costliest model of each session)', s.models), ...top];
  const pick = await vscode.window.showQuickPick(items, { title: `Usage Summary: ${usd(s.total)} in all indexed sessions`, placeHolder: 'A session is counted on the day it was last active', matchOnDescription: true, matchOnDetail: true });
  if (pick?.id) { await d.resume(pick.id); }
}

class UsageBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 89);
  private timer?: NodeJS.Timeout;
  private readonly sub: vscode.Disposable;

  constructor(private readonly d: UsageDeps) {
    this.item.command = BAR_CMD;
    this.sub = vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(BAR_SETTING)) { this.schedule(); } });
    this.schedule();
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.refresh(); }, DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    if (!vscode.workspace.getConfiguration().get<boolean>(BAR_SETTING, true)) { this.item.hide(); return; }
    try {
      const n = nearlyFull(await this.d.rows(), NEARLY_PCT);
      if (!n) { this.item.hide(); return; }
      this.item.text = `$(warning) ${n} ${n === 1 ? 'session' : 'sessions'} near full`;
      this.item.tooltip = `${n} ${n === 1 ? 'session is' : 'sessions are'} ${NEARLY_PCT}% full or more. Click to list them in the panel.`;
      this.item.show();
    } catch (e) { this.item.hide(); this.d.log('usage status bar', e); }
  }

  dispose(): void { clearTimeout(this.timer); this.sub.dispose(); this.item.dispose(); }
}

export function registerUsage(ctx: vscode.ExtensionContext, d: UsageDeps): void {
  const bar = new UsageBar(d);
  d.onIndex(() => bar.schedule());
  ctx.subscriptions.push(bar,
    vscode.commands.registerCommand(SUMMARY_CMD, () => showSummary(d).catch((e) => d.log('usage summary', e))),
    vscode.commands.registerCommand(BAR_CMD, () => d.showNearly()));
}
