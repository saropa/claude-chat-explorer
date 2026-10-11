/** Open Work pull request layer: per repository, one list call (shared with the sidebar through the PR cache), then one
 *  `gh pr view <n>` per matched pull request, one at a time. Read-only: every command goes through wipGit's allow-list.
 *  Streams `prs` and `checks` messages; never blocks the git facts. Pure node (no vscode import). */
import { Limiter } from './execLimit';
import { Exec } from './wipExec';
import { CHECKS_FIELDS, Ctx, gh, isPrNumber } from './wipGit';
import { cleanTitle, fetchAuth, GhAuth, ghReason, PrCache, reviewWord } from './wipPrs';
import { PrInfo } from './wipTypes';

export const CHECKS_CACHE_MS = 2 * 60 * 1000;
export const PR_LAYER_MS = 20000; // per repository: the time its own gh commands may run
export const GH_MS = 8000;
export const MAX_NAMES = 5;
export const AUTH_CACHE_MS = 60 * 1000;
const QUEUE_GRACE_MS = 60000;
const NAME_MAX = 80;

export type CheckState = 'passing' | 'failing' | 'pending' | 'none';
/** The checks of one pull request rolled up: counts and the names of up to five failing checks (plain text). */
export interface CheckRoll { state: CheckState; total: number; failing: number; pending: number; names: string[]; }

const FAIL_CONCLUSIONS = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const FAIL_STATES = new Set(['FAILURE', 'ERROR']);
const PEND_STATES = new Set(['PENDING', 'EXPECTED']);
const up = (v: unknown): string => (typeof v === 'string' ? v.toUpperCase() : '');
const nameOf = (v: unknown): string => cleanTitle(String(v ?? '')).slice(0, NAME_MAX);

/** Roll up `statusCheckRollup`: CheckRun items (status, conclusion) and StatusContext items (state). An empty or missing list is none. */
export function rollupChecks(items: unknown): CheckRoll {
  const list = Array.isArray(items) ? items : [];
  let failing = 0, pending = 0, total = 0;
  const names: string[] = [];
  for (const x of list as Array<{ [k: string]: unknown }>) {
    if (!x || typeof x !== 'object') { continue; }
    total++;
    const isCtx = typeof x.state === 'string' && x.status === undefined;
    const bad = isCtx ? FAIL_STATES.has(up(x.state)) : up(x.status) === 'COMPLETED' && FAIL_CONCLUSIONS.has(up(x.conclusion));
    const wait = !bad && (isCtx ? PEND_STATES.has(up(x.state)) : up(x.status) !== 'COMPLETED');
    if (bad) { failing++; if (names.length < MAX_NAMES) { names.push(nameOf(isCtx ? x.context : x.name) || 'unnamed check'); } }
    else if (wait) { pending++; }
  }
  const state: CheckState = failing > 0 ? 'failing' : pending > 0 ? 'pending' : total > 0 ? 'passing' : 'none';
  return { state, total, failing, pending, names };
}

/** The roll-up and head commit from the JSON of `gh pr view --json statusCheckRollup,headRefOid`; undefined when it is not the expected shape. */
export function parseView(stdout: string): { roll: CheckRoll; sha?: string } | undefined {
  let v: { [k: string]: unknown } | null;
  try { v = JSON.parse(stdout); } catch { return undefined; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) { return undefined; }
  if (v.statusCheckRollup !== null && v.statusCheckRollup !== undefined && !Array.isArray(v.statusCheckRollup)) { return undefined; }
  return { roll: rollupChecks(v.statusCheckRollup), sha: typeof v.headRefOid === 'string' ? v.headRefOid : undefined };
}

/** One check lookup: the roll-up, or the short reason it is unavailable. */
export async function fetchChecks(c: Ctx, cwd: string, n: number): Promise<CheckRoll | string> {
  const r = await gh(c, cwd, ['pr', 'view', String(n), '--json', CHECKS_FIELDS]);
  if (r.code !== 0) { return ghReason(r); }
  const v = parseView(r.stdout);
  return v ? v.roll : 'unreadable gh answer';
}

export interface PrOpts {
  exec: Exec; limiter: Limiter; cache: PrCache; ghMs?: number; deadlineMs?: number; now?: () => number; log?: (where: string, e: unknown) => void;
}
export interface PrHost { post: (m: object) => void; signal: AbortSignal; force: boolean; changed: () => void; }
interface St {
  rk: string; common: string; cwd: string; branches: Set<string>; by?: Map<string, PrInfo>; final: Set<number>;
  chain: Promise<void>; done: boolean; failed: boolean; force: boolean; sent: string;
}
interface Lane { ctx: Ctx; late: Promise<'late'>; timedOut: () => boolean; stop: () => void; }

/** Keys: the page names a repository's pull request layer `p<n>` for repository `r<n>`. */
export const prKey = (rk: string): string => 'p' + rk.slice(1);

/** The pull request layer for all scans: it owns the check cache and the pull request links the page asks to open. */
export class WorkPrs {
  private readonly checks = new Map<string, { at: number; r: CheckRoll }>();
  private readonly urls = new Map<string, Map<number, string>>();
  private auth?: { at: number; p: Promise<GhAuth>; done: boolean };

  constructor(readonly o: PrOpts) {}

  /** The https link of a pull request listed in the last answer for a repository key; never a link the page sent. */
  url(rk: string, n: number): string | undefined { return this.urls.get(rk)?.get(n); }

  /** `gh auth status`, kept 60 seconds (a forced scan asks again; a failure to ask, such as a timeout, is never kept). */
  authStatus(c: Ctx, cwd: string, force: boolean, now: number): Promise<GhAuth> {
    const a = this.auth;
    if (a && !force && now - a.at < AUTH_CACHE_MS) { return a.p; }
    const e = { at: now, done: false, p: fetchAuth(c, cwd).then((r) => { e.done = true; if (r.state === 'error' && this.auth === e) { this.auth = undefined; } return r; }) };
    this.auth = e;
    return e.p;
  }

  begin(h: PrHost): PrRun { return new PrRun(this, h); }

  /** Lookup of one check result in the 2 minute cache, keyed by repository, pull request number and head commit. */
  cached(key: string, now: number): CheckRoll | undefined {
    const hit = this.checks.get(key);
    return hit && now - hit.at < CHECKS_CACHE_MS ? hit.r : undefined;
  }
  keep(key: string, r: CheckRoll, now: number): void { this.checks.set(key, { at: now, r }); if (this.checks.size > 2000) { this.checks.delete(this.checks.keys().next().value as string); } }
  setUrls(rk: string, by: Map<string, PrInfo>): void {
    const m = new Map<number, string>();
    for (const p of by.values()) { if (p.url) { m.set(p.number, p.url); } }
    this.urls.set(rk, m);
  }
}

/** One scan's pull request work. */
export class PrRun {
  private readonly repos = new Map<string, St>();
  private authP?: Promise<void>;

  constructor(private readonly w: WorkPrs, private readonly h: PrHost) {}

  private get now(): number { return (this.w.o.now ?? Date.now)(); }
  private get deadline(): number { return this.w.o.deadlineMs ?? PR_LAYER_MS; }
  private put(m: object): void { if (!this.h.signal.aborted) { this.h.post(m); } }

  /** Repositories with a final pull request state, and all repositories seen so far (the page's counter). */
  progress(): { done: number; total: number } { return { done: [...this.repos.values()].filter((s) => s.done).length, total: this.repos.size }; }
  /** Page keys of layers without a final state. */
  open(): string[] { return [...this.repos.values()].filter((s) => !s.done).map((s) => prKey(s.rk)); }

  /** The first repository starts the one `gh auth status` check of this scan; its answer is posted as a `gh` message. */
  private checkAuth(cwd: string): void {
    const ms = this.w.o.ghMs ?? GH_MS;
    const exec = this.w.o.limiter.wrap(this.w.o.exec, 'bg');
    const ctx: Ctx = { exec, ghExec: exec, signal: this.h.signal, gitMs: ms, ghMs: ms, flags: { gitMissing: false } };
    this.authP = this.w.authStatus(ctx, cwd, this.h.force, this.now).then((r) => { this.put({ type: 'gh', state: r.state, reason: r.reason }); }).catch((e) => this.w.o.log?.('open work gh auth', e));
  }

  /** A folder of repository rk ended on a branch (or none): start the layer the first time, and match that branch. */
  join(rk: string, common: string, cwd: string, branch?: string): void {
    let st = this.repos.get(rk);
    if (!st) {
      if (!this.authP) { this.checkAuth(cwd); }
      st = { rk, common, cwd, branches: new Set(), final: new Set(), chain: Promise.resolve(), done: false, failed: false, force: this.h.force, sent: '' };
      this.repos.set(rk, st);
      this.put({ type: 'prs', repo: rk, state: 'queued' });
      this.h.changed();
    }
    this.addBranches(rk, branch ? [branch] : []);
  }

  /** More branches in scope (worktrees found by the repository layer): match them too. */
  addBranches(rk: string, branches: string[]): void {
    const st = this.repos.get(rk);
    if (!st) { return; }
    for (const b of branches) { if (b) { st.branches.add(b); } }
    this.kick(st);
  }

  /** Run one repository's layer again, ignoring both caches. */
  retry(rk: string): void {
    const st = this.repos.get(rk);
    if (!st || this.h.signal.aborted) { return; }
    st.by = undefined; st.failed = false; st.force = true; st.sent = ''; st.final.clear(); st.done = false;
    this.put({ type: 'prs', repo: rk, state: 'queued' });
    this.h.changed();
    this.kick(st);
  }

  /** Resolves when every repository's work, including work queued while waiting, has ended. */
  async settled(): Promise<void> {
    await this.authP;
    for (;;) {
      const snap = [...this.repos.values()].map((s) => [s, s.chain] as const);
      await Promise.all(snap.map(([, c]) => c));
      if (snap.every(([s, c]) => s.chain === c) && snap.length === this.repos.size) { return; }
    }
  }

  private kick(st: St): void { st.chain = st.chain.then(() => this.work(st)).catch((e) => this.w.o.log?.('open work pull requests', e)); }

  /** A gh lane for one repository. Its deadline counts only the time its own gh commands run (never the wait for a slot in the global gh limiter), so a long queue
   *  cannot time out a repository that has barely started; a lane that never got a slot at all ends after the deadline plus a long grace. */
  private lane(st: St): Lane {
    const ac = new AbortController();
    const onAbort = (): void => ac.abort();
    this.h.signal.addEventListener('abort', onAbort, { once: true });
    let timer: NodeJS.Timeout | undefined, timedOut = false, started = false, spent = 0, since = 0, fire: () => void = () => undefined;
    const late = new Promise<'late'>((res) => { fire = () => res('late'); });
    const expire = (): void => { timedOut = true; ac.abort(); fire(); };
    const limited = this.w.o.limiter.wrap(this.w.o.exec, 'bg', () => {
      if (!started) { started = true; this.put({ type: 'prs', repo: st.rk, state: 'checking' }); }
      since = this.now;
      clearTimeout(timer);
      timer = setTimeout(expire, Math.max(0, this.deadline - spent));
    });
    const exec: Exec = (cmd, args, o) => limited(cmd, args, o).finally(() => { if (since) { spent += this.now - since; since = 0; } clearTimeout(timer); });
    const guard = setTimeout(() => { if (!started) { expire(); } }, this.deadline + QUEUE_GRACE_MS);
    const ms = this.w.o.ghMs ?? GH_MS;
    const ctx: Ctx = { exec, ghExec: exec, signal: ac.signal, gitMs: ms, ghMs: ms, flags: { gitMissing: false } };
    return { ctx, late, timedOut: () => timedOut, stop: () => { clearTimeout(timer); clearTimeout(guard); this.h.signal.removeEventListener('abort', onAbort); } };
  }

  private matched(st: St): Array<[string, PrInfo]> {
    const out: Array<[string, PrInfo]> = [];
    for (const b of st.branches) { const p = st.by?.get(b); if (p && isPrNumber(p.number)) { out.push([b, p]); } } // a number gh would never print is skipped, never fails the repository
    return out;
  }
  private todo(st: St): Array<[string, PrInfo]> { return this.matched(st).filter(([, p]) => !st.final.has(p.number)); }

  private finish(st: St): void {
    st.force = false; // the forced first run is over; later work may use the caches
    if (!st.done) { st.done = true; this.h.changed(); }
  }

  private async work(st: St): Promise<void> {
    if (this.h.signal.aborted || st.failed || (st.by && !this.todo(st).length)) { if (st.by && !st.failed) { this.finish(st); } return; }
    const lane = this.lane(st);
    try {
      if (!st.by && !(await this.list(st, lane))) { return; }
      await this.lookups(st, lane);
    } catch (e) {
      this.w.o.log?.('open work pull request layer', e);
      if (!this.h.signal.aborted) { this.fail(st, 'gh failed'); }
    } finally { lane.stop(); }
    if (!this.h.signal.aborted && st.by) { this.finish(st); }
  }

  private fail(st: St, reason: string): void {
    st.failed = true;
    this.put({ type: 'prs', repo: st.rk, state: 'unavailable', reason });
    this.finish(st);
  }

  /** The list step through the shared cache; false when it ended without a list. */
  private async list(st: St, lane: Lane): Promise<boolean> {
    const r = await Promise.race([this.w.o.cache.get(lane.ctx, st.common, st.cwd, st.force, this.now), lane.late]);
    if (this.h.signal.aborted) { return false; }
    if (r === 'late' || lane.timedOut()) { this.fail(st, 'timed out'); return false; }
    if (r.error) { this.fail(st, r.error); return false; }
    st.by = r.own ?? r.byBranch; // PRs from other owners never match a branch here
    this.w.setUrls(st.rk, st.by);
    return true;
  }

  /** Post the matched pull requests, then look up each one's checks, one at a time, until done or the layer deadline. */
  private async lookups(st: St, lane: Lane): Promise<void> {
    this.postList(st);
    const todo = this.todo(st);
    for (const [, p] of todo) { this.put({ type: 'checks', repo: st.rk, n: p.number, state: 'checking' }); }
    for (const [, p] of todo) {
      if (this.h.signal.aborted) { return; }
      const r = lane.timedOut() ? 'timed out' : await this.one(st, lane, p);
      if (this.h.signal.aborted) { return; }
      if (typeof r === 'string') { this.put({ type: 'checks', repo: st.rk, n: p.number, state: 'unavailable', reason: r }); }
      else { this.put({ type: 'checks', repo: st.rk, n: p.number, state: r.state, total: r.total, failing: r.failing, pending: r.pending, names: r.names }); }
      st.final.add(p.number);
    }
  }

  private postList(st: St): void {
    const by: { [b: string]: object } = {};
    for (const [b, p] of this.matched(st)) { by[b] = { n: p.number, title: p.title, draft: p.draft, review: reviewWord(p.review), link: !!p.url }; }
    const sig = JSON.stringify(by);
    if (sig !== st.sent) { st.sent = sig; this.put({ type: 'prs', repo: st.rk, state: 'ok', by }); }
  }

  /** One checks lookup: the 2 minute cache first (keyed by head commit), then gh view, raced against the layer deadline. */
  private async one(st: St, lane: Lane, p: PrInfo): Promise<CheckRoll | string> {
    const key = st.common + '|' + p.number + '|' + (p.sha ?? 'unknown');
    const hit = st.force ? undefined : this.w.cached(key, this.now);
    if (hit) { return hit; }
    const r = await Promise.race([fetchChecks(lane.ctx, st.cwd, p.number), lane.late]);
    if (r === 'late') { return 'timed out'; }
    if (typeof r !== 'string') { this.w.keep(key, r, this.now); }
    return r;
  }
}
