/** The "ask the creator chat to clean up" prompt of the Project status page. Pure text work (no vscode, no git): the host gathers the facts, this lays them out
 *  with receipts (when and how each item was created, from the chat transcript and from the branch reflog) and keeps the whole prompt under a size cap. */
import { Proof } from './workMatch';

export const PROMPT_MAX = 4000;
export const ASK = 'These were created by you in this session. List what each one is for, what is unfinished, and tell me exactly how you will clean each one up (commit, push, open a PR, merge, or delete). Do not delete anything until I confirm.';

export interface CleanCommit { sha: string; au: string; date: string; subject: string; }
/** Everything known about one branch / worktree / pull request the chat made. Times are unix seconds (git) or milliseconds (proofs). */
export interface CleanItem {
  branch: string; wt?: string; pr?: { n: number; text: string }; created?: number;
  proofs: Proof[]; told?: boolean; // told: only a subagent's instructions named the folder (no tool-call receipt)
  reflog?: string; reflogAt?: number; reflogMsg?: string;
  commits: CleanCommit[]; commitTotal?: number; // commits only on this branch (not on the default branch)
  files: string[]; fileTotal: number; unpushed: number; ahead?: number; behind?: number; def: string; gone?: boolean; missing?: boolean; read: boolean; // read false: git state not read
}
export interface CleanIn { title: string; chatId: string; root: string; items: CleanItem[]; }

const p2 = (n: number): string => String(n).padStart(2, '0');
export const utcText = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
export function localText(ms: number): string {
  const d = new Date(ms), o = -d.getTimezoneOffset(), a = Math.abs(o);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' (UTC' + (o < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + ':' + p2(a % 60) + ')';
}
const more = (n: number, what: string): string => (n > 0 ? 'and ' + n + ' more' + (what ? ' ' + what : '') : '');
const pl = (n: number, one: string, many = one + 's'): string => n + ' ' + (n === 1 ? one : many);

/** Detail levels, richest first: the prompt drops to the next level until it fits. */
const LEVELS = [{ commits: 10, files: 15, cmd: 300, proofs: 2 }, { commits: 5, files: 8, cmd: 200, proofs: 1 }, { commits: 3, files: 4, cmd: 140, proofs: 1 }, { commits: 1, files: 2, cmd: 100, proofs: 1 }, { commits: 0, files: 0, cmd: 80, proofs: 1 }];

function receipt(p: Proof, root: string, cmd: number): string {
  const file = root.replace(/[\\/]+$/, '') + '/' + p.f;
  return '   Made by tool call at ' + (p.t ? utcText(p.t) + ', local ' + localText(p.t) : 'an unknown time') + '\n   Command: ' + (p.c.length > cmd ? p.c.slice(0, cmd) + '...' : p.c) + '\n   Proof: tool_use ' + (p.u || '?') + ', session ' + p.s + (p.a ? ', subagent ' + p.a : '') + ', ' + file + ' line ' + p.l;
}

function stateLine(it: CleanItem, files: number): string {
  if (it.missing) { return 'Worktree folder is gone.'; }
  if (!it.read) { return 'Git state was not read yet.'; }
  const o: string[] = [];
  o.push(it.fileTotal > 0 ? pl(it.fileTotal, 'file') + ' not committed' + (files > 0 && it.files.length ? ' (' + it.files.slice(0, files).join(', ') + (it.fileTotal > Math.min(files, it.files.length) ? ', ' + more(it.fileTotal - Math.min(files, it.files.length), '') : '') + ')' : '') : 'nothing uncommitted');
  o.push(it.unpushed > 0 ? pl(it.unpushed, 'commit') + ' not pushed' : it.gone ? 'remote branch is gone' : 'nothing unpushed');
  if (typeof it.ahead === 'number' && typeof it.behind === 'number') { o.push('ahead ' + it.ahead + ', behind ' + it.behind + ' vs ' + (it.def || 'the default branch')); }
  return o.join('; ') + '.';
}

function block(it: CleanItem, n: number, root: string, lv: typeof LEVELS[number]): string {
  const o: string[] = [n + ') Branch ' + (it.branch || '(none)') + (it.wt ? '; worktree ' + it.wt : '; no worktree') + '; ' + (it.pr ? 'PR #' + it.pr.n + ' ' + it.pr.text : 'no pull request')];
  const when = it.proofs.find((x) => x.t > 0)?.t ?? (it.created ? it.created * 1000 : 0);
  o.push('   Created ' + (when ? utcText(when) + ', local ' + localText(when) : 'at an unknown time'));
  if (it.proofs.length) { it.proofs.slice(0, lv.proofs).forEach((x) => o.push(receipt(x, root, lv.cmd))); }
  else { o.push('   No tool-call receipt' + (it.told ? ': a subagent was only told to use this folder.' : '.')); }
  if (it.reflogAt) { o.push('   Branch reflog (independent proof): created ' + utcText(it.reflogAt * 1000) + ', "' + (it.reflogMsg ?? '') + '"'); }
  else if (it.branch) { o.push('   Branch reflog: no creation entry found.'); }
  if (lv.commits > 0 && it.commits.length) {
    const shown = it.commits.slice(0, lv.commits), total = Math.max(it.commitTotal ?? it.commits.length, it.commits.length);
    o.push('   Commits only on this branch (' + total + '): ' + shown.map((c) => c.sha + ' ' + c.au + ' ' + c.date.slice(0, 10) + ' ' + c.subject).join(' | ') + (total > shown.length ? ' | ' + more(total - shown.length, '') : ''));
  }
  o.push('   Now: ' + stateLine(it, lv.files) + (it.pr ? ' PR ' + it.pr.text + '.' : ''));
  return o.join('\n');
}

/** The prompt: facts with receipts per item, then the ask. At most max characters: detail is dropped level by level, then items are cut with "and N more". */
export function cleanupPrompt(i: CleanIn, max = PROMPT_MAX): string {
  const head = 'Clean-up review for "' + i.title.replace(/\s+/g, ' ').slice(0, 80) + '" (session ' + i.chatId + '). Here are the facts about what you created, with receipts.\n';
  const tail = '\n' + ASK;
  for (const lv of LEVELS) {
    const text = head + i.items.map((it, k) => block(it, k + 1, i.root, lv)).join('\n') + tail;
    if (text.length <= max) { return text; }
  }
  const lv = LEVELS[LEVELS.length - 1];
  for (let keep = i.items.length - 1; keep >= 1; keep--) {
    const text = head + i.items.slice(0, keep).map((it, k) => block(it, k + 1, i.root, lv)).join('\n') + '\n' + more(i.items.length - keep, 'items') + '.' + tail;
    if (text.length <= max) { return text; }
  }
  const one = head + block(i.items[0], 1, i.root, { commits: 0, files: 0, cmd: 40, proofs: 1 }) + '\n' + more(i.items.length - 1, 'items') + '.' + tail;
  return one.length <= max ? one : one.slice(0, max - tail.length - 4) + '...' + tail;
}

/** The terminal alternative to Resume: change into the worktree (or the repository) and resume the chat. */
export function resumeCommand(dir: string, id: string, win = false): string {
  const q = win ? '"' + dir.replace(/"/g, '') + '"' : "'" + dir.replace(/'/g, "'\\''") + "'";
  return 'cd ' + q + ' && claude --resume ' + id;
}
