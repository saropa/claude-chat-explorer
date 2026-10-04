import * as vscode from 'vscode';
import { WorkerClient } from './client';
import { deliver } from './exporter';
import { ExportOut } from './export';
import { gitHint } from './gitMatch';
import { opts } from './msgOpts';
import { compile, isEmpty, MIN_QUERY_CHARS, parseQuery, queryChars } from './query';
import { STATUS_KEYS } from './status';
import { Store } from './store';

export interface ExportDeps {
  client: WorkerClient; store: Store; post: (m: unknown) => void; logErr: (where: string, e: unknown) => void;
  ctxMsg: object; // pins, tags and dots for the worker
}

/** Export every matching line (not just the shown rows): a worker job with the search timeout; copy or save the text. Archived chats are left out. */
export async function runExport(m: any, d: ExportDeps): Promise<void> {
  const query = String(m.query ?? '').trim(), o = opts(m);
  const x = { context: !!m.context, unique: !!m.unique, statuses: Array.isArray(m.statuses) ? STATUS_KEYS.filter((k) => m.statuses.includes(k)) : [...STATUS_KEYS] };
  d.store.setExportPrefs(x);
  const hint = gitHint(parseQuery(query).tokens);
  if (hint) { d.post({ type: 'short', message: hint }); return; }
  try { if (isEmpty(compile(query, o)) || queryChars(query, o) < MIN_QUERY_CHARS) { throw new Error('Nothing to export'); } }
  catch (e) { void vscode.window.showErrorMessage('Export failed: ' + (e as Error).message); return; }
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const fail = (e: unknown) => {
    const msg = (e as Error).message;
    d.logErr('export', e);
    void vscode.window.showErrorMessage(msg.startsWith('Export') ? msg : 'Export failed: ' + msg);
  };
  d.client.search({ query, o, folders, x, ...d.ctxMsg, archived: [...d.store.archived] }, (w) => {
    if (w.t === 'done') { deliver(w as unknown as ExportOut, m.mode === 'save' ? 'save' : 'copy').catch(fail); }
    else if (w.t === 'error') { fail(new Error(w.message)); }
  }, (why) => {
    // 'error' ends already delivered one error message ('Search worker restarted' or the export's own) to the callback above
    if (why === 'cancel') { void vscode.window.showInformationMessage('Export canceled'); }
  }, 'export');
}
