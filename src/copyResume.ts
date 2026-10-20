/** Copy the terminal command that resumes a chat: change into its folder, then claude --resume. */
import * as vscode from 'vscode';
import { isSessionId } from './sessionId';
import { resumeCommand } from './workCleanup';

export interface ResumeDeps { cwd: (id: string) => Promise<string>; log: (where: string, e: unknown) => void; }

/** Same builder and quoting as the Project status toast (single quotes elsewhere, double quotes with quotes removed on Windows). */
export async function copyResume(id: string, d: ResumeDeps): Promise<void> {
  if (!isSessionId(id)) { return; }
  try {
    const dir = await d.cwd(id);
    if (!dir) { void vscode.window.showInformationMessage('This chat has no known folder, so there is no resume command to copy.'); return; }
    await vscode.env.clipboard.writeText(resumeCommand(dir, id, process.platform === 'win32'));
    void vscode.window.showInformationMessage('Copied resume command');
  } catch (e) { d.log('copy resume command', e); void vscode.window.showErrorMessage('Could not copy the resume command: ' + (e as Error).message); }
}
