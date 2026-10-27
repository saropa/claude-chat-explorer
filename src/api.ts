/** Public API returned from activate(); other Saropa extensions read it with extension.exports. */
import { FileSessionsReply } from './fileSessions';
import { FileSessionsService } from './fileSessionsService';

export const API_VERSION = 1;

export interface ChatLink { id: string; title: string; edited: boolean; last: number; branch?: string; }
export interface ChatsForFile { indexing: boolean; total: number; edited: number; items: ChatLink[]; }

export interface ChatExplorerApi {
  apiVersion: number;
  /** Chats that read or edited the file (absolute path); cached for 30 seconds per file. Rejects only if the index worker fails. */
  chatsForFile(file: string): Promise<ChatsForFile>;
}

const slim = (r: FileSessionsReply): ChatsForFile => ({ indexing: r.indexing, total: r.total, edited: r.edited,
  items: r.items.map((s) => ({ id: s.id, title: s.title, edited: s.edited, last: s.last, branch: s.branch })) });

export function makeApi(svc: FileSessionsService): ChatExplorerApi {
  return { apiVersion: API_VERSION, chatsForFile: async (file) => slim(await svc.get(file)) };
}
