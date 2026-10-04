import * as fs from 'fs';
import * as readline from 'readline';
import { Chat, FileRef, Msg } from './types';

export const MSG_CAP = 20000;
export const CMD_CAP = 300;
const TITLE_MARKS = ['customTitle', 'aiTitle', 'lastPrompt', 'summary'];
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);

/** Joined text blocks of a message content value. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') { return content; }
  if (Array.isArray(content)) {
    return content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
  }
  return '';
}

function toolUse(b: any, files: Map<string, boolean>, cmds: Set<string>): void {
  const inp = b.input ?? {};
  if (EDIT_TOOLS.has(b.name)) {
    const p = inp.file_path ?? inp.notebook_path;
    if (typeof p === 'string' && p) { files.set(p, true); }
  } else if (READ_TOOLS.has(b.name)) {
    const p = inp.file_path ?? inp.path;
    if (typeof p === 'string' && p && !files.has(p)) { files.set(p, false); }
  } else if (b.name === 'Bash' && typeof inp.command === 'string' && inp.command) {
    cmds.add(inp.command.slice(0, CMD_CAP));
  }
}

interface Acc {
  custom: string; ai: string; lastPrompt: string; summary: string; firstUser: string;
  lastTs: number; firstTs: number; count: number;
  messages: Msg[]; files: Map<string, boolean>; cmds: Set<string>;
}

/** Same title sources as the Claude Code extension: customTitle > aiTitle > lastPrompt > summary. */
function takeTitles(row: any, a: Acc): void {
  if (typeof row.customTitle === 'string' && row.customTitle) { a.custom = row.customTitle; }
  if (typeof row.aiTitle === 'string' && row.aiTitle) { a.ai = row.aiTitle; }
  if (typeof row.lastPrompt === 'string' && row.lastPrompt) { a.lastPrompt = row.lastPrompt; }
  if (typeof row.summary === 'string' && row.summary) { a.summary = row.summary; }
}

/** Fold one user or assistant row into the accumulator. */
function takeMessage(row: any, a: Acc, mtime: number, pruneBefore: number): void {
  const content = row.message?.content;
  if (row.type === 'assistant' && Array.isArray(content)) {
    for (const b of content) { if (b && b.type === 'tool_use') { toolUse(b, a.files, a.cmds); } }
  }
  const text = textOf(content);
  if (!text) { return; }
  if (row.type === 'user' && !a.firstUser) { a.firstUser = text; }
  const rts = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
  const ts = Number.isNaN(rts) ? mtime : rts;
  if (!a.firstTs || ts < a.firstTs) { a.firstTs = ts; }
  a.count++;
  if (ts >= pruneBefore) { a.messages.push({ ts, role: row.type, text: text.slice(0, MSG_CAP) }); }
}

/** Fold one raw line; a partial or corrupt line (file still being written) is skipped. */
function takeLine(line: string, a: Acc, mtime: number, pruneBefore: number): void {
  const k = line.lastIndexOf('"timestamp":"');
  if (k >= 0) {
    const t = Date.parse(line.slice(k + 13, k + 37));
    if (!Number.isNaN(t)) { a.lastTs = t; }
  }
  const isMsg = line.includes('"type":"user"') || line.includes('"type":"assistant"');
  if (!isMsg && !TITLE_MARKS.some((m) => line.includes(m))) { return; }
  let row: any;
  try { row = JSON.parse(line); } catch { return; }
  if (!row || typeof row !== 'object') { return; }
  takeTitles(row, a);
  if (row.type === 'user' || row.type === 'assistant') { takeMessage(row, a, mtime, pruneBefore); }
}

/** Parse one chat file into an index entry. Messages older than pruneBefore are dropped. */
export async function parseChat(
  file: string, dir: string, id: string, mtime: number, size: number, pruneBefore = 0,
): Promise<Chat> {
  const a: Acc = { custom: '', ai: '', lastPrompt: '', summary: '', firstUser: '', lastTs: 0, firstTs: 0, count: 0,
    messages: [], files: new Map(), cmds: new Set() };
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) { if (line) { takeLine(line, a, mtime, pruneBefore); } }
  } finally { rl.close(); input.destroy(); }
  const flat = (x: string) => x.replace(/\s+/g, ' ');
  const title = flat(a.custom || a.ai || a.lastPrompt || a.summary || flat(a.firstUser).slice(0, 80) || '(untitled)');
  const fl: FileRef[] = Array.from(a.files, ([path, edited]) => ({ path, edited }));
  return { id, dir, file, mtime, size, title, last: a.lastTs || mtime, first: a.firstTs || a.lastTs || mtime,
    count: a.count, messages: a.messages, files: fl, commands: [...a.cmds] };
}
