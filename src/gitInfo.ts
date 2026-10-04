import { Chat, Cost, Git } from './types';

const B = (s: string) => Buffer.from(s);
const GIT_OP = B('"gitOperation"'), BRANCH_KEY = B('"gitBranch":"'), COST_ROW = B('{"type":"cost-state"'), PR_ROW = B('{"type":"pr-link"');
const GIT_LINE_MAX = 400000; // longer rows are not git results, only a mention
const TAIL = 1024; // gitBranch sits near the end of a row
const HEAD = 32;
const MAX_COMMITS = 300;
const MAX_BRANCHES = 40;
const MAX_PRS = 100;
const SHA = /^[0-9a-f]{4,40}$/;
const BRANCH = /^[\w.\/+@#-]{1,200}$/;

/** Running tally of cost and git facts while one chat file is parsed. */
export interface GitAcc {
  commits: Map<string, string>; branches: Set<string>; prs: Map<number, string>; seen: Map<string, number>; cost?: Cost;
}
export const newGitAcc = (): GitAcc => ({ commits: new Map(), branches: new Set(), prs: new Map(), seen: new Map() });

const slice = (b: Buffer, from: number, to: number): Buffer => b.subarray(Math.max(0, from), Math.min(b.length, to));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** A usable branch name, or '' (drops HEAD and unresolved shell text such as $B;). */
const branchOf = (v: unknown): string => (typeof v === 'string' && v !== 'HEAD' && BRANCH.test(v) ? v : '');

function addBranch(a: GitAcc, v: unknown): string {
  const b = branchOf(v);
  if (b && a.branches.size < MAX_BRANCHES) { a.branches.add(b); }
  return b;
}

/** Short model family: opus, sonnet, haiku; else the id without the claude- prefix, date and context tag. */
export function modelName(id: string): string {
  const m = /(opus|sonnet|haiku)/i.exec(id);
  return m ? m[1].toLowerCase() : id.replace(/^claude-/, '').replace(/\[.*$/, '').replace(/-\d{8}$/, '');
}

/** One cost-state row; totals are cumulative, so the last row of the file wins. */
function takeCost(row: any, a: GitAcc): void {
  const use = row.modelUsage && typeof row.modelUsage === 'object' ? row.modelUsage : {};
  const by = Object.entries(use).map(([k, v]) => [modelName(k), num((v as any)?.costUSD)] as [string, number]);
  by.sort((x, y) => y[1] - x[1]);
  a.cost = { usd: num(row.totalCostUSD), add: num(row.totalLinesAdded), rem: num(row.totalLinesRemoved), models: [...new Set(by.map((x) => x[0]))] };
}

/** One toolUseResult.gitOperation: commit, branch (merge or rebase target) and push. */
function takeOp(op: any, a: GitAcc): void {
  const c = op.commit;
  const sha = typeof c?.sha === 'string' ? c.sha.toLowerCase() : '';
  const br = addBranch(a, c?.branch);
  if (SHA.test(sha) && !a.commits.has(sha) && a.commits.size < MAX_COMMITS) { a.commits.set(sha, br); }
  addBranch(a, op.branch?.ref);
  addBranch(a, op.push?.branch);
}

function takePr(row: any, a: GitAcc): void {
  const n = row.prNumber;
  if (Number.isInteger(n) && n > 0 && !a.prs.has(n) && a.prs.size < MAX_PRS) {
    a.prs.set(n, typeof row.prRepository === 'string' ? row.prRepository.slice(0, 100) : '');
  }
}

/** Count the gitBranch value of one row; the most frequent value becomes a touched branch. */
function tallyBranch(line: Buffer, a: GitAcc): void {
  const t = slice(line, line.length - TAIL, line.length);
  const k = t.lastIndexOf(BRANCH_KEY);
  if (k < 0) { return; }
  const s = k + BRANCH_KEY.length, e = t.indexOf(34, s);
  if (e < 0 || e - s > 200) { return; }
  const v = t.toString('utf8', s, e);
  a.seen.set(v, (a.seen.get(v) ?? 0) + 1);
}

/** Parse the row as JSON and hand it on; a damaged or partial row is skipped. */
function withRow(line: Buffer, fn: (row: any) => void): void {
  try { const r = JSON.parse(line.toString('utf8')); if (r && typeof r === 'object') { fn(r); } } catch { /* partial line */ }
}

/** Fold one raw JSONL line into the tally: cost-state, pr-link, git results and the row's gitBranch. */
export function takeExtra(line: Buffer, a: GitAcc): void {
  tallyBranch(line, a);
  const head = slice(line, 0, HEAD);
  if (head.indexOf(COST_ROW) >= 0) { withRow(line, (r) => takeCost(r, a)); }
  else if (head.indexOf(PR_ROW) >= 0) { withRow(line, (r) => takePr(r, a)); }
  else if (line.length < GIT_LINE_MAX && line.indexOf(GIT_OP) >= 0) {
    withRow(line, (r) => { const op = r.toolUseResult?.gitOperation; if (op && typeof op === 'object') { takeOp(op, a); } });
  }
}

/** Cost (absent when it holds nothing) and git facts (absent when empty) of the finished tally. */
export function finishExtras(a: GitAcc): { cost?: Cost; git?: Git } {
  const top = [...a.seen].sort((x, y) => y[1] - x[1])[0];
  if (top) { addBranch(a, top[0]); }
  const c = a.cost;
  const cost = c && (c.usd || c.add || c.rem || c.models.length) ? c : undefined;
  const git = a.commits.size || a.branches.size || a.prs.size
    ? { commits: [...a.commits], branches: [...a.branches], prs: [...a.prs] } : undefined;
  return { cost, git };
}

/** Git facts of a chat plus its subagents (commits and PRs deduplicated; a commit keeps the first branch seen). */
export function mergedGit(c: Chat, subs: Chat[]): Git {
  const commits = new Map<string, string>(), prs = new Map<number, string>(), branches = new Set<string>();
  for (const x of [c, ...subs]) {
    for (const [s, b] of x.git?.commits ?? []) { if (!commits.has(s)) { commits.set(s, b); } }
    for (const [n, r] of x.git?.prs ?? []) { if (!prs.has(n)) { prs.set(n, r); } }
    for (const b of x.git?.branches ?? []) { branches.add(b); }
  }
  return { commits: [...commits], branches: [...branches], prs: [...prs] };
}
