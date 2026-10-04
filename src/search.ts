import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface Result {
  id: string; title: string; hits: number; mtime: number; project: string;
  before: string; match: string; after: string; score: number;
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

async function scanFile(file: string, words: string[], project: string): Promise<Result | null> {
  const stat = await fs.promises.stat(file);
  if (stat.size === 0) { return null; }
  const counts = words.map(() => 0);
  let title = '', firstUser = '', snippetSrc = '', snippetIdx = -1, snippetLen = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) { continue; }
    let row: any;
    try { row = JSON.parse(line); } catch { continue; }
    const t = row.aiTitle ?? row.summary;
    if (typeof t === 'string' && t) { title = t; }
    if (row.type !== 'user' && row.type !== 'assistant') { continue; }
    const text = textOf(row.message?.content);
    if (!text) { continue; }
    if (row.type === 'user' && !firstUser) { firstUser = text; }
    const lower = text.toLowerCase();
    words.forEach((w, i) => {
      let p = lower.indexOf(w);
      while (p !== -1) {
        counts[i]++;
        if (snippetIdx < 0 && i === 0) { snippetSrc = text; snippetIdx = p; snippetLen = w.length; }
        p = lower.indexOf(w, p + w.length);
      }
    });
  }
  if (counts.some((c) => c === 0)) { return null; }
  const hits = counts.reduce((a, b) => a + b, 0);
  const ageDays = Math.max(0, (Date.now() - stat.mtimeMs) / 86400000);
  const s = Math.max(0, snippetIdx - 40);
  const flat = (x: string) => x.replace(/\s+/g, ' ');
  return {
    id: path.basename(file, '.jsonl'),
    title: title || flat(firstUser).slice(0, 80) || '(untitled)',
    hits, mtime: stat.mtimeMs, project, score: hits / (1 + ageDays / 30),
    before: flat(snippetSrc.slice(s, snippetIdx)),
    match: flat(snippetSrc.slice(snippetIdx, snippetIdx + snippetLen)),
    after: flat(snippetSrc.slice(snippetIdx + snippetLen, snippetIdx + snippetLen + 80)),
  };
}

export async function searchChats(query: string, all: boolean, folders: string[]): Promise<Result[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) { return []; }
  let dirs: string[] = [];
  try { dirs = await dirsFor(all, folders); } catch { return []; }
  const out: Result[] = [];
  for (const d of dirs) {
    let files: string[] = [];
    try { files = (await fs.promises.readdir(path.join(root(), d))).filter((f) => f.endsWith('.jsonl')); }
    catch { continue; }
    for (const f of files) {
      try {
        const r = await scanFile(path.join(root(), d, f), words, d.split('-').filter(Boolean).pop() ?? d);
        if (r) { out.push(r); }
      } catch { /* skip unreadable */ }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 50);
}
