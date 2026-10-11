/** What a shell command created: the worktree folders and branches named by `git worktree add`, `git checkout -b`, `git switch -c` and `git branch <name>`.
 *  Pure text work done while a chat file is parsed (nothing is run); the Project status page uses it to tie a chat to the branch or worktree it made. */

/** [kind, value]: 'w' with the folder as typed (absolute or relative), 'b' with the branch name. */
export type Made = [string, string];

const MAX_PER_CMD = 4;
const MAX_VALUE = 300;
const BRANCH_OK = /^[\p{L}\p{N}_.\/+@#-]{1,200}$/u;
const UNRESOLVED = /[$`<>*?{}\\]/; // shell text that is not a literal name: a variable, a substitution, a glob

/** Split one command line into simple commands at && || ; | and newlines (outside quotes) and words (quotes removed). */
export function wordsOf(cmd: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [], w = '', has = false, q = '';
  const endWord = (): void => { if (has) { cur.push(w); } w = ''; has = false; };
  const endCmd = (): void => { endWord(); if (cur.length) { out.push(cur); } cur = []; };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (q) { if (ch === q) { q = ''; } else if (ch === '\\' && q === '"' && i + 1 < cmd.length) { w += cmd[++i]; } else { w += ch; } continue; }
    if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (ch === '\\' && i + 1 < cmd.length) { w += cmd[++i]; has = true; }
    else if (ch === ' ' || ch === '\t') { endWord(); }
    else if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') { endCmd(); }
    else if (ch === '#' && !has) { while (i < cmd.length && cmd[i] !== '\n') { i++; } }
    else { w += ch; has = true; }
  }
  endCmd();
  return out;
}

const GLOBAL_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const BRANCH_NOT_CREATE = new Set(['-d', '-D', '--delete', '-m', '-M', '--move', '-c', '-C', '--copy', '-l', '--list', '-a', '--all', '-r', '--remotes', '--show-current', '-v', '-vv', '--verbose', '-u', '--set-upstream-to', '--unset-upstream', '--edit-description', '--contains', '--no-contains', '--merged', '--no-merged', '--sort', '--points-at', '--format']);
const BRANCH_WITH_VALUE = new Set(['-t', '--track', '--set-upstream', '--create-reflog']);

const keepBranch = (v: string | undefined): string => (v && !v.startsWith('-') && !UNRESOLVED.test(v) && BRANCH_OK.test(v) && v !== 'HEAD' ? v : '');
const keepPath = (v: string | undefined): string => (v && !v.startsWith('-') && !UNRESOLVED.test(v) && v.length <= MAX_VALUE ? v : '');

/** The arguments of a git command line after its global options; undefined when the words are not a git command. */
function gitArgs(words: string[]): string[] | undefined {
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) { i++; } // VAR=value prefixes
  if (words[i] !== 'git') { return undefined; }
  i++;
  while (i < words.length && words[i].startsWith('-')) { i += GLOBAL_WITH_VALUE.has(words[i]) ? 2 : 1; }
  return words.slice(i);
}

function worktreeAdd(a: string[], out: Made[]): void {
  let path = '';
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === '-b' || v === '-B') { const b = keepBranch(a[++i]); if (b) { out.push(['b', b]); } }
    else if (v === '--reason') { i++; }
    else if (!v.startsWith('-') && !path) { path = keepPath(v); }
  }
  if (path) { out.push(['w', path]); }
}

function branchCreate(a: string[], out: Made[]): void {
  if (a.some((v) => BRANCH_NOT_CREATE.has(v))) { return; }
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (BRANCH_WITH_VALUE.has(v)) { i++; continue; }
    if (v.startsWith('-')) { continue; }
    const b = keepBranch(v);
    if (b) { out.push(['b', b]); }
    return; // the next word is the start point
  }
}

/** Everything one command line created, at most four values, each once. */
export function madeOf(cmd: string): Made[] {
  const out: Made[] = [];
  if (typeof cmd !== 'string' || !/\bgit\b/.test(cmd)) { return out; }
  for (const words of wordsOf(cmd)) {
    const a = gitArgs(words);
    if (!a || !a.length) { continue; }
    if (a[0] === 'worktree' && a[1] === 'add') { worktreeAdd(a.slice(2), out); }
    else if (a[0] === 'checkout' || a[0] === 'switch') {
      const flags = a[0] === 'checkout' ? ['-b', '-B'] : ['-c', '-C', '--create', '--force-create'];
      const i = a.findIndex((v) => flags.includes(v));
      const b = i > 0 ? keepBranch(a[i + 1]) : '';
      if (b) { out.push(['b', b]); }
    } else if (a[0] === 'branch') { branchCreate(a.slice(1), out); }
  }
  const seen = new Set<string>();
  return out.filter((m) => { const k = m[0] + '\0' + m[1]; if (seen.has(k)) { return false; } seen.add(k); return true; }).slice(0, MAX_PER_CMD);
}

/** What a worktree tool call created (the EnterWorktree tool names a worktree by `name` or `path`). */
export function madeByTool(name: string, input: any): Made[] {
  if (name !== 'EnterWorktree' || !input || typeof input !== 'object') { return []; }
  const v = keepPath(typeof input.path === 'string' ? input.path : typeof input.name === 'string' ? input.name : undefined);
  return v ? [['w', v]] : [];
}
