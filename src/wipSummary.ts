import { DotMap } from './liveState';
import { filesText, linkedOf, plural, prText, shownChats, stateWord, View, worktreeGroups } from './wipModel';
import { WipChat, WipData } from './wipTypes';

/** One plain-text line of what is pending in a folder. */
function facts(c: WipChat): string {
  const f = c.folder, p: string[] = [];
  if (f.state !== 'ok') { return f.state === 'missing' ? 'folder missing' : f.state === 'notgit' ? 'not a git folder' : f.state === 'unavailable' ? `unavailable: ${f.reason ?? 'error'}` : 'not scanned'; }
  if (f.fileTotal) { p.push(`${plural(f.fileTotal, 'file', 'files')} not checked in (${filesText(f)})`); }
  if (f.ahead) { p.push(`${plural(f.ahead, 'commit', 'commits')} not pushed`); }
  if (f.behind) { p.push(`behind ${f.behind}`); }
  if (c.pr) { p.push(prText(c.pr)); }
  linkedOf(c).forEach((n) => p.push(`linked PR #${n}`));
  return p.join(', ') || 'nothing pending';
}

const dotsOf = (v: View): DotMap => v.dots;

/** Plain-text summary of everything shown: one line per chat or worktree, then the notes. */
export function summaryText(d: WipData, v: View): string {
  const lines: string[] = [];
  if (v.mode === 'chat') {
    for (const c of shownChats(d, v)) {
      lines.push([c.title, c.folder.branch ?? '', stateWord(dotsOf(v)[c.id], c.last, v.now), c.folder.top ?? c.folder.cwd, facts(c)].filter(Boolean).join(' | '));
    }
  } else {
    for (const g of worktreeGroups(d, v)) {
      lines.push([g.repo?.name ?? '', g.facts.top ?? g.facts.cwd, g.facts.branch ?? '', facts(g.chats[0]), plural(g.chats.length, 'chat', 'chats')].filter(Boolean).join(' | '));
    }
  }
  if (d.gitMissing) { lines.push('Git not found.'); }
  if (d.prNote) { lines.push(`Open PRs unavailable: ${d.prNote}`); }
  if (d.notScanned > 0) { lines.push(`${d.notScanned} more not scanned`); }
  return lines.join('\n');
}
