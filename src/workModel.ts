/**
 * Open Work model: pure, self-contained functions (no outer references except each other) because the page
 * embeds their source via Function.toString(); node checks import the same functions.
 * Slice 1 uses chat state only. The git and pull request rules of the later slices plug into bandOf.
 */

export const BAND_ORDER = ['needs', 'finish', 'waiting', 'tidy', 'idle'];
export const BAND_LABEL: { [k: string]: string } = { needs: 'Needs you', finish: 'To finish', waiting: 'Waiting on others', tidy: 'Ready to tidy', idle: 'Idle' };
/** Header chip text per band (the idle band has no chip). */
export const BAND_CHIP: { [k: string]: string } = { needs: 'need you', finish: 'to finish', waiting: 'waiting', tidy: 'to tidy' };

/** Band of a chat from its dot state (running, waiting, unread, idle). First matching rule wins. */
export function bandOf(dot: string): string {
  if (dot === 'waiting' || dot === 'unread') { return 'needs'; }
  // To finish (slices 2 and 3): files, unpushed commits, pull request review and checks, from git facts. Not known yet: never guessed.
  if (dot === 'running') { return 'waiting'; }
  // Ready to tidy (slice 2): clean and pushed, from git facts. Not known yet: never guessed.
  return 'idle';
}

/** One plain sentence on what to do next, from the dot state only. */
export function nextStep(dot: string): string {
  if (dot === 'waiting') { return 'The agent is waiting for your answer. Open the chat and reply.'; }
  if (dot === 'unread') { return 'The agent finished while you were away. Open the chat to read it.'; }
  if (dot === 'running') { return 'The agent is working in this chat. Nothing to do yet.'; }
  return 'No open work is known for this chat yet. Git and pull request state are not shown.';
}

/** Rows by band, newest first; the idle band holds chats with no signal. Every band is present, empty or not. */
export function bandRows(rows: Array<{ id: string; last: number }>, dots: { [id: string]: { s: string } }): { [band: string]: any[] } {
  const out: { [band: string]: any[] } = { needs: [], finish: [], waiting: [], tidy: [], idle: [] };
  const sorted = rows.slice().sort((a, b) => b.last - a.last);
  for (const r of sorted) { out[bandOf(dots[r.id] ? dots[r.id].s : 'idle')].push(r); }
  return out;
}

/** Display groups for a mode: attention (bands), chat (one flat list) or repo (by project folder, newest group first). hidden lists bands whose rows are left out. */
export function groupRows(rows: Array<{ id: string; last: number; project: string }>, dots: { [id: string]: { s: string } }, mode: string, hidden: string[]): Array<{ key: string; label: string; rows: any[] }> {
  const by = bandRows(rows, dots);
  if (mode === 'chat' || mode === 'repo') {
    const shown = rows.filter((r) => hidden.indexOf(bandOf(dots[r.id] ? dots[r.id].s : 'idle')) < 0).sort((a, b) => b.last - a.last);
    if (mode === 'chat') { return shown.length ? [{ key: 'all', label: 'All chats', rows: shown }] : []; }
    const g: { [p: string]: any[] } = {};
    for (const r of shown) { (g[r.project || 'Unknown folder'] = g[r.project || 'Unknown folder'] || []).push(r); }
    return Object.keys(g).sort((a, b) => g[b][0].last - g[a][0].last).map((p) => ({ key: 'repo:' + p, label: p, rows: g[p] }));
  }
  const labels: { [k: string]: string } = { needs: 'Needs you', finish: 'To finish', waiting: 'Waiting on others', tidy: 'Ready to tidy', idle: 'Idle' };
  return ['needs', 'finish', 'waiting', 'tidy', 'idle'].filter((b) => hidden.indexOf(b) < 0 && by[b].length).map((b) => ({ key: b, label: labels[b], rows: by[b] }));
}

/** Source of the functions and constants above, for the page script. */
export const WORK_MODEL_SRC = [bandOf, nextStep, bandRows, groupRows].map((f) => f.toString()).join('\n')
  + '\nconst BAND_ORDER=' + JSON.stringify(BAND_ORDER) + ',BAND_LABEL=' + JSON.stringify(BAND_LABEL) + ',BAND_CHIP=' + JSON.stringify(BAND_CHIP) + ';\n';
