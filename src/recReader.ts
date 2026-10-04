import * as fs from 'fs';
import * as path from 'path';
import { decodeRec } from './blob';
import { fileOf } from './files';
import { MemKeep } from './memKeep';
import { chatOf, code, emptyRec } from './recChat';
import { DIR_PREFIX, FORMAT, isCorrupt, parseRecord, readRecordSync, recName } from './record';
import { buildFileMap, FileMap, relatedChats } from './related';
import { Chat, Rec, Related } from './types';

const REPARSE_DELAY = 1000;

/** The in-memory chat table and the record read path: ChatIndex adds loading, parsing, writing and sweeping. */
export abstract class RecReader {
  protected chats = new Map<string, Chat>(); // keyed by source file path
  protected bySub?: Map<string, Chat[]>;
  protected fmap?: FileMap;
  protected keepMem = new MemKeep(); // records whose write failed
  protected dirty = false;
  protected reparseTimer?: NodeJS.Timeout;
  private logged = new Set<string>();
  readonly recDir: string;
  onChange?: () => void;
  onError?: (where: string, e: unknown) => void;

  constructor(protected readonly dir: string, readonly root: string) {
    this.recDir = path.join(dir, DIR_PREFIX + FORMAT);
  }

  abstract refresh(): Promise<void>;

  /** Report an error once per distinct error code (or message). */
  protected logOnce(where: string, e: unknown): void {
    const k = code(e) ?? (e instanceof Error ? e.message : String(e));
    if (this.logged.has(k)) { return; }
    this.logged.add(k);
    this.onError?.(where, e);
  }

  /** Top-level chats (subagents excluded). */
  tops(): Chat[] { return [...this.chats.values()].filter((c) => !c.parent); }
  get size(): number { return this.chats.size; }

  /** Subagent chats of a parent session (same project folder), newest first. */
  subsOf(p: Chat): Chat[] {
    if (!this.bySub) {
      const m = new Map<string, Chat[]>();
      for (const c of this.chats.values()) {
        if (!c.parent) { continue; }
        const k = c.dir + '/' + c.parent;
        (m.get(k) ?? m.set(k, []).get(k)!).push(c);
      }
      for (const l of m.values()) { l.sort((a, b) => b.last - a.last); }
      this.bySub = m;
    }
    return this.bySub.get(p.dir + '/' + p.id) ?? [];
  }

  /** Newest top-level chat with this session id. */
  find(id: string): Chat | undefined {
    let best: Chat | undefined;
    for (const c of this.chats.values()) { if (!c.parent && c.id === id && (!best || c.mtime > best.mtime)) { best = c; } }
    return best;
  }

  fileOf(c: Chat): string { return fileOf(this.root, c); }
  protected srcOf(file: string): string { return path.relative(this.root, file); }
  protected changed(): void { this.dirty = true; this.bySub = undefined; this.fmap = undefined; }

  related(chat: Chat): Related[] {
    this.fmap ??= buildFileMap(this.tops());
    return relatedChats(chat, this.fmap);
  }

  /** Decode a chat's record. A corrupt one is evicted and re-parsed, an I/O error keeps the file; both read as empty. */
  rec(c: Chat): Rec {
    try {
      const m = this.keepMem.bodies.get(c.rec);
      if (m) { return decodeRec(m); }
      if (this.keepMem.pend.has(c.rec)) { return emptyRec(); }
      return decodeRec(parseRecord(readRecordSync(path.join(this.recDir, c.rec)), c.rec).body);
    } catch (e) { return this.recFailed(c, e); }
  }

  private recFailed(c: Chat, e: unknown): Rec {
    if (code(e) === 'ENOENT') {
      const r = this.reresolve(c);
      if (r) { return r; }
    } else {
      this.logOnce('record ' + c.id, e);
      if (!isCorrupt(e)) { return emptyRec(); } // EMFILE, EACCES, EBUSY, EIO: keep the file, read again next time
      try { fs.unlinkSync(path.join(this.recDir, c.rec)); } catch { /* already gone */ }
    }
    this.evict(c);
    return emptyRec();
  }

  /** The record vanished: use the one for the source's current version when it exists. */
  private reresolve(c: Chat): Rec | undefined {
    try {
      const file = fileOf(this.root, c), st = fs.statSync(file);
      const name = recName(this.srcOf(file), st.mtimeMs, st.size);
      if (name === c.rec) { return undefined; }
      const p = parseRecord(readRecordSync(path.join(this.recDir, name)), name);
      this.chats.set(file, chatOf(p, name));
      this.changed();
      return decodeRec(p.body);
    } catch { return undefined; }
  }

  /** Forget a chat and queue a refresh so it is parsed again. */
  private evict(c: Chat): void {
    const k = fileOf(this.root, c);
    if (this.chats.get(k) === c) { this.chats.delete(k); this.changed(); }
    if (this.reparseTimer) { return; }
    this.reparseTimer = setTimeout(() => { this.reparseTimer = undefined; this.refresh().catch(() => undefined); }, REPARSE_DELAY);
  }
}
