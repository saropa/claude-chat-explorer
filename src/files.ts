import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Chat } from './types';

export const projectsRoot = (): string => path.join(os.homedir(), '.claude', 'projects');

/** One chat file found on disk; parent is set for subagent files. */
export interface FileStat { file: string; dir: string; id: string; parent?: string; mtime: number; size: number; }

const AGENT_FILE = /^agent-(.+)\.jsonl$/;

/** Source .jsonl path of an indexed chat. */
export function fileOf(root: string, c: Pick<Chat, 'dir' | 'id' | 'parent'>): string {
  return c.parent ? path.join(root, c.dir, c.parent, 'subagents', `agent-${c.id}.jsonl`)
    : path.join(root, c.dir, c.id + '.jsonl');
}

async function statInto(f: Omit<FileStat, 'mtime' | 'size'>, out: FileStat[]): Promise<void> {
  try {
    const st = await fs.promises.stat(f.file);
    if (st.isFile() && st.size > 0) { out.push({ ...f, mtime: st.mtimeMs, size: st.size }); }
  } catch { /* deleted between readdir and stat */ }
}

/** Subagent files of one session folder; none without a subagents folder or a parent .jsonl beside it. */
async function subagentsOf(root: string, dir: string, parent: string, out: FileStat[]): Promise<void> {
  const sub = path.join(root, dir, parent, 'subagents');
  let names: string[];
  try { await fs.promises.access(path.join(root, dir, parent + '.jsonl')); } catch { return; } // orphan: no parent chat file
  try { names = await fs.promises.readdir(sub); } catch { return; }
  await Promise.all(names.map((n) => {
    const m = AGENT_FILE.exec(n);
    return m ? statInto({ file: path.join(sub, n), dir, id: m[1], parent }, out) : undefined;
  }));
}

/** Top-level chats and subagent chats of one project folder. */
export async function statDir(root: string, dir: string, out: FileStat[]): Promise<void> {
  const ents = await fs.promises.readdir(path.join(root, dir), { withFileTypes: true });
  await Promise.all(ents.map((e) => {
    if (e.isDirectory()) { return subagentsOf(root, dir, e.name, out); }
    if (!e.name.endsWith('.jsonl')) { return undefined; }
    return statInto({ file: path.join(root, dir, e.name), dir, id: e.name.slice(0, -6) }, out);
  }));
}

/** Every chat file under the projects root. */
export async function listFiles(root: string, onError: (where: string, e: unknown) => void): Promise<FileStat[]> {
  const out: FileStat[] = [];
  let dirs: string[] = [];
  try {
    dirs = (await fs.promises.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { return out; } // no projects folder yet
  await Promise.all(dirs.map((d) => statDir(root, d, out).catch((e) => onError('read ' + d, e))));
  return out;
}

/** Agent type and description from agent-<id>.meta.json next to a subagent file. */
export async function agentMeta(file: string): Promise<{ type?: string; desc?: string }> {
  try {
    const o = JSON.parse(await fs.promises.readFile(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    const s = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 200) : undefined);
    return { type: s(o?.agentType), desc: s(o?.description) };
  } catch { return {}; }
}
