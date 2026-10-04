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

/** Parse one chat file into an index entry. Messages older than pruneBefore are dropped. */
export async function parseChat(
  file: string, dir: string, id: string, mtime: number, size: number, pruneBefore = 0,
): Promise<Chat> {
  let custom = '', ai = '', lastPrompt = '', summary = '', firstUser = '', lastTs = 0, firstTs = 0, count = 0;
  const messages: Msg[] = [];
  const files = new Map<string, boolean>();
  const cmds = new Set<string>();
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) { continue; }
      const k = line.lastIndexOf('"timestamp":"');
      if (k >= 0) {
        const t = Date.parse(line.slice(k + 13, k + 37));
        if (!Number.isNaN(t)) { lastTs = t; }
      }
      const isMsg = line.includes('"type":"user"') || line.includes('"type":"assistant"');
      if (!isMsg && !TITLE_MARKS.some((m) => line.includes(m))) { continue; }
      let row: any;
      try { row = JSON.parse(line); } catch { continue; }
      // Same sources as the Claude Code extension: customTitle > aiTitle > lastPrompt > summary.
      if (typeof row.customTitle === 'string' && row.customTitle) { custom = row.customTitle; }
      if (typeof row.aiTitle === 'string' && row.aiTitle) { ai = row.aiTitle; }
      if (typeof row.lastPrompt === 'string' && row.lastPrompt) { lastPrompt = row.lastPrompt; }
      if (typeof row.summary === 'string' && row.summary) { summary = row.summary; }
      if (row.type !== 'user' && row.type !== 'assistant') { continue; }
      const content = row.message?.content;
      if (row.type === 'assistant' && Array.isArray(content)) {
        for (const b of content) { if (b && b.type === 'tool_use') { toolUse(b, files, cmds); } }
      }
      const text = textOf(content);
      if (!text) { continue; }
      if (row.type === 'user' && !firstUser) { firstUser = text; }
      const rts = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
      const ts = Number.isNaN(rts) ? mtime : rts;
      if (!firstTs || ts < firstTs) { firstTs = ts; }
      count++;
      if (ts >= pruneBefore) { messages.push({ ts, role: row.type, text: text.slice(0, MSG_CAP) }); }
    }
  } finally { rl.close(); input.destroy(); }
  const flat = (x: string) => x.replace(/\s+/g, ' ');
  const title = flat(custom || ai || lastPrompt || summary || flat(firstUser).slice(0, 80) || '(untitled)');
  const fl: FileRef[] = Array.from(files, ([path, edited]) => ({ path, edited }));
  return { id, dir, file, mtime, size, title, last: lastTs || mtime, first: firstTs || lastTs || mtime, count, messages, files: fl, commands: [...cmds] };
}
