/** Hand-over note of one chat: the facts the worker knows, and the plain text built from them. No vscode dependency. */
import { ctxInfo } from './contextWindow';
import { projectRoot, relativeTo } from './fileSessions';
import { mergedGit } from './gitInfo';
import { parseQuery } from './query';
import { Chat } from './types';
import { ago, stamp } from './timeText';

const MAX_FILES = 5;
export interface HandoverData {
  id: string; title: string; folder: string; branch?: string; last: number; pct?: number;
  files: Array<{ path: string; edited: boolean }>;
}
interface Source { subsOf(p: Chat): Chat[]; }

/** Files of the chat and its subagents that the query's file: and edited: tokens match (edited when any copy was edited). */
function matchedFiles(chats: Chat[], query: string): HandoverData['files'] {
  const vals = parseQuery(query).tokens.filter((t) => t.kind === 'file' || t.kind === 'edited').map((t) => t.value);
  const out = new Map<string, boolean>();
  if (!vals.length) { return []; }
  for (const c of chats) {
    for (const f of c.files) {
      if (vals.some((v) => f.path.toLowerCase().includes(v))) { out.set(f.path, (out.get(f.path) ?? false) || f.edited); }
    }
  }
  return [...out].slice(0, MAX_FILES).map(([path, edited]) => ({ path, edited }));
}

/** Facts for the note: working folder, branch, context percent and the files the current query matched. */
export function handoverData(ix: Source, chat: Chat, query: string): HandoverData {
  const subs = ix.subsOf(chat), git = mergedGit(chat, subs);
  const folder = chat.cwd ?? (chat.files[0] ? projectRoot(chat.files[0].path, chat.dir) : undefined) ?? chat.dir;
  return { id: chat.id, title: chat.title, folder, branch: git.branches[git.branches.length - 1], last: chat.last,
    pct: ctxInfo(chat.use)?.pct, files: matchedFiles([chat, ...subs], query) };
}

/** Plain-text note; file paths are workspace-relative when inside a workspace folder. */
export function handoverText(d: HandoverData, roots: string[], now = Date.now()): string {
  const lines = [`Chat: ${d.title.replace(/\s+/g, ' ')}`, `Session id: ${d.id}`, `Project folder: ${d.folder}`];
  if (d.branch) { lines.push(`Git branch: ${d.branch}`); }
  lines.push(`Last active: ${ago(d.last, now)} (${stamp(d.last)})`);
  if (d.pct !== undefined) { lines.push(`Context: ${d.pct}% full`); }
  for (const f of d.files) {
    lines.push(`File: ${relativeTo(f.path, roots)?.rel ?? f.path.replace(/\\/g, '/')} (${f.edited ? 'edited' : 'read'})`);
  }
  return lines.join('\n');
}
