/**
 * Open Work model: pure, self-contained functions (no outer references except each other) because the page
 * embeds their source via Function.toString(); node checks import the same functions.
 * Slice 2 adds the git rules (To finish, Ready to tidy, Ready to remove); the pull request rules of slice 3 plug into bandOf.
 */

export const BAND_ORDER = ['needs', 'finish', 'waiting', 'tidy', 'idle'];
export const BAND_LABEL: { [k: string]: string } = { needs: 'Needs you', finish: 'To finish', waiting: 'Waiting on others', tidy: 'Ready to tidy', idle: 'Idle' };
/** Header chip text per band (the idle band has no chip). */
export const BAND_CHIP: { [k: string]: string } = { needs: 'need you', finish: 'to finish', waiting: 'waiting', tidy: 'to tidy' };

/**
 * Band of a row from its dot state and, when known, its git view g (ok, files, ahead, gone, up, merged, isDef, ready; a worktree row adds wt and locked).
 * First matching rule wins. Unknown git facts (g missing or not ok) never move a row: it is placed from the facts it has.
 */
export function bandOf(dot: string, g?: any, last?: number, now?: number): string {
  if (g && g.wt) {
    if (g.locked || !g.ok) { return 'idle'; }
    if (g.files > 0 || g.ahead > 0) { return 'finish'; }
    return g.ready ? 'tidy' : 'idle';
  }
  if (dot === 'waiting' || dot === 'unread') { return 'needs'; }
  if (dot === 'running') { return 'waiting'; }
  if (g && g.ok) {
    if (g.files > 0 || g.ahead > 0) { return 'finish'; }
    const old = typeof last === 'number' && typeof now === 'number' && now - last >= 3 * 86400000;
    if (g.gone || g.ready || (g.merged && !g.isDef) || (old && (g.up || g.isDef || g.merged))) { return 'tidy'; }
  }
  return 'idle';
}

/** Plain-words count: 1 file, 2 files. */
export function countWord(n: number, one: string, many?: string): string { return n + ' ' + (n === 1 ? one : many || one + 's'); }

/** One plain sentence on what to do next, from the dot state and the git view. */
export function nextStep(dot: string, g?: any): string {
  if (dot === 'waiting') { return 'The agent is waiting for your answer. Open the chat and reply.'; }
  if (dot === 'unread') { return 'The agent finished while you were away. Open the chat to read it.'; }
  if (dot === 'running') { return 'The agent is working in this chat. Nothing to do yet.'; }
  if (!g || !g.ok) { return 'No open work is known for this chat yet. Git state is not shown.'; }
  const todo: string[] = [];
  if (g.files > 0) { todo.push('commit or discard ' + countWord(g.files, 'changed file')); }
  if (g.ahead > 0) { todo.push('push ' + countWord(g.ahead, 'commit')); }
  if (todo.length) { return 'Open work: ' + todo.join(', then ') + '.'; }
  if (g.ready) { return 'This worktree is finished. You can remove it with the copied command.'; }
  if (g.gone) { return 'The remote branch is gone. The branch can be deleted and the chat archived.'; }
  if (g.merged && !g.isDef) { return 'This branch is merged. It can be deleted and the chat archived.'; }
  return 'Nothing is open. Archive the chat when you are done with it.';
}

/** Rows by band, newest first; every band is present, empty or not. bandFn(row, dot) places a row (the page uses it to hold rows still while they are hovered). */
export function bandRows(rows: Array<{ id: string; last: number }>, dots: { [id: string]: { s: string } }, bandFn?: (r: any, dot: string) => string): { [band: string]: any[] } {
  const out: { [band: string]: any[] } = { needs: [], finish: [], waiting: [], tidy: [], idle: [] };
  const place = bandFn || function (r: any, dot: string): string { return bandOf(dot); };
  const sorted = rows.slice().sort((a, b) => b.last - a.last);
  for (const r of sorted) { out[place(r, dots[r.id] ? dots[r.id].s : 'idle')].push(r); }
  return out;
}

/** Display groups for a mode: attention (bands), chat (one flat list) or repo (by project folder, newest group first). hidden lists bands whose rows are left out. */
export function groupRows(rows: Array<{ id: string; last: number; project: string }>, dots: { [id: string]: { s: string } }, mode: string, hidden: string[], bandFn?: (r: any, dot: string) => string): Array<{ key: string; label: string; rows: any[] }> {
  const place = bandFn || function (r: any, dot: string): string { return bandOf(dot); };
  const by = bandRows(rows, dots, place);
  if (mode === 'chat' || mode === 'repo') {
    const shown = rows.filter((r) => hidden.indexOf(place(r, dots[r.id] ? dots[r.id].s : 'idle')) < 0).sort((a, b) => b.last - a.last);
    if (mode === 'chat') { return shown.length ? [{ key: 'all', label: 'All chats', rows: shown }] : []; }
    const g: { [p: string]: any[] } = {};
    for (const r of shown) { (g[r.project || 'Unknown folder'] = g[r.project || 'Unknown folder'] || []).push(r); }
    return Object.keys(g).sort((a, b) => g[b][0].last - g[a][0].last).map((p) => ({ key: 'repo:' + p, label: p, rows: g[p] }));
  }
  const labels: { [k: string]: string } = { needs: 'Needs you', finish: 'To finish', waiting: 'Waiting on others', tidy: 'Ready to tidy', idle: 'Idle' };
  return ['needs', 'finish', 'waiting', 'tidy', 'idle'].filter((b) => hidden.indexOf(b) < 0 && by[b].length).map((b) => ({ key: b, label: labels[b], rows: by[b] }));
}

/**
 * True when a linked worktree is Ready to remove: not the main checkout, not locked, not a workspace folder, no open chat in it,
 * clean, nothing unpushed (or upstream gone), and merged (or upstream gone). A worktree whose folder is missing is ready to prune.
 * This is a read-only marker: nothing is ever removed by the extension.
 */
export function wtReady(w: any, g: any, open: boolean): boolean {
  if (!w || w.main || w.locked || w.ws || open) { return false; }
  if (w.missing) { return true; }
  if (!g || !g.ok || g.files > 0) { return false; }
  if (!(g.ahead === 0 || g.gone)) { return false; }
  return w.merged === true || !!g.gone;
}

/** What a Mark done remembers: the chat part (last message time, dot state) and the git part (branch, files, ahead; empty while git is unknown). */
export function fingerprint(dot: string, last: number, g?: any): string {
  return last + '|' + dot + '#' + (g && g.ok ? (g.branch || '') + '|' + g.files + '|' + g.ahead : '');
}

/** True while a marked-done row should stay hidden: the chat part is unchanged, and the git part too whenever git is known now and was known then. */
export function doneHidden(stored: string | undefined, dot: string, last: number, g?: any): boolean {
  if (typeof stored !== 'string') { return false; }
  const i = stored.indexOf('#'), now = fingerprint(dot, last, g), j = now.indexOf('#');
  if (i < 0 || stored.slice(0, i) !== now.slice(0, j)) { return false; }
  const was = stored.slice(i + 1), is = now.slice(j + 1);
  return !was || !is || was === is;
}

/** Source of the functions and constants above, for the page script. */
export const WORK_MODEL_SRC = [bandOf, countWord, nextStep, bandRows, groupRows, wtReady, fingerprint, doneHidden].map((f) => f.toString()).join('\n')
  + '\nconst BAND_ORDER=' + JSON.stringify(BAND_ORDER) + ',BAND_LABEL=' + JSON.stringify(BAND_LABEL) + ',BAND_CHIP=' + JSON.stringify(BAND_CHIP) + ';\n';
