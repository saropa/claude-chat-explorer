/**
 * Chat digests: the data model and every exact (no AI) part of a digest. Pure logic with no vscode import, so the
 * worker, the host and the unit checks share one copy. A digest is a short stored record of one top-level chat:
 * goal, owner decisions, files changed, references and work left open. Facts are copied exactly as recorded;
 * only the goal, the choice of message decisions and "left open" come from the AI (digestAi.ts).
 */
import { FileRef } from './types';

/** Digest file layout version. The store folder is named after it (digests-v1), so a layout change starts a new folder. */
export const DIGEST_VERSION = 1;
/** Folder name of the digest store, beside the records-v<FORMAT> folder in the extension's storage. */
export const DIGEST_DIR = 'digests-v' + DIGEST_VERSION;
/** Most bytes a digest file may hold, not counting its file list (Files changed is exempt from the cap). */
export const DIGEST_CAP = 20 * 1024;
/** How long a chat file must sit unchanged before the automatic rebuild touches its stale digest. */
export const AUTO_IDLE_MS = 10 * 60 * 1000;
/** Upper bound of references kept before the size cap runs, so a chat that pastes thousands of URLs cannot build a huge list first. */
const MAX_REFS = 400;

/** Where an owner decision came from: an answer in the question dialog, or an owner message the AI marked as a decision. */
export type DecisionSource = 'dialog' | 'message';

/** One owner decision, quoted exactly. */
export interface Decision {
  src: DecisionSource;
  a: string; // the chosen answer (dialog) or the whole owner message (message), verbatim
  q?: string; // dialog only: the question that was asked
  opts?: string[]; // dialog only: the option labels that were offered
  i?: number; // message only: index of the message in the chat's record
  line?: number; // 1-based line of the chat file: the owner message, or the tool-result row that holds the dialog answer
}

/** State of the AI parts: written, turned off by setting, failed (retried on the next build), or nothing to send. */
export type AiState = 'ok' | 'off' | 'failed' | 'none';

/** One stored digest; one JSON file per chat id in the digests-v1 folder. */
export interface Digest {
  v: number; id: string; dir: string; title: string;
  size: number; mtime: number; // the chat file as it was when the digest was built: staleness compares both
  built: number; first: number; last: number;
  folder: string; // the chat's working folder (the same reader the hand-over note uses)
  start?: string; // the folder the chat started in, when known; export files a moved chat under it
  branch?: string;
  goal?: string; open?: string[]; // AI parts
  decisions: Decision[]; files: FileRef[]; refs: string[];
  ai: AiState;
  noClose?: boolean; // the chat stopped without a final agent reply (a context crash or an interrupted turn); omitted when the file has no stop_reason at all
  dialogUnread?: boolean; // the chat had question dialogs, but no answer of any of them could be read (the chat-file layout changed)
  inputTrimmed?: boolean; // the AI input was over 8 pieces, so the middle of the chat was not sent
  capTrimmed?: string[]; // parts the 20 KB cap shortened, in trim order
}

/** One searchable line of a digest: k names the part (for the label), t is the exact text. */
export interface DigestLine { k: 'goal' | 'decision' | 'file' | 'ref' | 'open'; t: string; }
/** A stored digest with its search lines, as the worker cache hands it out. */
export interface DigestEntry { d: Digest; lines: DigestLine[]; }
/** What search and the list rows read: the cached digest of a chat id, if any. */
export interface DigestLookup { get(id: string): DigestEntry | undefined; }

/** True when the chat file changed since the digest was built (size or mtime differ). */
export const digestStale = (d: Pick<Digest, 'size' | 'mtime'>, c: { size: number; mtime: number }): boolean => d.size !== c.size || d.mtime !== c.mtime;

/** True when the automatic rebuild may run for a chat: not busy, and its file has been quiet for AUTO_IDLE_MS. */
export const autoDue = (mtime: number, now: number, busy: boolean): boolean => !busy && now - mtime > AUTO_IDLE_MS;

/** Shape check of a parsed digest file; a damaged or foreign file is treated as no digest. */
export function validDigest(x: unknown): x is Digest {
  const d = x as Digest;
  // Every field the readers index into must have the right type, so a hand-edited file cannot throw later.
  // The version must be exactly DIGEST_VERSION: a file of another layout (or with no v at all) is never read as a current
  // digest; the build list reports it as stale (DigestBuilder.todo), so the next build rewrites it in the current layout.
  return !!d && typeof d === 'object' && d.v === DIGEST_VERSION && typeof d.id === 'string' && typeof d.title === 'string'
    && typeof d.size === 'number' && typeof d.mtime === 'number' && Array.isArray(d.decisions) && Array.isArray(d.files) && Array.isArray(d.refs)
    && (d.goal === undefined || typeof d.goal === 'string') && (d.open === undefined || Array.isArray(d.open));
}

// ---------------------------------------------------------------------------------------------------------------
// References: URLs, commit hashes, PR numbers and Markdown doc or plan paths, taken out exactly as written.
// ---------------------------------------------------------------------------------------------------------------

// A URL runs to whitespace or a closing bracket or quote; trailing sentence punctuation is cut afterwards.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]}]+/g;
// 7 to 40 hex characters not glued to other hex, word characters, '#' or '-': this keeps UUID pieces (session ids) and #rrggbb colors out.
const SHA_RE = /(?<![\w#-])[0-9a-f]{7,40}(?![\w-])/g;
// A PR number counts only in PR context, because a bare '#123' is just as often a CSS color (#333), a hex color (#000000),
// a list number or a heading. Context is a keyword right before it: PR, pull (request), issue, or a GitHub closing keyword
// (fix, fixes, close, closes, resolve, resolves and their past forms), any case, with an optional colon and spaces between.
const KW_PR_RE = /\b(?:prs?|pull(?:\s+request)?|issues?|fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s*:?\s*(#\d{1,6})\b/gi;
// The other PR context: the '(#123)' tail a squash merge puts on a commit subject.
const PAREN_PR_RE = /\((#\d{1,6})\)/g;
// A Markdown path, with or without folders and a drive letter, either slash direction; the optional leading slash covers absolute paths (/a/b.md, D:\a\b.md).
const MD_RE = /(?<![\w\\/.-])(?:[A-Za-z]:)?[\\/]?(?:[\w.-]+[\\/])*[\w-][\w.-]*\.md\b/g;
const TRAIL_PUNCT = /[.,;:!?]+$/;

/** A hex run counts as a commit hash only when it mixes letters and digits; plain words (deadbeef) and plain numbers stay out. */
const shaLike = (s: string): boolean => /[a-f]/.test(s) && /\d/.test(s);

/**
 * References of the given texts in order of first appearance, deduplicated, each exactly as written.
 * URLs are removed from the text before the other patterns run, so a hash or path inside a URL is not listed twice.
 */
export function extractRefs(texts: Iterable<string>, max = MAX_REFS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string): void => {
    // The cap stops the scan early: past it every new reference would be trimmed by the size cap anyway.
    if (out.length < max && s && !seen.has(s)) { seen.add(s); out.push(s); }
  };
  for (const text of texts) {
    if (out.length >= max) { break; }
    // Collect each kind with its offset, then add them in text order, so the list reads in the order the chat used them.
    const found: Array<[number, string]> = [];
    const rest = text.replace(URL_RE, (u, at: number) => {
      found.push([at, u.replace(TRAIL_PUNCT, '')]);
      return ' '.repeat(u.length); // same length: the offsets of later matches stay true
    });
    for (const m of rest.matchAll(SHA_RE)) { if (shaLike(m[0])) { found.push([m.index ?? 0, m[0]]); } }
    // PR numbers are kept only in PR context (keyword or commit-subject parentheses); the offset is that of the '#', so the
    // text order matches where the number itself sits. GitHub pull and issue URLs are already listed whole by URL_RE above.
    for (const m of rest.matchAll(KW_PR_RE)) { found.push([(m.index ?? 0) + m[0].length - m[1].length, m[1]]); }
    for (const m of rest.matchAll(PAREN_PR_RE)) { found.push([(m.index ?? 0) + 1, m[1]]); }
    for (const m of rest.matchAll(MD_RE)) { found.push([m.index ?? 0, m[0]]); }
    found.sort((a, b) => a[0] - b[0]);
    for (const [, s] of found) { add(s); }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Chat-file pass: question-dialog answers, compaction rows and whether the chat ended cleanly.
// The record parser skips user rows that hold tool results, so dialog answers are read from the chat file itself.
// ---------------------------------------------------------------------------------------------------------------

/** One question of an AskUserQuestion call, as its tool input holds it. */
interface AskQ { question: string; options: string[]; }

/** State of one pass over a chat file. */
export interface FileAcc {
  asks: Map<string, AskQ[]>; // tool_use id of an AskUserQuestion call -> its questions, until the result row pairs with it
  dialogs: Decision[];
  compact: Set<number>; // 1-based lines of compaction summary rows: AI input only, never quoted as a decision
  read: number; // dialog result rows that gave at least one answer
  unread: number; // dialog result rows that were not a rejection and still gave no answer (layout drift, or keys that no longer match)
  stopSeen: boolean; // some assistant row carries a stop_reason field; without one the clean-end test has nothing to read
}

/** A fresh pass state. */
export const newFileAcc = (): FileAcc => ({ asks: new Map(), dialogs: [], compact: new Set(), read: 0, unread: 0, stopSeen: false });

/** Text of a tool_result content value: a string, or the text blocks of an array. */
function resultText(c: unknown): string {
  if (typeof c === 'string') { return c; }
  if (!Array.isArray(c)) { return ''; }
  return c.map((b) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : '')).join('\n');
}

/** Questions of an AskUserQuestion tool input; malformed entries are skipped. */
function asksOf(input: unknown): AskQ[] {
  const qs = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(qs)) { return []; }
  const out: AskQ[] = [];
  for (const q of qs) {
    // Only questions with text can be paired with an answer; the options are kept for display.
    if (!q || typeof q.question !== 'string' || !q.question) { continue; }
    const opts = Array.isArray(q.options) ? q.options.map((o: { label?: unknown }) => (typeof o?.label === 'string' ? o.label : '')).filter(Boolean) : [];
    out.push({ question: q.question, options: opts });
  }
  return out;
}

// The tool_result text of an answered dialog: "Your questions have been answered: "Q"="A", "Q2"="A2". You can now continue ...".
const ANSWERED = 'Your questions have been answered';
const PAIR_RE = /"([\s\S]+?)"="([\s\S]*?)"(?=,\s"|\.\s|\.?\s*$)/g;

/** Answers parsed from the tool_result text: the fallback when the row has no structured toolUseResult. */
export function answersFromText(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const at = text.indexOf(ANSWERED);
  // A rejected or failed dialog has no answer sentence: nothing to keep.
  if (at < 0) { return out; }
  for (const m of text.slice(at + ANSWERED.length).matchAll(PAIR_RE)) { out.set(m[1], m[2]); }
  return out;
}

/** Answers from the structured result on the tool-result row: { questions, answers: { [question]: answer } }. */
function answersFromResult(r: unknown): Map<string, string> | undefined {
  const a = (r as { answers?: unknown })?.answers;
  // A rejected dialog stores a plain string ("User rejected tool use"): no structured answers.
  if (!a || typeof a !== 'object' || Array.isArray(a)) { return undefined; }
  const out = new Map<string, string>();
  for (const [q, v] of Object.entries(a as Record<string, unknown>)) {
    // Multi-select answers may arrive as a list; join them so the quote still shows every chosen option.
    if (typeof v === 'string') { out.set(q, v); } else if (Array.isArray(v)) { out.set(q, v.filter((x) => typeof x === 'string').join(', ')); }
  }
  return out;
}

/** Cheap probes on the raw line, so only the few rows that matter are JSON-parsed. */
const ASK_PROBE = '"AskUserQuestion"';
const COMPACT_PROBE = '"isCompactSummary":true';

/** Fold one line of a chat file into the pass; only dialog, answer and compaction rows are parsed, every other line is skipped on a cheap probe. */
export function takeFileLine(line: string, n: number, a: FileAcc): void {
  const ask = line.includes(ASK_PROBE);
  const compact = line.includes(COMPACT_PROBE);
  // A tool-result row is only interesting while a dialog waits for its answer, and only when it names that call.
  const answer = a.asks.size > 0 && line.includes('"tool_result"') && [...a.asks.keys()].some((id) => line.includes(id));
  if (!ask && !compact && !answer) { return; }
  let row: any;
  try { row = JSON.parse(line); } catch { return; } // a partial last line (file still being written) is skipped
  if (!row || typeof row !== 'object' || row.isSidechain) { return; }
  if (row.isCompactSummary === true) { a.compact.add(n); }
  const content = row.message?.content;
  if (Array.isArray(content)) {
    for (const b of content) {
      // The question dialog call: remember its questions until the answer row arrives.
      if (row.type === 'assistant' && b?.type === 'tool_use' && b.name === 'AskUserQuestion' && typeof b.id === 'string') { a.asks.set(b.id, asksOf(b.input)); }
      // The answer row: pair it with its call and keep each answered question.
      if (row.type === 'user' && b?.type === 'tool_result' && typeof b.tool_use_id === 'string' && a.asks.has(b.tool_use_id)) {
        const qs = a.asks.get(b.tool_use_id)!;
        a.asks.delete(b.tool_use_id);
        const ans = answersFromResult(row.toolUseResult) ?? answersFromText(resultText(b.content));
        let got = 0;
        for (const q of qs) {
          const v = ans.get(q.question);
          // An unanswered question (dialog dismissed, or answers keyed differently) yields no decision: nothing to quote.
          if (v !== undefined && v !== '') { a.dialogs.push({ src: 'dialog', q: q.question, a: v, opts: q.options, line: n }); got++; }
        }
        // A rejected dialog has no answer by design (a plain-string result or an error block); only other empty results count as unreadable.
        const rejected = b.is_error === true || typeof row.toolUseResult === 'string';
        if (got) { a.read++; } else if (!rejected) { a.unread++; }
      }
    }
  }
}

/**
 * Whether one row closes the chat: true for an agent reply that finished its turn, false for any other main-thread
 * message row, undefined for rows that do not count (meta rows such as command output, sidechain rows, non-messages).
 */
export function closeOf(line: string): boolean | undefined {
  let row: any;
  try { row = JSON.parse(line); } catch { return undefined; } // a partial last line says nothing about the end
  if (!row || typeof row !== 'object' || row.isSidechain || row.isMeta || (row.type !== 'user' && row.type !== 'assistant')) { return undefined; }
  const stop = row.message?.stop_reason;
  return row.type === 'assistant' && (stop === 'end_turn' || stop === 'stop_sequence');
}

/** True when one raw row is an assistant row whose message has a stop_reason field (any value, null included). */
export function hasStopField(line: string): boolean {
  // Cheap probe first: most rows never name the field, and parsing every tail row twice would be wasted work.
  if (!line.includes('"stop_reason"')) { return false; }
  try {
    const row = JSON.parse(line);
    return !!row && row.type === 'assistant' && !!row.message && typeof row.message === 'object' && 'stop_reason' in row.message;
  } catch { return false; } // a partial last line says nothing
}

/** What one pass over a chat file found. */
export interface FileScan {
  dialogs: Decision[]; compact: Set<number>;
  noClose?: boolean; // undefined: unknown, because no assistant row in the file has a stop_reason field to judge by
  dialogUnread: boolean; // dialogs were asked and answered, yet no answer could be read
}

/** The pass result once the whole file is read; tail holds the last few message rows in file order, for the clean-end test. */
export function finishFile(a: FileAcc, tail: string[]): FileScan {
  let closed: boolean | undefined;
  // Walk back to the last row that counts; a chat with no such row never started, so it is not "cut off".
  for (let k = tail.length - 1; k >= 0 && closed === undefined; k--) { closed = closeOf(tail[k]); }
  // Without any stop_reason field in the file the clean-end test reads a field that is not there and would call every
  // chat cut off; such a layout leaves the flag unknown. The tail rows count too, for callers that pass only the tail.
  const stops = a.stopSeen || tail.some(hasStopField);
  // Only a total miss is drift: one unreadable dialog among readable ones is a single odd row, not a changed layout.
  return { dialogs: a.dialogs, compact: a.compact, noClose: stops ? closed === false : undefined, dialogUnread: a.unread > 0 && a.read === 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Assembly, the size cap and the searchable text.
// ---------------------------------------------------------------------------------------------------------------

/** Files of a chat and its subagents: one entry per path (edited when any copy was edited), edited files first, otherwise in first-seen order. */
export function mergedFiles(lists: FileRef[][]): FileRef[] {
  const m = new Map<string, boolean>();
  for (const l of lists) { for (const f of l) { m.set(f.path, (m.get(f.path) ?? false) || f.edited); } }
  const all = [...m].map(([path, edited]) => ({ path, edited }));
  // Stable split instead of a sort, so the first-seen order survives inside each group.
  return [...all.filter((f) => f.edited), ...all.filter((f) => !f.edited)];
}

/** Dialog and message decisions in chat order (by file line), so the list reads like the chat did. */
export function orderDecisions(ds: Decision[]): Decision[] {
  return ds.map((d, k) => [d, k] as const).sort((x, y) => (x[0].line ?? 0) - (y[0].line ?? 0) || x[1] - y[1]).map(([d]) => d);
}

/** Bytes the cap counts: the digest without its file list. */
const cappedBytes = (d: Digest): number => Buffer.byteLength(JSON.stringify({ ...d, files: [] }));

/** Remove the last decision of one source; false when none is left. */
function dropLast(d: Digest, src: DecisionSource): boolean {
  for (let k = d.decisions.length - 1; k >= 0; k--) {
    if (d.decisions[k].src === src) { d.decisions.splice(k, 1); return true; }
  }
  return false;
}

/**
 * Apply the 20 KB cap. Files changed is exempt and stays complete. The rest is trimmed in this order: Left open,
 * Goal, Message decisions, References, Dialog decisions; each step removes one item from the end of its part and
 * the next part is touched only when the previous one is empty. capTrimmed lists the parts that were shortened.
 */
export function capDigest(src: Digest, cap = DIGEST_CAP): Digest {
  const d: Digest = { ...src, decisions: [...src.decisions], refs: [...src.refs], open: src.open ? [...src.open] : undefined };
  const mark = (part: string): void => { d.capTrimmed = [...new Set([...(d.capTrimmed ?? []), part])]; };
  // Each step is one small removal, re-measured after it, so the digest keeps as much as fits.
  const steps: Array<[string, () => boolean]> = [
    ['open', () => { if (!d.open?.length) { return false; } d.open.pop(); if (!d.open.length) { delete d.open; } return true; }],
    ['goal', () => { if (d.goal === undefined) { return false; } delete d.goal; return true; }],
    ['message decisions', () => dropLast(d, 'message')],
    ['references', () => { if (!d.refs.length) { return false; } d.refs.pop(); return true; }],
    ['dialog decisions', () => dropLast(d, 'dialog')],
  ];
  for (const [part, step] of steps) {
    while (cappedBytes(d) > cap) {
      if (!step()) { break; } // this part is empty: move to the next one
      mark(part);
    }
  }
  return d;
}

/** Searchable lines of a digest: every part, exact text. Labels stay out of the text so a search for "goal" does not hit every digest. */
export function digestLines(d: Digest): DigestLine[] {
  const out: DigestLine[] = [];
  if (d.goal) { out.push({ k: 'goal', t: d.goal }); }
  for (const x of d.decisions) {
    // A dialog decision searches as its question and answer together, the way the card shows it.
    out.push({ k: 'decision', t: x.src === 'dialog' && x.q ? x.q + ' → ' + x.a : x.a });
  }
  for (const f of d.files) { out.push({ k: 'file', t: f.path }); }
  for (const r of d.refs) { out.push({ k: 'ref', t: r }); }
  for (const o of d.open ?? []) { out.push({ k: 'open', t: o }); }
  return out;
}

/** Lines whose text contains the lowercased value (a digest: token). */
export const digestHits = (lines: DigestLine[], value: string): string[] => lines.filter((l) => l.t.toLowerCase().includes(value)).map((l) => l.t);
