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
    if (g.prOnly) { // an open pull request on a branch with no chat and no worktree: placed from the pull request alone
      const q = g.pr;
      if (!q) { return 'idle'; }
      return q.checks === 'failing' || q.review === 'changes requested' || (q.review === 'approved' && (q.checks === 'passing' || q.checks === 'none')) ? 'finish' : 'waiting';
    }
    if (g.locked || !g.ok) { return 'idle'; }
    if (g.pr && g.pr.checks === 'failing') { return 'finish'; }
    if (g.files > 0 || g.ahead > 0) { return 'finish'; }
    return g.ready ? 'tidy' : 'idle';
  }
  if (dot === 'waiting' || dot === 'unread') { return 'needs'; }
  const p = g && g.ok ? g.pr : undefined;
  if (p && p.checks === 'failing') { return 'finish'; }
  if (dot === 'running' || dot === 'background') { return 'waiting'; }
  if (g && g.ok) {
    if (g.files > 0 || g.ahead > 0) { return 'finish'; }
    if (p) { return p.review === 'changes requested' || (p.review === 'approved' && (p.checks === 'passing' || p.checks === 'none')) ? 'finish' : 'waiting'; }
    const old = typeof last === 'number' && typeof now === 'number' && now - last >= 3 * 86400000;
    if (g.gone || g.ready || (g.merged && !g.isDef) || (old && (g.up || g.isDef || g.merged))) { return 'tidy'; }
  }
  return 'idle';
}

/** Group headers of the Project status table (same keys as the bands, so the saved "turned off" list keeps its meaning). */
export const GROUP_LABEL: { [k: string]: string } = { needs: 'Needs you', finish: 'Unfinished work', waiting: 'Waiting', tidy: 'Cleanup', idle: 'Idle' };

/**
 * The one verdict of a Project status row: state (one short word or phrase), group (needs, finish, waiting, tidy, idle), reason (at most 6 words),
 * full (the same reason as one plain sentence, for the tooltip) and tags (secondary facts, the page shows two at most).
 * i: name, defName, isDef, local, remote, stray ({git}), wt (null or {missing, main, locked, known, files, unpushed, behind, gone, merged}), a and bh (commits ahead of and behind the default branch, undefined when not read),
 *    up (the branch has a remote branch), gone, merged (merged into the default branch), pr (null or {n, checks, review, draft}), chat ('waiting', 'unread', 'running', 'background' or ''),
 *    chatTitle (title of the chat that is waiting or unread, for the unread reason).
 * First matching rule wins; unknown facts never move a row into a worse group.
 */
export function workVerdict(i: any): { state: string; group: string; reason: string; full: string; tags: string[] } {
  const out = (state: string, group: string, reason: string, full?: string, tags?: string[]) => ({ state, group, reason, full: full || reason, tags: tags || [] });
  const dn = i.defName || 'main', w = i.wt, pr = i.pr;
  const tags: string[] = [];
  if (w && w.locked && !w.main) { tags.push('locked'); }
  if (pr && pr.draft) { tags.push('draft'); }
  if (i.gone) { tags.push('remote branch deleted'); }
  if (w && w.main && !i.isDef) { tags.push('main checkout'); }
  if (i.stray) { return out('Leftover folder', 'tidy', 'Not a git worktree', i.stray.git ? 'Git does not list this folder as a worktree: repair or remove it' : 'A plain folder left behind by a removed worktree', tags); }
  const files = w && w.known ? w.files || 0 : 0;
  const never = !w && i.local && !i.up && !i.gone && !i.isDef && typeof i.a === 'number' && i.a > 0; // a branch with no worktree that was never pushed
  const unp = w && w.known ? w.unpushed || 0 : never ? i.a : 0;
  const bh = typeof i.bh === 'number' ? i.bh : w ? w.behind || 0 : 0;
  const behind = bh > 0 ? ', ' + bh + ' behind ' + (i.isDef ? 'origin' : dn) : '';
  const prWord = (p: any): string => '#' + p.n + (p.checks === 'passing' ? ', checks passing' : p.checks === 'failing' ? ', checks failing' : p.checks === 'pending' ? ', checks running' : '') + (p.review === 'approved' ? ', approved' : p.review === 'review requested' ? ', needs review' : '');
  const prFull = (p: any): string => 'PR #' + p.n + ' is open' + (p.checks === 'passing' ? ', checks passing' : p.checks === 'failing' ? ', checks failing' : p.checks === 'pending' ? ', checks running' : '') + (p.review === 'approved' ? ', approved' : p.review === 'review requested' ? ', needs review' : '');
  if (i.chat === 'waiting') { return out('Needs you', 'needs', 'Chat waiting for your answer', 'A chat is waiting for your answer', tags); }
  if (i.chat === 'unread') {
    const t = String(i.chatTitle || '').trim(), title = t.length > 40 ? t.slice(0, 39) + '…' : t;
    return out('Needs you', 'needs', title ? 'Unread: ' + title : 'Unread chat', 'A chat finished while you were away: read it', tags);
  }
  if (w && w.missing) { return out('Needs you', 'needs', 'Worktree folder is gone', 'The worktree folder is gone: prune the worktree', tags); }
  if (pr && pr.checks === 'failing') { return out('PR failing', 'needs', 'Checks failing on PR #' + pr.n, 'Checks are failing on PR #' + pr.n, tags); }
  if (pr && pr.review === 'changes requested') { return out('Needs you', 'needs', 'Changes requested on PR #' + pr.n, 'Changes were requested on PR #' + pr.n, tags); }
  if (i.chat === 'running' || i.chat === 'background') { return out('Working…', 'waiting', '', 'A chat is working here right now', tags); }
  if (files > 0) { return out('Dirty', 'finish', countWord(files, 'file') + ' uncommitted' + (unp > 0 ? ', ' + unp + ' unpushed' : ''), countWord(files, 'file') + ' not committed' + (unp > 0 ? ', ' + countWord(unp, 'commit') + ' not pushed' : '') + behind, tags); }
  if (unp > 0) { return out('Unpushed', 'finish', countWord(unp, 'commit') + (never ? ' only on this computer' : ' not pushed'), countWord(unp, 'commit') + (never ? ' only on this computer' : ' not pushed') + behind, tags); }
  if (pr && pr.review === 'approved' && (pr.checks === 'passing' || pr.checks === 'none')) { return out('Needs you', 'needs', 'PR #' + pr.n + ' approved, ready to merge', 'PR #' + pr.n + ' is approved and its checks pass: ready to merge', tags); }
  if (pr) { return out('PR open', 'waiting', prWord(pr), prFull(pr), tags); }
  const same = !i.isDef && !w?.main && typeof i.a === 'number' && i.a === 0;
  if (!i.isDef && !(w && (w.main || w.locked || w.ws || (!w.known && !w.missing))) && (i.merged || same || i.gone || (w && w.merged === true))) {
    const tail = w ? ': the worktree can be removed' : '';
    if (same) { return out('Merged clean', 'tidy', 'Same as ' + dn + ', nothing unique', 'Same as ' + dn + ', nothing unique' + (w ? tail : ': the branch can be deleted'), tags); }
    if (i.gone && !i.merged) { return out('Merged clean', 'tidy', 'Remote branch deleted, nothing unpushed', 'The remote branch was deleted and nothing is unpushed', tags); }
    return out('Merged clean', 'tidy', 'Merged into ' + dn + ', nothing to lose', 'Merged into ' + dn + ', nothing to lose' + tail, tags);
  }
  if (!i.local && i.remote) { return out('Remote only', 'idle', 'Only on GitHub, no local copy', 'Only on GitHub, no local copy' + (typeof i.a === 'number' && i.a > 0 ? ', ' + countWord(i.a, 'commit') + ' not in ' + dn : ''), tags); }
  if (bh > 0 && !(typeof i.a === 'number' && i.a > 0)) { return out('Behind', 'idle', bh + ' behind ' + (i.isDef ? 'origin' : dn) + ', no own work', bh + ' behind ' + (i.isDef ? 'origin' : dn) + ', nothing of its own', tags); }
  if (typeof i.a === 'number' && i.a > 0 && i.local) { return out('No PR', 'idle', countWord(i.a, 'commit') + ' pushed, no PR', countWord(i.a, 'commit') + ' pushed' + (bh > 0 ? ', ' + bh + ' behind ' + dn : '') + ', no pull request', tags); }
  if (w && !w.known) { return out('Idle', 'idle', 'Git state not read', 'Git state not read (' + (w.unread || 'unknown') + ')', tags); }
  return out('Idle', 'idle', 'Nothing open', 'Nothing open', tags);
}

/** Rows per group, as the page lists them: the one source of every number shown next to a group. */
export type GroupCounts = { needs: number; finish: number; waiting: number; tidy: number; idle: number };

/**
 * The answer-first line above the table: "proj — 2 need you · 1 unfinished · 4 waiting · 3 to clean up". Zero parts are left out.
 * counts: rows per group (the page passes the counts of the rows it lists). project: name put in front, left out when empty.
 */
export function workHeadline(counts: GroupCounts, complete = true, project = ''): string {
  const lead = project ? project + ' — ' : '';
  const n = counts.needs + counts.finish + counts.waiting + counts.tidy + counts.idle;
  if (!n) { return lead + (complete ? 'No branches besides the default one. Nothing is open.' : 'No branches besides the default one so far; some parts were not read yet.'); }
  const parts: string[] = [];
  if (counts.needs) { parts.push(counts.needs + (counts.needs === 1 ? ' needs you' : ' need you')); }
  if (counts.finish) { parts.push(counts.finish + ' unfinished'); }
  if (counts.waiting) { parts.push(counts.waiting + ' waiting'); }
  if (counts.tidy) { parts.push(counts.tidy + ' to clean up'); }
  if (!parts.length) { parts.push(complete ? 'Nothing is open' : 'Nothing open so far'); }
  if (counts.idle) { parts.push(counts.idle + ' idle'); }
  return lead + parts.join(' · ');
}

/** Plain-words count: 1 file, 2 files. */
export function countWord(n: number, one: string, many?: string): string { return n + ' ' + (n === 1 ? one : many || one + 's'); }

/** One plain sentence on what to do next, from the dot state and the git view. */
export function nextStep(dot: string, g?: any): string {
  if (dot === 'waiting') { return 'The agent is waiting for your answer. Open the chat and reply.'; }
  if (dot === 'unread') { return 'The agent finished while you were away. Open the chat to read it.'; }
  if (dot === 'running') { return 'The agent is working in this chat. Nothing to do yet.'; }
  if (dot === 'background') { return 'Background agents are still working for this chat. Nothing to do yet.'; }
  if (!g || !g.ok) { return 'No open work is known for this chat yet. Git state is not shown.'; }
  const pr = g.pr ? 'pull request #' + g.pr.n : '';
  if (pr && g.pr.checks === 'failing') { return 'A check is failing on ' + pr + '. Open the pull request and fix it.'; }
  const todo: string[] = [];
  if (g.files > 0) { todo.push('commit or discard ' + countWord(g.files, 'changed file')); }
  if (g.ahead > 0) { todo.push('push ' + countWord(g.ahead, 'commit')); }
  if (todo.length) { return 'Open work: ' + todo.join(', then ') + '.'; }
  if (pr) { return g.pr.review === 'changes requested' ? 'Changes were requested on ' + pr + '. Make them and push.' : g.pr.review === 'approved' && (g.pr.checks === 'passing' || g.pr.checks === 'none') ? 'The ' + pr + ' is approved. It is ready to merge.' : 'Waiting on ' + pr + ' (review or checks).'; }
  if (g.ready) { return 'This worktree is finished. You can remove it with the copied command.'; }
  if (g.gone) { return 'The remote branch is gone. The branch can be deleted and the chat archived.'; }
  if (g.merged && !g.isDef) { return 'This branch is merged. It can be deleted and the chat archived.'; }
  return 'Nothing is open. Archive the chat when you are done with it.';
}

/** Row order: 'recent' (newest first, the default) or 'name' (title). */
export function rowCmp(mode?: string): (a: any, b: any) => number {
  const byLast = (a: any, b: any): number => b.last - a.last;
  const text = (k: string) => (a: any, b: any): number => String(a[k] || '').toLowerCase().localeCompare(String(b[k] || '').toLowerCase()) || byLast(a, b);
  const base = mode === 'name' ? text('title') : byLast;
  return (a: any, b: any): number => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || base(a, b); // pinned chats first
}

/** Rows by band (newest first unless sort says otherwise); every band is present, empty or not. bandFn(row, dot) places a row (the page uses it to hold rows still while they are hovered). */
export function bandRows(rows: Array<{ id: string; last: number }>, dots: { [id: string]: { s: string } }, bandFn?: (r: any, dot: string) => string, sort?: string): { [band: string]: any[] } {
  const out: { [band: string]: any[] } = { needs: [], finish: [], waiting: [], tidy: [], idle: [] };
  const place = bandFn || function (r: any, dot: string): string { return bandOf(dot); };
  const sorted = rows.slice().sort(rowCmp(sort));
  for (const r of sorted) { out[place(r, dots[r.id] ? dots[r.id].s : 'idle')].push(r); }
  return out;
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

/** True when every word of the query appears (any case) in the row's text; an empty query matches everything. */
export function filterMatch(hay: string, q: string): boolean {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const h = String(hay || '').toLowerCase();
  for (const w of words) { if (h.indexOf(w) < 0) { return false; } }
  return true;
}

/** State filters (f: pr, fail, dirty, push): a row passes when it meets every one that is on. A row whose git state is unknown fails them. */
export function flagPass(g: any, f: any): boolean {
  if (!f || !(f.pr || f.fail || f.dirty || f.push)) { return true; }
  if (!g || !g.ok) { return false; }
  if (f.pr && !g.pr) { return false; }
  if (f.fail && !(g.pr && g.pr.checks === 'failing')) { return false; }
  if (f.dirty && !(g.files > 0)) { return false; }
  if (f.push && !(g.ahead > 0)) { return false; }
  return true;
}

/**
 * Markdown summary of the open items (band, title, project, branch, state, files, ahead, pr, wt, ready, locked per item).
 * Titles and names are cleaned: control characters and line breaks become spaces, links and long key-like strings are replaced, markdown characters escaped. No links are ever included.
 */
export function summaryOf(items: any[], days: number): { text: string; n: number } {
  const clean = (s: any): string => String(s == null ? '' : s).replace(/[\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/https?:\/\/\S+/gi, '[link]').replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[redacted]').replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]').replace(/[A-Za-z0-9+\/=_-]{20,}/g, (t: string) => (/[+\/=]/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t) && /[0-9]/.test(t) ? '[redacted]' : t)).replace(/\s+/g, ' ').trim().slice(0, 120).replace(/([\\`*_{}\[\]<>|#~])/g, '\\$1');
  const order = ['needs', 'finish', 'waiting', 'tidy'];
  const labels: { [k: string]: string } = { needs: 'Needs you', finish: 'To finish', waiting: 'Waiting on others', tidy: 'Ready to tidy' };
  const open = items.filter((x) => order.indexOf(x.band) >= 0);
  const out: string[] = ['# Open work: ' + countWord(open.length, 'item'), '', 'Chats from the last ' + countWord(days, 'day') + ', and worktrees without a chat.', ''];
  out.push(order.map((b) => labels[b] + ' ' + open.filter((x) => x.band === b).length).join(', ') + '.');
  for (const b of order) {
    const list = open.filter((x) => x.band === b);
    if (!list.length) { continue; }
    out.push('', '## ' + labels[b] + ' (' + list.length + ')');
    for (const x of list) {
      const where = [clean(x.project), clean(x.branch)].filter(Boolean).join(', ');
      const facts: string[] = [];
      if (x.prOnly) { facts.push('pull request branch, no worktree'); }
      else if (x.wt) { facts.push(x.locked ? 'worktree, locked' : x.ready ? 'worktree, ready to remove' : 'worktree'); }
      if (x.state) { facts.push(clean(x.state)); }
      if (x.files > 0) { facts.push(countWord(x.files, 'uncommitted file')); }
      if (x.ahead > 0) { facts.push(countWord(x.ahead, 'unpushed commit')); }
      if (x.pr) { facts.push('PR #' + Number(x.pr.n) + (x.pr.draft ? ' draft' : '') + (x.pr.review ? ' ' + clean(x.pr.review) : '') + (x.pr.checks && x.pr.checks !== 'unknown' && x.pr.checks !== 'none' ? ', checks ' + clean(x.pr.checks) : '')); }
      out.push('- **' + clean(x.title || 'Untitled') + '**' + (where ? ' (' + where + ')' : '') + (facts.length ? ': ' + facts.join('; ') : ''));
    }
  }
  if (!open.length) { out.push('', 'Nothing is open.'); }
  return { text: out.join('\n') + '\n', n: open.length };
}

/**
 * The GitHub connection indicator of the top bar from what the page knows: the lookup setting (on), the `gh auth status` answer (gh: st ok, missing, unauth or error, with reason),
 * the per-repository pull request states (st queued, checking, ok, unavailable; reason; at, the time of the last good answer) and the clock (now).
 * Returns kind (off, missing, unauth, limit, error, partial, wait, ok), cls (off, ok, warn, bad), short text, tooltip with the next step, and click (setting or refresh).
 * Repositories that are simply not on GitHub are neither failures nor counted as checked.
 */
export function ghStatus(i: { on: boolean; gh?: { st: string; reason?: string } | null; repos: Array<{ st: string; reason?: string; at?: number }>; now: number }): { kind: string; cls: string; text: string; tip: string; click: string } {
  const out = (kind: string, cls: string, text: string, tip: string, click: string) => ({ kind, cls, text, tip, click });
  const age = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 10 ? 'just now' : s < 60 ? s + ' s ago' : s < 3600 ? Math.floor(s / 60) + ' min ago' : Math.floor(s / 3600) + ' h ago'; };
  if (!i.on) { return out('off', 'off', 'GitHub off', 'Pull request lookup is off, so pull requests and checks are not shown. To turn it on, enable the setting "Look Up Pull Requests". Click to open that setting.', 'setting'); }
  const g = i.gh, rs = i.repos || [];
  const failed = rs.filter((r) => r.st === 'unavailable' && r.reason !== 'not a GitHub repository');
  const why = (re: RegExp): boolean => (g ? re.test(String(g.reason || '')) && g.st !== 'ok' : false) || failed.some((r) => re.test(String(r.reason || '')));
  if ((g && g.st === 'missing') || why(/gh not installed/)) { return out('missing', 'bad', 'gh not installed', 'The GitHub command line tool (gh) was not found, so pull requests cannot be looked up. Install it from cli.github.com, then click to check again.', 'refresh'); }
  if ((g && g.st === 'unauth') || why(/not signed in/)) { return out('unauth', 'bad', 'gh not signed in', 'gh is installed but not signed in. Run "gh auth login" in a terminal, then click to check again.', 'refresh'); }
  if (why(/rate limit/)) { return out('limit', 'warn', 'GitHub rate limited', 'GitHub says too many requests were made (rate limit reached). Wait a few minutes, then click to try again.', 'refresh'); }
  if (g && g.st === 'error') { return out('error', 'warn', 'GitHub problem', 'gh could not be checked: ' + (g.reason || 'unknown reason') + '. Click to check again.', 'refresh'); }
  const ok = rs.filter((r) => r.st === 'ok'), pending = rs.filter((r) => r.st === 'queued' || r.st === 'checking');
  if (failed.length) {
    const reasons = failed.map((r) => r.reason || 'unknown reason').filter((x, k, a) => a.indexOf(x) === k).slice(0, 3).join('; ');
    const all = !ok.length && !pending.length;
    return out(all ? 'error' : 'partial', all ? 'bad' : 'warn', all ? 'GitHub failed' : 'GitHub partly failed', 'Pull request lookup failed for ' + failed.length + ' of ' + rs.length + (rs.length === 1 ? ' repository' : ' repositories') + ': ' + reasons + '. Click to try again.', 'refresh');
  }
  if (!ok.length) { return out('wait', 'off', 'GitHub checking', 'Waiting for the first pull request lookup. Click to refresh.', 'refresh'); }
  const at = ok.reduce((m, r) => Math.max(m, r.at || 0), 0);
  return out('ok', 'ok', 'GitHub OK', 'GitHub lookup works. Checked ' + ok.length + (ok.length === 1 ? ' repository' : ' repositories') + (at ? ', last lookup ' + age(i.now - at) : '') + (pending.length ? ', ' + pending.length + ' still checking' : '') + '. Click to refresh.', 'refresh');
}

/** Source of the functions and constants above, for the page script. */
export const WORK_MODEL_SRC = [bandOf, countWord, workVerdict, workHeadline, nextStep, rowCmp, bandRows, wtReady, fingerprint, doneHidden, filterMatch, flagPass, summaryOf, ghStatus].map((f) => f.toString()).join('\n')
  + '\nconst BAND_ORDER=' + JSON.stringify(BAND_ORDER) + ',BAND_LABEL=' + JSON.stringify(BAND_LABEL) + ',BAND_CHIP=' + JSON.stringify(BAND_CHIP) + ',GROUP_LABEL=' + JSON.stringify(GROUP_LABEL) + ';\n';
