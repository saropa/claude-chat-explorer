import * as vscode from 'vscode';

/** The search.contextLines setting: lines of each snippet row shown in results (1 to 4, default 1). */
export const searchContextLines = (): number => {
  const v = vscode.workspace.getConfiguration('saropaChatExplorer').get<number>('search.contextLines');
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(4, Math.max(1, Math.round(v))) : 1;
};
