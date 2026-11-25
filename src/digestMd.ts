/** A digest as Markdown for "Export Session Digests to Project": file names, the per-chat file and INDEX.md. No vscode import. */
import { Digest } from './digest';
import { encodeDir, normPath } from './fileSessions';

/** Folder of the exported files, relative to the project root. */
export const EXPORT_DIR = ['docs', 'history', 'chats'];
export const INDEX_NAME = 'INDEX.md';
/** Title of the Build command, named by messages that send the owner there; the one copy, shared by the host and the timeline text. */
export const BUILD_TITLE = 'Saropa: Build Session Digests';
const SLUG_MAX = 60;

/** Short labels for the digest notes; one place, shared by the Markdown and the card text the host builds. */
export const NOTE_TEXT = {
  noClose: 'Session ended without a close',
  dialogUnread: 'Dialog answers could not be read',
  inputTrimmed: 'Input trimmed: the middle of a very long session was not sent to the AI',
  failed: 'AI parts not generated (they are retried on the next build)',
  off: 'AI parts turned off (setting saropaChats.digest.useAi)',
  cap: 'Shortened to fit the 20 KB digest size',
} as const;

/** Title as a file-name slug: lowercased, every run outside [a-z0-9] becomes one dash, trimmed, at most 60 characters, "untitled" when empty. */
export function slugOf(title: string): string {
  // Cutting can leave a dash at the end; trim again after the cut.
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX).replace(/-+$/g, '');
  return s || 'untitled';
}

/** Local calendar date YYYY-MM-DD of a time. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Export file name: YYYY-MM-DD_<slug>_<first 8 chars of the session id>.md; the id part keeps two same-day, same-title chats apart. */
export const digestFileName = (d: Pick<Digest, 'first' | 'title' | 'id'>): string => `${dayOf(d.first)}_${slugOf(d.title)}_${d.id.slice(0, 8)}.md`;

/**
 * True when the digest belongs to the project folder: the chat's start folder (or, unknown, its project dir)
 * encodes to the folder's encoding. A chat whose folder changed exports under the project it started in.
 */
export function inProject(d: Pick<Digest, 'start' | 'dir'>, folder: string): boolean {
  const want = normPath(encodeDir(folder));
  // The start folder wins over the project dir: a chat that moved keeps its first project.
  return d.start ? normPath(encodeDir(d.start)) === want : normPath(d.dir) === want;
}

/** One line of a multi-line quote as a Markdown blockquote. */
const quote = (s: string): string[] => s.split(/\r?\n/).map((l) => '> ' + l);
/**
 * Existing export files that an export of `names` replaces under a new name: the same session (the _<id8>.md tail) but
 * another file name, which happens when the title (and so the slug) changed. Without this a re-export leaves the old file
 * beside the new one. INDEX.md and files of other shapes never match.
 */
export function supersededExports(existing: string[], names: string[]): string[] {
  const tails = new Set<string>();
  for (const n of names) { const m = /_[0-9a-f]{8}\.md$/.exec(n); if (m) { tails.add(m[0]); } }
  const keep = new Set(names);
  return existing.filter((n) => { const m = /_[0-9a-f]{8}\.md$/.exec(n); return !!m && tails.has(m[0]) && !keep.has(n); });
}

/** Collapse any whitespace run (newlines included) to one space, so a title or goal stays on one Markdown line and cannot break a list item or heading. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Notes of a digest (ended without close, trimmed input, AI state, cap) as plain sentences. */
export function digestNotes(d: Digest): string[] {
  const out: string[] = [];
  if (d.noClose) { out.push(NOTE_TEXT.noClose); }
  // The chat asked question dialogs but none of the answers could be read, so Dialog decisions may be missing.
  if (d.dialogUnread) { out.push(NOTE_TEXT.dialogUnread); }
  if (d.inputTrimmed) { out.push(NOTE_TEXT.inputTrimmed); }
  // Only the two states the owner must know about get a note; 'ok' and 'none' are normal.
  if (d.ai === 'failed') { out.push(NOTE_TEXT.failed); } else if (d.ai === 'off') { out.push(NOTE_TEXT.off); }
  if (d.capTrimmed?.length) { out.push(`${NOTE_TEXT.cap} (${d.capTrimmed.join(', ')})`); }
  return out;
}

/** The exported Markdown of one digest. Quotes and references are copied exactly; only line breaks become blockquote lines. */
export function digestMarkdown(d: Digest): string {
  const out = [`# ${oneLine(d.title)}`, '', `- Session: ${d.id}`, `- Dates: ${dayOf(d.first)} to ${dayOf(d.last)}`, `- Folder: ${d.start ?? d.folder}`];
  if (d.branch) { out.push(`- Branch: ${d.branch}`); }
  for (const n of digestNotes(d)) { out.push(`- Note: ${n}`); }
  out.push('', '## Goal', '', d.goal ?? '_Not generated._');
  out.push('', '## Decisions', '');
  if (!d.decisions.length) { out.push('_None recorded._'); }
  for (const x of d.decisions) {
    // Dialog decisions show the question beside the answer; message decisions point at their message and file line.
    if (x.src === 'dialog') { out.push(`- Dialog: ${oneLine(x.q ?? '')}`, ...quote(x.a).map((l) => '  ' + l)); }
    else { out.push(`- Message ${x.i ?? '?'}${x.line ? ` (line ${x.line} of the session file)` : ''}:`, ...quote(x.a).map((l) => '  ' + l)); }
  }
  out.push('', `## Files changed (${d.files.length})`, '');
  if (!d.files.length) { out.push('_None._'); }
  for (const f of d.files) { out.push(`- \`${f.path}\`${f.edited ? ' (edited)' : ' (read)'}`); }
  out.push('', '## References', '');
  if (!d.refs.length) { out.push('_None._'); }
  for (const r of d.refs) { out.push(`- ${r}`); }
  out.push('', '## Left open', '');
  if (!d.open?.length) { out.push(d.ai === 'ok' ? '_Nothing left open._' : '_Not generated._'); }
  for (const o of d.open ?? []) { out.push(`- ${o}`); }
  return out.join('\n') + '\n';
}

/** INDEX.md: one line per exported chat, newest first, linking its file and showing its goal. */
export function indexMarkdown(ds: Digest[]): string {
  const rows = [...ds].sort((a, b) => b.first - a.first).map((d) => `- ${dayOf(d.first)} [${oneLine(d.title).replace(/[[\]]/g, '')}](${digestFileName(d)})${d.goal ? ' - ' + oneLine(d.goal) : ''}`);
  return ['# Session digests', '', ...rows].join('\n') + '\n';
}
