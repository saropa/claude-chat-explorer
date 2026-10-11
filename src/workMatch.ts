/** Which chats relate to which worktree or branch of one repository, for the Project status page. Pure: it reads only the indexed chat facts
 *  (cwds, gitBranch values, created worktrees and branches, files, times; a decoded record only for the few chats a name check cannot rule out).
 *  Certain signals first (then the probable ones, for every row): the chat ran in the worktree (cwd), its rows carry the branch (git-branch-field), a tool call created it
 *  (created-by-tool-call), or one of its subagents did either (subagent). Probable ones:
 *  files touched under the worktree, then the time window around the branch's creation; the name in the agent's text of a chat of this repository counts only when no
 *  chat created the row. A chat that only contains the name (a creator exists, it is another repository's chat, or only the owner's question has it) is a "mention" (conf
 *  'mention'), listed last and collapsed by the page. A row with nothing gets the nearest chat by time, so the page never shows an empty chat cell. */
import { gramsOf, mayHave } from './bloom';
import { startOf } from './blob';
import { Chat, Receipt, Rec } from './types';

export interface RelSource { tops(): Chat[]; subsOf(p: Chat): Chat[]; rec(c: Chat): Rec; }
export interface RelWt { k: string; name: string; path: string; real: string; branch: string; main: boolean; detached: boolean; }
/** cr and ts are unix seconds: branch creation (0 when unknown) and the tip commit. */
export interface RelBr { n: string; cr: number; ts: number; }
export interface RelIn { ids: string[]; roots: string[]; wts: RelWt[]; brs: RelBr[]; def: string; }
/** One chat related to one row: why (reason code), conf, other reasons, a plain-language note, and for the nearest-by-time fallback the gap in ms (negative: the chat ended before the branch appeared).
 *  cr: a tool call of the chat or of one of its subagents created the worktree or branch (the creator). conf 'mention': the chat only contains the name; the page lists these after the rest, collapsed. */
/** The receipt of a creating tool call with where it is: s the session id, f the transcript path relative to the projects folder, a the subagent id when a subagent ran it. */
export interface Proof extends Receipt { s: string; f: string; a?: string; }
export const MAX_PROOFS = 4;
export interface RelHit { id: string; why: string; conf: 'certain' | 'probable' | 'mention'; cr?: boolean; rc?: Proof[]; more?: string[]; note?: string; near?: number; }
export interface RelOut { w: { [k: string]: RelHit[] }; b: { [n: string]: RelHit[] }; }

export const REL_WHY = ['cwd', 'git-branch-field', 'created-by-tool-call', 'subagent', 'name-in-text', 'files-touched', 'time-window'];
export const MAX_HITS = 30;
export const MAX_MENTIONS = 20;
export const MAX_DECODE = 80; // decoded records per request (a name check that the bloom filter could not rule out)
const SLACK_MS = 10 * 60 * 1000;
const NAME_MIN = 8;

const norm = (p: string): string => { const s = p.replace(/\\/g, '/').replace(/\/+$/, ''); return /^[A-Za-z]:/.test(s) ? s.toLowerCase() : s; };
const baseOf = (p: string): string => { const s = p.replace(/\\/g, '/').replace(/\/+$/, ''); return s.slice(s.lastIndexOf('/') + 1); };
const within = (n: string, root: string): boolean => n === root || n.startsWith(root + '/');
const enc = (p: string): string => p.replace(/[^a-zA-Z0-9]/g, '-');

interface Sig { cwds: string[]; seen: Set<string>; made: Array<[string, string, Receipt?]>; }
interface Prof { c: Chat; own: Sig; subs: Array<{ c: Chat; s: Sig }>; inRepo: boolean; }
interface Acc { why: Set<string>; notes: string[]; cr: boolean; rc: Proof[]; }

const sigOf = (c: Chat): Sig => ({ cwds: (c.cwds ?? (c.cwd ? [c.cwd] : [])).map(norm), seen: new Set([...(c.seen ?? []), ...(c.git?.branches ?? [])]), made: c.made ?? [] });
const agentNote = (s: Chat, what: string): string => 'subagent ' + s.id.slice(0, 8) + (s.desc ? ' (' + s.desc.replace(/\s+/g, ' ').slice(0, 50) + ')' : '') + ' ' + what;

/** Where a target is: its worktree (cwd, folder name, agent id) and its branch. */
interface Spec { wt?: RelWt; branch: string; def: boolean; }

/** The transcript of a chat relative to the projects folder (a subagent file sits under its parent session). */
export const transcriptOf = (c: Chat): string => (c.parent ? c.dir + '/' + c.parent + '/subagents/agent-' + c.id + '.jsonl' : c.dir + '/' + c.id + '.jsonl');
const proofOf = (c: Chat, m: [string, string, Receipt?]): Proof[] => (m[2] ? [{ ...m[2], s: c.parent ?? c.id, f: transcriptOf(c), ...(c.parent ? { a: c.id } : {}) }] : []);

function addTo(m: Map<string, Acc>, id: string, why: string, note?: string, cr = false, rc: Proof[] = []): void {
  let a = m.get(id);
  if (!a) { a = { why: new Set(), notes: [], cr: false, rc: [] }; m.set(id, a); }
  a.why.add(why);
  if (cr) { a.cr = true; }
  for (const p of rc) { if (a.rc.length < MAX_PROOFS && !a.rc.some((x) => x.u === p.u && x.f === p.f && x.c === p.c)) { a.rc.push(p); } }
  if (note && a.notes.length < 3) { a.notes.push(note); }
}

class Matcher {
  private readonly lowered = new Map<string, { all: string; agent: string } | null>();
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
  private certain(p: Prof, t: Spec): Array<[string, string | undefined, boolean, Proof[]?]> {
    const out: Array<[string, string | undefined, boolean, Proof[]?]> = [];
    const w = t.wt;
    if (w) {
      if (p.own.cwds.some((d) => this.ownerOf(d) === w.k)) { out.push(['cwd', 'the chat ran in ' + w.name, false]); }
      for (const s of p.subs) { if (s.s.cwds.some((d) => this.ownerOf(d) === w.k)) { out.push(['subagent', agentNote(s.c, 'ran in ' + w.name), false]); } }
      const agent = /^agent-(.+)$/.exec(w.name);
      if (agent) { for (const s of p.subs) { if (s.c.id === agent[1]) { out.push(['subagent', agentNote(s.c, 'owns this worktree (agent id in its name)'), false]); } } }
      if (!w.main) {
        const mw = p.own.made.filter((m) => m[0] === 'w' && baseOf(m[1]) === w.name);
        if (mw.length) { out.push(['created-by-tool-call', 'the chat ran git worktree add for ' + w.name, true, mw.flatMap((m) => proofOf(p.c, m))]); }
        for (const s of p.subs) {
          const sw = s.s.made.filter((m) => m[0] === 'w' && baseOf(m[1]) === w.name);
          if (sw.length) { out.push(['subagent', agentNote(s.c, 'created ' + w.name), true, sw.flatMap((m) => proofOf(s.c, m))]); }
          else if (s.s.made.some((m) => m[0] === 'i' && baseOf(m[1]) === w.name)) { out.push(['subagent', agentNote(s.c, 'was told to create ' + w.name), true]); }
        }
      }
    }
    const b = t.branch;
    if (b && (!t.def || !w)) { // the default branch is told by its worktree; with none checked out, by the branch field
      if (p.own.seen.has(b)) { out.push(['git-branch-field', 'its rows record branch ' + b, false]); }
      const mb = p.own.made.filter((m) => m[0] === 'b' && m[1] === b);
      if (mb.length) { out.push(['created-by-tool-call', 'the chat created branch ' + b, true, mb.flatMap((m) => proofOf(p.c, m))]); }
      for (const s of p.subs) {
        const sb = s.s.made.filter((m) => m[0] === 'b' && m[1] === b);
        if (sb.length) { out.push(['subagent', agentNote(s.c, 'created branch ' + b), true, sb.flatMap((m) => proofOf(s.c, m))]); }
        else if (s.s.seen.has(b)) { out.push(['subagent', agentNote(s.c, 'worked on branch ' + b), false]); }
      }
      const agent = /(?:^|[\/-])agent-([0-9a-f]+)$/.exec(b);
      if (agent) { for (const s of p.subs) { if (s.c.id === agent[1]) { out.push(['subagent', agentNote(s.c, 'owns this branch (agent id in its name)'), false]); } } }
    }
    return out;
  }

  /** The lowercase text of one chat record: everything, and what the agent side said (the owner's own messages left out; a subagent has no owner messages). */
  private lowerText(c: Chat): { all: string; agent: string } | null {
    const hit = this.lowered.get(c.rec);
    if (hit !== undefined) { return hit; }
    if (this.decoded >= MAX_DECODE) { return null; }
    this.decoded++;
    let t: { all: string; agent: string } | null = null;
    try {
      const r = this.ix.rec(c), cmds = r.cmds.join('\n');
      const all = (r.text + '\n' + cmds).toLowerCase();
      let agent = all;
      if (!c.parent && r.roles?.length > 0 && r.roles.length === r.ends?.length) {
        const parts: string[] = [];
        for (let i = 0; i < r.roles.length; i++) { if (r.roles[i] !== 0) { parts.push(r.text.slice(startOf(r, i), r.ends[i])); } }
        agent = (parts.join('\n') + '\n' + cmds).toLowerCase();
      }
      t = { all, agent };
    } catch { t = null; }
    this.lowered.set(c.rec, t);
    return t;
  }

  /** Where the lowercase token is in the chat or one of its subagents: 'agent' (the agent side, or a command, says it), 'user' (only the owner's own messages) or '' (nowhere).
   *  The bloom filter rules a chat out first; the decoded record is read only when it cannot. */
  private mentions(p: Prof, tok: string): 'agent' | 'user' | '' {
    const g = gramsOf(tok);
    let found: 'user' | '' = '';
    for (const c of [p.c, ...p.subs.map((s) => s.c)]) {
      if (!mayHave(c.bloom, g)) { continue; }
      const t = this.lowerText(c);
      if (!t) { continue; }
      if (t.agent.includes(tok)) { return 'agent'; }
      if (t.all.includes(tok)) { found = 'user'; }
    }
    return found;
  }

  private touched(p: Prof, w: RelWt): boolean {
    const seg = '/' + w.name.toLowerCase() + '/';
    return [p.c, ...p.subs.map((s) => s.c)].some((c) => c.files.some((f) => ('/' + f.path.replace(/\\/g, '/').toLowerCase()).includes(seg)));
  }

  private target(t: Spec): RelHit[] {
    const acc = new Map<string, Acc>();
    for (const p of this.profs) { for (const [why, note, cr, rc] of this.certain(p, t)) { addTo(acc, p.c.id, why, note, cr, rc); } }
    const sure = acc.size ? this.finish(acc, 'certain') : [];
    if (!t.wt && !t.branch) { return sure; }
    const creator = sure.some((h) => h.cr);
    // A chat that only holds the name is a mention. With a creator on the row (a tool call made the worktree or branch), every such chat is mention only. Without one, the
    // best of them (the agent side of a chat in this repository said the name) are probable; a chat of another repository, or one whose only hits are the owner's own
    // question, is mention only at best.
    const prob = new Map<string, Acc>(), men = new Map<string, Acc>();
    const w = t.wt, names = [t.branch, w?.name ?? ''].filter((n) => n.length >= NAME_MIN && /[-_\/]/.test(n)).map((n) => n.toLowerCase());
    for (const p of this.profs) {
      if (acc.has(p.c.id)) { continue; }
      if (p.inRepo && w && !w.main && this.touched(p, w)) { addTo(prob, p.c.id, 'files-touched', 'it read or edited files under ' + w.name); continue; }
      let hit = '', where: 'agent' | 'user' | '' = '';
      for (const n of names) { const r = this.mentions(p, n); if (r && (!where || r === 'agent')) { hit = n; where = r; } if (where === 'agent') { break; } }
      if (!where) { continue; }
      if (p.inRepo && where === 'agent' && !creator) { addTo(prob, p.c.id, 'name-in-text', 'the chat mentions "' + hit + '"'); }
      else { addTo(men, p.c.id, 'name-in-text', (p.inRepo ? (where === 'user' ? 'only the question names "' : 'the chat only mentions "') : 'a chat of another repository names "') + hit + '"'); }
    }
    const maybe = prob.size ? this.finish(prob, 'probable') : [];
    const mention = men.size ? this.finish(men, 'mention').slice(0, MAX_MENTIONS) : [];
    if (sure.length || maybe.length) { return sure.concat(maybe).slice(0, MAX_HITS).concat(mention); }
    const near = this.byTime(t);
    return near.concat(mention.filter((m) => !near.some((n) => n.id === m.id)));
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

  private finish(acc: Map<string, Acc>, conf: 'certain' | 'probable' | 'mention'): RelHit[] {
    const last = new Map(this.profs.map((p) => [p.c.id, p.c.last] as const));
    const rank = (w: string): number => { const r = REL_WHY.indexOf(w); return r < 0 ? 99 : r; };
    const hits = [...acc].map(([id, a]): RelHit => {
      const ws = [...a.why].sort((x, y) => rank(x) - rank(y));
      return { id, why: ws[0], conf, ...(a.cr ? { cr: true } : {}), ...(a.rc.length ? { rc: a.rc } : {}), ...(ws.length > 1 ? { more: ws.slice(1) } : {}), ...(a.notes.length ? { note: a.notes[0] } : {}) };
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
