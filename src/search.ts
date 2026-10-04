import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

export interface Options { all: boolean; cs: boolean; ww: boolean; re: boolean; when: string; }

/** Earliest allowed last-active time (ms) for a time-filter value; 0 means any time. */
export function cutoffOf(when: string, now: number = Date.now()): number {
  const h: { [k: string]: number } = { '1h': 1, '2h': 2, '4h': 4, '8h': 8 };
  if (h[when]) { return now - h[when] * 3600000; }
  if (when === 'today') { return new Date(now).setHours(0, 0, 0, 0); }
  return 0;
}
export interface Abort { aborted: boolean; }
export type OnFile = (r: Result | null, done: number, total: number) => void;
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

/** Superset patterns (no word boundary) used to pre-filter raw JSON lines cheaply. */
function buildPre(query: string, o: Options): RegExp[] {
  const q = query.trim();
  const parts = o.re ? [q] : q.split(/\s+/).filter(Boolean).map(escRe);
  return parts.map((p) => new RegExp(p, o.cs ? '' : 'i'));
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

const TITLE_MARKS = ['customTitle', 'aiTitle', 'lastPrompt', 'summary'];
const DAY = 86400000;

async function scanFile(
  file: string, mtime: number, terms: RegExp[], pre: RegExp[], project: string, sig: Abort,
): Promise<Result | null> {
  const counts = terms.map(() => 0);
  let custom = '', ai = '', lastPrompt = '', summary = '', firstUser = '';
  let snippetSrc = '', snippetIdx = -1, snippetTs = -1, lastTs = 0, weightSum = 0;
  const now = Date.now();
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (sig.aborted) { return null; }
      if (!line) { continue; }
      const k = line.lastIndexOf('"timestamp":"');
      if (k >= 0) {
        const t = Date.parse(line.slice(k + 13, k + 37));
        if (!Number.isNaN(t)) { lastTs = t; }
      }
      const hit = pre.some((re) => re.test(line));
      const titled = TITLE_MARKS.some((m) => line.includes(m));
      const needUser = !firstUser && line.includes('"type":"user"');
      if (!hit && !titled && !needUser) { continue; }
      let row: any;
      try { row = JSON.parse(line); } catch { continue; }
      // Same sources as the Claude Code extension: customTitle > aiTitle > lastPrompt > summary.
      if (typeof row.customTitle === 'string' && row.customTitle) { custom = row.customTitle; }
      if (typeof row.aiTitle === 'string' && row.aiTitle) { ai = row.aiTitle; }
      if (typeof row.lastPrompt === 'string' && row.lastPrompt) { lastPrompt = row.lastPrompt; }
      if (typeof row.summary === 'string' && row.summary) { summary = row.summary; }
      if (row.type !== 'user' && row.type !== 'assistant') { continue; }
      const text = textOf(row.message?.content);
      if (!text) { continue; }
      if (row.type === 'user' && !firstUser) { firstUser = text; }
      if (!hit) { continue; }
      const rts = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
      const ts = Number.isNaN(rts) ? mtime : rts;
      const w = 1 / (1 + Math.max(0, (now - ts) / DAY) / 30);
      let first = -1;
      terms.forEach((re, i) => {
        for (const [st] of matches(re, text)) {
          counts[i]++; weightSum += w;
          if (first < 0 || st < first) { first = st; }
        }
      });
      if (first >= 0 && ts >= snippetTs) { snippetSrc = text; snippetIdx = first; snippetTs = ts; }
    }
  } finally { rl.close(); input.destroy(); }
  if (counts.some((c) => c === 0)) { return null; }
  const hits = counts.reduce((a, b) => a + b, 0);
  const last = lastTs || mtime;
  const flat = (x: string) => x.replace(/\s+/g, ' ');
  const title = flat(custom || ai || lastPrompt || summary || flat(firstUser).slice(0, 80) || '(untitled)');
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
    id: path.basename(file, '.jsonl'), title, hits, last, project, snippet, ranges,
    score: scoreOf(title, terms, weightSum, last, now),
  };
}

/** Title matches (x1000, +5000 if all terms hit, weighted by last-active) plus capped recency-weighted body. */
export function scoreOf(title: string, terms: RegExp[], weightSum: number, last: number, now: number): number {
  const perTerm = terms.map((re) => { let n = 0; for (const _ of matches(re, title)) { n++; } return n; });
  const n = perTerm.reduce((a, b) => a + b, 0);
  let titleScore = n * 1000 + (n > 0 && perTerm.every((c) => c > 0) ? 5000 : 0);
  const age = Math.max(0, (now - last) / DAY);
  titleScore *= 0.5 + 0.5 / (1 + age / 30);
  return titleScore + Math.min(900, weightSum * 10);
}

export async function searchChats(
  query: string, o: Options, folders: string[], sig: Abort, onFile?: OnFile,
): Promise<Result[]> {
  const terms = buildTerms(query, o); // may throw: caller reports invalid regex
  if (!terms.length) { return []; }
  const pre = buildPre(query, o);
  const cutoff = cutoffOf(o.when);
  let dirs: string[] = [];
  try { dirs = await dirsFor(o.all, folders); } catch { return []; }
  const todo: Array<{ file: string; mtime: number; project: string }> = [];
  for (const d of dirs) {
    try {
      const project = d.split('-').filter(Boolean).pop() ?? d;
      const names = (await fs.promises.readdir(path.join(root(), d))).filter((f) => f.endsWith('.jsonl'));
      await Promise.all(names.map(async (f) => {
        try {
          const file = path.join(root(), d, f);
          const st = await fs.promises.stat(file);
          // A file's mtime is never older than its last row, so an older mtime cannot pass the filter.
          if (st.size > 0 && st.mtimeMs >= cutoff) { todo.push({ file, mtime: st.mtimeMs, project }); }
        } catch { /* skip unreadable */ }
      }));
    } catch { continue; }
  }
  todo.sort((a, b) => b.mtime - a.mtime);
  const out: Result[] = [];
  let done = 0, next = 0;
  const worker = async (): Promise<void> => {
    while (!sig.aborted && next < todo.length) {
      const t = todo[next++];
      let r: Result | null = null;
      try { r = await scanFile(t.file, t.mtime, terms, pre, t.project, sig); } catch { /* skip */ }
      if (sig.aborted) { return; }
      if (r && r.last < cutoff) { r = null; }
      done++;
      if (r) { out.push(r); }
      onFile?.(r, done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, todo.length) }, worker));
  return out.sort((a, b) => b.score - a.score).slice(0, 50);
}
