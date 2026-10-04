import { Chat, Related } from './types';

export const COMMON_RATIO = 0.25;
export const MAX_RELATED = 5;
const EDIT_WEIGHT = 3;

interface Entry { id: string; edited: boolean; }
export interface FileMap { files: Map<string, Entry[]>; byId: Map<string, Chat>; total: number; }

/** Inverted map: file path to the chats that touched it. Built at index time. */
export function buildFileMap(chats: Chat[]): FileMap {
  const files = new Map<string, Entry[]>();
  const byId = new Map<string, Chat>();
  for (const c of chats) {
    const prev = byId.get(c.id);
    if (!prev || prev.mtime < c.mtime) { byId.set(c.id, c); }
    for (const f of c.files) {
      const list = files.get(f.path);
      if (list) { list.push({ id: c.id, edited: f.edited }); } else { files.set(f.path, [{ id: c.id, edited: f.edited }]); }
    }
  }
  return { files, byId, total: chats.length };
}

/** Chats sharing files with this one; edited files weigh 3x, files in over 25% of chats are ignored. */
export function relatedChats(chat: Chat, fm: FileMap): Related[] {
  const score = new Map<string, { score: number; shared: number }>();
  const limit = fm.total * COMMON_RATIO;
  for (const f of chat.files) {
    const list = fm.files.get(f.path);
    if (!list || list.length > limit) { continue; }
    for (const e of list) {
      if (e.id === chat.id) { continue; }
      const s = score.get(e.id) ?? { score: 0, shared: 0 };
      s.score += f.edited || e.edited ? EDIT_WEIGHT : 1;
      s.shared++;
      score.set(e.id, s);
    }
  }
  const out: Related[] = [];
  for (const [id, s] of score) {
    const c = fm.byId.get(id);
    if (c) { out.push({ id, title: c.title, shared: s.shared, last: c.last, score: s.score }); }
  }
  return out.sort((a, b) => b.score - a.score || b.last - a.last).slice(0, MAX_RELATED);
}
