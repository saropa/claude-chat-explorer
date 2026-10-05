/**
 * Open Work model: pure, self-contained functions (no outer references except each other) because the page
 * embeds their source via Function.toString(); node checks import the same functions.
 * Git rules (To finish, Ready to tidy, Ready to remove) and pull request rules (failing checks, review state, checks pending).
 */

export const BAND_ORDER = ['needs', 'finish', 'waiting', 'tidy', 'idle'];
export const BAND_LABEL: { [k: string]: string } = { needs: 'Needs you', finish: 'To finish', waiting: 'Waiting on others', tidy: 'Ready to tidy', idle: 'Idle' };
/** Header chip text per band (the idle band has no chip). */
export const BAND_CHIP: { [k: string]: string } = { needs: 'need you', finish: 'to finish', waiting: 'waiting', tidy: 'to tidy' };

/**
 * Band of a row from its dot state and, when known, its git view g (ok, files, ahead, gone, up, merged, isDef, ready; a worktree row adds wt and locked).
 * g.pr, when a pull request is open on the branch, has review ('approved', 'changes requested', 'review requested' or ''), draft and checks
 * ('failing', 'pending', 'passing', 'none', or anything else while unknown). First matching rule wins.
 * Unknown facts (g missing or not ok, checks still loading) never move a row: it is placed from the facts it has.
 */
export function bandOf(dot: string, g?: any, last?: number, now?: number): string {
  if (g && g.wt) {
    if (g.locked || !g.ok) { return 'idle'; }
    if (g.pr && g.pr.checks === 'failing') { return 'finish'; }
    if (g.files > 0 || g.ahead > 0) { return 'finish'; }
    return g.ready ? 'tidy' : 'idle';
  }
  if (dot === 'waiting' || dot === 'unread') { return 'needs'; }
  const p = g && g.ok ? g.pr : undefined;
  if (p && p.checks === 'failing') { return 'finish'; }
  if (dot === 'running') { return 'waiting'; }
  if (g && g.ok) {
    if (g.files > 0 || g.ahead > 0) { return 'finish'; }
    if (p) { return p.review === 'changes requested' || (p.review === 'approved' && p.checks !== 'pending') ? 'finish' : 'waiting'; }
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
  const pr = g.pr ? 'pull request #' + g.pr.n : '';
  if (pr && g.pr.checks === 'failing') { return 'A check is failing on ' + pr + '. Open the pull request and fix it.'; }
  const todo: string[] = [];
  if (g.files > 0) { todo.push('commit or discard ' + countWord(g.files, 'changed file')); }
  if (g.ahead > 0) { todo.push('push ' + countWord(g.ahead, 'commit')); }
  if (todo.length) { return 'Open work: ' + todo.join(', then ') + '.'; }
  if (pr) { return g.pr.review === 'changes requested' ? 'Changes were requested on ' + pr + '. Make them and push.' : g.pr.review === 'approved' && g.pr.checks !== 'pending' ? 'The ' + pr + ' is approved. It is ready to merge.' : 'Waiting on ' + pr + ' (review or checks).'; }
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
  if (!w || w.main || w.locked || w.ws || open || (g && g.pr)) { return false; }
  if (w.missing) { return true; }
  if (!g || !g.ok || g.files > 0) { return false; }
  if (!(g.ahead === 0 || g.gone)) { return false; }
  return w.merged === true || !!g.gone;
}

/**
 * What a Mark done remembers: the chat part (last message time, dot state), the git part (branch, files, ahead; empty while git is unknown)
 * and the pull request part (number, review state, checks failing yes or no; empty while the pull request layer has not answered or there is no pull request).
 * Only failing is kept from the checks, so pending turning to passing never brings a row back.
 */
export function fingerprint(dot: string, last: number, g?: any): string {
  // A long branch name (or one holding the # and | separators) is replaced by a short hash, so the whole fingerprint stays well under the 200 characters the host stores.
  const hash = (s: string): string => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'h' + (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  };
  const br = g && g.ok ? String(g.branch || '') : '';
  const git = g && g.ok ? (br.length > 40 || /[#|]/.test(br) ? hash(br) : br) + '|' + g.files + '|' + g.ahead : '';
  const pr = g && g.ok && g.pr ? g.pr.n + '|' + (g.pr.review || '') + '|' + (g.pr.checks === 'failing' ? 'F' : '-') : '';
  return last + '|' + dot + '#' + git + (pr ? '#' + pr : '');
}

/** True while a marked-done row should stay hidden: the chat part is unchanged, and the git part and the pull request part too whenever each is known now and was known then. */
export function doneHidden(stored: string | undefined, dot: string, last: number, g?: any): boolean {
  if (typeof stored !== 'string') { return false; }
  const was = stored.split('#'), is = fingerprint(dot, last, g).split('#');
  if (was.length < 2 || was[0] !== is[0]) { return false; }
  for (let k = 1; k < 3; k++) { if (was[k] && is[k] && was[k] !== is[k]) { return false; } }
  return true;
}

/** The marked-done list at its cap: marks of chats no longer listed go first (oldest first), then the oldest of the rest. listed empty means the list is unknown, so nothing is judged stale. */
export function capDone(list: Array<[string, string]>, listed: Set<string>, max: number): Array<[string, string]> {
  let extra = list.length - max;
  const kept = extra > 0 && listed.size ? list.filter(([k]) => listed.has(k) || extra-- <= 0) : list;
  return kept.slice(-max);
}

/** Source of the functions and constants above, for the page script. */
export const WORK_MODEL_SRC = [bandOf, countWord, nextStep, bandRows, groupRows, wtReady, fingerprint, doneHidden].map((f) => f.toString()).join('\n')
  + '\nconst BAND_ORDER=' + JSON.stringify(BAND_ORDER) + ',BAND_LABEL=' + JSON.stringify(BAND_LABEL) + ',BAND_CHIP=' + JSON.stringify(BAND_CHIP) + ';\n';
