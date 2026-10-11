/** Host side of "Ask <chat> to clean up": which branches, worktrees and pull requests a chat created (from the matcher's certain creator hits of the last scan), their facts
 *  read from the scan, and the finished prompt. No vscode import, so a check can run it on a real repository. The page names only a repository key, a chat id and rows
 *  (a branch name, a worktree key); every one is looked up here and dropped when this chat is not its creator. */
import { cleanupPrompt, CleanItem, resumeCommand } from './workCleanup';
import { Proof, RelHit } from './workMatch';
import { WorkScan } from './workScan';

export interface CleanModel { rel?: { w?: { [k: string]: RelHit[] }; b?: { [n: string]: RelHit[] } }; prs?: any; checks: Map<string, any>; }
export interface CleanRow { b?: string; w?: string; }
export const MAX_ROWS = 20;

const creatorHit = (l: RelHit[] | undefined, id: string): RelHit | undefined => (l ?? []).find((h) => h.id === id && h.cr === true && h.conf === 'certain');

/** Every row (branch with its worktree, or a worktree without a branch) whose creator is the chat; the main checkout and the default branch never count. */
export function creatorRows(scan: WorkScan, rk: string, rel: CleanModel['rel'], id: string): CleanRow[] {
  const base = scan.relInput(rk);
  if (!base || !rel) { return []; }
  const out = new Map<string, CleanRow>();
  for (const w of base.wts) {
    if (w.main || !creatorHit(rel.w?.[w.k], id)) { continue; }
    out.set(w.branch && !w.detached ? w.branch : w.k, { b: w.branch && !w.detached ? w.branch : undefined, w: w.k });
  }
  for (const n of Object.keys(rel.b ?? {})) {
    if (n === base.def || !creatorHit(rel.b?.[n], id)) { continue; }
    const w = base.wts.find((x) => !x.detached && x.branch === n && !x.main);
    out.set(n, { b: n, w: w?.k ?? out.get(n)?.w });
  }
  return [...out.values()].slice(0, MAX_ROWS);
}

/** The pull request of a branch in the last pull request answer: number and a plain-language state. */
export function prOf(m: CleanModel, rk: string, branch: string): { n: number; text: string } | undefined {
  const x = branch && m.prs && m.prs.state === 'ok' ? m.prs.by?.[branch] ?? (m.prs.all ?? []).find((p: any) => p.b === branch) : undefined;
  if (!x || !(x.n > 0)) { return undefined; }
  const c = m.checks.get(rk + '|' + x.n);
  const ck = !c ? 'checks not read' : c.state === 'failing' ? 'checks failing (' + c.failing + ' of ' + c.total + ')' : c.state === 'pending' ? 'checks pending' : c.state === 'passing' ? 'checks passing' : c.state === 'none' ? 'no checks' : 'checks unknown';
  return { n: x.n, text: 'is open' + (x.draft ? ' (draft)' : '') + (x.review ? ', review: ' + x.review : '') + ', ' + ck };
}

export interface CleanOut { text: string; dir: string; n: number; title: string; }

/** Build the prompt for a chat. rows undefined means every row the chat created; a named row that this chat did not create is dropped. undefined when nothing is left. */
export async function buildCleanup(scan: WorkScan, m: CleanModel, rk: string, id: string, title: string, root: string, rows?: CleanRow[]): Promise<CleanOut | undefined> {
  const mine = creatorRows(scan, rk, m.rel, id);
  const want = rows === undefined ? mine : mine.filter((x) => rows.some((r) => (r.b ? r.b === x.b : false) || (r.w ? r.w === x.w : false)));
  if (!want.length) { return undefined; }
  const base = scan.relInput(rk);
  const items: CleanItem[] = [];
  let dir = '', top = '';
  for (const row of want) {
    const f = await scan.cleanFacts(rk, row.b ?? '', row.w ?? '');
    if (!f) { continue; }
    const hits = [creatorHit(m.rel?.b?.[row.b ?? ''], id), creatorHit(m.rel?.w?.[row.w ?? ''], id)].filter((h): h is RelHit => !!h);
    const proofs: Proof[] = [];
    for (const p of hits.flatMap((h) => h.rc ?? [])) { if (!proofs.some((x) => x.u === p.u && x.f === p.f && x.c === p.c)) { proofs.push(p); } }
    let wt = f.wt;
    if (!wt && row.w && base) { wt = base.wts.find((w) => w.k === row.w)?.path; } // a folder git does not list
    items.push({ ...f, wt, proofs, told: !proofs.length, pr: prOf(m, rk, f.branch) });
    if (!top) { top = f.top; }
    if (!dir) { dir = wt && !f.missing ? wt : f.top; }
  }
  if (!items.length) { return undefined; }
  return { text: cleanupPrompt({ title, chatId: id, root, items }), dir: dir || top, n: items.length, title };
}

export { resumeCommand };
