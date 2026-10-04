import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface Options { all: boolean; cs: boolean; ww: boolean; re: boolean; }
export interface Progress { done: number; total: number; }
export interface Result {
  id: string; title: string; hits: number; last: number; project: string;
  snippet: string; ranges: Array<[number, number]>; score: number;
}

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build one RegExp per required term. Throws SyntaxError on an invalid regex. */
export function buildTerms(query: string, o: Options): RegExp[] {
  const q = query.trim();
  if (!q) { return []; }
  const parts = o.re ? [q] : q.split(/\s+/).filter(Boolean).map(escRe);
  return parts.map((p) => new RegExp(o.ww ? '\\b(?:' + p + ')\\b' : p, o.cs ? 'g' : 'gi'));
}

function* matches(re: RegExp, text: string): Generator<[number, number]> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    yield [m.index, m.index + m[0].length];
  }
}

const root = () => path.join(os.homedir(), '.claude', 'projects');
const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');

function textOf(content: unknown): string {
  if (typeof content === 'string') { return content; }
  if (Array.isArray(content)) {
    return content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
  }
  return '';
}

async function dirsFor(all: boolean, folders: string[]): Promise<string[]> {
  if (all) {
    const ents = await fs.promises.readdir(root(), { withFileTypes: true });
    return ents.filter((e) => e.isDirectory()).map((e) => e.name);
  }
  return folders.map(encode);
}

async function scanFile(file: string, terms: RegExp[], project: string): Promise<Result | null> {
  const stat = await fs.promises.stat(file);
  if (stat.size === 0) { return null; }
  const counts = terms.map(() => 0);
  let custom = '', ai = '', lastPrompt = '', summary = '', firstUser = '';
  let snippetSrc = '', snippetIdx = -1, lastTs = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) { continue; }
    let row: any;
    try { row = JSON.parse(line); } catch { continue; }
    const ts = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
    if (!Number.isNaN(ts)) { lastTs = ts; }
    // Same sources as the Claude Code extension: customTitle > aiTitle > lastPrompt > summary.
    if (typeof row.customTitle === 'string' && row.customTitle) { custom = row.customTitle; }
    if (typeof row.aiTitle === 'string' && row.aiTitle) { ai = row.aiTitle; }
    if (typeof row.lastPrompt === 'string' && row.lastPrompt) { lastPrompt = row.lastPrompt; }
    if (typeof row.summary === 'string' && row.summary) { summary = row.summary; }
    if (row.type !== 'user' && row.type !== 'assistant') { continue; }
    const text = textOf(row.message?.content);
    if (!text) { continue; }
    if (row.type === 'user' && !firstUser) { firstUser = text; }
    terms.forEach((re, i) => {
      for (const [st] of matches(re, text)) {
        counts[i]++;
        if (snippetIdx < 0) { snippetSrc = text; snippetIdx = st; }
      }
    });
  }
  if (counts.some((c) => c === 0)) { return null; }
  const hits = counts.reduce((a, b) => a + b, 0);
  const last = lastTs || stat.mtimeMs;
  const ageDays = Math.max(0, (Date.now() - last) / 86400000);
  const flat = (x: string) => x.replace(/\s+/g, ' ');
  const title = custom || ai || lastPrompt || summary || flat(firstUser).slice(0, 80) || '(untitled)';
  // Snippet window keeps original text; whitespace is flattened 1:1 so offsets stay valid.
  const s = Math.max(0, snippetIdx - 40);
  const snippet = snippetSrc.slice(s, snippetIdx + 120).replace(/\s/g, ' ');
  const raw: Array<[number, number]> = [];
  for (const re of terms) { for (const r of matches(re, snippet)) { raw.push(r); } }
  raw.sort((a, b) => a[0] - b[0]);
  const ranges: Array<[number, number]> = [];
  for (const r of raw) {
    const p = ranges[ranges.length - 1];
    if (p && r[0] <= p[1]) { p[1] = Math.max(p[1], r[1]); } else { ranges.push([r[0], r[1]]); }
  }
  return {
    id: path.basename(file, '.jsonl'), title: flat(title), hits, last, project,
    score: hits / (1 + ageDays / 30), snippet, ranges,
  };
}

export async function searchChats(
  query: string, o: Options, folders: string[], onProgress?: (p: Progress) => void,
): Promise<Result[]> {
  const terms = buildTerms(query, o); // may throw: caller reports invalid regex
  if (!terms.length) { return []; }
  let dirs: string[] = [];
  try { dirs = await dirsFor(o.all, folders); } catch { return []; }
  const todo: Array<[string, string]> = [];
  for (const d of dirs) {
    try {
      for (const f of await fs.promises.readdir(path.join(root(), d))) {
        if (f.endsWith('.jsonl')) { todo.push([d, f]); }
      }
    } catch { continue; }
  }
  const out: Result[] = [];
  let done = 0;
  for (const [d, f] of todo) {
    try {
      const r = await scanFile(path.join(root(), d, f), terms, d.split('-').filter(Boolean).pop() ?? d);
      if (r) { out.push(r); }
    } catch { /* skip unreadable */ }
    done++;
    if (onProgress && (done % 5 === 0 || done === todo.length)) { onProgress({ done, total: todo.length }); }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 50);
}
