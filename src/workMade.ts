/** What a shell command created: the worktree folders and branches named by `git worktree add`, `git checkout -b`, `git switch -c` and `git branch <name>`.
 *  Pure text work done while a chat file is parsed (nothing is run); the Project status page uses it to tie a chat to the branch or worktree it made. */

import * as path from 'path';
import { Receipt } from './types';

/** [kind, value]: 'w' the worktree folder (absolute when the working folder was known, else as typed), 'b' the branch name,
 *  'i' a worktree folder a subagent's instructions said to use (intended, not seen created). */
export type Made = [string, string, Receipt?];

const MAX_PER_CMD = 4;
const MAX_VALUE = 300;
export const RECEIPT_CMD_CAP = 300;
const BRANCH_OK = /^[\p{L}\p{N}_.\/+@#-]{1,200}$/u;
/** What names a commit rather than a folder: a remote branch, a ref, HEAD. */
const START_POINT = /^(?:origin|upstream|refs|remotes)\/|^(?:HEAD|FETCH_HEAD|ORIG_HEAD)(?:[~^@].*)?$/;
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

/** A path resolved against a folder (what the shell and git do with a relative path); the path as typed when the folder is unknown or the path is not literal. */
export function resolveIn(base: string, p: string): string {
  if (!p || p.startsWith('~') || UNRESOLVED.test(p)) { return p; }
  const win = /^[A-Za-z]:[\\/]/.test(p) || /^[A-Za-z]:[\\/]/.test(base);
  const m = win ? path.win32 : path.posix;
  if (m.isAbsolute(p)) { return m.normalize(p).replace(/(.)[\\/]+$/, '$1'); }
  return base && m.isAbsolute(base) ? m.resolve(base, p) : p;
}

/** The arguments of a git command line after its global options and the folder its -C options point to (relative to cwd);
 *  undefined when the words are not a git command. */
function gitArgs(words: string[], cwd: string): { a: string[]; dir: string } | undefined {
  let i = 0, dir = cwd;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) { i++; } // VAR=value prefixes
  if (words[i] !== 'git') { return undefined; }
  i++;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C' && i + 1 < words.length) { dir = dir ? resolveIn(dir, words[i + 1]) : words[i + 1]; }
    i += GLOBAL_WITH_VALUE.has(words[i]) ? 2 : 1;
  }
  return { a: words.slice(i), dir };
}

/** `git worktree add [options] <path> [<commit-ish>]`: the FIRST word that is not an option (or an option's value) is the path; the second is the start point (origin/x, HEAD, a branch)
 *  and is never a path, even when the path itself is not literal ("$W") and so could not be kept. */
function worktreeAdd(a: string[], out: Made[], dir: string): void {
  let wt = '', seen = false;
  const pos: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === '-b' || v === '-B') { const b = keepBranch(a[++i]); if (b) { out.push(['b', b]); } }
    else if (v === '--reason') { i++; }
    else if (!v.startsWith('-')) { pos.push(v); if (!seen) { seen = true; wt = keepPath(v); } }
  }
  if (pos.length > 1 && START_POINT.test(pos[0])) { wt = ''; } // `worktree add origin/main ../x` is the arguments the wrong way round: git rejects it, so no folder was made
  if (wt) { out.push(['w', dir ? resolveIn(dir, wt) : wt]); }
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

/** Everything one command line created, at most four values, each once. cwd is the folder the command ran in: relative worktree paths
 *  are resolved against it, after any `cd <dir> &&` and `git -C <dir>` in the line. */
/** Replace $NAME and ${NAME} by the value an earlier `NAME=value` line of the same command gave; a name that is not known stays as typed (and is then not a literal path). */
function expandVars(w: string, vars: Map<string, string>): string {
  return vars.size && w.includes('$') ? w.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (m, a, b) => vars.get(a ?? b) ?? m) : w;
}

export function madeOf(cmd: string, cwd = ''): Made[] {
  const out: Made[] = [];
  if (typeof cmd !== 'string' || !/\bgit\b/.test(cmd)) { return out; }
  let cur = cwd;
  const vars = new Map<string, string>();
  for (const raw of wordsOf(cmd)) {
    const assign = raw.length > 0 && raw.every((x) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x));
    const words = raw.map((x) => expandVars(x, vars));
    if (assign) { for (const x of words) { const k = x.indexOf('='); vars.set(x.slice(0, k), x.slice(k + 1)); } continue; }
    if (words[0] === 'cd' && words.length >= 2) { cur = cur && words[1] !== '-' ? resolveIn(cur, words[1]) : ''; continue; }
    const g = gitArgs(words, cur);
    if (!g || !g.a.length) { continue; }
    const a = g.a;
    if (a[0] === 'worktree' && a[1] === 'add') { worktreeAdd(a.slice(2), out, g.dir); }
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

const INTENT = /\bworktree\s+(?:add\s+)?(?:-b\s+\S+\s+)?[`'"]?((?:\.{1,2}[\\/]|\/|[A-Za-z]:[\\/])[^\s`'",;)]+)/gi;

/** The worktree folders a subagent's first instruction says to use ("use a sibling worktree ../name", "git worktree add ../name"), as intended folders. */
export function intendedOf(text: string, cwd = ''): Made[] {
  const out: Made[] = [];
  if (typeof text !== 'string') { return out; }
  for (const m of text.slice(0, 6000).matchAll(INTENT)) {
    const p = keepPath(m[1].replace(/[.:]+$/, ''));
    if (p && out.length < 2) { out.push(['i', cwd ? resolveIn(cwd, p) : p]); }
  }
  return out;
}
