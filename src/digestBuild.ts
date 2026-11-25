/**
 * Worker side of a digest build. Step one (digestInput) gathers the exact parts from the index and one pass over
 * the chat file, and returns the AI input; step two (digestSave) quotes the AI's picks from the record, applies the
 * size cap and writes the file. The host runs the AI between the two steps, so the worker never starts a process.
 */
import { scanLines } from './scan';
import { capDigest, Decision, Digest, DIGEST_VERSION, extractRefs, FileScan, mergedFiles, newFileAcc, orderDecisions, takeFileLine, AiState, digestStale, finishFile } from './digest';
import { AI_SLOTS, AI_TIMEOUT_MS, AI_TRIES, aiInput, AiInput, AiPart, estCalls, MAX_PIECES, messageDecisions, msgText } from './digestAi';
import { DigestCache, readDigest, writeDigest } from './digestStore';
import { digestFileName, digestMarkdown, inProject, indexMarkdown } from './digestMd';
import { handoverData } from './handover';
import { TimelineSrc } from './digestTimeline';
import { Chat, Rec } from './types';

/** What the build reads from the index (ChatIndex has all of it). */
export interface DigestSource {
  find(id: string): Chat | undefined; subsOf(p: Chat): Chat[]; rec(c: Chat): Rec; fileOf(c: Chat): string; tops(): Chat[];
}

/** Last message rows kept for the clean-end test; a few, because meta rows (command output) can follow the final reply. */
const TAIL_ROWS = 6;
const HEAD = 1024;
const USER = Buffer.from('"type":"user"'), ASST = Buffer.from('"type":"assistant"');
/** The field the clean-end test reads; quoted, so an escaped mention inside a message text (\"stop_reason\") does not match. */
const STOP = Buffer.from('"stop_reason"');
/**
 * How long a gathered build waits for its AI result before it is dropped (a canceled or crashed host build).
 * Derived from the AI constants so it is never shorter than a real build: every piece plus the merge call, each
 * retried AI_TRIES times at the full timeout, times AI_SLOTS because the calls of concurrent builds queue on the
 * AI_SLOTS shared processes. A fixed 15 minutes was shorter than that, so another chat's input() swept a live build
 * and its save came back as lost.
 */
export const PENDING_MS = (MAX_PIECES + 1) * AI_TRIES * AI_TIMEOUT_MS * AI_SLOTS;

/** True when the head or tail of a raw line names a user or assistant row (the same cheap probe the parser uses). */
function msgRow(b: Buffer, s: number, e: number): boolean {
  const h = b.subarray(s, Math.min(e, s + HEAD)), t = b.subarray(Math.max(s, e - HEAD), e);
  return h.indexOf(USER) >= 0 || h.indexOf(ASST) >= 0 || t.indexOf(USER) >= 0 || t.indexOf(ASST) >= 0;
}

/** One pass over a chat file: question-dialog answers, compaction summary lines and whether the chat ended cleanly. */
export async function scanChatFile(file: string): Promise<FileScan> {
  const a = newFileAcc();
  const tail: string[] = [];
  await scanLines(file, (b, s, e, n) => {
    const line = b.subarray(s, e);
    // Probe the raw bytes first: decoding every line would copy the whole file into strings, and only a few rows matter.
    if (line.indexOf('AskUserQuestion') >= 0 || line.indexOf('isCompactSummary') >= 0 || (a.asks.size > 0 && line.indexOf('tool_result') >= 0)) { takeFileLine(line.toString('utf8'), n, a); }
    // Keep the last few message rows; the buffer is reused by the scanner, so each kept line is decoded into its own string.
    if (msgRow(b, s, e)) { tail.push(line.toString('utf8')); if (tail.length > TAIL_ROWS) { tail.shift(); } }
    // Remember that any assistant row exists: without one, a missing stop_reason is not layout drift.
    if (!a.asstSeen && line.indexOf(ASST) >= 0) { a.asstSeen = true; }
    // One assistant row with a stop_reason field is enough to trust the clean-end test; stop probing once it is found.
    if (!a.stopSeen && line.indexOf(STOP) >= 0 && line.indexOf(ASST) >= 0) { a.stopSeen = true; }
  });
  return finishFile(a, tail);
}

/** A gathered build waiting for its AI result: the digest without AI parts and the record the quotes come from. */
interface Pending { base: Digest; rec: Rec; at: number; allowed: Set<number>; } // allowed: owner messages the AI may pick (no summaries, no harness text)

/** The reply of step one. */
export interface DigestInputReply {
  id: string; title: string; input: AiInput;
  drift?: string[]; // chat-file layout problems found by the pass ('dialog answers', 'stop_reason'), for the host to log once
}

/**
 * Give every decision a numeric `at`. Dialog decisions whose answer row has no parseable timestamp, and message decisions
 * whose message time is 0, are built without `at`; digestStale treats any decision without `at` as stale, so such a digest
 * would be rebuilt (a Haiku run) on every automatic pass, forever. This is the ONE place that closes the gap, for both kinds.
 * Fallback order: the decision's own time, the nearest earlier known message time in the chat, the chat's last activity.
 * Returns new objects; the inputs are not mutated.
 */
export function withDecisionTimes(ds: Decision[], rec: Rec, last: number, built: number): Decision[] {
  // Last resort when even the chat's last activity is unknown (0 or missing): the build time, so `at` is always a real number.
  const end = Number.isFinite(last) && last > 0 ? last : built;
  return ds.map((d) => {
    // The decision already has its own time: keep it untouched.
    if (typeof d.at === 'number' && Number.isFinite(d.at)) { return d; }
    // Find where the decision sits in the message list: a message decision names its index; a dialog decision is placed by
    // the largest message whose file line is at or before the decision's line (rec.lines ascend in file order).
    let k = -1;
    if (typeof d.i === 'number') { k = Math.min(d.i, rec.ts.length - 1); }
    else if (d.line !== undefined) { for (let j = 0; j < rec.lines.length && rec.lines[j] <= d.line; j++) { k = j; } }
    // Walk back to the nearest earlier message that has a recorded time (0 means none was recorded).
    for (; k >= 0; k--) { if (rec.ts[k] > 0) { return { ...d, at: rec.ts[k] }; } }
    return { ...d, at: end };
  });
}

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
    // noClose undefined (no stop_reason anywhere) stays omitted: an unknown end is not reported as a crash.
    if (scan.noClose === true) { base.noClose = true; }
    if (scan.dialogUnread) { base.dialogUnread = true; }
    if (input.trimmed) { base.inputTrimmed = true; }
    this.sweep();
    this.pend.set(c.id, { base, rec, at: this.now(), allowed: new Set(input.allowed) });
    const drift = [...(scan.dialogUnread ? ['dialog answers'] : []), ...(scan.noClose === undefined && rec.ts.length ? ['stop_reason'] : [])];
    return drift.length ? { id: c.id, title: c.title, input, drift } : { id: c.id, title: c.title, input };
  }

  /** Drop gathered builds whose host never came back: only those older than PENDING_MS, which is longer than any real build, so a build still in flight is never swept. */
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
    // Single assembly point for both decision kinds: fill any missing time so the finished digest is never stale by its own content.
    d.decisions = withDecisionTimes(orderDecisions(ds), p.rec, d.last, d.built);
    const out = capDigest(d);
    await writeDigest(this.cache.dir, out);
    // This window's searches see the new digest at once; other windows pick it up on their next listing.
    this.cache.drop([id]);
    return { goal: out.goal };
  }

  /** Top-level chats (archived ones too) with their digest state, for the Build command and the automatic rebuild. */
  todo(): Array<{ id: string; title: string; mtime: number; state: 'none' | 'stale' | 'fresh'; calls: number }> {
    return this.ix.tops().map((c) => {
      const e = this.cache.get(c.id);
      // A file that is there but not a valid current digest (another version, no version, damaged) is stale, not absent:
      // it is rebuilt by the Build command and by the automatic rebuild, which only touches stale digests.
      const state = !e ? (this.cache.has(c.id) ? 'stale' as const : 'none' as const) : digestStale(e.d, c) ? 'stale' as const : 'fresh' as const;
      // The call estimate bounds the cost shown in the Build confirmation; it is computed from index facts, without reading the record.
      return { id: c.id, title: c.title, mtime: c.mtime, state, calls: estCalls(c.len, c.count) };
    });
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

  /**
   * Every stored digest that has decisions, with its session file, for the Decisions timeline. Read straight from disk
   * like the export, so the timeline shows exactly what is stored. Only the fields the timeline prints are sent back,
   * which keeps the reply small: files and references can be most of a digest.
   */
  timeline(): TimelineSrc[] {
    const out: TimelineSrc[] = [];
    for (const c of this.ix.tops()) {
      const d = readDigest(this.cache.dir, c.id);
      // A chat without a valid digest adds nothing. A digest without decisions is still sent: the project pick lists every project that has digests.
      if (!d) { continue; }
      out.push({ d: { id: d.id, title: d.title, folder: d.folder, start: d.start, dir: d.dir, first: d.first, last: d.last, decisions: d.decisions }, file: this.ix.fileOf(c) });
    }
    return out;
  }

  /** Session file and size of a chat, for the card's message links (the line comes from the stored digest). */
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
