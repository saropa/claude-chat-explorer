/**
 * The Decisions timeline: every Dialog and Message decision of the stored digests, newest first, grouped by day, as the
 * text of a read-only editor document. Pure formatting with no vscode import, so the unit checks drive it directly; the
 * host command (digestRun.ts) fetches the digests from the worker and opens the text through the results-editor view.
 */
import { Decision, Digest } from './digest';
import { BUILD_TITLE, dayOf } from './digestMd';
import { encodeDir, normPath } from './fileSessions';

/** One stored digest with the session file it came from, as the worker hands it to the timeline. */
export interface TimelineSrc {
  d: Pick<Digest, 'id' | 'title' | 'folder' | 'start' | 'dir' | 'first' | 'last' | 'decisions'>;
  file: string; // the session file, so each decision can link to its line
}

/** A project of the quick pick: key is the normalized folder (two spellings of one folder match), label its last folder name, path the folder as written. */
export interface TimelineProject { key: string; label: string; path: string; }

/** A clickable session-file reference in the document: zero-based document line and columns, the file and its 1-based line. */
export interface TimelineLink { line: number; from: number; to: number; file: string; at?: number; }

/** The document: its text, the session-file links in it, and how many decisions it lists. */
export interface TimelineDoc { text: string; links: TimelineLink[]; count: number; }

/**
 * The user-facing strings of the document. The host fills them through vscode.l10n.t (this file has no vscode import, so
 * it stays testable); the formatter only places them. DEFAULT_TIMELINE_TEXT is the English set the checks use.
 */
export interface TimelineText {
  all: string; // label of the unfiltered timeline; also the first item of the host's quick pick
  heading: (label: string) => string; // first line of the document
  empty: (project?: string) => string; // the empty state, with the command that builds digests
  counts: (decisions: number, sessions: number) => string; // the line under the heading
  sessionFile: string; // label before the session-file link
}

/** Heading label of the unfiltered timeline, English; the host passes its translated label in TimelineText.all. */
export const ALL_PROJECTS = 'All projects';

/** The English text set: the source strings of the host's l10n calls, and what the unit checks use. */
export const DEFAULT_TIMELINE_TEXT: TimelineText = {
  all: ALL_PROJECTS,
  heading: (label) => `# Decisions timeline: ${label}`,
  empty: (project) => (project
    ? `No digests of ${project} have decisions yet. Run "${BUILD_TITLE}" to build digests.`
    : `No digests have decisions yet. Run "${BUILD_TITLE}" to build digests.`),
  counts: (n, sessions) => `${n} decision${n === 1 ? '' : 's'} in ${sessions} session${sessions === 1 ? '' : 's'}, newest first.`,
  sessionFile: 'Session file:',
};

/** The folder a digest belongs to: the folder the session started in, else its working folder (the same rule as the export). */
const folderOf = (d: TimelineSrc['d']): string => d.start ?? d.folder;

/** Normalized project key of a folder: the same encoding the export uses to match a digest to a project. */
export const projectKey = (folder: string): string => normPath(encodeDir(folder));

/** Last folder name of a path, either slash direction; the whole path when it has no separator. */
const baseName = (p: string): string => p.split(/[\\/]+/).filter(Boolean).pop() ?? p;

/** Projects that have at least one digest, sorted by label, each once (the first spelling seen is shown). */
export function timelineProjects(srcs: TimelineSrc[]): TimelineProject[] {
  const m = new Map<string, TimelineProject>();
  for (const s of srcs) {
    const f = folderOf(s.d), key = projectKey(f);
    // Two sessions of one project may spell its folder differently (drive-letter case); the key folds them into one item.
    if (!m.has(key)) { m.set(key, { key, label: baseName(f), path: f }); }
  }
  return [...m.values()].sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()) || a.path.localeCompare(b.path));
}

/** One decision with what the timeline needs to sort and print it. */
interface Item { x: Decision; s: TimelineSrc; at: number; }

/** Local time HH:MM of a time, for the entry line. */
function clockOf(ms: number): string {
  const t = new Date(ms);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** Collapse whitespace runs to one space, so a title or question stays on its one document line. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The timeline document. project is a key from timelineProjects (undefined: every project). Decisions are sorted newest
 * first by when they were made (a digest built before decisions carried a time uses the session's last activity), then
 * by session and file line, so the order is stable. Each entry names project, session title and source, quotes the
 * decision exactly (Dialog: question and answer), and ends with the session file and line, which is a link.
 */
export function timelineDoc(srcs: TimelineSrc[], project?: string, projectLabel?: string, text: TimelineText = DEFAULT_TIMELINE_TEXT): TimelineDoc {
  const items: Item[] = [];
  for (const s of srcs) {
    // The project filter compares normalized keys, the same as the quick pick that produced the key.
    if (project !== undefined && projectKey(folderOf(s.d)) !== project) { continue; }
    for (const x of s.d.decisions) {
      // A damaged stored decision (non-string answer or question, non-finite time) is skipped: one bad row must not break the whole document.
      if (!x || typeof x.a !== 'string' || (x.src === 'dialog' && typeof x.q !== 'string')) { continue; }
      if (x.at !== undefined && typeof x.at !== 'number') { continue; }
      // A non-finite time falls back to the session's last activity; a non-finite fallback leaves the decision out (it cannot be placed on a day).
      const at = typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : s.d.last;
      if (typeof at !== 'number' || !Number.isFinite(at)) { continue; }
      items.push({ x, s, at });
    }
  }
  items.sort((a, b) => b.at - a.at || a.s.d.id.localeCompare(b.s.d.id) || (b.x.line ?? 0) - (a.x.line ?? 0));
  const head = text.heading(project === undefined ? text.all : projectLabel ?? project);
  // Nothing to list: the empty state names the command that builds digests, so the document is never blank.
  if (!items.length) { return { text: [head, '', text.empty(project === undefined ? undefined : projectLabel ?? project)].join('\n') + '\n', links: [], count: 0 }; }
  const sessions = new Set(items.map((i) => i.s.d.id)).size;
  const lines = [head, text.counts(items.length, sessions)];
  const links: TimelineLink[] = [];
  let day = '';
  for (const it of items) {
    const d = dayOf(it.at);
    // A new day starts a new group: the items are sorted, so each day's heading appears exactly once.
    if (d !== day) { day = d; lines.push('', `## ${d}`); }
    const src = it.x.src === 'dialog' ? 'Dialog' : `Message${it.x.i !== undefined ? ' ' + it.x.i : ''}`;
    lines.push('', `${clockOf(it.at)}  ${baseName(folderOf(it.s.d))} | ${oneLine(it.s.d.title)} | ${src}`);
    // The quote is exact: a Dialog shows its question and the chosen answer; every line of a multi-line quote is indented, never joined.
    const quote = it.x.src === 'dialog' ? `${oneLine(it.x.q ?? '')} → ${it.x.a}` : it.x.a;
    // Split on every line break VS Code counts (CRLF, lone CR, LF), so the document line numbers match the link targets.
    for (const q of quote.split(/\r\n|\r|\n/)) { lines.push(q ? '    ' + q : ''); }
    // The session-file reference: path and line, the whole of it a link that opens the file at that line.
    const ref = it.x.line ? `${it.s.file}:${it.x.line}` : it.s.file, pre = `    ${text.sessionFile} `;
    links.push({ line: lines.length, from: pre.length, to: pre.length + ref.length, file: it.s.file, at: it.x.line });
    lines.push(pre + ref);
  }
  return { text: lines.join('\n') + '\n', links, count: items.length };
}
