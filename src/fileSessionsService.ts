/** Cached, async lookup of the chats that touched a file; the only thing the commands and the status bar call. */
import { FileSessionsReply, normPath } from './fileSessions';

export const CACHE_MS = 30000;
export interface Requester { request(m: { [k: string]: unknown }, background?: boolean): Promise<any>; }

export class FileSessionsService {
  private cache = new Map<string, { at: number; reply: FileSessionsReply }>();
  private epoch = 0;

  constructor(private readonly client: Requester, private readonly roots: () => string[], private readonly pins: () => string[]) {}

  /** The index changed: drop every cached answer (and ignore answers still in flight). */
  invalidate(): void { this.epoch++; this.cache.clear(); }

  /** Chats that touched the file; cached for 30 seconds per file path, never cached while the first index build runs. */
  async get(file: string, now = Date.now()): Promise<FileSessionsReply> {
    const key = normPath(file), hit = this.cache.get(key);
    if (hit && now - hit.at < CACHE_MS) { return hit.reply; }
    const epoch = this.epoch;
    const reply: FileSessionsReply = await this.client.request({ t: 'fileSessions', file, roots: this.roots(), pins: this.pins() }, true);
    if (!reply.indexing && epoch === this.epoch) { this.cache.set(key, { at: Date.now(), reply }); }
    return reply;
  }
}
