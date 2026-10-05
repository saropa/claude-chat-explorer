import { EdChat, EdOut, EdRow } from './editorSearch';
import { localStamp } from './export';

/** A highlighted span in the document text: zero-based line, start and end column. */
export interface Span { line: number; from: number; to: number; }
/** A chat header line that resumes the chat: zero-based line, last column before the colon, session id. */
export interface HeadLink { line: number; to: number; id: string; }
export interface Doc { text: string; spans: Span[]; links: HeadLink[]; }
export interface DocMeta { query: string; flags: string[]; }

const plu = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

/** The header lines: query, flags, counts and any cap, then a blank line. */
export function headerLines(out: EdOut, m: DocMeta): string[] {
  const l = [`# Query: ${m.query}`];
  if (m.flags.length) { l.push(`# Flags: ${m.flags.join(' ')}`); }
  l.push(`${plu(out.results, 'result')} - ${plu(out.chats.length, 'chat')}`);
  if (out.chatsCapped) { l.push(`Showing the top ${out.chats.length.toLocaleString('en-US')} of ${out.totalChats.toLocaleString('en-US')} chats. Be more specific in your search to narrow down the results.`); }
  if (out.resultsCapped) { l.push(`Stopped at ${plu(out.results, 'result')}. Be more specific in your search to narrow down the results.`); }
  return l.concat('');
}

function chatHeader(c: EdChat): string {
  return `${c.title.replace(/\s+/g, ' ')}${c.project ? ' | ' + c.project : ''} | ${localStamp(c.last)}`;
}

/** The document: header, then per chat a header line and numbered match lines (":" after the number) and context lines (blank), a blank line between hits. */
export function buildDoc(out: EdOut, m: DocMeta): Doc {
  const lines = headerLines(out, m), spans: Span[] = [], links: HeadLink[] = [];
  const w = Math.max(1, ...out.chats.flatMap((c) => c.hits.map((h) => String(h.n).length)));
  for (const c of out.chats) {
    const h = chatHeader(c);
    links.push({ line: lines.length, to: h.length, id: c.id });
    lines.push(h + ':');
    for (const hit of c.hits) {
      if (hit.sub !== undefined) { lines.push(`  Subagent ${hit.sub}`.trimEnd()); }
      const num = hit.n > 0 ? String(hit.n).padStart(w) : '-'.padStart(w);
      for (const r of hit.rows) { lines.push(rowText(r, num, lines.length, spans)); }
      lines.push('');
    }
  }
  return { text: lines.join('\n') + '\n', spans, links };
}

function rowText(r: EdRow, num: string, line: number, spans: Span[]): string {
  const pre = `  ${num}${r.r ? ':' : ' '} `;
  for (const [a, b] of r.r ?? []) { spans.push({ line, from: pre.length + a, to: pre.length + b }); }
  return pre + r.t;
}
