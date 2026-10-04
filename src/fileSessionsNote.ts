/** Text for the file-sessions UI: hand-over note, Markdown list, relative times. No vscode dependency. */
import { FileSession } from './fileSessions';

const UNITS: Array<[string, number]> = [['d', 86400e3], ['h', 3600e3], ['min', 60e3]];

/** Short age such as "3h ago", "2d ago" or "just now". */
export function ago(ts: number, now = Date.now()): string {
  const d = Math.max(0, now - ts);
  for (const [u, ms] of UNITS) { if (d >= ms) { return `${Math.floor(d / ms)}${u === 'min' ? ' min' : u} ago`; } }
  return 'just now';
}

/** Local "YYYY-MM-DD HH:MM". */
export function stamp(ts: number): string {
  const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const touchOf = (s: FileSession): string => (s.edited ? 'edited' : 'read');

/** Plain-text note for handing a bug to the chat that knows the file. */
export function handoverNote(s: FileSession, path: string, now = Date.now()): string {
  return [
    `File: ${path}`, `Chat: ${s.title}`, `Session id: ${s.id}`,
    `Touched: ${s.edited ? 'edited the file' : 'only read the file'}${s.onlySub ? ' (through a subagent)' : ''}`,
    `Last active: ${stamp(s.last)} (${ago(s.last, now)})`, `Project folder: ${s.project}`,
  ].join('\n');
}

/** Markdown list of every match: the path, then one line per chat. */
export function markdownList(items: FileSession[], path: string): string {
  const lines = items.map((s) => `- ${s.title.replace(/\s+/g, ' ')} | session ${s.id} | ${touchOf(s)} | last active ${stamp(s.last)}`);
  return [`Claude chats that touched \`${path}\``, '', ...lines, ''].join('\n');
}
