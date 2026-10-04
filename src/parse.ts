import { FileRef, Cost, Git, Usage } from './types';
import { finishExtras, GitAcc, newGitAcc, takeExtra } from './gitInfo';
import { scanLines } from './scan';
import { takeCwd } from './cwdInfo';
import { finishUsage, newUseAcc, takeOther, takeUsage, UseAcc } from './contextUsage';

export const MSG_CAP = 20000; // chars of text kept per message of a top-level chat
export const SUB_CAP = 8000; // chars of text kept per message of a subagent chat
export const CMD_CAP = 300;
export const SEP = '\u0001'; // separates packed messages and commands in a store record
export const CMD_SEP = '\u0002'; // separates a command from its message index inside a record
const TITLE_LINE_MAX = 100000; // longer lines that merely mention a title key are not title rows
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);

const B = (s: string) => Buffer.from(s);
const TS = B('"timestamp":"'), USER = B('"type":"user"'), ASST = B('"type":"assistant"');
const TOOL_RESULT = B('"type":"tool_result"');
const TITLE_KEYS = ['"customTitle":"', '"aiTitle":"', '"lastPrompt":"', '"summary":"'].map(B);

/** Parsed chat file: metadata plus packed message text. */
export interface Parsed {
  title: string; last: number; first: number; count: number;
  files: FileRef[]; cmds: string[]; cmdAt: number[]; ts: number[]; roles: number[]; texts: string[];
  lines: number[]; // 1-based JSONL line of each kept message
  cost?: Cost; git?: Git; use?: Usage;
  cwd?: string; // last non-empty cwd of the rows
}

interface Acc {
  custom: string; ai: string; lastPrompt: string; summary: string; firstUser: string;
  lastTs: number; firstTs: number; count: number; cap: number; before: number; mtime: number; line: number;
  lines: number[]; ts: number[]; roles: number[]; texts: string[]; files: Map<string, boolean>; cmds: Map<string, number>; x: GitAcc; u: UseAcc; cwd: string;
}

/** Joined text blocks of a message content value (tool results, images and thinking are skipped). */
export function textOf(content: unknown): string {
  if (typeof content === 'string') { return content; }
  if (!Array.isArray(content)) { return ''; }
  let out = '';
  for (const b of content) {
    if (b && b.type === 'text' && typeof b.text === 'string') { out += (out ? '\n' : '') + b.text; }
  }
  return out;
}

function toolUse(b: any, a: Acc): void {
  const inp = b.input ?? {};
  if (EDIT_TOOLS.has(b.name)) {
    const p = inp.file_path ?? inp.notebook_path;
    if (typeof p === 'string' && p) { a.files.set(p, true); }
  } else if (READ_TOOLS.has(b.name)) {
    const p = inp.file_path ?? inp.path;
    if (typeof p === 'string' && p && !a.files.has(p)) { a.files.set(p, false); }
  } else if (b.name === 'Bash' && typeof inp.command === 'string' && inp.command) {
    a.cmds.set(inp.command.slice(0, CMD_CAP).replace(/[\u0001\u0002]/g, ' '), a.texts.length); // latest use wins
  }
}

/** Same title sources as the Claude Code extension: customTitle > aiTitle > lastPrompt > summary. */
function takeTitles(row: any, a: Acc): void {
  if (typeof row.customTitle === 'string' && row.customTitle) { a.custom = row.customTitle; }
  if (typeof row.aiTitle === 'string' && row.aiTitle) { a.ai = row.aiTitle; }
  if (typeof row.lastPrompt === 'string' && row.lastPrompt) { a.lastPrompt = row.lastPrompt; }
  if (typeof row.summary === 'string' && row.summary) { a.summary = row.summary; }
}

/** Fold one user or assistant row into the accumulator. */
function takeMessage(row: any, a: Acc): void {
  const content = row.message?.content;
  if (row.type === 'assistant' && Array.isArray(content)) {
    for (const b of content) { if (b && b.type === 'tool_use') { toolUse(b, a); } }
  }
  const text = textOf(content);
  if (!text) { return; }
  if (row.type === 'user' && !a.firstUser) { a.firstUser = text.slice(0, 400); }
  const rts = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
  const ts = Number.isNaN(rts) ? a.mtime : rts;
  if (!a.firstTs || ts < a.firstTs) { a.firstTs = ts; }
  a.count++;
  if (ts < a.before) { return; }
  const t = text.length > a.cap ? text.slice(0, a.cap) : text;
  a.texts.push(t.includes(SEP) ? t.split(SEP).join(' ') : t);
  a.ts.push(ts);
  a.lines.push(a.line);
  a.roles.push(row.type === 'user' ? 0 : 1);
}

const HEAD = 1024; // type and role keys sit near a row's start or end; long rows are probed there instead of scanned whole
const TITLE_HEAD = 512;
const ASST_ROLE = B('"role":"assistant"'), USER_ROLE = B('"role":"user"');
const slice = (line: Buffer, a: number, b: number): Buffer => line.subarray(Math.max(0, a), Math.min(line.length, b));
const probe = (line: Buffer, pats: Buffer[]): boolean => {
  const h = slice(line, 0, HEAD), t = slice(line, line.length - HEAD, line.length);
  return pats.some((p) => h.indexOf(p) >= 0 || t.indexOf(p) >= 0);
};

/** Which rows need JSON.parse: messages without tool results, and short title rows. */
function wanted(line: Buffer): boolean {
  if (probe(line, [ASST, ASST_ROLE])) { return true; }
  if (probe(line, [USER, USER_ROLE])) { return slice(line, 0, HEAD * 4).indexOf(TOOL_RESULT) < 0; }
  const t = slice(line, 0, TITLE_HEAD);
  return line.length < TITLE_LINE_MAX && TITLE_KEYS.some((k) => t.indexOf(k) >= 0);
}

/** Fold one raw line; a partial or corrupt line (file still being written) is skipped. */
function takeLine(b: Buffer, s: number, e: number, a: Acc): void {
  const line = b.subarray(s, e);
  const k = line.lastIndexOf(TS);
  if (k >= 0) {
    const t = Date.parse(line.toString('latin1', k + 13, Math.min(line.length, k + 37)));
    if (!Number.isNaN(t)) { a.lastTs = t; }
  }
  takeExtra(line, a.x);
  a.cwd = takeCwd(line, a.cwd);
  if (!wanted(line)) { takeOther(line, a.u); return; }
  let row: any;
  try { row = JSON.parse(line.toString('utf8')); } catch { return; }
  if (!row || typeof row !== 'object') { return; }
  takeTitles(row, a);
  if (row.type === 'assistant') { takeUsage(row, a.u, Date.parse(row.timestamp) || 0); }
  if (row.type === 'user' || row.type === 'assistant') { takeMessage(row, a); }
}

/** Parse one chat file. Messages older than before are counted but their text is dropped. */
export async function parseFile(file: string, mtime: number, cap: number, before = 0): Promise<Parsed> {
  const a: Acc = { custom: '', ai: '', lastPrompt: '', summary: '', firstUser: '', lastTs: 0, firstTs: 0,
    count: 0, cap, before, mtime, line: 0, lines: [], ts: [], roles: [], texts: [], files: new Map(), cmds: new Map(), x: newGitAcc(), u: newUseAcc(), cwd: '' };
  await scanLines(file, (b, s, e, n) => { a.line = n; takeLine(b, s, e, a); });
  const flat = (x: string) => x.replace(/\s+/g, ' ');
  const title = flat(a.custom || a.ai || a.lastPrompt || a.summary || flat(a.firstUser).slice(0, 80) || '(untitled)');
  return {
    title, last: a.lastTs || mtime, first: a.firstTs || a.lastTs || mtime, count: a.count,
    files: Array.from(a.files, ([path, edited]) => ({ path, edited })), cmds: [...a.cmds.keys()], cmdAt: [...a.cmds.values()],
    ts: a.ts, roles: a.roles, texts: a.texts, lines: a.lines, ...finishExtras(a.x), use: finishUsage(a.u), cwd: a.cwd || undefined,
  };
}
