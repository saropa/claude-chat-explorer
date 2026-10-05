import { FileChange, WorktreeInfo, BranchAhead } from './wipTypes';

export const MAX_FILES = 20;

export interface StatusParts {
  branch: string; detached: boolean; upstream?: string; ahead: number; behind: number; gone: boolean;
  staged: number; modified: number; untracked: number; files: FileChange[]; fileTotal: number;
}

const num = (re: RegExp, s: string): number => { const m = re.exec(s); return m ? Number(m[1]) : 0; };

/** The branch line of `git status --porcelain=v1 --branch` (without the leading ## ). */
function parseHeader(h: string): Pick<StatusParts, 'branch' | 'detached' | 'upstream' | 'ahead' | 'behind' | 'gone'> {
  const out = { branch: '', detached: false, upstream: undefined as string | undefined, ahead: 0, behind: 0, gone: false };
  if (h.startsWith('No commits yet on ')) { out.branch = h.slice(18); return out; }
  if (h.startsWith('HEAD (no branch)')) { out.detached = true; return out; }
  const i = h.indexOf(' [');
  const track = i >= 0 ? h.slice(i) : '';
  const names = (i >= 0 ? h.slice(0, i) : h).split('...');
  out.branch = names[0];
  out.upstream = names[1];
  out.ahead = num(/ahead (\d+)/, track);
  out.behind = num(/behind (\d+)/, track);
  out.gone = /\bgone\b/.test(track);
  return out;
}

/** Parse `git status --porcelain=v1 --branch -z`: counts plus the first MAX_FILES entries with a status letter. */
export function parseStatus(out: string): StatusParts {
  const parts = out.split('\0');
  const head = parts[0].startsWith('## ') ? parseHeader(parts[0].slice(3)) : parseHeader('');
  const r: StatusParts = { ...head, staged: 0, modified: 0, untracked: 0, files: [], fileTotal: 0 };
  for (let i = 1; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) { continue; }
    const x = e[0], y = e[1];
    if (x === 'R' || x === 'C') { i++; } // the next entry is the original path
    r.fileTotal++;
    if (x === '?') { r.untracked++; } else { if (x !== ' ') { r.staged++; } if (y !== ' ') { r.modified++; } }
    if (r.files.length < MAX_FILES) { r.files.push({ s: x === '?' ? '?' : y !== ' ' ? y : x, p: e.slice(3) }); }
  }
  return r;
}

/** Parse `git worktree list --porcelain`; the first block is the main worktree. missing is filled in later. */
export function parseWorktrees(out: string): WorktreeInfo[] {
  const list: WorktreeInfo[] = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const p = lines.find((l) => l.startsWith('worktree '));
    if (!p) { continue; }
    const b = lines.find((l) => l.startsWith('branch '));
    const lk = lines.find((l) => l === 'locked' || l.startsWith('locked '));
    const h = lines.find((l) => l.startsWith('HEAD '));
    list.push({ path: p.slice(9), branch: b ? b.slice(7).replace(/^refs\/heads\//, '') : '', detached: lines.includes('detached'),
      main: list.length === 0, missing: false, head: h ? h.slice(5).trim() : '', locked: !!lk,
      lockReason: lk && lk.length > 7 ? lk.slice(7).replace(/[\u0000-\u001f]/g, ' ').slice(0, 120) : undefined,
      prunable: lines.some((l) => l === 'prunable' || l.startsWith('prunable ')) });
  }
  return list;
}

export const REF_FORMAT = '%(refname:short)%09%(upstream:short)%09%(upstream:track)';
export const MAX_BRANCHES = 30;

/** Parse the for-each-ref lines: only branches with an upstream that are ahead of it or whose upstream is gone. */
export function parseRefs(out: string): BranchAhead[] {
  const list: BranchAhead[] = [];
  for (const line of out.split(/\r?\n/)) {
    const [name, up, track = ''] = line.split('\t');
    if (!name || !up) { continue; }
    const ahead = num(/ahead (\d+)/, track), gone = /\bgone\b/.test(track);
    if ((ahead > 0 || gone) && list.length < MAX_BRANCHES) { list.push({ name, ahead, gone }); }
  }
  return list;
}

/** Upstream facts of one branch from a for-each-ref line (REF_FORMAT): upstream name, ahead, behind and whether the upstream is gone. */
export function parseTrack(out: string): { upstream?: string; ahead: number; behind: number; gone: boolean } {
  const [, up = '', track = ''] = (out.split(/\r?\n/)[0] ?? '').split('\t');
  return { upstream: up || undefined, ahead: num(/ahead (\d+)/, track), behind: num(/behind (\d+)/, track), gone: /\bgone\b/.test(track) };
}

export const MAX_COMMITS = 20;

/** Parse `rev-list --format=%h%x09%s`: the "commit <id>" header lines are skipped, each other line is a short id and a subject. */
export function parseCommits(out: string): Array<{ sha: string; subject: string }> {
  const list: Array<{ sha: string; subject: string }> = [];
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf('\t');
    if (i > 0 && list.length < MAX_COMMITS) { list.push({ sha: line.slice(0, i), subject: line.slice(i + 1).replace(/[\u0000-\u001f]/g, ' ').slice(0, 120) }); }
  }
  return list;
}
