import * as vscode from 'vscode';

export const RING_DEFAULT = 300000, RING_MIN = 10000;
/** The contextRingTokens setting: the token count that fills the row ring (at least 10000). */
export const contextRingTokens = (): number => {
  const v = vscode.workspace.getConfiguration('saropaChatExplorer').get<number>('contextRingTokens');
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(RING_MIN, Math.round(v)) : RING_DEFAULT;
};
