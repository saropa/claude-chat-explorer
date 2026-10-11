/** Worker side of the sidebar's chat-to-work matching: the facts of one chat the host needs to find its repository, and the shared matcher's
 *  verdict (workMatch.relOf) for that one chat against the worktrees and branches the host read. No git here and no matching rules of its own. */
import { chatCwd } from './wipChats';
import { relOf, RelIn, RelWt, RelBr, Proof } from './workMatch';
import { Chat, Receipt } from './types';

export interface FactSource { find(id: string): Chat | undefined; subsOf(p: Chat): Chat[]; tops(): Chat[]; rec: Parameters<typeof relOf>[0]['rec']; }
/** One tool-call creation: kind 'w' (worktree folder) or 'b' (branch name), the receipt, and the subagent that ran it. */
export type MadeOut = [string, string, Receipt?, string?];
export interface ChatFacts { ok: boolean; cwd: string; cands: string[]; cwds: string[]; made: MadeOut[]; seen: string[]; }

const MAX_MADE = 1500, MAX_CANDS = 8;


/** The folder of a chat, the folders to find its repository in (latest first), and everything its tool calls and its subagents' created. */
export function chatFacts(ix: FactSource, id: string, folders: string[]): ChatFacts {
  const c = ix.find(id);
  if (!c) { return { ok: false, cwd: '', cands: [], cwds: [], made: [], seen: [] }; }
  const cwd = chatCwd(ix, id, folders);
  const subs = ix.subsOf(c);
  const cands = [cwd, ...[...(c.cwds ?? [])].reverse(), ...subs.flatMap((s) => [...(s.cwds ?? (s.cwd ? [s.cwd] : []))].reverse())].filter(Boolean);
  const made: MadeOut[] = [];
  for (const m of c.made ?? []) { if (m[0] !== 'i') { made.push([m[0], m[1], m[2]]); } }
  for (const s of subs) { for (const m of s.made ?? []) { if (m[0] !== 'i') { made.push([m[0], m[1], m[2], s.id]); } } }
  made.sort((a, b) => (b[2]?.t ?? 0) - (a[2]?.t ?? 0));
  return { ok: true, cwd, cands: [...new Set(cands)].slice(0, MAX_CANDS), cwds: [...new Set(cands)].slice(0, 80), made: made.slice(0, MAX_MADE), seen: c.seen ?? [] };
}

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.slice(0, max) : '');
const list = (a: unknown, n: number): any[] => (Array.isArray(a) ? a.slice(0, n) : []);

/** A request body checked and capped (at most 600 worktrees and 4000 branches: a chat can create hundreds). */
export function hitsInOf(m: any): RelIn | undefined {
  if (!m || !Array.isArray(m.wts)) { return undefined; }
  return {
    ids: [str(m.chat, 80)],
    roots: list(m.roots, 4).map((x) => str(x)).filter(Boolean),
    wts: list(m.wts, 600).filter((w) => w && typeof w.k === 'string').map((w): RelWt => ({ k: str(w.k, 20), name: str(w.name, 200), path: str(w.path), real: str(w.real), branch: str(w.branch, 250), main: w.main === true, detached: w.detached === true })),
    brs: list(m.brs, 4000).filter((b) => b && typeof b.n === 'string').map((b): RelBr => ({ n: str(b.n, 250), cr: 0, ts: 0 })),
    def: str(m.def, 250),
  };
}

/** What the matcher says of one chat about one worktree (by key) or branch (by name). */
export interface ChatHit { why: string; conf: 'certain' | 'probable' | 'mention'; cr: boolean; rc: Proof[]; note?: string; }
export interface ChatHits { w: { [k: string]: ChatHit }; b: { [n: string]: ChatHit } }

/** Run the shared matcher for one chat; keeps only that chat's own hit per target, and drops the nearest-by-time guess (it exists for the page's empty rows, not as evidence). */
export function chatHits(ix: FactSource, i: RelIn): ChatHits {
  const out = relOf(ix, i), id = i.ids[0], pick = (hs: Array<{ id: string; why: string; conf: ChatHit['conf']; cr?: boolean; rc?: Proof[]; note?: string }>): ChatHit | undefined => {
    const h = hs.find((x) => x.id === id);
    return h && h.why !== 'time-window' ? { why: h.why, conf: h.conf, cr: h.cr === true, rc: h.rc ?? [], note: h.note } : undefined;
  };
  const res: ChatHits = { w: {}, b: {} };
  for (const k of Object.keys(out.w)) { const h = pick(out.w[k]); if (h) { res.w[k] = h; } }
  for (const n of Object.keys(out.b)) { const h = pick(out.b[n]); if (h) { res.b[n] = h; } }
  return res;
}
