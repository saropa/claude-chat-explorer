/** Which chats relate to which worktree or branch of one repository, for the Project status page. Pure: it reads only the indexed chat facts
 *  (cwds, gitBranch values, created worktrees and branches, files, times; a decoded record only for the few chats a name check cannot rule out).
 *  Certain signals first: the chat ran in the worktree (cwd), its rows carry the branch (git-branch-field), a tool call created it
 *  (created-by-tool-call), or one of its subagents did either (subagent). Probable ones only for a row with no certain chat:
 *  the name in the chat text, files touched under the worktree, then the time window around the branch's creation. A row with nothing
 *  gets the nearest chat by time, so the page never shows an empty chat cell. */
import { gramsOf, mayHave } from './bloom';
import { Chat, Rec } from './types';

export interface RelSource { tops(): Chat[]; subsOf(p: Chat): Chat[]; rec(c: Chat): Rec; }
export interface RelWt { k: string; name: string; path: string; real: string; branch: string; main: boolean; detached: boolean; }
/** cr and ts are unix seconds: branch creation (0 when unknown) and the tip commit. */
export interface RelBr { n: string; cr: number; ts: number; }
export interface RelIn { ids: string[]; roots: string[]; wts: RelWt[]; brs: RelBr[]; def: string; }
/** One chat related to one row: why (reason code), conf, other reasons, a plain-language note, and for the nearest-by-time fallback the gap in ms (negative: the chat ended before the branch appeared). */
export interface RelHit { id: string; why: string; conf: 'certain' | 'probable'; more?: string[]; note?: string; near?: number; }
export interface RelOut { w: { [k: string]: RelHit[] }; b: { [n: string]: RelHit[] }; }

export const REL_WHY = ['cwd', 'git-branch-field', 'created-by-tool-call', 'subagent', 'name-in-text', 'files-touched', 'time-window'];
export const MAX_HITS = 30;
export const MAX_DECODE = 80; // decoded records per request (a name check that the bloom filter could not rule out)
const SLACK_MS = 10 * 60 * 1000;
const NAME_MIN = 8;

const norm = (p: string): string => { const s = p.replace(/\\/g, '/').replace(/\/+$/, ''); return /^[A-Za-z]:/.test(s) ? s.toLowerCase() : s; };
const baseOf = (p: string): string => { const s = p.replace(/\\/g, '/').replace(/\/+$/, ''); return s.slice(s.lastIndexOf('/') + 1); };
const within = (n: string, root: string): boolean => n === root || n.startsWith(root + '/');
const enc = (p: string): string => p.replace(/[^a-zA-Z0-9]/g, '-');

interface Sig { cwds: string[]; seen: Set<string>; made: Array<[string, string]>; }
interface Prof { c: Chat; own: Sig; subs: Array<{ c: Chat; s: Sig }>; inRepo: boolean; }
interface Acc { why: Set<string>; notes: string[]; }

const sigOf = (c: Chat): Sig => ({ cwds: (c.cwds ?? (c.cwd ? [c.cwd] : [])).map(norm), seen: new Set([...(c.seen ?? []), ...(c.git?.branches ?? [])]), made: c.made ?? [] });
const agentNote = (s: Chat, what: string): string => 'subagent ' + s.id.slice(0, 8) + (s.desc ? ' (' + s.desc.replace(/\s+/g, ' ').slice(0, 50) + ')' : '') + ' ' + what;

/** Where a target is: its worktree (cwd, folder name, agent id) and its branch. */
interface Spec { wt?: RelWt; branch: string; def: boolean; }

function addTo(m: Map<string, Acc>, id: string, why: string, note?: string): void {
  let a = m.get(id);
  if (!a) { a = { why: new Set(), notes: [] }; m.set(id, a); }
  a.why.add(why);
  if (note && a.notes.length < 3) { a.notes.push(note); }
}

class Matcher {
  private readonly lowered = new Map<string, string | null>();
  private decoded = 0;
  private profs: Prof[] = [];
  private readonly wtByK = new Map<string, RelWt>();
  private readonly paths: Array<{ n: string; k: string }> = [];
  private readonly roots: string[];

  constructor(private readonly ix: RelSource, private readonly i: RelIn) {
    this.roots = i.roots.map(norm);
    for (const w of i.wts) {
      this.wtByK.set(w.k, w);
      for (const p of new Set([norm(w.path), norm(w.real || w.path)])) { this.paths.push({ n: p, k: w.k }); }
    }
    this.paths.sort((a, b) => b.n.length - a.n.length); // the deepest worktree owns a folder: an agent worktree sits inside the main checkout
    const want = new Set(i.ids);
    this.profs = ix.tops().filter((c) => want.has(c.id)).map((c) => this.profOf(c));
    this.profs.sort((a, b) => b.c.last - a.c.last);
  }

  private ownerOf(cwd: string): string | undefined { return this.paths.find((p) => within(cwd, p.n))?.k; }
  private inRepoCwd(cwd: string): boolean { return !!this.ownerOf(cwd) || this.roots.some((r) => within(cwd, r)); }

  private profOf(c: Chat): Prof {
    const own = sigOf(c), subs = this.ix.subsOf(c).map((s) => ({ c: s, s: sigOf(s) }));
    const dirs = new Set(this.roots.concat(this.i.wts.map((w) => norm(w.path))).map(enc));
    const inRepo = [own, ...subs.map((x) => x.s)].some((s) => s.cwds.some((d) => this.inRepoCwd(d))) || [c, ...subs.map((x) => x.c)].some((x) => dirs.has(x.dir));
    return { c, own, subs, inRepo };
  }

  /** Certain reasons of one chat for one target: [reason, note]. */
  private certain(p: Prof, t: Spec): Array<[string, string | undefined]> {
    const out: Array<[string, string | undefined]> = [];
    const w = t.wt;
    if (w) {
      if (p.own.cwds.some((d) => this.ownerOf(d) === w.k)) { out.push(['cwd', 'the chat ran in ' + w.name]); }
      for (const s of p.subs) { if (s.s.cwds.some((d) => this.ownerOf(d) === w.k)) { out.push(['subagent', agentNote(s.c, 'ran in ' + w.name)]); } }
      const agent = /^agent-(.+)$/.exec(w.name);
      if (agent) { for (const s of p.subs) { if (s.c.id === agent[1]) { out.push(['subagent', agentNote(s.c, 'owns this worktree (agent id in its name)')]); } } }
      if (!w.main) {
        if (p.own.made.some((m) => m[0] === 'w' && baseOf(m[1]) === w.name)) { out.push(['created-by-tool-call', 'the chat ran git worktree add for ' + w.name]); }
        for (const s of p.subs) { if (s.s.made.some((m) => m[0] === 'w' && baseOf(m[1]) === w.name)) { out.push(['subagent', agentNote(s.c, 'created ' + w.name)]); } }
      }
    }
    const b = t.branch;
    if (b && (!t.def || !w)) { // the default branch is told by its worktree; with none checked out, by the branch field
      if (p.own.seen.has(b)) { out.push(['git-branch-field', 'its rows record branch ' + b]); }
      if (p.own.made.some((m) => m[0] === 'b' && m[1] === b)) { out.push(['created-by-tool-call', 'the chat created branch ' + b]); }
      for (const s of p.subs) {
        if (s.s.made.some((m) => m[0] === 'b' && m[1] === b)) { out.push(['subagent', agentNote(s.c, 'created branch ' + b)]); }
        else if (s.s.seen.has(b)) { out.push(['subagent', agentNote(s.c, 'worked on branch ' + b)]); }
      }
      const agent = /(?:^|[\/-])agent-([0-9a-f]+)$/.exec(b);
      if (agent) { for (const s of p.subs) { if (s.c.id === agent[1]) { out.push(['subagent', agentNote(s.c, 'owns this branch (agent id in its name)')]); } } }
    }
    return out;
  }

  private lowerText(c: Chat): string | null {
    const hit = this.lowered.get(c.rec);
    if (hit !== undefined) { return hit; }
    if (this.decoded >= MAX_DECODE) { return null; }
    this.decoded++;
    let t: string | null = null;
    try { const r = this.ix.rec(c); t = (r.text + '\n' + r.cmds.join('\n')).toLowerCase(); } catch { t = null; }
    this.lowered.set(c.rec, t);
    return t;
  }

  /** True when the lowercase token is in the chat or one of its subagents (the bloom filter first, the decoded record only when it cannot rule it out). */
  private mentions(p: Prof, tok: string): boolean {
    const g = gramsOf(tok);
    for (const c of [p.c, ...p.subs.map((s) => s.c)]) {
      if (!mayHave(c.bloom, g)) { continue; }
      const t = this.lowerText(c);
      if (t && t.includes(tok)) { return true; }
    }
    return false;
  }

  private touched(p: Prof, w: RelWt): boolean {
    const seg = '/' + w.name.toLowerCase() + '/';
    return [p.c, ...p.subs.map((s) => s.c)].some((c) => c.files.some((f) => ('/' + f.path.replace(/\\/g, '/').toLowerCase()).includes(seg)));
  }

  private target(t: Spec): RelHit[] {
    const acc = new Map<string, Acc>();
    for (const p of this.profs) { for (const [why, note] of this.certain(p, t)) { addTo(acc, p.c.id, why, note); } }
    if (acc.size) { return this.finish(acc, 'certain'); }
    if (!t.wt && !t.branch) { return []; }
    const w = t.wt, names = [t.branch, w?.name ?? ''].filter((n) => n.length >= NAME_MIN && /[-_\/]/.test(n)).map((n) => n.toLowerCase());
    for (const p of this.profs) {
      if (!p.inRepo) { continue; }
      if (w && !w.main && this.touched(p, w)) { addTo(acc, p.c.id, 'files-touched', 'it read or edited files under ' + w.name); }
      const hit = names.find((n) => this.mentions(p, n));
      if (hit) { addTo(acc, p.c.id, 'name-in-text', 'the chat mentions "' + hit + '"'); }
    }
    if (acc.size) { return this.finish(acc, 'probable'); }
    return this.byTime(t);
  }

  private timeOf(t: Spec): { at: number; end: number } | undefined {
    const b = this.i.brs.find((x) => x.n === t.branch);
    if (!b || !(b.ts > 0 || b.cr > 0)) { return undefined; }
    const at = (b.cr > 0 ? b.cr : b.ts - 3600) * 1000, end = Math.max(at + SLACK_MS, (b.ts > 0 ? b.ts : b.cr) * 1000 + SLACK_MS);
    return { at, end };
  }

  /** Chats active while the branch was made and worked on; when none, the one nearest in time (flagged with the gap). */
  private byTime(t: Spec): RelHit[] {
    const tm = this.timeOf(t);
    if (!tm) { return []; }
    const rows = this.profs.filter((p) => p.inRepo).map((p) => {
      const first = p.c.first || p.c.last, last = p.c.last;
      const gap = last < tm.at ? last - tm.at : first > tm.end ? first - tm.end : 0;
      return { p, gap, covers: first <= tm.at && last >= tm.at, span: Math.max(1, last - first) };
    });
    const inWin = rows.filter((r) => r.gap === 0 || (r.gap < 0 && -r.gap <= SLACK_MS) || (r.gap > 0 && r.gap <= SLACK_MS));
    if (inWin.length) {
      inWin.sort((a, b) => Number(b.covers) - Number(a.covers) || a.span - b.span);
      return inWin.slice(0, 3).map((r) => ({ id: r.p.c.id, why: 'time-window', conf: 'probable' as const, note: 'the chat was active when the branch was made and worked on' }));
    }
    rows.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
    const n = rows[0];
    return n ? [{ id: n.p.c.id, why: 'time-window', conf: 'probable', near: n.gap, note: 'nearest chat by time' }] : [];
  }

  private finish(acc: Map<string, Acc>, conf: 'certain' | 'probable'): RelHit[] {
    const last = new Map(this.profs.map((p) => [p.c.id, p.c.last] as const));
    const rank = (w: string): number => { const r = REL_WHY.indexOf(w); return r < 0 ? 99 : r; };
    const hits = [...acc].map(([id, a]): RelHit => {
      const ws = [...a.why].sort((x, y) => rank(x) - rank(y));
      return { id, why: ws[0], conf, ...(ws.length > 1 ? { more: ws.slice(1) } : {}), ...(a.notes.length ? { note: a.notes[0] } : {}) };
    });
    hits.sort((a, b) => (last.get(b.id) ?? 0) - (last.get(a.id) ?? 0));
    return hits.slice(0, MAX_HITS);
  }

  run(): RelOut {
    const out: RelOut = { w: {}, b: {} };
    const def = this.i.def;
    const wtOf = (n: string): RelWt | undefined => this.i.wts.find((w) => !w.detached && w.branch === n);
    for (const w of this.i.wts) { out.w[w.k] = this.target({ wt: w, branch: w.detached ? '' : w.branch, def: !!def && w.branch === def }); }
    const names = new Set<string>([...this.i.brs.map((b) => b.n), ...this.i.wts.filter((w) => !w.detached && w.branch).map((w) => w.branch)]);
    for (const n of names) {
      const w = wtOf(n);
      out.b[n] = this.target({ wt: w, branch: n, def: !!def && n === def });
    }
    return out;
  }
}

/** Chats related to every worktree and branch of one repository. ids are the chats in scope (the page's rows). */
export function relOf(ix: RelSource, i: RelIn): RelOut { return new Matcher(ix, i).run(); }

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** A request body checked and capped (at most 2000 chats, 60 worktrees, 3000 branches); undefined when it has no worktrees. */
export function relInOf(m: any): RelIn | undefined {
  if (!m || !Array.isArray(m.wts) || !m.wts.length) { return undefined; }
  const list = (a: unknown, n: number): any[] => (Array.isArray(a) ? a.slice(0, n) : []);
  return {
    ids: list(m.ids, 2000).filter((x) => typeof x === 'string'),
    roots: list(m.roots, 4).map((x) => str(x)).filter(Boolean),
    wts: list(m.wts, 60).filter((w) => w && typeof w.k === 'string').map((w): RelWt => ({ k: str(w.k, 20), name: str(w.name, 200), path: str(w.path), real: str(w.real), branch: str(w.branch, 250), main: w.main === true, detached: w.detached === true })),
    brs: list(m.brs, 3000).filter((b) => b && typeof b.n === 'string').map((b): RelBr => ({ n: str(b.n, 250), cr: num(b.cr), ts: num(b.ts) })),
    def: str(m.def, 250),
  };
}
