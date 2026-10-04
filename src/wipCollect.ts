import * as path from 'path';
import { pool } from './wipExec';
import { Ctx, probe, repoOf, statusOf } from './wipGit';
import { StatusParts } from './wipParse';
import { PrCache, PrResult } from './wipPrs';
import { emptyFolder, FolderFacts, RepoFacts, WipChat, WipChatIn, WipData } from './wipTypes';

export const MAX_FOLDERS = 60;
export const CONCURRENCY = 4;

export interface CollectOpts { ctx: Ctx; prs: boolean; cache: PrCache; force: boolean; now: number; maxFolders?: number; }

const uniq = <T>(a: T[]): T[] => [...new Set(a)];
const stopped = (c: Ctx) => (): boolean => !!c.signal?.aborted;

/** Distinct working folders, most recently active chat first, capped. */
export function foldersOf(chats: WipChatIn[], max: number): { scan: string[]; more: number } {
  const all = uniq([...chats].sort((a, b) => b.last - a.last).map((c) => c.cwd).filter(Boolean));
  return { scan: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** Fold a status answer into folder facts. */
function withStatus(f: FolderFacts, s: StatusParts | string | undefined): FolderFacts {
  if (typeof s === 'string' || !s) { return { ...f, state: 'unavailable', reason: s ?? 'canceled' }; }
  return { ...f, branch: s.branch, detached: s.detached, upstream: s.upstream, ahead: s.ahead, behind: s.behind, gone: s.gone,
    staged: s.staged, modified: s.modified, untracked: s.untracked, files: s.files, fileTotal: s.fileTotal };
}

/** Probe each folder, then run status once per distinct worktree top. */
async function folderFacts(o: CollectOpts, scan: string[]): Promise<Map<string, FolderFacts>> {
  const probes = await pool(scan, CONCURRENCY, (cwd) => probe(o.ctx, cwd), stopped(o.ctx));
  const tops = uniq(probes.map((p) => (p?.state === 'ok' ? p.top! : '')).filter(Boolean));
  const sts = await pool(tops, CONCURRENCY, (t) => statusOf(o.ctx, t), stopped(o.ctx));
  const byTop = new Map(tops.map((t, i) => [t, sts[i]] as const));
  const out = new Map<string, FolderFacts>();
  scan.forEach((cwd, i) => { const p = probes[i]; if (p) { out.set(cwd, p.state === 'ok' ? withStatus(p, byTop.get(p.top!)) : p); } });
  return out;
}

/** Worktree and branch facts, once per repository. */
async function repoFacts(o: CollectOpts, facts: FolderFacts[]): Promise<Map<string, RepoFacts>> {
  const where = new Map<string, string>();
  for (const f of facts) { if (f.state === 'ok' && f.common && !where.has(f.common)) { where.set(f.common, f.top!); } }
  const keys = [...where.keys()];
  const rs = await pool(keys, CONCURRENCY, (k) => repoOf(o.ctx, k, where.get(k)!), stopped(o.ctx));
  const out = new Map<string, RepoFacts>();
  keys.forEach((k, i) => { const r = rs[i]; if (r) { out.set(k, r); } });
  return out;
}

/** Open PRs once per repository; the lookup runs in the repository's main folder when it exists. */
async function prFacts(o: CollectOpts, repos: Map<string, RepoFacts>): Promise<Map<string, PrResult>> {
  const keys = [...repos.keys()];
  const rs = await pool(keys, CONCURRENCY, (k) => {
    const r = repos.get(k)!, main = r.worktrees.find((w) => w.main && !w.missing);
    return o.cache.get(o.ctx, k, main?.path ?? path.dirname(k), o.force, o.now);
  }, stopped(o.ctx));
  return new Map(keys.map((k, i) => [k, rs[i] ?? { byBranch: new Map(), error: 'canceled' }] as const));
}

/** One scan: folders, repositories, then open PRs (when asked); assembled per chat. */
export async function collect(chats: WipChatIn[], o: CollectOpts): Promise<WipData> {
  const t0 = Date.now();
  const { scan, more } = foldersOf(chats, o.maxFolders ?? MAX_FOLDERS);
  const folders = o.ctx.flags.gitMissing ? new Map<string, FolderFacts>() : await folderFacts(o, scan);
  const repos = await repoFacts(o, [...folders.values()]);
  const prs = o.prs && !o.ctx.flags.gitMissing ? await prFacts(o, repos) : new Map<string, PrResult>();
  if (o.ctx.signal?.aborted) { throw new Error('canceled'); }
  const rows: WipChat[] = chats.filter((c) => c.cwd).map((c) => {
    const f = folders.get(c.cwd) ?? emptyFolder(c.cwd, 'notscanned');
    return { ...c, folder: f, pr: f.common && f.branch ? prs.get(f.common)?.byBranch.get(f.branch) : undefined };
  });
  const errs = uniq([...prs.values()].map((p) => p.error).filter((e): e is string => !!e && e !== 'canceled'));
  const miss = [...prs.values()].some((p) => p.missing);
  const gh = !o.prs ? 'off' : miss ? 'missing' : errs.length ? 'error' : 'ok';
  return { chats: rows, repos, notScanned: more, gitMissing: o.ctx.flags.gitMissing, at: o.now,
    prNote: errs.length ? errs.join('; ') : undefined, stats: { folders: scan.length, gitMissing: o.ctx.flags.gitMissing, gh, ms: Date.now() - t0 } };
}
