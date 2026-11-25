/**
 * Worker side of a digest build. Step one (digestInput) gathers the exact parts from the index and one pass over
 * the chat file, and returns the AI input; step two (digestSave) quotes the AI's picks from the record, applies the
 * size cap and writes the file. The host runs the AI between the two steps, so the worker never starts a process.
 */
import { scanLines } from './scan';
import { capDigest, Decision, Digest, DIGEST_VERSION, extractRefs, finishFile, mergedFiles, newFileAcc, orderDecisions, takeFileLine, AiState, digestStale } from './digest';
import { aiInput, AiInput, AiPart, messageDecisions, msgText } from './digestAi';
import { DigestCache, readDigest, writeDigest } from './digestStore';
import { digestFileName, digestMarkdown, inProject, indexMarkdown } from './digestMd';
import { handoverData } from './handover';
import { Chat, Rec } from './types';

/** What the build reads from the index (ChatIndex has all of it). */
export interface DigestSource {
  find(id: string): Chat | undefined; subsOf(p: Chat): Chat[]; rec(c: Chat): Rec; fileOf(c: Chat): string; tops(): Chat[];
}

/** Last message rows kept for the clean-end test; a few, because meta rows (command output) can follow the final reply. */
const TAIL_ROWS = 6;
const HEAD = 1024;
const USER = Buffer.from('"type":"user"'), ASST = Buffer.from('"type":"assistant"');
/** How long a gathered build waits for its AI result before it is dropped (a canceled or crashed host build). */
const PENDING_MS = 15 * 60 * 1000;

/** True when the head or tail of a raw line names a user or assistant row (the same cheap probe the parser uses). */
function msgRow(b: Buffer, s: number, e: number): boolean {
  const h = b.subarray(s, Math.min(e, s + HEAD)), t = b.subarray(Math.max(s, e - HEAD), e);
  return h.indexOf(USER) >= 0 || h.indexOf(ASST) >= 0 || t.indexOf(USER) >= 0 || t.indexOf(ASST) >= 0;
}

/** One pass over a chat file: question-dialog answers, compaction summary lines and whether the chat ended cleanly. */
export async function scanChatFile(file: string): Promise<ReturnType<typeof finishFile>> {
  const a = newFileAcc();
  const tail: string[] = [];
  await scanLines(file, (b, s, e, n) => {
    const line = b.subarray(s, e);
    // Probe the raw bytes first: decoding every line would copy the whole file into strings, and only a few rows matter.
    if (line.indexOf('AskUserQuestion') >= 0 || line.indexOf('isCompactSummary') >= 0 || (a.asks.size > 0 && line.indexOf('tool_result') >= 0)) { takeFileLine(line.toString('utf8'), n, a); }
    // Keep the last few message rows; the buffer is reused by the scanner, so each kept line is decoded into its own string.
    if (msgRow(b, s, e)) { tail.push(line.toString('utf8')); if (tail.length > TAIL_ROWS) { tail.shift(); } }
  });
  return finishFile(a, tail);
}

/** A gathered build waiting for its AI result: the digest without AI parts and the record the quotes come from. */
interface Pending { base: Digest; rec: Rec; at: number; allowed: Set<number>; } // allowed: owner messages the AI may pick (no summaries, no harness text)

/** The reply of step one. */
export interface DigestInputReply { id: string; title: string; input: AiInput; }

/** Builds digests in the worker; keeps gathered builds until their save arrives. */
export class DigestBuilder {
  private readonly pend = new Map<string, Pending>();

  constructor(private readonly ix: DigestSource, readonly cache: DigestCache, private readonly now: () => number = Date.now) {}

  /** Step one: gather the exact parts of one top-level chat and return its AI input; undefined when the chat is not indexed. */
  async input(id: string): Promise<DigestInputReply | undefined> {
    const c = this.ix.find(id);
    if (!c) { return undefined; }
    const subs = this.ix.subsOf(c), rec = this.ix.rec(c);
    const scan = await scanChatFile(this.ix.fileOf(c));
    // Compaction rows are kept as messages by the parser; map their file lines to message indexes so the AI never gets to quote them.
    const summary = new Set<number>();
    for (let i = 0; i < rec.lines.length; i++) { if (scan.compact.has(rec.lines[i])) { summary.add(i); } }
    const input = aiInput(rec, summary);
    // References come from the chat and its subagents (their facts merge into the parent's digest), text and commands alike.
    const recs = [rec, ...subs.map((s) => safeRec(() => this.ix.rec(s)))].filter((r): r is Rec => !!r);
    // Folder and branch reuse the hand-over note's reader, so both always agree.
    const h = handoverData(this.ix, c, '');
    const base: Digest = {
      v: DIGEST_VERSION, id: c.id, dir: c.dir, title: c.title, size: c.size, mtime: c.mtime, built: this.now(), first: c.first, last: c.last,
      folder: h.folder, decisions: scan.dialogs, files: mergedFiles([c.files, ...subs.map((s) => s.files)]), refs: extractRefs(recTexts(recs)), ai: 'none',
    };
    const start = c.cwds?.[0] ?? c.cwd;
    if (start) { base.start = start; }
    if (h.branch) { base.branch = h.branch; }
    if (scan.noClose) { base.noClose = true; }
    if (input.trimmed) { base.inputTrimmed = true; }
    this.sweep();
    this.pend.set(c.id, { base, rec, at: this.now(), allowed: new Set(input.allowed) });
    return { id: c.id, title: c.title, input };
  }

  /** Drop gathered builds whose host never came back. */
  private sweep(): void {
    const old = this.now() - PENDING_MS;
    for (const [id, p] of this.pend) { if (p.at < old) { this.pend.delete(id); } }
  }

  /**
   * Step two: add the AI parts (when ai is 'ok'), quote the picked owner messages verbatim, cap and write. A failed
   * or turned-off AI keeps the exact parts and says so. Returns the goal for the list marker, or undefined when the
   * gathered build expired (the host then starts over).
   */
  async save(id: string, state: AiState, part?: AiPart): Promise<{ goal?: string } | undefined> {
    const p = this.pend.get(id);
    if (!p) { return undefined; }
    this.pend.delete(id);
    const d: Digest = { ...p.base, ai: state, built: this.now() };
    let ds: Decision[] = d.decisions;
    // The part crossed a thread boundary: check its shape before any field is used, and treat a bad one as a failed AI run.
    const good = !!part && typeof part.goal === 'string' && Array.isArray(part.decisions) && Array.isArray(part.open);
    if (state === 'ok' && good) {
      d.goal = part!.goal;
      const open = part!.open.filter((x): x is string => typeof x === 'string');
      if (open.length) { d.open = open; }
      ds = [...ds, ...messageDecisions(p.rec, part!.decisions.filter((x): x is number => Number.isInteger(x) && p.allowed.has(x)))];
    } else if (state === 'ok') { d.ai = 'failed'; }
    d.decisions = orderDecisions(ds);
    const out = capDigest(d);
    await writeDigest(this.cache.dir, out);
    // This window's searches see the new digest at once; other windows pick it up on their next listing.
    this.cache.drop([id]);
    return { goal: out.goal };
  }

  /** Top-level chats (archived ones too) with their digest state, for the Build command and the automatic rebuild. */
  todo(): Array<{ id: string; title: string; mtime: number; state: 'none' | 'stale' | 'fresh' }> {
    return this.ix.tops().map((c) => {
      const e = this.cache.get(c.id);
      return { id: c.id, title: c.title, mtime: c.mtime, state: !e ? 'none' as const : digestStale(e.d, c) ? 'stale' as const : 'fresh' as const };
    });
  }

  /** The digest of one chat for its card: the digest and whether the chat changed since it was built. */
  card(id: string): { d: Digest; stale: boolean } | null {
    const e = this.cache.get(id), c = this.ix.find(id);
    return e ? { d: e.d, stale: !!c && digestStale(e.d, c) } : null;
  }

  /** Export files of every digest that belongs to the folder, plus INDEX.md; missing counts the folder's chats with no digest yet. */
  exportFor(folder: string): { files: Array<{ name: string; text: string }>; index: string; missing: number; stale: number } {
    const ds: Digest[] = [];
    let missing = 0, stale = 0;
    for (const c of this.ix.tops()) {
      // Read straight from disk: the export must use exactly what is stored, not a cached copy from before another window's rebuild.
      const d = readDigest(this.cache.dir, c.id);
      const where = d ?? { start: c.cwds?.[0] ?? c.cwd, dir: c.dir };
      if (!inProject(where, folder)) { continue; }
      if (!d) { missing++; continue; }
      if (digestStale(d, c)) { stale++; }
      ds.push(d);
    }
    return { files: ds.map((d) => ({ name: digestFileName(d), text: digestMarkdown(d) })), index: indexMarkdown(ds), missing, stale };
  }

  /** Session file and 1-based line of one message of a chat, for the card's message links. */
  where(id: string): { file: string; size: number } | undefined {
    const c = this.ix.find(id);
    return c ? { file: this.ix.fileOf(c), size: c.size } : undefined;
  }
}

/** Every message text and command of the records, in order: the input of the reference scan. */
function* recTexts(recs: Rec[]): Generator<string> {
  for (const r of recs) {
    for (let i = 0; i < r.ts.length; i++) { yield msgText(r, i); }
    yield* r.cmds;
  }
}

/** A subagent record that cannot be read (deleted meanwhile) only drops its references; the build goes on. */
function safeRec(fn: () => Rec): Rec | undefined {
  try { return fn(); } catch { return undefined; }
}
