/** Host side of the sidebar's chat-to-work matching: which branch, worktree and pull request a chat card shows. The matching itself is the shared matcher
 *  (workMatch.relOf, run in the worker through chatHits); this file only reads the repository (git), turns the verdict into card facts, and looks up pull
 *  requests. Order of the certain signals for the folder a card reads: a tool call of the chat (or of a subagent) created it, then the chat ran in it (cwd),
 *  then its rows name its branch (gitBranch). Nothing found: the chat's last cwd, as before. */
import * as fs from 'fs';
import * as path from 'path';
import { ChatFacts, ChatHit, ChatHits, MadeOut } from './chatFacts';
import { HintWt, PrLive, WorkHint } from './gitLive';
import { defaultBranchOf, Ctx, git, probe, repoOf } from './wipGit';
import { Exec, realExec } from './wipExec';
import { PrCache } from './wipPrs';
import { RelWt } from './workMatch';

const GIT_MS = 5000, GH_MS = 8000, TTL_MS = 20000;
const MAX_CREATED_SHOWN = 40, MAX_MENTIONS_SHOWN = 30, MAX_HINT = 80;

export interface Request { (m: { [k: string]: unknown }): Promise<any>; }
export interface WorkDeps { request: Request; exec: Exec; ghExec: Exec; cache: PrCache; folders: () => string[]; prsOn: () => boolean; now?: () => number; }

/** One thing the chat made or ran in. state: 'exists', or 'removed' (created, now gone). how: 'created', 'cwd', 'branch' (the rows record it) or 'subagent'. */
export interface WorkItem {
  kind: 'wt' | 'br'; name: string; branch: string; path: string; state: 'exists' | 'removed'; how: string; at: number; main: boolean;
  pr?: PrLive & { url?: string }; tip: string;
}
export interface MentionItem { name: string; note: string; }
/** What the card sends to the panel. Times are text in the local zone. */
export interface WorkView {
  badge: string; folder: string; branch: string; how: string;
  created: Array<{ kind: 'wt' | 'br'; name: string; branch: string; state: string; at: string; pr?: PrLive; tip: string }>; createdTotal: number; createdGone: number;
  worked: Array<{ name: string; branch: string; how: string; state: string; pr?: PrLive }>;
  mentions: MentionItem[]; mentionsTotal: number;
}
export interface ChatWorkFacts {
  /** Folder the card's live git state is read from (never empty when the chat has any folder). */
  cwd: string; fromMatcher: boolean; hint?: WorkHint; view?: WorkView; urls: Map<number, string>; prNumbers: number[]; removedCreated: number;
}

const baseOf = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? p;
const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
const pad = (n: number): string => String(n).padStart(2, '0');
/** Local date and time of a receipt, for the badge ("2026-10-11 00:40"). */
export const localTime = (ms: number): string => {
  if (!(ms > 0)) { return 'an unknown time'; }
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The tooltip of a creator hit: command, tool_use id, transcript and line. */
export function receiptTip(h: ChatHit): string {
  const r = h.rc[0];
  if (!r) { return h.note ?? ''; }
  return ['Created by a tool call at ' + localTime(r.t), 'Command: ' + r.c.replace(/\s+/g, ' ').slice(0, 300), 'tool_use: ' + r.u, 'Transcript: ' + r.f + ' line ' + r.l + (r.a ? ' (subagent ' + r.a.slice(0, 8) + ')' : '')].join('\n');
}

interface Repo { top: string; common: string; main: string; wts: RelWt[]; missing: Set<string>; locals: Set<string>; remotes: Set<string>; def: string; }

/** Reads the repository of the chat's folder (worktrees, local branches, default branch); a string is the reason it could not. */
async function readRepo(ctx: Ctx, cands: string[]): Promise<Repo | string> {
  for (const cand of cands) {
    const f = await probe(ctx, cand);
    if (f.state !== 'ok' || !f.top || !f.common) { continue; }
    const repo = await repoOf(ctx, f.common, f.top);
    if (typeof repo === 'string') { return repo; }
    const br = await git(ctx, f.top, ['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads']);
    const locals = new Set(br.code === 0 ? br.stdout.split(/\r?\n/).filter(Boolean) : []);
    const rb = await git(ctx, f.top, ['for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin']);
    const remotes = new Set(rb.code === 0 ? rb.stdout.split(/\r?\n/).filter((n) => n && n !== 'HEAD' && !locals.has(n)) : []);
    const dflt = ((await defaultBranchOf(ctx, f.top)) ?? '').replace(/^origin\//, '');
    const wts = repo.worktrees.map((w, i): RelWt => ({ k: 'w' + i, name: baseOf(w.path), path: w.path, real: w.path, branch: w.branch, main: w.main, detached: w.detached }));
    return { top: f.top, common: f.common, main: repo.main, wts, missing: new Set(repo.worktrees.filter((w) => w.missing).map((w) => norm(w.path))), locals, remotes, def: dflt };
  }
  return 'no git folder';
}

/** Created worktrees and branches that git no longer has, added as targets so the matcher can say who made them. A worktree and a branch made by one tool call (same tool_use id) are one thing. */
const WT_FOLDER = /(?:^|\/)worktrees\/[^/]+$|-wt-[^/]+$/;
function extra(f: ChatFacts, repo: Repo): { wts: RelWt[]; brs: Array<{ n: string }>; pair: Map<string, string> } {
  const made = f.made;
  const have = new Set(repo.wts.flatMap((w) => [norm(w.path), w.name]));
  const wts: RelWt[] = [], brs: Array<{ n: string }> = [], pair = new Map<string, string>(), byUse = new Map<string, string>();
  for (const m of made) { if (m[0] === 'b' && m[2]) { byUse.set(m[2].u, m[1]); } }
  made.forEach((m, i) => {
    if (m[0] === 'b') { if (!repo.locals.has(m[1]) && !repo.remotes.has(m[1])) { brs.push({ n: m[1] }); } return; }
    if (have.has(norm(m[1])) || have.has(baseOf(m[1]))) { return; }
    have.add(norm(m[1])); have.add(baseOf(m[1]));
    wts.push({ k: 'x' + i, name: baseOf(m[1]), path: m[1], real: m[1], branch: '', main: false, detached: true });
    const b = m[2] ? byUse.get(m[2].u) : undefined;
    if (b) { pair.set('x' + i, b); }
  });
  // Worktree folders the chat ran in that are gone now (a cwd of the chat or its subagents), and branches its rows record that are gone.
  f.cwds.forEach((p, i) => {
    if (!WT_FOLDER.test(norm(p)) || have.has(norm(p)) || fs.existsSync(p)) { return; }
    have.add(norm(p));
    wts.push({ k: 'c' + i, name: baseOf(p), path: p, real: p, branch: '', main: false, detached: true });
  });
  for (const n of f.seen) { if (!repo.locals.has(n) && !repo.remotes.has(n) && !brs.some((b) => b.n === n)) { brs.push({ n }); } }
  return { wts, brs, pair };
}

/** The card facts of one chat. Never throws; fromMatcher is false when the answer is only the chat's last folder. */
export class ChatWork {
  private readonly done = new Map<string, { at: number; v: ChatWorkFacts }>();
  private readonly busy = new Map<string, Promise<ChatWorkFacts>>();
  constructor(private readonly d: WorkDeps) {}

  private now(): number { return (this.d.now ?? Date.now)(); }

  /** The folder (and the work facts) of one chat for its card, counts and hand-over note. Falls back to the chat's last cwd. */
  resolve(id: string): Promise<ChatWorkFacts> {
    const hit = this.done.get(id);
    if (hit && this.now() - hit.at < TTL_MS) { return Promise.resolve(hit.v); }
    const run = this.busy.get(id);
    if (run) { return run; }
    const p = this.build(id).then((v) => { if (v.fromMatcher) { this.done.set(id, { at: this.now(), v }); } return v; }).finally(() => { this.busy.delete(id); });
    this.busy.set(id, p);
    return p;
  }

  forget(id: string): void { this.done.delete(id); }

  private async cwdOnly(id: string): Promise<ChatWorkFacts> {
    const c = await this.d.request({ t: 'chatCwd', chat: id, folders: this.d.folders() }).catch(() => '');
    return { cwd: typeof c === 'string' ? c : '', fromMatcher: false, urls: new Map(), prNumbers: [], removedCreated: 0 };
  }

  private async build(id: string): Promise<ChatWorkFacts> {
    try {
      const facts: ChatFacts | undefined = await this.d.request({ t: 'chatFacts', chat: id, folders: this.d.folders() });
      if (!facts?.ok) { return await this.cwdOnly(id); }
      const none = (): ChatWorkFacts => ({ cwd: facts.cwd, fromMatcher: false, urls: new Map(), prNumbers: [], removedCreated: 0 });
      const ctx: Ctx = { exec: this.d.exec, ghExec: this.d.ghExec, gitMs: GIT_MS, ghMs: GH_MS, flags: { gitMissing: false } };
      const repo = await readRepo(ctx, facts.cands);
      if (typeof repo === 'string') { return none(); }
      const ex = extra(facts, repo);
      const wts = repo.wts.concat(ex.wts);
      const brs = [...repo.locals, ...repo.remotes].map((n) => ({ n, cr: 0, ts: 0 })).concat(ex.brs.map((b) => ({ n: b.n, cr: 0, ts: 0 })));
      const hits: ChatHits | undefined = await this.d.request({ t: 'chatHits', chat: id, roots: [repo.main], wts, brs, def: repo.def });
      if (!hits) { return none(); }
      const prs = this.d.prsOn() ? await this.d.cache.get(ctx, repo.common, repo.top, false, this.now()) : undefined;
      return this.facts(facts, repo, wts, ex.pair, hits, prs?.byBranch);
    } catch {
      return await this.cwdOnly(id);
    }
  }

  private facts(f: ChatFacts, repo: Repo, wts: RelWt[], pair: Map<string, string>, hits: ChatHits, prs?: Map<string, { number: number; title: string; draft: boolean; review: string; url?: string }>): ChatWorkFacts {
    const prOf = (b: string): WorkItem['pr'] => { const p = b && prs ? prs.get(b) : undefined; return p ? { number: p.number, title: p.title, draft: p.draft, review: p.review, url: p.url } : undefined; };
    const mainBranch = repo.wts.find((x) => x.main)?.branch ?? '';
    const items: WorkItem[] = [], mentions: MentionItem[] = [], branchOfWt = new Set<string>();
    for (const w of wts) {
      const h = hits.w[w.k];
      if (!h) { continue; }
      const branch = w.branch || pair.get(w.k) || '';
      if (h.conf !== 'certain') { mentions.push({ name: w.name, note: h.note ?? h.why }); continue; }
      const exists = repo.wts.includes(w) && !repo.missing.has(norm(w.path));
      if (w.main && !h.cr) { continue; } // working in the main checkout is the baseline, not news
      const at = h.rc[0]?.t ?? 0;
      items.push({ kind: 'wt', name: w.name, branch, path: w.path, state: exists ? 'exists' : 'removed', how: h.cr ? 'created' : h.why === 'subagent' ? 'subagent' : h.why === 'cwd' ? 'cwd' : 'branch', at, main: w.main, pr: prOf(branch), tip: h.cr ? receiptTip(h) : (h.note ?? '') });
      if (branch) { branchOfWt.add(branch); }
    }
    for (const [n, h] of Object.entries(hits.b)) {
      if (branchOfWt.has(n)) {
        const it = items.find((x) => x.branch === n);
        if (it && h.cr && it.how !== 'created') { it.how = 'created'; it.at = h.rc[0]?.t ?? it.at; it.tip = receiptTip(h); }
        continue;
      }
      if (h.conf !== 'certain') { mentions.push({ name: n, note: h.note ?? h.why }); continue; }
      if ((n === repo.def || n === mainBranch) && !h.cr) { continue; } // the branch of the main checkout is the baseline
      items.push({ kind: 'br', name: n, branch: n, path: '', state: repo.locals.has(n) || repo.remotes.has(n) ? 'exists' : 'removed', how: h.cr ? 'created' : h.why === 'subagent' ? 'subagent' : 'branch', at: h.rc[0]?.t ?? 0, main: false, pr: prOf(n), tip: h.cr ? receiptTip(h) : (h.note ?? '') });
    }
    const created = items.filter((x) => x.how === 'created').sort((a, b) => Number(b.state === 'exists') - Number(a.state === 'exists') || b.at - a.at);
    const worked = items.filter((x) => x.how !== 'created');
    // The folder the card reads: created and still there, then the chat's own cwd when that is a linked worktree, then a worktree of the branch its rows record.
    const wtItem = (x: WorkItem | undefined): WorkItem | undefined => (x && x.kind === 'wt' && x.state === 'exists' ? x : undefined);
    const createdPick = wtItem(created.find((x) => x.kind === 'wt' && x.state === 'exists'));
    const cwdPick = wtItem(worked.find((x) => x.how === 'cwd' && !x.main));
    const branchPick = wtItem(worked.find((x) => x.how === 'branch' && x.kind === 'wt'));
    const pick = createdPick ?? cwdPick ?? branchPick;
    const how = createdPick ? 'created' : cwdPick ? 'cwd' : branchPick ? 'branch' : '';
    const cwd = pick?.path || f.cwd;
    const badgeOf = created.find((x) => x === pick) ?? created[0];
    const badge = badgeOf ? `created ${badgeOf.branch ? 'branch ' + badgeOf.branch : 'worktree ' + badgeOf.name} at ${localTime(badgeOf.at)}${badgeOf.state === 'removed' ? ' (now removed)' : ''}` : '';
    const view: WorkView = {
      badge, folder: pick?.path ?? '', branch: pick?.branch ?? '', how,
      created: created.slice(0, MAX_CREATED_SHOWN).map((x) => ({ kind: x.kind, name: x.name, branch: x.branch, state: x.state, at: localTime(x.at), pr: x.pr && { number: x.pr.number, title: x.pr.title, draft: x.pr.draft, review: x.pr.review }, tip: x.tip })),
      createdTotal: created.length, createdGone: created.filter((x) => x.state === 'removed').length,
      worked: worked.slice(0, 10).map((x) => ({ name: x.name, branch: x.branch, how: x.how, state: x.state, pr: x.pr && { number: x.pr.number, title: x.pr.title, draft: x.pr.draft, review: x.pr.review } })),
      mentions: mentions.slice(0, MAX_MENTIONS_SHOWN), mentionsTotal: mentions.length,
    };
    const hint: HintWt[] = created.filter((x) => x.kind === 'wt').slice(0, MAX_HINT).map((x) => ({ path: x.path, branch: x.branch, removed: x.state === 'removed' }));
    const urls = new Map<number, string>(), nums = new Set<number>();
    for (const x of [...created, ...worked]) { if (x.pr) { nums.add(x.pr.number); if (x.pr.url) { urls.set(x.pr.number, x.pr.url); } } }
    const shown = !!(badge || created.length || worked.length || mentions.length);
    return { cwd, fromMatcher: true, hint: hint.length ? { created: hint } : undefined, view: shown ? view : undefined, urls, prNumbers: [...nums], removedCreated: hint.filter((h) => h.removed).length };
  }
}

/** A plain adapter for callers that have no git runner of their own (tests). */
export const plainDeps = (request: Request, folders: () => string[]): WorkDeps => ({ request, exec: realExec, ghExec: realExec, cache: new PrCache(), folders, prsOn: () => false });

/** The path part a card shows of a folder. */
export const shortPath = (p: string): string => path.basename(p) || p;
