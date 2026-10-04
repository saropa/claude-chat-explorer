import * as vscode from 'vscode';
import * as fs from 'fs';
import { sessionsDir } from './liveState';
import { WinInfo } from './windowMarker';

export const DIAG_CMD = 'saropaChatSearch.diagnostics';
const VIEW_IDS = ['claudeChatSearch.view', 'claudeChatSearch.git'];

/** Chats the worker has indexed, or -1 when it did not answer. */
async function chatCount(request: (m: { [k: string]: any }, bg?: boolean) => Promise<any>): Promise<number> {
  try {
    const r = await request({ t: 'sessions', o: {}, sort: 'recent', folders: [], pins: [], archived: [], dots: {} }, true);
    return Number(r?.total ?? 0);
  } catch { return -1; }
}

/** Lines that let the owner check the open-window marker by hand. */
export function windowLines(w: WinInfo | undefined): string[] {
  if (!w) { return ['window marker: no poll yet']; }
  return [`extension host pid: ${w.hostPid}`, `live sessions: ${w.sessions}${w.ps ? ` (this window ${w.here}, other windows ${w.other})` : ' (window marker off: ps not available)'}`,
    `parent pids found: ${w.parents.length ? w.parents.join(', ') : 'none'}`];
}

/** Command "Show Diagnostics": one message with the facts needed to explain a missing icon or menu. */
export function registerDiagnostics(ctx: vscode.ExtensionContext, request: (m: { [k: string]: any }, bg?: boolean) => Promise<any>, version: string, activated: () => boolean, winInfo?: () => WinInfo | undefined, nearly?: () => number): void {
  ctx.subscriptions.push(vscode.commands.registerCommand(DIAG_CMD, async () => {
    const count = await chatCount(request);
    const claude = vscode.extensions.getExtension('anthropic.claude-code') ? 'installed' : 'not installed';
    const lines = [`Saropa Chat Explorer ${version}`, `activation completed: ${activated() ? 'yes' : 'no'}`,
      `chats indexed: ${count < 0 ? 'unknown (worker did not answer)' : count}`, `Claude Code extension: ${claude}`,
      `~/.claude/sessions: ${fs.existsSync(sessionsDir()) ? 'exists' : 'missing'}`, `views: ${VIEW_IDS.join(', ')}`, ...windowLines(winInfo?.()), `live chats at 80% context or more: ${nearly?.() ?? 0}`];
    void vscode.window.showInformationMessage(lines.join(' | '));
  }));
}
