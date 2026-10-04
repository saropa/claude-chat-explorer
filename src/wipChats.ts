import { mergedGit } from './gitInfo';
import { Source } from './search';
import { WipChatIn } from './wipTypes';

const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');
const MAX_CHATS = 2000;
const MAX_PRS = 5;

/** Chats active since a time or live now, newest first, with their working folder (the repository folder when the record has none). */
export function wipChats(ix: Source, since: number, live: Set<string>, folders: string[]): WipChatIn[] {
  const byDir = new Map(folders.map((f) => [encode(f), f] as const));
  const out: WipChatIn[] = [];
  for (const c of ix.tops().filter((x) => x.last >= since || live.has(x.id)).sort((a, b) => b.last - a.last).slice(0, MAX_CHATS)) {
    const prs = mergedGit(c, ix.subsOf(c)).prs.sort((a, b) => b[0] - a[0]).slice(0, MAX_PRS);
    out.push({ id: c.id, title: c.title, last: c.last, cwd: c.cwd ?? byDir.get(c.dir) ?? '', prs });
  }
  return out;
}
