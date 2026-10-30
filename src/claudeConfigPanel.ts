/** Claude Config screen: a read-only editor tab showing ~/.claude and project configuration, with a Copy for AI button. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { analyse, Reader } from './claudeConfig';
import { CFG_TITLE, configHtml } from './claudeConfigHtml';
import { configMarkdown } from './claudeConfigMd';

export const CONFIG_CMD = 'saropaChatExplorer.claudeConfig';

const fsReader: Reader = {
  read: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return undefined; } },
  list: (p) => { try { return fs.readdirSync(p); } catch { return undefined; } },
};

export function registerClaudeConfig(ctx: vscode.ExtensionContext, log: (where: string, e: unknown) => void): void {
  let panel: vscode.WebviewPanel | undefined;
  const show = () => {
    if (panel) { panel.reveal(); return; }
    const p = vscode.window.createWebviewPanel('saropaChatExplorer.claudeConfig', CFG_TITLE, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    panel = p;
    const rep = analyse(fsReader, path.join(os.homedir(), '.claude'), vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    p.webview.html = configHtml(rep);
    const sub = p.webview.onDidReceiveMessage(async (m: { type?: string }) => {
      if (m?.type !== 'copy') { return; }
      try { await vscode.env.clipboard.writeText(configMarkdown(rep)); void vscode.window.showInformationMessage('Copied Claude config for AI'); }
      catch (e) { log('copy claude config', e); void vscode.window.showErrorMessage('Could not copy the Claude config: ' + (e as Error).message); }
    });
    p.onDidDispose(() => { sub.dispose(); panel = undefined; });
  };
  ctx.subscriptions.push(vscode.commands.registerCommand(CONFIG_CMD, show), { dispose: () => panel?.dispose() });
}
