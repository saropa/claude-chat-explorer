/**
 * The digest store: one JSON file per chat id in <extension storage>/digests-v1, beside the records folder. Claude
 * Code's chat files are never written. DigestCache is the worker's read side: lazy reads, cached by chat id and
 * digest file mtime, dropped on demand after a build.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Digest, DIGEST_DIR, DigestEntry, digestLines, DigestLookup, validDigest } from './digest';
import { isSessionId } from './sessionId';

/** How long a directory listing is trusted before it is read again; another window may have built digests meanwhile. */
export const LIST_TTL_MS = 30000;

/** Folder of the digest store under the extension's storage folder. */
export const digestDir = (storage: string): string => path.join(storage, DIGEST_DIR);

/** File of one chat's digest; undefined for an id that is not a session id (it could otherwise name a path). */
export const digestFile = (dir: string, id: string): string | undefined => (isSessionId(id) ? path.join(dir, id + '.json') : undefined);

/** Read one digest; undefined when missing, unreadable or not a valid digest. */
export function readDigest(dir: string, id: string): Digest | undefined {
  const f = digestFile(dir, id);
  if (!f) { return undefined; }
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    // The id inside must match the file name: a copied or renamed file is not trusted.
    return validDigest(d) && d.id === id ? d : undefined;
  } catch { return undefined; }
}

/** Write one digest through a same-folder temp file and a rename, so a reader never sees half a file. */
export async function writeDigest(dir: string, d: Digest): Promise<void> {
  const f = digestFile(dir, d.id);
  if (!f) { throw new Error('invalid session id'); }
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = `${f}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(d), 'utf8');
    await fs.promises.rename(tmp, f);
  } catch (e) {
    // A failed write leaves no temp file behind; the old digest (if any) stays in place.
    await fs.promises.unlink(tmp).catch(() => undefined);
    throw e;
  }
}

/** Ids with a digest file in the store (empty when the folder does not exist yet). */
export function listDigestIds(dir: string): string[] {
  try { return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter(isSessionId); } catch { return []; }
}

/** One cache slot: the parsed entry and the file mtime it was read at, so a rebuild by another window (new mtime) is noticed and the entry re-read. */
interface Cached { mtime: number; e: DigestEntry; }

/** The worker's digest cache: a lookup by chat id that reads each digest file at most once per change. */
export class DigestCache implements DigestLookup {
  private ids?: Set<string>; // ids that have a digest file, from the last listing
  private listed = 0; // when the listing was read
  private readonly cache = new Map<string, Cached>();

  constructor(readonly dir: string, private readonly now: () => number = Date.now) {}

  /** Read the folder listing again when it is older than the TTL; cached entries whose file changed or vanished are dropped. */
  private listing(): Set<string> {
    if (this.ids && this.now() - this.listed < LIST_TTL_MS) { return this.ids; }
    this.ids = new Set(listDigestIds(this.dir));
    this.listed = this.now();
    for (const [id, c] of this.cache) {
      // A digest rebuilt by another window has a new mtime; one removed from disk is gone from the listing.
      if (!this.ids.has(id) || this.mtimeOf(id) !== c.mtime) { this.cache.delete(id); }
    }
    return this.ids;
  }

  /** Mtime of one digest file, or -1 when it cannot be read. */
  private mtimeOf(id: string): number {
    const f = digestFile(this.dir, id);
    try { return f ? fs.statSync(f).mtimeMs : -1; } catch { return -1; }
  }

  /** The digest of a chat with its search lines; undefined when it has none. */
  get(id: string): DigestEntry | undefined {
    if (!this.listing().has(id)) { return undefined; }
    const hit = this.cache.get(id);
    if (hit) { return hit.e; }
    const mtime = this.mtimeOf(id), d = readDigest(this.dir, id);
    // A damaged file is treated as no digest; it is not cached, so a rebuild that fixes it is seen.
    if (!d) { return undefined; }
    const e = { d, lines: digestLines(d) };
    this.cache.set(id, { mtime, e });
    return e;
  }

  /** True when the store holds a file for the chat, valid or not (get() returns only valid current digests). */
  has(id: string): boolean { return this.listing().has(id); }

  /** Forget the given ids after a build or rebuild, and refresh their presence in the listing at once. */
  drop(ids: string[]): void {
    const set = this.ids;
    for (const id of ids) {
      this.cache.delete(id);
      // Without a listing yet there is nothing to correct: the first get() reads the folder.
      if (set) { if (this.mtimeOf(id) >= 0) { set.add(id); } else { set.delete(id); } }
    }
  }
}
