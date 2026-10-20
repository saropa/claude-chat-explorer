/** Options screen: an editor tab that edits every saropaChatExplorer.* setting, built from the manifest schema. */
import * as vscode from 'vscode';
import { OPT_PREFIX, OptEntry, parseSchema, validateValue } from './optionsForm';
import { OPT_TITLE, optionsHtml } from './optionsHtml';

export const OPTIONS_CMD = 'saropaChatExplorer.options';

export function registerOptions(ctx: vscode.ExtensionContext, log: (where: string, e: unknown) => void): void {
  let panel: vscode.WebviewPanel | undefined;
  const entries = (): OptEntry[] => parseSchema((ctx.extension?.packageJSON ?? vscode.extensions.getExtension('saropa.claude-chat-explorer')?.packageJSON)?.contributes?.configuration?.properties);
  const state = (list: OptEntry[], errs: Record<string, string> = {}, reset = false) => {
    const cfg = vscode.workspace.getConfiguration(), out: Record<string, object> = {};
    for (const e of list) { out[e.key] = { value: cfg.get(e.key) ?? e.def ?? '', isDefault: cfg.inspect(e.key)?.globalValue === undefined, error: errs[e.key], reset }; }
    return out;
  };
  const push = (list: OptEntry[], errs?: Record<string, string>, reset = false) => { void panel?.webview.postMessage({ type: 'values', values: state(list, errs, reset) }); };

  const onMessage = async (m: { type?: string; key?: unknown; value?: unknown }) => {
    const list = entries();
    if (m?.type === 'openSettings') { await vscode.commands.executeCommand('workbench.action.openSettings', OPT_PREFIX.slice(0, -1)); return; }
    if (m?.type === 'ready') { push(list); return; }
    if (m?.type !== 'set' && m?.type !== 'reset') { return; }
    const e = list.find((x) => x.key === m.key);
    const chk = validateValue(e, m.type === 'reset' ? undefined : m.value);
    if (!chk.ok) { push(list, { [String(m.key)]: chk.error }, true); return; }
    try {
      // The webSessions consent listener (src/webSessions.ts) reacts to this write, so enabling still shows its warning and a decline turns it back off.
      await vscode.workspace.getConfiguration().update(e!.key, chk.value, vscode.ConfigurationTarget.Global);
    } catch (err) { log('options write', err); push(list, { [e!.key]: 'Could not save this setting.' }, true); return; }
    push(list, undefined, m.type === 'reset');
  };

  const show = () => {
    if (panel) { panel.reveal(); return; }
    const list = entries();
    const p = vscode.window.createWebviewPanel('saropaChatExplorer.options', OPT_TITLE, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [] });
    panel = p;
    const cfg = vscode.workspace.getConfiguration(), vals: Record<string, unknown> = {};
    for (const e of list) { vals[e.key] = cfg.get(e.key); }
    p.webview.html = optionsHtml(list, vals);
    const subs = [
      p.webview.onDidReceiveMessage((m) => { onMessage(m).catch((e) => log('options', e)); }),
      vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(OPT_PREFIX.slice(0, -1))) { push(list); } }),
    ];
    p.onDidDispose(() => { subs.forEach((s) => s.dispose()); panel = undefined; });
  };
  ctx.subscriptions.push(vscode.commands.registerCommand(OPTIONS_CMD, show), { dispose: () => panel?.dispose() });
}
