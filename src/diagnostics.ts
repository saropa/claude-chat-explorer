import * as vscode from 'vscode';
import * as fs from 'fs';
import { sessionsDir } from './liveState';

export const DIAG_CMD = 'saropaChatSearch.diagnostics';
const VIEW_IDS = ['claudeChatSearch.view', 'claudeChatSearch.git'];

/** Chats the worker has indexed, or -1 when it did not answer. */
async function chatCount(request: (m: { [k: string]: any }, bg?: boolean) => Promise<any>): Promise<number> {
  try {
    const r = await request({ t: 'sessions', o: {}, sort: 'recent', folders: [], pins: [], archived: [], dots: {} }, true);
    return Number(r?.total ?? 0);
  } catch { return -1; }
}

/** Command "Show Diagnostics": one message with the facts needed to explain a missing icon or menu. */
export function registerDiagnostics(ctx: vscode.ExtensionContext, request: (m: { [k: string]: any }, bg?: boolean) => Promise<any>, version: string, activated: () => boolean): void {
  ctx.subscriptions.push(vscode.commands.registerCommand(DIAG_CMD, async () => {
    const count = await chatCount(request);
    const claude = vscode.extensions.getExtension('anthropic.claude-code') ? 'installed' : 'not installed';
    const lines = [`Saropa Chat Search ${version}`, `activation completed: ${activated() ? 'yes' : 'no'}`,
      `chats indexed: ${count < 0 ? 'unknown (worker did not answer)' : count}`, `Claude Code extension: ${claude}`,
      `~/.claude/sessions: ${fs.existsSync(sessionsDir()) ? 'exists' : 'missing'}`, `views: ${VIEW_IDS.join(', ')}`];
    void vscode.window.showInformationMessage(lines.join(' | '));
  }));
}
