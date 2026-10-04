import * as fs from 'fs';
import * as path from 'path';
import { decodeRec } from './blob';
import { fileOf } from './files';
import { MemKeep } from './memKeep';
import { recCache } from './recCache';
import { chatOf, code, emptyRec } from './recChat';
import { DIR_PREFIX, FORMAT, isCorrupt, parseRecord, readRecordSync, recName } from './record';
import { buildFileMap, FileMap, relatedChats } from './related';
import { Chat, Rec, Related } from './types';

const REPARSE_DELAY = 1000;
const READ_FAILS = 3;

/** The in-memory chat table and the record read path: ChatIndex adds loading, parsing, writing and sweeping. */
export abstract class RecReader {
  protected chats = new Map<string, Chat>(); // keyed by source file path
  protected bySub?: Map<string, Chat[]>;
  protected fmap?: FileMap;
  protected keepMem = new MemKeep(); // records whose write failed
  protected failed = new Map<string, string>(); // source file -> version that did not fit in memory; skipped until it changes
  protected fails = new Map<string, number>(); // record name -> consecutive read failures
  protected dirty = false;
  protected reparseTimer?: NodeJS.Timeout;
  private logged = new Set<string>();
  readonly recDir: string;
  onChange?: () => void;
  onError?: (where: string, e: unknown) => void;

  constructor(protected readonly dir: string, readonly root: string) {
    this.recDir = path.join(dir, DIR_PREFIX + FORMAT);
    this.keepMem.onFree = () => this.failed.clear();
  }

  /** Count a read failure of one record; at READ_FAILS it is treated as a miss. */
  protected noteFail(name: string): number {
    const n = (this.fails.get(name) ?? 0) + 1;
    this.fails.set(name, n);
    return n;
  }
  protected unreadable(name: string): boolean { return (this.fails.get(name) ?? 0) >= READ_FAILS; }

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
      const r = decodeRec(this.readBody(c.rec));
      this.fails.delete(c.rec);
      return r;
    } catch (e) { return this.recFailed(c, e); }
  }

  /** The verified body of a record, from the raw-file cache when present. */
  private readBody(name: string): Buffer {
    const hit = recCache.get(name);
    const b = hit ?? readRecordSync(path.join(this.recDir, name));
    let body: Buffer;
    try { body = parseRecord(b, name, recCache.verified).body; } catch (e) { recCache.drop(name); throw e; }
    if (!hit) { recCache.put(name, b); }
    return body;
  }

  private recFailed(c: Chat, e: unknown): Rec {
    if (code(e) === 'ENOENT') {
      const r = this.reresolve(c);
      if (r) { return r; }
    } else if (isCorrupt(e)) {
      this.logOnce('record ' + c.id, e);
      recCache.drop(c.rec);
      try { fs.unlinkSync(path.join(this.recDir, c.rec)); } catch { /* already gone */ }
    } else {
      this.logOnce('record ' + c.id, e);
      if (this.noteFail(c.rec) < READ_FAILS) { return emptyRec(); } // EMFILE, EACCES, EBUSY, EIO: keep the file, read again; the 3rd failure rebuilds into memory
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
    recCache.drop(c.rec);
    this.failed.delete(k); // an evicted chat must be tried again
    if (this.chats.get(k) === c) { this.chats.delete(k); this.changed(); }
    if (this.reparseTimer) { return; }
    this.reparseTimer = setTimeout(() => { this.reparseTimer = undefined; this.refresh().catch(() => undefined); }, REPARSE_DELAY);
  }
}
