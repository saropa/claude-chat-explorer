/** Wires context warnings to VS Code: the setting, saved state, the toast and the worker lookup. */
import * as vscode from 'vscode';
import { ContextWarner, warnText, WarnState } from './contextWarn';

const STATE_KEY = 'saropaChatSearch.contextWarned';
const OPEN = 'Open chat', DISMISS = 'Dismiss';

export interface WarnHost {
  request: (m: { [k: string]: any }, bg?: boolean) => Promise<any>;
  open: (id: string) => Promise<void>;
  log: (msg: string) => void;
}

/** The warner for this window: one non-modal toast per threshold crossing of a live session. */
export function createWarner(ctx: vscode.ExtensionContext, h: WarnHost): ContextWarner {
  return new ContextWarner({
    enabled: () => vscode.workspace.getConfiguration('saropaChatSearch').get<boolean>('contextWarnings', true),
    now: () => Date.now(),
    info: async (ids) => (await h.request({ t: 'ctx', ids }, true)) ?? {},
    load: () => structuredClone(ctx.globalState.get<WarnState>(STATE_KEY) ?? {}),
    save: (s) => { void ctx.globalState.update(STATE_KEY, s); },
    log: h.log,
    show: (w) => {
      void vscode.window.showInformationMessage(warnText(w.title, w.level), OPEN, DISMISS)
        .then((c) => (c === OPEN ? h.open(w.id) : undefined), (e) => h.log('context toast: ' + String(e)));
    },
  });
}
