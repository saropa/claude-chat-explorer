import { Chat } from './types';

const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');

/** Working folder recorded for a chat (the workspace folder whose encoded name matches its project dir when the record has none); '' when unknown. */
export function chatCwd(ix: { find(id: string): Chat | undefined }, id: string, folders: string[]): string {
  const c = ix.find(id);
  if (!c) { return ''; }
  return c.cwd ?? folders.find((f) => encode(f) === c.dir) ?? '';
}
