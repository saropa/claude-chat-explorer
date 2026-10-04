/** Copy button of the expanded card: ask the worker for the chat's facts, build the note and copy it. */
import * as vscode from 'vscode';
import { HandoverData, handoverText } from './handover';
import { isSessionId } from './sessionId';

export interface HandoverDeps { request: (m: { [k: string]: unknown }) => Promise<any>; roots: () => string[]; log: (where: string, e: unknown) => void; }

export async function copyHandover(id: string, query: string, d: HandoverDeps): Promise<void> {
  if (!isSessionId(id)) { return; }
  try {
    const data: HandoverData | null = await d.request({ t: 'handover', chat: id, query });
    if (!data) { void vscode.window.showInformationMessage('This chat is not indexed yet. Try again in a moment.'); return; }
    await vscode.env.clipboard.writeText(handoverText(data, d.roots()));
    void vscode.window.showInformationMessage('Copied hand-over note');
  } catch (e) { d.log('hand-over note', e); void vscode.window.showErrorMessage('Could not copy the hand-over note: ' + (e as Error).message); }
}
