/** One chat as Markdown: its own messages in order, text exactly as stored so code blocks stay intact. No vscode dependency. */
import { startOf } from './blob';
import { localStamp } from './export';
import { MSG_CAP } from './parse';
import { Chat, Rec } from './types';

interface Source { rec(c: Chat): Rec; }

/** Header, then one "## You" or "## Agent" section per message (subagent files are not included). */
export function chatMarkdown(ix: Source, chat: Chat, now: number): string {
  const rec = ix.rec(chat), out = [`# ${chat.title.replace(/\s+/g, ' ')}`, '', `Session: ${chat.id}`, `Exported: ${localStamp(now)}`];
  let cut = false;
  for (let i = 0; i < rec.ts.length; i++) {
    const text = rec.text.slice(startOf(rec, i), rec.ends[i]);
    if (text.length >= MSG_CAP) { cut = true; }
    out.push('', `## ${rec.roles[i] === 0 ? 'You' : 'Agent'} - ${localStamp(rec.ts[i])}`, '', text);
  }
  if (cut) { out.push('', `_Messages of ${MSG_CAP} characters or more were cut by the index._`); }
  return out.join('\n') + '\n';
}

/** Default save name: <title words>_<YYYYMMDD>.md, safe for any file system. */
export function mdName(title: string, d: Date): string {
  const slug = title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'session';
  return `${slug}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.md`;
}
