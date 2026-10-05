/** Open Work git scan: one pipeline per FOLDER (shared by every chat in it), one repository layer per repository,
 *  results posted folder by folder as each ends. Read-only: every command goes through wipGit's allow-list.
 *  Pure node (no vscode import) so the build check can drive it with a fake runner. */
import * as path from 'path';
import { Limiter } from './execLimit';
import { Exec, pool } from './wipExec';
import { Ctx, probe, statusOf, unpushedOf } from './wipGit';
import { FileChange } from './wipTypes';
import { readRepo, removeCommand, RepoOut, WtOut } from './workRepo';

export const MAX_FOLDERS = 60;
export const FOLDER_DEADLINE_MS = 10000;
export const SCAN_CACHE_MS = 5 * 60 * 1000;
const FOLDER_POOL = 2; // the page lane has 3 git slots: 2 for folders, 1 for the repository layer
const PROGRESS_MS = 100;
const START_GRACE_MS = 20000; // a lane that never got its first command (hung folder check, no free slot) still ends
const DETAIL_MS = 10000;

export type FolderState = 'queued' | 'running' | 'ok' | 'none' | 'error' | 'timeout';
export interface FolderIn { cwd: string; last: number; }
export interface ScanOpts {
  exec: Exec; limiter: Limiter; gitMs?: number; deadlineMs?: number; cacheMs?: number; now?: () => number;
  workspace?: () => string[]; log?: (where: string, e: unknown) => void;
}
interface FolderOut { state: FolderState; reason?: string; top?: string; common?: string; facts?: { [k: string]: unknown }; files: FileChange[]; ahead: number; }
interface FolderEntry { key: string; cwd: string; out?: FolderOut; topReal?: string; wsSent?: boolean; }
interface RepoRun { fks: Set<string>; done: boolean; }
interface Ws { paths: string[]; reals: Set<string>; commons: Set<string>; }
interface Run {
  scan: number; ac: AbortController; post: (m: object) => void; force: boolean; flags: { gitMissing: boolean };
  total: number; done: number; counted: Set<string>; unfinished: Set<string>; repos: Map<string, RepoRun>; repoChain: Promise<void>;
  lastProg: number; progTimer?: NodeJS.Timeout; ws?: Promise<Ws>;
}
interface Lane { ctx: Ctx; late: Promise<'late'>; timedOut: () => boolean; stop: () => void; }

const within = (p: string, root: string): boolean => p === root || p.startsWith(root + path.sep);
const whyState = (s: string): FolderState => (s === 'timed out' ? 'timeout' : 'error');

export class WorkScan {
  private run?: Run;
  private n = { f: 0, r: 0, w: 0 };
  private readonly fkeys = new Map<string, FolderEntry>(); // by cwd
  private readonly byKey = new Map<string, FolderEntry>();
  private readonly rkeys = new Map<string, string>(); // common dir -> r key
  private readonly repos = new Map<string, RepoOut>(); // by r key
  private readonly repoCommon = new Map<string, string>();
  private readonly wkeys = new Map<string, { rk: string; real: string }>();
  private readonly wmap = new Map<string, string>();
  private readonly fcache = new Map<string, { at: number; out: FolderOut }>();
  private readonly rcache = new Map<string, { at: number; out: RepoOut }>();
  private readonly details = new Set<AbortController>();
  private ws: Ws = { paths: [], reals: new Set(), commons: new Set() };

  constructor(private readonly o: ScanOpts) {}

  private get now(): number { return (this.o.now ?? Date.now)(); }
  private get deadline(): number { return this.o.deadlineMs ?? FOLDER_DEADLINE_MS; }
  private get gitMs(): number { return this.o.gitMs ?? 5000; }
  private log(where: string, e: unknown): void { this.o.log?.(where, e); }

  /** The host-issued key of a working folder (the page never sees the path). */
  keyOf(cwd: string): string {
    let e = this.fkeys.get(cwd);
    if (!e) { e = { key: 'f' + ++this.n.f, cwd }; this.fkeys.set(cwd, e); this.byKey.set(e.key, e); }
    return e.key;
  }

  /** Stop the running scan: queued work is dropped and running commands are killed. Nothing is posted afterward. */
  cancel(): void {
    const r = this.run;
    this.run = undefined;
    if (r) { r.ac.abort(); clearTimeout(r.progTimer); }
    this.details.forEach((d) => d.abort());
    this.details.clear();
  }

  /** Scan the folders (newest chat first). Resolves when every folder and repository has a final state and `end` was posted, or when canceled. */
  async start(scan: number, items: FolderIn[], force: boolean, post: (m: object) => void): Promise<void> {
    this.cancel();
    const run: Run = { scan, ac: new AbortController(), post, force, flags: { gitMissing: false }, total: items.length, done: 0, counted: new Set(), unfinished: new Set(), repos: new Map(), repoChain: Promise.resolve(), lastProg: 0 };
    this.run = run;
    try { await this.drive(run, items); } catch (e) { this.log('open work scan', e); }
  }

  private async drive(run: Run, items: FolderIn[]): Promise<void> {
    const entries = items.map((i) => this.byKey.get(this.keyOf(i.cwd))!);
    run.ws = this.wsInfo(run);
    const todo: FolderEntry[] = [];
    for (const e of entries) {
      const hit = run.force ? undefined : this.fcache.get(e.cwd);
      if (hit && this.now - hit.at < (this.o.cacheMs ?? SCAN_CACHE_MS)) { await this.finish(run, e, hit.out, Math.round((this.now - hit.at) / 1000)); }
      else { todo.push(e); run.unfinished.add(e.key); this.postFolder(run, e.key, { state: 'queued' }); }
    }
    this.progress(run, true);
    await pool(todo, FOLDER_POOL, (e) => this.runFolder(run, e, false), () => run.ac.signal.aborted);
    await run.repoChain;
    if (run.ac.signal.aborted) { return; }
    this.progress(run, true);
    run.post({ type: 'end', scan: run.scan, open: [...run.unfinished], gitMissing: run.flags.gitMissing });
  }

  private put(run: Run, m: object): void { if (!run.ac.signal.aborted) { run.post({ ...m, scan: run.scan }); } }
  private postFolder(run: Run, key: string, m: object): void { this.put(run, { type: 'folder', key, ...m }); }

  /** At most one progress message per 100 ms; a trailing one carries the last numbers. */
  private progress(run: Run, now: boolean): void {
    const send = (): void => { run.progTimer = undefined; run.lastProg = Date.now(); this.put(run, { type: 'progress', git: { done: run.done, total: run.total } }); };
    if (run.progTimer) { if (now) { clearTimeout(run.progTimer); send(); } return; }
    if (now || Date.now() - run.lastProg >= PROGRESS_MS) { send(); return; }
    run.progTimer = setTimeout(send, PROGRESS_MS);
  }

  /** A command lane for one folder or repository: its deadline starts at its first command, not when it was queued. */
  private lane(run: Run, onStart: () => void): Lane {
    const ac = new AbortController();
    const onAbort = (): void => ac.abort();
    run.ac.signal.addEventListener('abort', onAbort, { once: true });
    let timer: NodeJS.Timeout | undefined, timedOut = false, started = false, fire: () => void = () => undefined;
    const late = new Promise<'late'>((res) => { fire = () => res('late'); });
    const exec = this.o.limiter.wrap(this.o.exec, 'bg', () => {
      if (started) { return; }
      started = true;
      onStart();
      timer = setTimeout(() => { timedOut = true; ac.abort(); fire(); }, this.deadline);
    });
    const guard = setTimeout(() => { if (!started) { timedOut = true; ac.abort(); fire(); } }, this.deadline + START_GRACE_MS);
    const ctx: Ctx = { exec, signal: ac.signal, gitMs: this.gitMs, ghMs: this.gitMs, flags: run.flags };
    return { ctx, late, timedOut: () => timedOut, stop: () => { clearTimeout(timer); clearTimeout(guard); run.ac.signal.removeEventListener('abort', onAbort); } };
  }

  private async runFolder(run: Run, e: FolderEntry, quiet: boolean): Promise<void> {
    const lane = this.lane(run, () => { if (!quiet) { this.postFolder(run, e.key, { state: 'running' }); } });
    let out: FolderOut;
    try {
      const r = await Promise.race([this.readFolder(lane.ctx, e.cwd), lane.late]);
      out = r === 'late' ? { state: 'timeout', reason: 'timed out', files: [], ahead: 0 } : r;
    } catch (err) { this.log('open work folder', err); out = { state: 'error', reason: 'git error', files: [], ahead: 0 }; }
    finally { lane.stop(); }
    if (run.ac.signal.aborted) { return; }
    if (lane.timedOut()) { out = { state: 'timeout', reason: 'timed out', files: [], ahead: 0 }; }
    if (out.state === 'ok' || out.state === 'none') { this.fcache.set(e.cwd, { at: this.now, out }); }
    await this.finish(run, e, out, undefined);
  }

  /** Probe, then one status of the worktree top. The state names what the page shows. */
  private async readFolder(c: Ctx, cwd: string): Promise<FolderOut> {
    const bad = (state: FolderState, reason: string): FolderOut => ({ state, reason, files: [], ahead: 0 });
    const f = await probe(c, cwd);
    if (c.flags.gitMissing) { return bad('error', 'git not found'); }
    if (f.state === 'missing') { return bad('none', 'The folder no longer exists'); }
    if (f.state === 'notgit') { return bad('none', 'Not a git folder'); }
    if (f.state !== 'ok' || !f.top || !f.common) { return bad(whyState(f.reason ?? ''), f.reason ?? 'git error'); }
    const s = await statusOf(c, f.top);
    if (typeof s === 'string') { return bad(whyState(s), s); }
    const facts = { name: path.basename(f.top), branch: f.branch ?? s.branch, detached: !!f.detached || s.detached, sha: f.sha, noCommits: !!f.noCommits,
      upstream: s.upstream, ahead: s.ahead, behind: s.behind, gone: s.gone, staged: s.staged, modified: s.modified, untracked: s.untracked, fileTotal: s.fileTotal, files: s.files };
    return { state: 'ok', top: f.top, common: f.common, facts, files: s.files, ahead: s.ahead };
  }

  /** Record a folder's final state, post it, count it, and start its repository layer. */
  private async finish(run: Run, e: FolderEntry, out: FolderOut, age: number | undefined): Promise<void> {
    e.out = out;
    e.topReal = out.top;
    run.unfinished.delete(e.key);
    if (!run.counted.has(e.key)) { run.counted.add(e.key); run.done++; }
    const msg: { [k: string]: unknown } = { state: out.state, reason: out.reason, age };
    if (out.state === 'ok' && out.facts && out.common) {
      e.wsSent = this.inWs(e.cwd, out.common, out.top);
      msg.facts = { ...out.facts, rk: this.rkeyOf(out.common), ws: e.wsSent };
    }
    this.postFolder(run, e.key, msg);
    this.progress(run, false);
    if (out.state === 'ok' && out.common && out.top) { this.kickRepo(run, out.common, out.top, e.key); }
    void run.ws?.then(() => this.reportWs(run, e));
  }

  /** Once the workspace folders are known, tell the page when a folder (or repository) is in the workspace after all. */
  private reportWs(run: Run, e: FolderEntry): void {
    const o = e.out;
    if (!o || o.state !== 'ok' || !o.facts || !o.common || e.wsSent || !this.inWs(e.cwd, o.common, o.top)) { return; }
    e.wsSent = true;
    this.postFolder(run, e.key, { state: 'ok', age: undefined, facts: { ...o.facts, rk: this.rkeyOf(o.common), ws: true } });
    const rk = this.rkeyOf(o.common);
    if (run.repos.get(rk)?.done) { this.postRepo(run, rk, 'ok'); }
  }

  private inWs(cwd: string, common: string, top?: string): boolean {
    const w = this.ws;
    return w.paths.some((p) => within(cwd, path.resolve(p))) || w.commons.has(common) || (!!top && w.reals.has(top));
  }

  /** Resolve the workspace folders (their repository ids), so "this workspace only" also keeps sibling worktree folders. */
  private async wsInfo(run: Run): Promise<Ws> {
    const paths = (this.o.workspace?.() ?? []).slice(0, 10);
    this.ws = { paths, reals: new Set(), commons: new Set() };
    if (!paths.length) { return this.ws; }
    const lane = this.lane(run, () => undefined);
    try {
      const res = await Promise.race([Promise.all(paths.map((p) => probe(lane.ctx, p))), lane.late]);
      if (res !== 'late') { for (const f of res) { if (f.state === 'ok' && f.common && f.top) { this.ws.commons.add(f.common); this.ws.reals.add(f.top); } } }
    } catch (e) { this.log('open work workspace', e); } finally { lane.stop(); }
    return this.ws;
  }

  private rkeyOf(common: string): string {
    let k = this.rkeys.get(common);
    if (!k) { k = 'r' + ++this.n.r; this.rkeys.set(common, k); this.repoCommon.set(k, common); }
    return k;
  }

  /** Start the layer for a repository the first time one of its folders ends; later folders only join it. Layers run one at a time. */
  private kickRepo(run: Run, common: string, top: string, fk: string): void {
    const rk = this.rkeyOf(common);
    let st = run.repos.get(rk);
    if (!st) {
      st = { fks: new Set(), done: false };
      run.repos.set(rk, st);
      run.unfinished.add(rk);
      this.put(run, { type: 'repo', key: rk, state: 'running', worktrees: [], merged: [] });
      const s = st;
      run.repoChain = run.repoChain.then(() => this.runRepo(run, rk, common, top, s, false));
    }
    st.fks.add(fk);
    if (st.done) { this.postRepo(run, rk, 'ok'); }
  }

  private async runRepo(run: Run, rk: string, common: string, top: string, st: RepoRun, force: boolean): Promise<void> {
    if (run.ac.signal.aborted) { return; }
    const hit = run.force || force ? undefined : this.rcache.get(common);
    if (hit && this.now - hit.at < (this.o.cacheMs ?? SCAN_CACHE_MS)) { this.repoDone(run, rk, st, hit.out, 'ok', undefined); return; }
    const lane = this.lane(run, () => undefined);
    let res: RepoOut | string;
    try {
      res = await Promise.race([readRepo(lane.ctx, common, top, (p) => { this.repos.set(rk, p); this.postRepo(run, rk, 'running'); }), lane.late]);
    } catch (err) { this.log('open work repository', err); res = 'git error'; } finally { lane.stop(); }
    if (run.ac.signal.aborted) { return; }
    if (res === 'late') { res = 'timed out'; }
    if (typeof res === 'string') { this.repoDone(run, rk, st, this.repos.get(rk), lane.timedOut() ? 'timeout' : 'error', lane.timedOut() ? 'timed out' : res); return; }
    this.rcache.set(common, { at: this.now, out: res });
    this.repoDone(run, rk, st, res, 'ok', undefined);
  }

  private repoDone(run: Run, rk: string, st: RepoRun, out: RepoOut | undefined, state: string, reason: string | undefined): void {
    if (out) { this.repos.set(rk, out); }
    st.done = true;
    run.unfinished.delete(rk);
    this.postRepo(run, rk, state, reason);
  }

  private postRepo(run: Run, rk: string, state: string, reason?: string): void {
    const r = this.repos.get(rk), st = run.repos.get(rk);
    if (!r || !st) { this.put(run, { type: 'repo', key: rk, state, reason, worktrees: [], merged: [] }); return; }
    const fks = [...st.fks];
    const worktrees = r.worktrees.map((w) => ({
      k: this.wkeyOf(rk, w.real), name: path.basename(w.path), branch: w.branch, detached: w.detached, sha: w.head.slice(0, 7), main: w.main, missing: w.missing,
      locked: w.locked, lockReason: w.lockReason, prunable: w.prunable, merged: w.merged, facts: w.facts, ws: this.ws.reals.has(w.real) || this.ws.paths.some((p) => path.resolve(p) === w.path),
      fks: fks.filter((k) => this.byKey.get(k)?.topReal === w.real),
    }));
    this.put(run, { type: 'repo', key: rk, state, reason, name: r.name, def: r.def ?? '', defLocal: r.defLocal ?? '', merged: r.merged, worktrees, ws: this.ws.commons.has(r.common) });
  }

  private wkeyOf(rk: string, real: string): string {
    const id = rk + '|' + real;
    let k = this.wmap.get(id);
    if (!k) { k = 'w' + ++this.n.w; this.wmap.set(id, k); this.wkeys.set(k, { rk, real }); }
    return k;
  }

  /** Run one folder (f key) or one repository's layer (r key) again, ignoring the cache; the page shows it as queued first. quiet skips the page states. */
  retry(key: string, quiet = false): void {
    const run = this.run;
    if (!run || run.ac.signal.aborted) { return; }
    const f = /^f\d+$/.test(key) ? this.byKey.get(key) : undefined;
    if (f) { if (!quiet) { this.postFolder(run, key, { state: 'queued' }); } run.unfinished.add(key); void this.runFolder(run, f, quiet); return; }
    const common = /^r\d+$/.test(key) ? this.repoCommon.get(key) : undefined;
    const st = run.repos.get(key);
    const top = common ? [...this.fkeys.values()].find((e) => e.out?.state === 'ok' && e.out.common === common)?.out?.top : undefined;
    if (!common || !st || !top) { return; }
    st.done = false;
    run.unfinished.add(key);
    this.put(run, { type: 'repo', key, state: 'running', name: this.repos.get(key)?.name, worktrees: [], merged: [] });
    run.repoChain = run.repoChain.then(() => this.runRepo(run, key, common, top, st, true));
  }

  /** The files a click resolves against: the folder key (or worktree key) the page names, never a path the page sent. */
  fileOf(key: string, i: number): { top: string; file: FileChange } | undefined {
    const t = this.targetOf(key);
    const file = t?.files[i];
    return t && file && Number.isInteger(i) ? { top: path.resolve(t.top), file } : undefined;
  }

  private targetOf(key: string): { top: string; files: FileChange[]; ahead: number } | undefined {
    const f = this.byKey.get(key);
    if (f?.out?.state === 'ok' && f.out.top) { return { top: f.out.top, files: f.out.files, ahead: f.out.ahead }; }
    const w = this.wkeys.get(key);
    const wt = w ? this.repos.get(w.rk)?.worktrees.find((x) => x.real === w.real) : undefined;
    return wt?.facts?.ok ? { top: wt.real, files: wt.facts.files, ahead: wt.facts.ahead } : undefined;
  }

  /** Unpushed commits of a folder or worktree (up to 20), asked when a row is opened; it uses the sidebar lane and ends within 10 s. */
  async commits(key: string): Promise<{ commits?: Array<{ sha: string; subject: string }>; reason?: string }> {
    const t = this.targetOf(key);
    if (!t) { return { reason: 'Git state is not loaded for this row' }; }
    if (!t.ahead) { return { commits: [] }; }
    const ac = new AbortController();
    this.details.add(ac);
    const timer = setTimeout(() => ac.abort(), DETAIL_MS);
    try {
      const ctx: Ctx = { exec: this.o.limiter.wrap(this.o.exec, 'ui'), signal: ac.signal, gitMs: this.gitMs, ghMs: this.gitMs, flags: { gitMissing: false } };
      const r = await unpushedOf(ctx, t.top);
      return typeof r === 'string' ? { reason: r } : { commits: r };
    } catch (e) { this.log('open work commits', e); return { reason: 'git error' }; }
    finally { clearTimeout(timer); this.details.delete(ac); }
  }

  /** The folder key of a chat's working folder, and the worktree the folder is in (for the copy-remove button). */
  removeText(key: string, win?: boolean): { text: string; name: string } | undefined {
    const w = this.wkeys.get(key);
    const r = w ? this.repos.get(w.rk) : undefined;
    const wt: WtOut | undefined = r?.worktrees.find((x) => x.real === w?.real);
    const text = r && wt ? removeCommand(r, wt, win) : '';
    return text && wt ? { text, name: path.basename(wt.path) } : undefined;
  }
}
