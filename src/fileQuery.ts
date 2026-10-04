/** The panel query that finds the chats touching one file. No vscode dependency. */
import { relativeTo } from './fileSessions';

/** `file:<path>`: workspace-relative inside a workspace folder, else absolute; forward slashes; quoted when it holds spaces. */
export function fileQuery(file: string, roots: string[]): string {
  const rel = relativeTo(file, roots)?.rel ?? file.replace(/\\/g, '/');
  return 'file:' + (/\s/.test(rel) ? `"${rel}"` : rel);
}
