// Fails the build when the Open Work page misbehaves. Runs the real page (out/openWorkHtml.js) in node vm through the
// shared harness at widths 400, 760 and 1400, feeds every host message type, drives every button and the keyboard,
// and also checks the pure model, the worker rows, and the real worker thread (a soft chat-list request that answers at once).
// Any exception, window.onerror or console.error from the page script is a failure.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHarness } = require('./webview_harness');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const page = require(path.join(OUT, 'openWorkHtml.js')).openWorkHtml();
const model = require(path.join(OUT, 'workModel.js'));
const failures = [];
process.on('exit', (c) => { if (c !== 0 && failures.length) { console.error(failures.slice(0, process.env.ALL ? 9999 : 30).join('\n')); } });
const bad = (what, e) => failures.push(what + (e ? ': ' + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ') : ''));
const NOW = Date.now(), H = 3600e3;
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const row = (n, o) => Object.assign({ id: id(n), title: 'Session ' + n, project: n % 2 ? 'alpha' : 'beta', last: NOW - n * H, pinned: false,
  ctx: { pct: 61, tokens: 619392, window: 1000000, model: 'sonnet-5-5', comp: 0, pend: false, approx: false } }, o || {});

// A stub target whose closest() answers like the real DOM for [data-a] and .row.
function target(a, rowId, more) {
  const rowEl = rowId ? { dataset: { id: rowId } } : null;
  const t = Object.assign({ dataset: { a }, closest: (sel) => (sel === '[data-a]' ? t : sel === '.row' ? rowEl : null) }, more || {});
  return t;
}

const VIEW_POPS = ['vwb', 'vwm', 'mob', 'mom', 'shb', 'shm', 'smb', 'ghs', 'dnb'];
// Shared fixtures for the single-repository page. The page shows one repository: the workspace folder's (ws true).
const wtm = (k, name, branch, o) => Object.assign({ k, name, path: '/p/' + name, branch, detached: false, sha: 'abc1234', main: false, missing: false, locked: false, prunable: false, merged: null, ws: false, fks: [] }, o || {});
const repoMsg = (scan, worktrees, o) => Object.assign({ type: 'repo', scan, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: [], ws: true, gh: true, branches: [], worktrees }, o || {});
const mainRepo = (scan, fks, o) => repoMsg(scan, [wtm('w1', 'proj', 'main', { main: true, fks })], o);
/** The count next to a group header (its pill), or -1 when the group is not listed. */
const pillOf = (html, label) => { const m = new RegExp('<section[^>]*aria-label="' + label + '"[^]*?<span class="pill">(\\d+)</span>').exec(html); return m ? Number(m[1]) : -1; };
/** True when, for every group listed and open, the number next to it equals the rows listed in it. */
const groupsAgree = (html) => [...html.matchAll(/<section class="band ps wg[^>]*aria-label="([^"]+)"[^]*?<\/section>/g)].every((m) => { const pill = /<span class="pill">(\d+)<\/span>/.exec(m[0]); const nbAt = m[0].indexOf('aria-label="Chats without a branch"'); return !/<div class="wk"/.test(m[0]) || (m[0].match(/<div class="wr"/g) || []).length - (m[0].match(/<div class="wr"[^>]*data-kid="1"/g) || []).length + (nbAt < 0 ? 0 : (m[0].slice(nbAt).match(/class="row"/g) || []).length) === Number(pill[1]); });
/** The visible text of the summary line. */
const hlOf = (html) => { const m = /class="hl"[^>]*>([^<]*)</.exec(html); return m ? m[1] : ''; };
/** Open every collapsed group (Cleanup and Idle start closed), like a reader who clicked them. */
function openGroups(H) {
  const body = H.els.get('body');
  for (const m of [...body.innerHTML.matchAll(/data-a="sec" data-s="(g:[a-z]+)" aria-expanded="false"/g)]) { H.fire(body, 'click', { target: target('sec', '', { dataset: { a: 'sec', s: m[1] } }) }); }
}
/** Open every collapsed group, chat list and the chats section, like a reader who clicked them all. */
function openAll(H) {
  const body = H.els.get('body');
  openGroups(H);
  for (const m of [...body.innerHTML.matchAll(/data-a="hx" data-x="([^"]*)" data-on="0"/g)]) { H.fire(body, 'click', { target: target('hx', '', { dataset: { a: 'hx', x: m[1], on: '0' } }) }); }
}

const BCLS = { 'Needs you': 'b-needs', 'To finish': 'b-finish', 'Waiting on others': 'b-waiting', 'Ready to tidy': 'b-tidy' };
/** The html of one chat row (by its id): from its data-id to the next chat row or the end of the list it is in. */
const rowSlice = (body, key) => { const h = body.innerHTML, i = h.indexOf('data-id="' + key + '"'); if (i < 0) { return ''; } const ends = ['class="row"', '<div class="wr"', '<div class="hxr"', '</section>'].map((m) => h.indexOf(m, i + 1)).filter((v) => v >= 0); return h.slice(i, ends.length ? Math.min(...ends) : undefined); };
/** The html of one table row: by worktree key (w), branch name (b) or pull request number (n). */
const trSlice = (body, attr, val) => { const m = new RegExp('<div class="wr"[^>]*data-' + attr + '="' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^]*?(?=<div class="wr"|<div class="hxr"|</div></section>|$)').exec(body.innerHTML); return m ? m[0] : ''; };
/** The state pill of a chat row says which attention state it is in (the page has no bands any more). */
const inBandOf = (body, label, n) => new RegExp('class="st ' + BCLS[label] + '"').test(rowSlice(body, id(n)));

function scenario(W) {
  const H1 = createHarness({ page, name: 'openwork@' + W, width: W, popIds: VIEW_POPS });
  const { els, document, posted, run, fire, deliver, advance, check, step } = H1;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  H1.start();
  check(tag('page says ready'), posted.some((p) => p.type === 'ready'));
  step('init', () => deliver({ type: 'init', v: 1, days: 14, hidden: [], ws: 1 }));
  check(tag('loading state before the list'), /Loading sessions/.test(body.innerHTML) && body.getAttribute('aria-busy') === 'true');
  check(tag('layout follows width'), els.get('wrap').classList.contains('wide') === (W >= 1080));
  step('empty list', () => deliver({ type: 'chats', scan: 1, rows: [], indexing: false }));
  check(tag('before git is read the page says so and is no longer busy'), /Reading git/.test(body.innerHTML) && body.getAttribute('aria-busy') === 'false');
  step('scan ends with no repository', () => { deliver({ type: 'end', scan: 1, open: [], gitMissing: false }); advance(300); });
  check(tag('no git repository in the workspace folder gives one plain message and no tables'), /Open a git repository folder/.test(body.innerHTML) && !/<table/.test(body.innerHTML));
  step('no workspace folder at all', () => { deliver({ type: 'init', v: 1, days: 14, hidden: [], ws: 0 }); advance(300); });
  check(tag('no workspace folder gives the same message'), /Open a git repository folder/.test(body.innerHTML));
  step('init again', () => deliver({ type: 'init', v: 1, days: 14, hidden: [], ws: 1 }));
  step('repository found', () => { deliver({ type: 'chats', scan: 2, rows: [], indexing: false }); deliver(mainRepo(2, [])); advance(300); });
  check(tag('the repository shows as one slim summary line with its name, a GitHub button and no totals, and no repository header block'), /class="psl"/.test(body.innerHTML) && /class="hl"[^>]*>proj — /.test(body.innerHTML) && /data-a="repolink" data-k="r1"/.test(body.innerHTML) && !/class="psh"|class="psr"/.test(body.innerHTML));
  check(tag('a repository with no other branch shows one plain headline, no table, no empty-state lines and no session section'), /class="hl"[^>]*>proj — No branches besides the default one/.test(body.innerHTML) && !/class="wk"|class="wh"/.test(body.innerHTML) && !/Pull requests|No worktrees match|Pull request author/.test(body.innerHTML) && !/Sessions without a branch/.test(body.innerHTML));
  const rows = [row(1), row(2), row(3, { pinned: true }), row(4, { ctx: undefined }), row(5, { title: 'A <b>bold</b> "quoted" title' })];
  step('three bands', () => { deliver({ type: 'chats', scan: 3, rows, indexing: false }); deliver({ type: 'dots', map: { [id(1)]: { s: 'waiting' }, [id(2)]: { s: 'running' }, [id(4)]: { s: 'idle' } } }); advance(300); });
  check(tag('sessions of a folder that is not in git sit in the closed Everything else group, as chats without a branch'), /aria-label="Everything else"/.test(body.innerHTML) && /data-a="sec" data-s="g:idle" aria-expanded="false"/.test(body.innerHTML) && (body.innerHTML.match(/class="row"/g) || []).length === 0 && /<span class="pill">5<\/span>/.test(body.innerHTML));
  step('open the sessions section', () => { openAll(H1); advance(300); });
  check(tag('opening the section lists the 5 chats'), (body.innerHTML.match(/class="row"/g) || []).length === 5);
  check(tag('git bands are stubs: no session lands in To finish or Ready to tidy'), model.bandOf('idle') === 'idle' && model.bandOf('running') === 'waiting' && model.bandOf('waiting') === 'needs' && model.bandOf('unread') === 'needs');
  const hdr = page.slice(page.indexOf('<header'), page.indexOf('</header>'));
  check(tag('the header has no group chips, totals or Updated line, and one row of controls'), !/id="cnt"|id="updw"|id="upd"|data-a="band"/.test(page) && !/class="tot"/.test(body.innerHTML) && /id="fq"/.test(hdr) && /id="vwb"/.test(hdr) && /id="srm"/.test(hdr) && /id="rf"/.test(hdr) && /id="mob"/.test(hdr) && /id="smb"/.test(hdr) && /id="shb"/.test(hdr) && /id="ghs"/.test(hdr) && /id="dnb"/.test(hdr) && (hdr.match(/data-f=/g) || []).length === 0);
  check(tag('every session row has a dot with words, a title, a context percent and an age'), (body.innerHTML.match(/class="row"/g) || []).length === 5 && /role="img" aria-label="Waiting for you"/.test(body.innerHTML) && />61%</.test(body.innerHTML));
  check(tag('titles are escaped'), !/<b>bold<\/b>/.test(body.innerHTML) && /&lt;b&gt;bold/.test(body.innerHTML));
  check(tag('pinned session shows a Pinned label'), /Pinned/.test(body.innerHTML));
  check(tag('exactly one row is in the tab order'), (body.innerHTML.match(/class="rb"[^>]*tabindex="0"/g) || []).length === 1);
  check(tag('each chat row opens on click, has a star, a mark-read button and a More actions button with aria-labels; the other actions wait in the menu'), (body.innerHTML.match(/data-a="(open|pin|done|mnu)"/g) || []).length === 20 && !/data-a="(handover|find|arch)"/.test(body.innerHTML) && /aria-label="More actions: Session 1"/.test(body.innerHTML));
  check(tag('no agent name in visible output'), !/claude/i.test(body.innerHTML));
  // Index state and failure states.
  step('indexing', () => deliver({ type: 'chats', scan: 3, rows: [row(1)], indexing: true }));
  check(tag('indexing line shows with a Retry button'), els.get('ixs').hidden === false && /Indexing\.\.\./.test(page) && /data-a="retry"/.test(page));
  step('retry from the indexing line', () => fire(els.get('body'), 'click', { target: target('retry') }));
  check(tag('Retry asks the host again'), posted.some((p) => p.type === 'refresh'));
  step('indexed answer', () => deliver({ type: 'chats', scan: 4, rows, indexing: false }));
  check(tag('indexing line hides'), els.get('ixs').hidden === true);
  step('stale answer', () => deliver({ type: 'chats', scan: 1, rows: [], indexing: false }));
  check(tag('an older scan is dropped'), /Session 1/.test(body.innerHTML));
  step('list failure', () => deliver({ type: 'chatsFailed', scan: 5, message: 'Could not load sessions' }));
  check(tag('failure shows Could not load sessions with Retry, never a spinner'), /Could not load sessions/.test(body.innerHTML) && /data-a="retry"/.test(body.innerHTML) && !/Loading sessions/.test(body.innerHTML));
  step('recover', () => deliver({ type: 'chats', scan: 6, rows, indexing: false }));
  check(tag('a good answer clears the failure'), !/Could not load sessions/.test(body.innerHTML));
  // Watchdog on the fake clock: a refresh nobody answers ends as Retry.
  step('refresh no answer', () => fire(els.get('body'), 'click', { target: target('refresh') }));
  const posts0 = posted.length;
  step('time passes', () => advance(20100));
  check(tag('an unanswered refresh turns into Could not load sessions after the watchdog'), /Could not load sessions/.test(body.innerHTML) && posts0 > 0);
  step('recover again', () => deliver({ type: 'chats', scan: 7, rows, indexing: false }));
  // Dots change a band.
  step('dots move a session', () => { deliver({ type: 'dots', map: { [id(2)]: { s: 'waiting' } } }); advance(300); });
  check(tag('dots refresh the page'), />Waiting for you</.test(body.innerHTML));
  step('dots again', () => { deliver({ type: 'dots', map: { [id(1)]: { s: 'unread' }, [id(2)]: { s: 'running' } } }); advance(300); });
  const mkRb = (n) => { const r = Object.assign(H1.mkEl(''), { dataset: { a: 'open' }, tabIndex: -1 }); r.classList.add('rb'); r.closest = (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null); return r; };
  // Buttons.
  const act = (a, n) => fire(els.get('body'), 'click', { target: target(a, id(n)) });
  const sent = (type, n, extra) => posted.some((p) => p.type === type && p.id === id(n) && (!extra || Object.keys(extra).every((k) => p[k] === extra[k])));
  step('open session', () => act('open', 3));
  check(tag('Open session posts open with the id'), sent('open', 3));
  step('find', () => act('find', 3));
  check(tag('Find posts find'), sent('find', 3));
  step('open the chat menu', () => fire(els.get('body'), 'click', { target: target('mnu', id(3), { dataset: { a: 'mnu', x: 'c:nb:' + id(3) } }) }));
  check(tag('the More actions button opens a menu with copy note, search and archive'), /aria-expanded="true"/.test(body.innerHTML) && />Copy hand-over note</.test(body.innerHTML) && />Search in the sidebar</.test(body.innerHTML) && />Archive</.test(body.innerHTML));
  step('handover', () => act('handover', 3));
  check(tag('Copy note posts handover and shows Copying'), sent('handover', 3) && />Copying\.\.\.</.test(body.innerHTML));
  step('handover done', () => deliver({ type: 'handoverState', id: id(3), state: 'done' }));
  advance(300);
  check(tag('Copied shows after done'), />Copied</.test(body.innerHTML));
  step('copied clears', () => advance(2100));
  check(tag('Copied clears back to Copy note'), !/>Copied</.test(body.innerHTML) && />Copy hand-over note</.test(body.innerHTML));
  step('archive', () => act('arch', 4));
  check(tag('Archive posts archive on and the row leaves'), sent('archive', 4, { on: true }) && !new RegExp('data-id="' + id(4) + '"').test(body.innerHTML));
  step('space expands the row', () => fire(document, 'keydown', { key: ' ', target: mkRb(3) }));
  check(tag('a row expands with a next step and aria-expanded'), /Next step/.test(body.innerHTML) && /aria-expanded="true"/.test(body.innerHTML));
  step('left collapses the row', () => fire(document, 'keydown', { key: 'ArrowLeft', target: mkRb(3) }));
  check(tag('ArrowLeft collapses it'), !/Next step/.test(body.innerHTML));
  // Keyboard walk on stub row buttons.
  const rbs = [mkRb(1), mkRb(2), mkRb(3)];
  document.querySelectorAll = (sel) => (sel === '.rb' ? rbs : []);
  const key = (k, i) => fire(document, 'keydown', { key: k, target: rbs[i] });
  step('arrow down', () => key('ArrowDown', 0));
  check(tag('ArrowDown moves focus to the next row'), rbs[1].focused === 1);
  step('arrow up', () => key('ArrowUp', 1));
  check(tag('ArrowUp moves focus back'), rbs[0].focused === 1);
  step('end and home', () => { key('End', 0); key('Home', 2); });
  check(tag('End and Home jump'), rbs[2].focused === 1 && rbs[0].focused === 2);
  step('enter', () => key('Enter', 1));
  check(tag('Enter opens the session'), sent('open', 2));
  step('space expands, left collapses', () => { key(' ', 0); });
  check(tag('Space expands'), /aria-expanded="true"/.test(body.innerHTML));
  step('left', () => key('ArrowLeft', 0));
  check(tag('ArrowLeft collapses'), !/data-a="open"[^>]*aria-expanded="true"/.test(body.innerHTML));
  step('right and escape', () => { key('ArrowRight', 0); key('Escape', 0); });
  check(tag('Escape collapses an open row'), !/data-a="open"[^>]*aria-expanded="true"/.test(body.innerHTML));
  step('focusin sets the roving stop', () => fire(document, 'focusin', { target: rbs[1] }));
  check(tag('focus moves the single tab stop'), rbs[1].tabIndex === 0 && rbs[0].tabIndex === -1);
  document.querySelectorAll = () => [];
  check(tag('the page has no group buttons any more, and a saved hidden list changes nothing'), !/data-a="band"/.test(body.innerHTML) && !posted.some((p) => p.type === 'prefs'));
  step('everything hidden', () => deliver({ type: 'dots', map: {} }));
  advance(300);
  check(tag('the sessions without a branch are still listed'), (body.innerHTML.match(/class="row"/g) || []).length === 4);
  step('init with an old hidden list', () => deliver({ type: 'init', v: 1, days: 30, hidden: ['tidy', 'bogus'], ws: 1 }));
  check(tag('init ignores the old hidden list'), !/bogus/.test(body.innerHTML) && !posted.some((p) => p.type === 'prefs'));
  step('reset prefs', () => deliver({ type: 'init', v: 1, days: 14, hidden: [], ws: 1 }));
  // 250 rows, and every message type with odd payloads, must not throw.
  const many = Array.from({ length: 250 }, (_, i) => row(i + 10));
  step('250 rows', () => { deliver({ type: 'chats', scan: 8, rows: many, indexing: false }); advance(300); openAll(H1); advance(300); });
  check(tag('250 rows render'), (body.innerHTML.match(/class="row"/g) || []).length === 250);
  for (const m of [{ type: 'unknown' }, { type: 'chats', scan: 9 }, { type: 'dots' }, { type: 'handoverState', id: id(1) }, { type: 'init' }, { type: 'chatsFailed', scan: 10 }, { type: 'chats', scan: 11, rows: [row(1, { title: '' , project: ''})] }]) { step('message ' + m.type, () => deliver(m)); }
  step('null message', () => { for (const f of H1.listeners.window.message || []) { f({ data: null }); } });
  advance(300);
  // Popover and tooltip placement inside the viewport.
  const m = els.get('vwm');
  m.offsetWidth = 400;
  els.get('vwb').getBoundingClientRect = () => ({ top: 8, left: W - 34, right: W - 8, bottom: 34, width: 26, height: 26 });
  step('sort popover opens', () => fire('vwb', 'click'));
  const left = parseFloat(m.style.left), w = Math.min(400, W - 16);
  check(tag('sort popover sits inside the viewport with an 8px margin'), !m.hidden && left >= 8 && left + w <= W - 8 && /px$/.test(m.style.top));
  step('escape closes it', () => fire(document, 'keydown', { key: 'Escape', target: els.get('vwb') }));
  check(tag('Escape closes the popover'), m.hidden === true);
  const tipEl = els.get('tip');
  const anchor = { dataset: { tip: 'Open session\nSecond line' }, isConnected: true, closest: (s) => (s === '[data-tip]' ? anchor : null), contains: () => false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getBoundingClientRect: () => ({ left: W - 40, right: W - 10, top: 100, bottom: 120, width: 30, height: 20 }) };
  tipEl.offsetWidth = Math.min(280, Math.floor(W * 0.9));
  step('tooltip shows', () => { fire(document, 'mouseover', { target: anchor }); advance(500); });
  const tl = parseFloat(tipEl.style.left);
  check(tag('tooltip shows its text and stays inside the viewport'), !tipEl.hidden && /Open session/.test(tipEl.innerHTML) && tl >= 4 && tl + tipEl.offsetWidth <= W - 4);
  step('tooltip hides', () => fire(document, 'keydown', { key: 'Escape', target: anchor }));
  check(tag('Escape hides the tooltip'), tipEl.hidden === true);
  // A tip inside a table row opens above the row (the Work page asks for it); one elsewhere keeps the old place.
  const wrow = { getBoundingClientRect: () => ({ left: 0, right: W, top: 300, bottom: 340, width: W, height: 40 }) };
  const ranchor = { dataset: { tip: 'Full sentence' }, isConnected: true, closest: (q) => (q === '[data-tip]' ? ranchor : q === '.wr' ? wrow : null), contains: () => false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getBoundingClientRect: () => ({ left: 40, right: 140, top: 310, bottom: 330, width: 100, height: 20 }) };
  tipEl.offsetHeight = 30;
  step('row tooltip shows', () => { fire(document, 'mouseover', { target: ranchor }); advance(500); });
  check(tag('a tooltip of a table row opens above the row so it never covers the next row'), !tipEl.hidden && parseFloat(tipEl.style.top) + tipEl.offsetHeight <= 300);
  step('row tooltip hides', () => fire(document, 'keydown', { key: 'Escape', target: ranchor }));
  wrow.getBoundingClientRect = () => ({ left: 0, right: W, top: 4, bottom: 44, width: W, height: 40 });
  step('row tooltip at the top edge', () => { fire(document, 'mouseover', { target: ranchor }); advance(500); });
  check(tag('at the top edge the row tooltip falls back to below the row'), !tipEl.hidden && parseFloat(tipEl.style.top) >= 44);
  step('top edge tooltip hides', () => fire(document, 'keydown', { key: 'Escape', target: ranchor }));
  tipEl.offsetHeight = 0;
  // Updated text ticks on the fake clock.
  step('updated ticks', () => advance(60000));
  check(tag('the Refresh button tooltip carries the update time'), /Updated \d+ (s|min) ago/.test(els.get('rf').title) && /Refresh/.test(els.get('rf').title));
  // Page script reads only ids its own page has (the 0.18.2 failure class).
  const used = [...H1.script.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((x) => x[1]).concat([...H1.script.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)].map((x) => x[1]));
  check(tag('the focus selector targets the row button inside the row that carries data-id'), /querySelector\('\.row\[data-id="'\+focusId\+'"\] \.rb'\)/.test(H1.script) && !/\.rb\[data-id/.test(H1.script));
  check(tag('every id the script reads exists in the page (' + used.filter((u) => !els.has(u)).join(',') + ')'), used.every((u) => els.has(u)));
  H1.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { scenario(W); }

// Slice 2: streamed git state, progress, timeouts, bands from git, hold-still, Mark done, expanded git facts, worktree rows.
function gitScenario(W) {
  const G = createHarness({ page, name: 'openwork-git@' + W, width: W, popIds: VIEW_POPS });
  const { els, document, posted, fire, deliver, advance, check, step } = G;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const DAY = 86400000;
  const facts = (o) => Object.assign({ name: 'proj', branch: 'main', detached: false, upstream: 'origin/main', ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true }, o || {});
  const fm = (scanNo, key, state, o) => Object.assign({ type: 'folder', scan: scanNo, key, state }, o || {});
  const click = (a, n, data) => fire(body, 'click', { target: target(a, n ? id(n) : '', data ? { dataset: Object.assign({ a }, data) } : undefined) });
  /* A stub row button for the keyboard handler: Space expands the chat row n, ArrowLeft collapses it (a click on a row opens the chat now). */
  const rbOf = (n) => ({ classList: { contains: (c) => c === 'rb' }, closest: (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null), dataset: {} });
  const exRow = (n) => fire(document, 'keydown', { key: ' ', target: rbOf(n) });
  const coRow = (n) => fire(document, 'keydown', { key: 'ArrowLeft', target: rbOf(n) });
  const rowsG = [row(1, { fk: 'f1', last: NOW - 1 * H }), row(2, { fk: 'f2', last: NOW - 5 * DAY }), row(3, { fk: 'f3', last: NOW - 2 * H }), row(4, { fk: 'f4', last: NOW - 3 * H }), row(5, { last: NOW - 4 * H })];
  const rowOf = (key) => rowSlice(body, key);
  const inBand = (label, n) => inBandOf(body, label, n);
  const repoG = { type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: ['gone-branch'], ws: true, worktrees: [
    { k: 'w1', name: 'proj', path: '/p/proj', branch: 'main', detached: false, main: true, missing: false, locked: false, prunable: false, merged: null, ws: true, fks: ['f1', 'f2', 'f3'] },
    { k: 'w2', name: 'proj-wt-a', path: '/p/proj-wt-a', branch: 'feat', detached: false, main: false, missing: false, locked: false, prunable: false, merged: true, ws: false, fks: [], facts: { ok: true, fileTotal: 0, ahead: 0, behind: 0, gone: false, files: [] } },
    { k: 'w3', name: 'proj-wt-b', path: '/p/proj-wt-b', branch: '', sha: 'abc1234', detached: true, main: false, missing: false, locked: true, lockReason: 'in use', prunable: false, merged: true, ws: false, fks: [], facts: { ok: true, fileTotal: 0, ahead: 0, behind: 0, gone: false, files: [] } },
    { k: 'w4', name: 'proj-wt-c', path: '/p/proj-wt-c', branch: 'wip', detached: false, main: false, missing: false, locked: false, prunable: false, merged: false, ws: false, fks: [], facts: { ok: true, fileTotal: 4, ahead: 0, behind: 0, gone: false, files: [{ s: 'M', p: 'x.js' }] } },
    { k: 'w5', name: 'proj-wt-d', path: '/p/gone', branch: 'old', detached: false, main: false, missing: true, locked: false, prunable: true, merged: true, ws: false, fks: [] } ] };
  G.start();
  step('init', () => deliver({ type: 'init', v: 2, days: 14, hidden: [], ws: 1, done: {} }));
  step('dots', () => deliver({ type: 'dots', map: {} }));
  step('sessions', () => { deliver({ type: 'chats', scan: 1, rows: rowsG, indexing: false, scanning: true }); for (const k of ['f1', 'f2', 'f3', 'f4']) { deliver(fm(1, k, 'queued')); } deliver(repoG); advance(300); openAll(G); advance(300); });
  check(tag('queued session rows show a waiting cell and are busy; the sessions sit in the main worktree row, the one without a folder under Chats without a branch'), /Waiting to read git/.test(body.innerHTML) && (body.innerHTML.match(/aria-busy="true"/g) || []).length === 4 && /Chats without a branch/.test(body.innerHTML));
  check(tag('a session with no folder is not busy'), rowOf(id(5)) !== '' && !new RegExp('data-id="' + id(5) + '" aria-busy="true"').test(body.innerHTML));
  step('running', () => { deliver(fm(1, 'f1', 'running')); deliver(fm(1, 'f3', 'running')); advance(300); openAll(G); advance(300); });
  check(tag('a running folder shows a spinner with a label'), /class="spin" role="img" aria-label="Reading git"/.test(rowOf(id(1))));
  step('progress', () => deliver({ type: 'progress', scan: 1, git: { done: 0, total: 4 } }));
  const prog = els.get('prog');
  check(tag('progress line shows the counter and is a progressbar with numbers'), prog.hidden === false && /Checking git: 0 of 4 folders/.test(prog.textContent) && prog.getAttribute('aria-valuemax') === '4' && prog.getAttribute('aria-valuenow') === '0' && /Checking git: 0 of 4/.test(prog.getAttribute('aria-valuetext')));
  step('f1 ends dirty', () => { deliver(fm(1, 'f1', 'ok', { facts: facts({ branch: 'feat', ahead: 2, fileTotal: 3, staged: 1, modified: 1, untracked: 1, files: [{ s: 'M', p: 'src/a.ts' }, { s: '?', p: '<img src=x onerror=alert(1)>.txt' }, { s: 'A', p: 'b.ts' }] }) })); deliver({ type: 'progress', scan: 1, git: { done: 1, total: 4 } }); advance(300); openAll(G); advance(300); });
  check(tag('progress counter moves'), /Checking git: 1 of 4 folders/.test(prog.textContent) && prog.getAttribute('aria-valuenow') === '1');
  check(tag('a dirty, unpushed session is To finish inside its worktree row, which shows the dirty and unpushed badges'), inBand('To finish', 1) && /3 files/.test(rowOf(id(1))) && /↑2/.test(rowOf(id(1))) && />feat</.test(rowOf(id(1))) && /3 files not committed/.test(trSlice(body, 'w', 'w1')) && /2 commits not pushed/.test(trSlice(body, 'w', 'w1')));
  check(tag('the Your move header and the headline count the dirty main checkout and the dirty worktree'), pillOf(body.innerHTML, 'Your move') === 3 && /Next: Prune · 2 more need you/.test(hlOf(body.innerHTML)));
  step('repo', () => { deliver(repoG); advance(300); openAll(G); advance(300); });
  check(tag('a clean merged worktree with no session is Merged clean, says the worktree can be removed and has a Copy remove command button'), /Merged clean/.test(trSlice(body, 'w', 'w2')) && /worktree can be removed/.test(trSlice(body, 'w', 'w2')) && /data-a="rm" data-k="w2"/.test(trSlice(body, 'w', 'w2')));
  check(tag('a locked worktree has a locked tag and no remove button or Merged clean state'), /locked/.test(trSlice(body, 'w', 'w3')) && !/data-a="rm" data-k="w3"/.test(trSlice(body, 'w', 'w3')) && !/Merged clean/.test(trSlice(body, 'w', 'w3')));
  check(tag('a dirty worktree with no session says Commit 4 files, no remove button, and counts in the Your move header'), />Commit 4 files</.test(trSlice(body, 'w', 'w4')) && /4 files not committed/.test(trSlice(body, 'w', 'w4')) && !/data-a="rm" data-k="w4"/.test(trSlice(body, 'w', 'w4')) && pillOf(body.innerHTML, 'Your move') === 3 && /2 more need you/.test(hlOf(body.innerHTML)));
  step('open the w5 popover', () => fire(body, 'click', { target: target('mnu', '', { dataset: { a: 'mnu', x: 'b:w:w5' } }) }));
  check(tag('a worktree whose folder is missing says Prune, and its popover has the remove command'), />Prune</.test(trSlice(body, 'w', 'w5')) && /data-a="rm" data-k="w5"/.test(trSlice(body, 'w', 'w5')) && /worktree folder is gone/.test(trSlice(body, 'w', 'w5')));
  check(tag('worktree rows get no session actions'), trSlice(body, 'w', 'w2') !== '' && !/data-a="(open|handover|find|arch|done)"/.test(trSlice(body, 'w', 'w2')));
  check(tag('a worktree row tooltip shows the full path (data-tip only; nothing is posted back)'), /data-tip="[^"]*\/p\/proj-wt-a/.test(trSlice(body, 'w', 'w2')));
  step('copy remove', () => click('rm', 0, { k: 'w2' }));
  check(tag('Copy remove command posts copyRemove with only the worktree key'), posted.some((p) => p.type === 'copyRemove' && p.key === 'w2' && Object.keys(p).length === 2));
  step('init windows', () => { deliver({ type: 'init', v: 2, days: 14, hidden: [], ws: 1, done: {}, win: true }); advance(300); openAll(G); advance(300); });
  check(tag('on Windows the button and its label say PowerShell'), /data-tip="Copy a PowerShell command that removes/.test(trSlice(body, 'w', 'w2')) && />Copy remove command</.test(trSlice(body, 'w', 'w2')));
  step('init not windows', () => { deliver({ type: 'init', v: 2, days: 14, hidden: [], ws: 1, done: {} }); advance(300); openAll(G); advance(300); });
  check(tag('elsewhere the button stays Copy remove command'), />Copy remove command</.test(trSlice(body, 'w', 'w2')) && /data-a="rm" data-k="w2"/.test(trSlice(body, 'w', 'w2')) && !/PowerShell/.test(trSlice(body, 'w', 'w2')));
  step('f2 clean, idle 5 days', () => { deliver(fm(1, 'f2', 'ok', { facts: facts() })); advance(300); openAll(G); advance(300); });
  check(tag('a clean, pushed session idle for 5 days is Ready to tidy'), inBand('Ready to tidy', 2));
  check(tag('a session on the main checkout is not given a remove button'), rowOf(id(2)) !== '' && !/data-a="rm"/.test(rowOf(id(2))));
  // Staleness.
  step('stale folder message', () => deliver(fm(0, 'f1', 'error', { reason: 'git error' })));
  step('stale after a newer scan number', () => deliver(fm(5, 'f1', 'error', { reason: 'git error' })));
  advance(300);
  check(tag('a message of another scan is dropped'), inBand('To finish', 1) && !/>error</.test(body.innerHTML));
  // Watchdog: a folder left on running ends as timed out with Retry on the fake clock.
  step('time passes', () => advance(15200));
  check(tag('a folder left on "running" becomes "timed out" with Retry after the watchdog'), /timed out/.test(rowOf(id(3))) && new RegExp('data-a="fretry" data-k="f3"').test(body.innerHTML) && !/class="spin"/.test(rowOf(id(3))));
  step('retry', () => click('fretry', 3, { k: 'f3' }));
  advance(300);
  check(tag('Retry posts retry with the folder key and shows the row as waiting'), posted.some((p) => p.type === 'retry' && p.key === 'f3') && !/data-a="fretry" data-k="f3"/.test(body.innerHTML));
  step('bad retry key', () => click('fretry', 3, { k: '../x' }));
  check(tag('a retry for a key that is not f/r + digits is not sent'), !posted.some((p) => p.type === 'retry' && p.key === '../x'));
  // end lists keys that never finished.
  step('end', () => { deliver(fm(1, 'f3', 'ok', { facts: facts({ branch: 'topic', fileTotal: 0 }) })); deliver({ type: 'end', scan: 1, open: ['f4'], gitMissing: false }); advance(300); openAll(G); advance(300); });
  check(tag('end hides progress, announces and marks unfinished keys timed out with Retry'), prog.hidden === true && /Scan finished, but some parts were not read: \d+ items? open so far\./.test(els.get('live').textContent) && /data-a="fretry" data-k="f4"/.test(body.innerHTML));
  // Idle watchdog on a second scan.
  step('second scan', () => { deliver({ type: 'chats', scan: 2, rows: rowsG, indexing: false, scanning: true }); deliver(fm(2, 'f1', 'queued')); deliver(fm(2, 'f2', 'queued')); deliver(Object.assign({}, repoG, { scan: 2 })); advance(300); openAll(G); advance(300); });
  check(tag('a new scan number starts progress again'), /Waiting to read git/.test(body.innerHTML));
  step('silence', () => advance(45500));
  check(tag('a scan that goes silent ends every waiting cell as timed out (never an endless spinner)'), !/Waiting to read git/.test(body.innerHTML) && /data-a="fretry" data-k="f1"/.test(body.innerHTML) && prog.hidden === true);
  step('recover', () => { deliver(fm(2, 'f1', 'ok', { facts: facts({ branch: 'feat', ahead: 2, fileTotal: 3, files: [{ s: 'M', p: 'src/a.ts' }, { s: '?', p: '<img src=x onerror=alert(1)>.txt' }, { s: 'A', p: 'b.ts' }], staged: 1, modified: 1, untracked: 1 }) })); deliver(fm(2, 'f2', 'ok', { facts: facts() })); deliver({ type: 'end', scan: 2, open: [] }); advance(300); openAll(G); advance(300); });
  // Hold still: a row under the mouse does not change band until the mouse leaves or 2 s pass.
  const hoverRow = (n) => ({ target: { closest: (s) => (s === '.row' ? { dataset: { id: id(n) } } : null), dataset: {} } });
  step('hover row 1', () => fire(document, 'mouseover', hoverRow(1)));
  step('row 1 gets cleaned up while hovered', () => { deliver(fm(2, 'f1', 'ok', { facts: facts({ branch: 'feat', ahead: 0, fileTotal: 0, upstream: 'origin/feat' }) })); advance(300); openAll(G); advance(300); });
  check(tag('a hovered row keeps its band while results stream in'), inBand('To finish', 1));
  step('mouse leaves', () => { fire(document, 'mouseover', { target: { closest: () => null, dataset: {} } }); advance(300); openAll(G); advance(300); });
  check(tag('the row settles in one move when the mouse leaves'), !inBand('To finish', 1) && rowOf(id(1)) !== '');
  step('hover again then 2 s', () => { fire(document, 'mouseover', hoverRow(1)); deliver(fm(2, 'f1', 'ok', { facts: facts({ branch: 'feat', ahead: 1, fileTotal: 1, files: [{ s: 'M', p: 'q.ts' }] }) })); advance(300); openAll(G); advance(300); });
  check(tag('while hovered the row stays where it was'), !inBand('To finish', 1));
  step('2 s idle', () => advance(2100));
  check(tag('after 2 s the row moves even if the mouse is still there'), inBand('To finish', 1));
  step('mouse out', () => fire(document, 'mouseover', { target: { closest: () => null, dataset: {} } }));
  // Expanded row: git facts, escaped file names, unpushed commits requested once, open-file click by index only.
  step('expand', () => exRow(1));
  check(tag('expanding a session with unpushed commits asks the host once'), posted.filter((p) => p.type === 'expand' && p.id === id(1)).length === 1);
  step('detail', () => { deliver({ type: 'detail', id: id(1), commits: [{ sha: 'abc1234', subject: 'fix <b>x</b>' }], reason: '' }); advance(300); openAll(G); advance(300); });
  check(tag('expanded row shows branch, remote state, changes, files and commits'), /Branch/.test(body.innerHTML) && /1 commit not pushed/.test(body.innerHTML) && /Uncommitted files \(1\)/.test(body.innerHTML) && /abc1234/.test(body.innerHTML) && /Unpushed commits \(1\)/.test(body.innerHTML));
  check(tag('commit subjects and file names are escaped'), !/<b>x<\/b>/.test(body.innerHTML) && /&lt;b&gt;x/.test(body.innerHTML));
  step('open file', () => click('file', 1, { k: 'f1', i: '0' }));
  check(tag('Open file posts the folder key and an index, never a path'), posted.some((p) => p.type === 'openFile' && p.key === 'f1' && p.i === 0 && !('path' in p)));
  step('collapse', () => coRow(1));
  // Mark done.
  step('mark done', () => click('done', 1));
  advance(300);
  const doneMsg = posted.filter((p) => p.type === 'done' && p.id === id(1) && p.on === true).pop();
  check(tag('Mark done posts the fingerprint and hides the row'), doneMsg && typeof doneMsg.fp === 'string' && !new RegExp('data-id="' + id(1) + '"').test(body.innerHTML) && /Show done \(1\)/.test(els.get('dnb').textContent) && els.get('dnb').hidden === false);
  step('same state again', () => { deliver(fm(2, 'f1', 'ok', { facts: facts({ branch: 'feat', ahead: 1, fileTotal: 1, files: [{ s: 'M', p: 'q.ts' }] }) })); advance(300); openAll(G); advance(300); });
  check(tag('a done row stays hidden while nothing changed'), !new RegExp('data-id="' + id(1) + '"').test(body.innerHTML));
  step('show done', () => click('showdone'));
  check(tag('Show done brings it back with Undo done'), new RegExp('data-id="' + id(1) + '"').test(body.innerHTML) && /aria-label="Show again: /.test(body.innerHTML));
  step('hide done again', () => click('showdone'));
  step('git changes', () => { deliver(fm(2, 'f1', 'ok', { facts: facts({ branch: 'feat', ahead: 1, fileTotal: 2, files: [{ s: 'M', p: 'q.ts' }, { s: 'M', p: 'r.ts' }] }) })); advance(300); openAll(G); advance(300); });
  check(tag('a git change brings a done row back and clears the stored mark'), new RegExp('data-id="' + id(1) + '"').test(body.innerHTML) && posted.some((p) => p.type === 'done' && p.id === id(1) && p.on === false));
  step('restored done map', () => { deliver({ type: 'init', v: 2, days: 14, hidden: [], ws: 1, done: { [id(3)]: model.fingerprint('idle', rowsG[2].last, undefined) } }); advance(300); openAll(G); advance(300); });
  check(tag('a stored done mark hides its row after a reload (git unknown does not un-hide it)'), !new RegExp('data-id="' + id(3) + '"').test(body.innerHTML));
  // One repository: the workspace folder's. Chats of other repositories are not shown.
  check(tag('there is no This workspace only toggle and no repository sort: the page is the one repository'), !/id="wsb"/.test(page) && !/wsOnly/.test(page) && !/data-a="ws"/.test(page) && !/Repository'\]/.test(page));


  step('a sibling worktree folder in another repo', () => { deliver(fm(2, 'f4', 'ok', { facts: facts({ rk: 'r9', ws: false }) })); advance(300); openAll(G); advance(300); });
  check(tag('sessions outside the repository are dropped'), !new RegExp('data-id="' + id(4) + '"').test(body.innerHTML) && new RegExp('data-id="' + id(2) + '"').test(body.innerHTML));
  step('late scope update', () => { deliver(fm(2, 'f4', 'ok', { facts: facts({ rk: 'r1', ws: true, branch: 'wt' }) })); advance(300); openAll(G); advance(300); });
  check(tag('a session in a sibling worktree folder of the repository is kept (scope by repository)'), new RegExp('data-id="' + id(4) + '"').test(body.innerHTML));

  // Notes.
  step('notes', () => deliver({ type: 'notes', scan: 2, more: 7 }));
  check(tag('folders beyond the cap say so with a Scan more button'), /7 more folders not scanned/.test(els.get('note').innerHTML) && /data-a="more"/.test(els.get('note').innerHTML));
  step('scan more', () => click('more'));
  check(tag('Scan more posts scanMore'), posted.some((p) => p.type === 'scanMore'));
  step('git missing', () => deliver({ type: 'end', scan: 2, open: [], gitMissing: true }));
  check(tag('a missing git says only session state is shown'), /Git was not found on this computer\. Only session state is shown\./.test(els.get('note').innerHTML));
  // Odd payloads never throw.
  for (const m of [{ type: 'folder' }, { type: 'folder', scan: 2 }, { type: 'folder', scan: 2, key: 5 }, { type: 'folder', scan: 2, key: 'f1', state: 'ok' }, { type: 'folder', scan: 2, key: 'f9', state: 'ok', facts: {} }, { type: 'repo', scan: 2, key: 'r1' }, { type: 'repo', scan: 2, key: 'r2', state: 'ok', worktrees: [{}] }, { type: 'repo', scan: 2, key: 'r3', state: 'ok', worktrees: [{ k: 'w9', fks: null }] }, { type: 'progress', scan: 2 }, { type: 'progress', scan: 2, git: {} }, { type: 'end', scan: 2 }, { type: 'end', scan: 2, open: 5 }, { type: 'notes', scan: 2 }, { type: 'detail' }, { type: 'detail', id: id(1) }]) { step('odd ' + JSON.stringify(m).slice(0, 40), () => { deliver(m); advance(300); openAll(G); advance(300); }); }
  // Nothing in the page names an agent; every id the script reads exists.
  check(tag('no agent name in the git cells'), !/claude/i.test(body.innerHTML));
  G.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { gitScenario(W); }

// Review fixes (0.24.1): expand never hangs on Loading, repository queued/running, partial repositories, dropped repositories, done marks.
function reviewScenario(W) {
  const R = createHarness({ page, name: 'openwork-review@' + W, width: W, popIds: VIEW_POPS });
  const { els, document, posted, fire, deliver, advance, check, step } = R;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const facts = (o) => Object.assign({ name: 'proj', branch: 'feat', detached: false, upstream: 'origin/feat', ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true }, o || {});
  const fm = (sc, key, state, o) => Object.assign({ type: 'folder', scan: sc, key, state }, o || {});
  const click = (a, n, data) => fire(body, 'click', { target: target(a, n ? id(n) : '', data ? { dataset: Object.assign({ a }, data) } : undefined) });
  /* A stub row button for the keyboard handler: Space expands the chat row n, ArrowLeft collapses it (a click on a row opens the chat now). */
  const rbOf = (n) => ({ classList: { contains: (c) => c === 'rb' }, closest: (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null), dataset: {} });
  const exRow = (n) => fire(document, 'keydown', { key: ' ', target: rbOf(n) });
  const coRow = (n) => fire(document, 'keydown', { key: 'ArrowLeft', target: rbOf(n) });
  const exp = (n) => posted.filter((p) => p.type === 'expand' && p.id === id(n)).length;
  const rows = [row(1, { fk: 'f1', last: NOW - H }), row(2, { fk: 'f2', last: NOW - 2 * H })];
  const wtm = (k, o) => Object.assign({ k, name: 'proj-' + k, path: '/p/' + k, branch: 'b' + k, detached: false, main: false, missing: false, locked: false, prunable: false, merged: false, ws: true, fks: [] }, o || {});
  const okf = (n) => ({ ok: true, fileTotal: n, ahead: 0, behind: 0, gone: false, files: [] });
  R.start();
  step('init', () => { deliver({ type: 'init', v: 3, days: 14, hidden: [], ws: 1, done: {} }); deliver({ type: 'dots', map: {} }); });
  step('sessions', () => { deliver({ type: 'chats', scan: 1, rows, indexing: false, scanning: true }); deliver(fm(1, 'f1', 'queued')); deliver(fm(1, 'f2', 'queued')); deliver(mainRepo(1, ['f1', 'f2'])); advance(300); openAll(R); advance(300); });
  // 1. A row opened while its folder is still queued gets its commit request when the folder result arrives.
  step('open while queued', () => exRow(1));
  check(tag('opening a row whose folder is still queued sends no request yet'), exp(1) === 0);
  step('folder arrives', () => { deliver(fm(1, 'f1', 'ok', { facts: facts({ ahead: 2, fileTotal: 1, files: [{ s: 'M', p: 'a.ts' }] }) })); advance(300); openAll(R); advance(300); });
  check(tag('the request goes out once the folder result shows unpushed commits'), exp(1) === 1 && /Loading\.\.\./.test(body.innerHTML));
  step('same folder again', () => { deliver(fm(1, 'f1', 'ok', { facts: facts({ ahead: 2, fileTotal: 1, files: [{ s: 'M', p: 'a.ts' }] }) })); advance(300); });
  check(tag('a repeated folder result does not ask again while the request is out'), exp(1) === 1);
  step('host has no key', () => { deliver({ type: 'detail', id: id(1), commits: null, reason: 'Git state is not loaded for this row' }); advance(300); });
  check(tag('an answer with no commits shows its reason with a Retry button, not Loading'), /Git state is not loaded/.test(body.innerHTML) && /data-a="dretry"/.test(body.innerHTML) && !/Loading\.\.\./.test(body.innerHTML));
  step('another folder result', () => { deliver(fm(1, 'f1', 'ok', { facts: facts({ ahead: 2, fileTotal: 1, files: [{ s: 'M', p: 'a.ts' }] }) })); advance(300); });
  check(tag('a failed answer is not asked again by itself (no request loop)'), exp(1) === 1);
  step('retry detail', () => click('dretry', 1));
  check(tag('Retry asks the host for the commits again'), exp(1) === 2);
  step('watchdog', () => advance(15500));
  check(tag('a request with no answer turns Loading into timed out with Retry'), /timed out/.test(body.innerHTML) && /data-a="dretry"/.test(body.innerHTML) && !/Loading\.\.\./.test(body.innerHTML));
  step('retry after timeout', () => click('dretry', 1));
  step('answer', () => { deliver({ type: 'detail', id: id(1), commits: [{ sha: 'abc1234', subject: 'one' }, { sha: 'def5678', subject: 'two' }], reason: '' }); advance(300); });
  check(tag('an answer shows the commits'), /abc1234/.test(body.innerHTML) && !/data-a="dretry"/.test(body.innerHTML));
  // 9. Re-expanding and a refresh read the commits again.
  step('collapse and open again', () => { coRow(1); exRow(1); });
  check(tag('opening the row again reads the unpushed commits again'), exp(1) === 4);
  step('answer again', () => deliver({ type: 'detail', id: id(1), commits: [{ sha: 'abc1234', subject: 'one' }, { sha: 'def5678', subject: 'two' }], reason: '' }));
  step('refresh scan', () => { deliver({ type: 'chats', scan: 2, rows, indexing: false, scanning: true }); deliver(fm(2, 'f1', 'queued')); advance(300); });
  check(tag('a new scan drops the old commit list'), !/abc1234/.test(body.innerHTML));
  step('folder of scan 2', () => { deliver(fm(2, 'f1', 'ok', { facts: facts({ ahead: 2, fileTotal: 1, files: [{ s: 'M', p: 'a.ts' }] }) })); advance(300); });
  check(tag('after a refresh the open row asks for its commits again'), exp(1) === 5);
  step('close row', () => { coRow(1); advance(300); });
  // 5. Repository queued, running, partial.
  step('repo queued and worktrees', () => { deliver({ type: 'repo', scan: 2, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: [], ws: true, worktrees: [wtm('w1', { main: true, fks: ['f1'] }), wtm('w2', { facts: okf(3) }), wtm('w3')] }); advance(300); });
  step('repo queued again', () => { deliver({ type: 'repo', scan: 2, key: 'r1', state: 'queued', worktrees: [], merged: [] }); advance(300); });
  check(tag('a queued post with no worktrees keeps the worktree rows already known'), trSlice(body, 'w', 'w2') !== '' && trSlice(body, 'w', 'w3') !== '');
  step('queued for a long time', () => advance(20000));
  check(tag('a repository that is only queued is not timed out by the per-row watchdog'), !/data-a="fretry" data-k="r1"/.test(body.innerHTML));
  step('running then silence', () => { deliver({ type: 'repo', scan: 2, key: 'r1', state: 'running', worktrees: [], merged: [] }); advance(15500); });
  check(tag('a running repository that goes silent times out after 15 s'), /data-a="fretry" data-k="r1"/.test(body.innerHTML));
  check(tag('a worktree that finished before the timeout still shows its files; the unread one says timed out'), /3 files not committed/.test(trSlice(body, 'w', 'w2')) && /Git state not read \(timed out\)/.test(trSlice(body, 'w', 'w3')));
  // 10. Only the workspace repository is shown; one of another repository never appears and leaves nothing behind.
  step('another repo in scan 2', () => { deliver({ type: 'repo', scan: 2, key: 'r9', state: 'ok', name: 'old', def: 'origin/main', defLocal: 'main', merged: [], ws: false, worktrees: [wtm('w1', { main: true }), wtm('w9', { facts: okf(1) })] }); advance(300); });
  check(tag('a repository outside the workspace is not listed'), !/psn">old</.test(body.innerHTML) && trSlice(body, 'w', 'w9') === '');
  step('scan 3', () => { deliver({ type: 'chats', scan: 3, rows, indexing: false, scanning: true }); deliver(fm(3, 'f1', 'queued')); deliver({ type: 'repo', scan: 3, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: [], ws: true, worktrees: [wtm('w1', { main: true, fks: ['f1'] }), wtm('w2', { facts: okf(3) })] }); deliver({ type: 'end', scan: 3, open: [], gitMissing: false }); advance(300); });
  check(tag('a worktree that is not in the latest scan is dropped'), trSlice(body, 'w', 'w3') === '' && trSlice(body, 'w', 'w2') !== '');
  step('late timers', () => advance(50000));
  check(tag('the dropped repository never flips to timed out later'), !/data-k="r9"/.test(body.innerHTML) && trSlice(body, 'w', 'w9') === '');
  // 8. Mark done: no post or mutation while rendering; long branch names keep their mark.
  const doneOfSrc = /function doneOf\(r\)\{[^]*?\n[^\n]*\}\n/.exec(R.script);
  check(tag('doneOf (called while rendering) neither posts nor deletes'), doneOfSrc && !/postMessage|delete donemap/.test(doneOfSrc[0]));
  const longBranch = 'feature/' + 'x'.repeat(300);
  step('long branch folder', () => { deliver(fm(3, 'f2', 'ok', { facts: facts({ branch: longBranch, fk: 'f2', rk: 'r1' }) })); advance(300); });
  step('mark done long', () => click('done', 2));
  const dm = posted.filter((p) => p.type === 'done' && p.id === id(2) && p.on === true).pop();
  check(tag('Mark done on a session with a 300 character branch sends a fingerprint that fits the 200 character store'), dm && typeof dm.fp === 'string' && dm.fp.length <= 200 && !dm.fp.includes('xxxxxxxx'));
  step('same state', () => { deliver(fm(3, 'f2', 'ok', { facts: facts({ branch: longBranch, rk: 'r1' }) })); advance(300); });
  check(tag('the long-branch session stays hidden while nothing changed'), !new RegExp('data-id="' + id(2) + '"').test(body.innerHTML));
  step('branch changes', () => { deliver(fm(3, 'f2', 'ok', { facts: facts({ branch: longBranch + 'y', rk: 'r1' }) })); advance(300); openAll(R); advance(300); });
  check(tag('a different long branch brings the row back and clears the mark'), new RegExp('data-id="' + id(2) + '"').test(body.innerHTML) && posted.some((p) => p.type === 'done' && p.id === id(2) && p.on === false));
  R.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 1400]) { reviewScenario(W); }

// Slice 3: pull request layer, check states, streaming, hold-still, retry, lookups off.
function prScenario(W) {
  const P = createHarness({ page, name: 'openwork-prs@' + W, width: W, popIds: VIEW_POPS });
  const { els, document, posted, fire, deliver, advance, check, step } = P;
  const body = els.get('body'), tag = (s) => s + ' at ' + W, prog = els.get('prog');
  const facts = (o) => Object.assign({ name: 'proj', branch: 'feat', detached: false, upstream: 'origin/feat', ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true }, o || {});
  const fm = (sc, key, state, o) => Object.assign({ type: 'folder', scan: sc, key, state }, o || {});
  const click = (a, n, data) => fire(body, 'click', { target: target(a, n ? id(n) : '', data ? { dataset: Object.assign({ a }, data) } : undefined) });
  /* A stub row button for the keyboard handler: Space expands the chat row n, ArrowLeft collapses it (a click on a row opens the chat now). */
  const rbOf = (n) => ({ classList: { contains: (c) => c === 'rb' }, closest: (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null), dataset: {} });
  const exRow = (n) => fire(document, 'keydown', { key: ' ', target: rbOf(n) });
  const coRow = (n) => fire(document, 'keydown', { key: 'ArrowLeft', target: rbOf(n) });
  const rowsP = [row(1, { fk: 'f1', last: NOW - 1 * H }), row(2, { fk: 'f2', last: NOW - 2 * H }), row(3, { last: NOW - 3 * H })];
  const rowOf = (key) => rowSlice(body, key);
  const inBand = (label, n) => inBandOf(body, label, n);
  const prs = (state, o) => Object.assign({ type: 'prs', scan: 1, repo: 'r1', state }, o || {});
  const chk = (n, state, o) => Object.assign({ type: 'checks', scan: 1, repo: 'r1', n, state }, o || {});
  const BY = { feat: { n: 81, title: 'Fix <b>it</b>', draft: false, review: 'approved', link: true }, other: { n: 82, title: 'Draft one', draft: true, review: '', link: true } };
  P.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {} }));
  step('dots', () => deliver({ type: 'dots', map: { [id(1)]: { s: 'running' } } }));
  step('sessions', () => { deliver({ type: 'chats', scan: 1, rows: rowsP, indexing: false, scanning: true }); deliver(fm(1, 'f1', 'ok', { facts: facts() })); deliver(fm(1, 'f2', 'ok', { facts: facts({ branch: 'other' }) })); deliver(mainRepo(1, ['f1', 'f2'])); advance(300); openAll(P); advance(300); });
  check(tag('the PR and Checks cells exist in the session rows when lookups are on'), /class="pr"/.test(rowOf(id(1))) && /class="kc"/.test(rowOf(id(1))) && els.get('wrap').classList.contains('wpr'));
  check(tag('the header title has no off-tooltip while lookups are on'), !els.get('ttl').dataset.tip);
  step('queued', () => { deliver(prs('queued')); advance(300); openAll(P); advance(300); });
  check(tag('a queued PR layer shows a waiting cell and the row is busy'), /class="q" data-tip="Waiting to look up pull requests"/.test(rowOf(id(1))) && /aria-busy="true"/.test(rowOf(id(1))));
  check(tag('a session with no folder has no PR cell state and is not busy'), !/aria-busy="true"/.test(rowOf(id(3))));
  step('checking', () => { deliver(prs('checking')); deliver({ type: 'progress', scan: 1, git: { done: 2, total: 2 }, prs: { done: 0, total: 1 } }); advance(300); openAll(P); advance(300); });
  check(tag('a PR layer being read shows a spinner with a label'), /class="spin" role="img" aria-label="Checking pull request"/.test(rowOf(id(1))));
  check(tag('the progress line shows the PR counter with numbers and the git part is gone once it is done'), /Checking pull requests: 0 of 1 repository/.test(prog.textContent) && !/Checking git/.test(prog.textContent) && prog.getAttribute('aria-valuemax') === '3' && prog.getAttribute('aria-valuenow') === '2' && prog.hidden === false);
  step('both running', () => deliver({ type: 'progress', scan: 1, git: { done: 1, total: 2 }, prs: { done: 0, total: 3 } }));
  check(tag('while both run, both counters show'), /Checking git: 1 of 2 folders · Checking pull requests: 0 of 3 repositories/.test(prog.textContent));
  step('list', () => { deliver(prs('ok', { by: BY })); deliver(chk(81, 'checking')); advance(300); openAll(P); advance(300); });
  check(tag('the PR cell shows number, review state; the checks cell shows a spinner and the word checking'), /#81 approved/.test(rowOf(id(1))) && /aria-label="Checking pull request"/.test(rowOf(id(1))) && /checking/.test(rowOf(id(1))) && /#82 draft/.test(rowOf(id(2))));
  check(tag('a PR in review with unknown checks puts the running session in Waiting on others; a clean session with a draft PR is Waiting on others'), inBand('Waiting on others', 1) && inBand('Waiting on others', 2));
  check(tag('the PR title is escaped in the expanded row and no raw tag reaches the page'), (() => { step('expand', () => exRow(1)); const h = rowOf(id(1)); step('collapse', () => coRow(1)); return /Fix &lt;b&gt;it&lt;\/b&gt;/.test(h) && !/<b>it<\/b>/.test(h); })());
  step('open the chat menu', () => { const m = new RegExp('data-a="mnu" data-x="([^"]*' + id(1) + ')"').exec(body.innerHTML); if (m) { click('mnu', 0, { x: m[1] }); } });
  check(tag('Open PR and Copy PR link buttons are in the chat menu with the repository key and the number only'), /data-a="pr" data-k="r1" data-n="81"/.test(rowOf(id(1))) && /data-a="prc" data-k="r1" data-n="81"/.test(rowOf(id(1))) && /aria-label="Copy PR link: Session 1"/.test(rowOf(id(1))));
  step('open pr', () => click('pr', 1, { k: 'r1', n: '81' }));
  step('copy pr', () => click('prc', 1, { k: 'r1', n: '81' }));
  check(tag('Open PR posts openPr and Copy PR link posts copyPr with the key and number, never a link'), posted.some((p) => p.type === 'openPr' && p.repo === 'r1' && p.n === 81 && Object.keys(p).length === 3) && posted.some((p) => p.type === 'copyPr' && p.repo === 'r1' && p.n === 81 && !('url' in p)));
  step('bad key', () => { click('pr', 1, { k: '../x', n: '81' }); click('pr', 1, { k: 'r1', n: 'x' }); });
  check(tag('a PR click with a bad key or number posts nothing'), posted.filter((p) => p.type === 'openPr').length === 1);
  // Failing check moves the running chat up (even while running); the cell has icon and text.
  const names = ['lint <img src=x onerror=alert(1)>', 'unit'];
  step('failing', () => { deliver(chk(81, 'failing', { total: 9, failing: 2, pending: 0, names })); advance(300); openAll(P); advance(300); });
  check(tag('a failing check moves the session to To finish even while the agent is running'), inBand('To finish', 1) && /class="dot running"/.test(rowOf(id(1))));
  check(tag('the failing badge has an icon and text, not color alone'), /class="ck fail"[^>]*>✗ checks failing \(2 of 9\)</.test(rowOf(id(1))));
  check(tag('failing check names are in the tooltip, escaped'), /data-tip="Failing: lint &lt;img src=x onerror=alert\(1\)&gt;, unit"/.test(rowOf(id(1))) && !/<img src=x/.test(body.innerHTML));
  check(tag('the failing PR puts its branch in Your move, as Fix checks on PR'), pillOf(body.innerHTML, 'Your move') === 1 && /Fix checks on PR #/.test(body.innerHTML));
  step('expand failing', () => exRow(1));
  check(tag('the expanded row lists the pull request and the failing names, escaped'), /Checks<\/dt><dd>checks failing \(2 of 9\): lint &lt;img/.test(rowOf(id(1))) && /Pull request<\/dt><dd>#81 Fix &lt;b&gt;it&lt;\/b&gt; \(approved\)/.test(rowOf(id(1))));
  step('collapse', () => coRow(1));
  // Pending moves to Waiting; passing + approved moves to To finish (not running).
  step('dots idle', () => { deliver({ type: 'dots', map: {} }); advance(300); openAll(P); advance(300); });
  step('pending', () => { deliver(chk(81, 'pending', { total: 9, failing: 0, pending: 3, names: [] })); advance(300); openAll(P); advance(300); });
  check(tag('pending checks put an approved PR in Waiting on others'), inBand('Waiting on others', 1) && /◔ checks pending/.test(rowOf(id(1))));
  step('passing', () => { deliver(chk(81, 'passing', { total: 9, failing: 0, pending: 0, names: [] })); advance(300); openAll(P); advance(300); });
  check(tag('approved with checks passing is To finish'), inBand('To finish', 1) && /✓ checks passing/.test(rowOf(id(1))));
  step('none', () => { deliver(chk(81, 'none', { total: 0, failing: 0, pending: 0, names: [] })); advance(300); openAll(P); advance(300); });
  check(tag('no checks shows no badge'), !/class="ck/.test(rowOf(id(1))) && inBand('To finish', 1));
  // Mark done ignores pending -> passing but comes back on failing.
  step('pending again', () => { deliver(chk(81, 'pending', { total: 9, failing: 0, pending: 3, names: [] })); advance(300); openAll(P); advance(300); });
  step('mark done', () => click('done', 1));
  advance(300);
  const dm = posted.filter((p) => p.type === 'done' && p.id === id(1) && p.on === true).pop();
  check(tag('Mark done hides the row and its fingerprint records the PR'), dm && /#feat\|0\|0#81\|approved\|-$/.test(dm.fp) && !new RegExp('data-id="' + id(1) + '"').test(body.innerHTML));
  step('pending to passing', () => { deliver(chk(81, 'passing', { total: 9, failing: 0, pending: 0, names: [] })); advance(300); openAll(P); advance(300); });
  check(tag('checks going from pending to passing do not bring a done row back'), !new RegExp('data-id="' + id(1) + '"').test(body.innerHTML) && !posted.some((p) => p.type === 'done' && p.id === id(1) && p.on === false));
  step('failing again', () => { deliver(chk(81, 'failing', { total: 9, failing: 1, pending: 0, names: ['unit'] })); advance(300); openAll(P); advance(300); });
  check(tag('a failing check brings a done row back and clears the mark'), new RegExp('data-id="' + id(1) + '"').test(body.innerHTML) && posted.some((p) => p.type === 'done' && p.id === id(1) && p.on === false) && inBand('To finish', 1));
  // Hold still while streaming: a row under the mouse does not jump when a check result arrives.
  step('back to passing and none', () => { deliver(chk(81, 'pending', { total: 9, failing: 0, pending: 3, names: [] })); advance(300); openAll(P); advance(300); });
  check(tag('setup: pending puts it in Waiting on others'), inBand('Waiting on others', 1));
  const hoverRow = (n) => ({ target: { closest: (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null), dataset: {} } });
  step('hover', () => fire(document, 'mouseover', hoverRow(1)));
  step('failing while hovered', () => { deliver(chk(81, 'failing', { total: 9, failing: 1, pending: 0, names: ['unit'] })); advance(300); openAll(P); advance(300); });
  check(tag('a hovered row stays in its band while the failing result streams in (the badge itself updates)'), inBand('Waiting on others', 1) && /checks failing/.test(rowOf(id(1))));
  step('leave', () => { fire(document, 'mouseover', { target: { closest: () => null, dataset: {} } }); advance(300); openAll(P); advance(300); });
  check(tag('the row moves up to To finish once the mouse leaves'), inBand('To finish', 1));
  step('hover and wait', () => { step('pending', () => deliver(chk(81, 'pending', { total: 9, failing: 0, pending: 3, names: [] }))); advance(300); openAll(P); advance(300); });
  check(tag('setup: failing to pending leaves To finish when nothing is hovered'), inBand('Waiting on others', 1));
  step('hover 2', () => fire(document, 'mouseover', hoverRow(1)));
  step('failing hovered', () => { deliver(chk(81, 'failing', { total: 9, failing: 1, pending: 0, names: ['unit'] })); advance(300); openAll(P); advance(300); });
  check(tag('held while hovered'), inBand('Waiting on others', 1));
  step('2 s', () => advance(2100));
  check(tag('a hovered row moves after 2 s anyway'), inBand('To finish', 1));
  step('mouse out', () => fire(document, 'mouseover', { target: { closest: () => null, dataset: {} } }));
  // Unavailable states.
  step('unavailable', () => { deliver(chk(81, 'unavailable', { reason: 'timed out' })); advance(300); openAll(P); advance(300); });
  check(tag('a failed check lookup shows PR info unavailable with Retry; the row keeps its git facts and band'), /PR info unavailable/.test(rowOf(id(1))) && /data-a="fretry" data-k="p1"/.test(rowOf(id(1))) && /aria-label="Retry pull request lookup: Session 1"/.test(rowOf(id(1))));
  step('retry', () => click('fretry', 1, { k: 'p1' }));
  advance(300);
  check(tag('Retry posts retry with the p key and shows the repository as waiting'), posted.some((p) => p.type === 'retry' && p.key === 'p1') && /data-tip="Waiting to look up pull requests"/.test(rowOf(id(2))));
  step('retry watchdog', () => advance(25500));
  check(tag('a PR layer left on queued or checking ends as unavailable with Retry after the watchdog (never an endless spinner)'), !/class="spin"/.test(rowOf(id(2))) && /class="q unk"[^>]*>timed out</.test(rowOf(id(2))) && /data-a="fretry" data-k="p1"/.test(rowOf(id(2))));
  step('good again', () => { deliver(prs('ok', { by: BY })); deliver(chk(81, 'passing', { total: 1, failing: 0, pending: 0, names: [] })); advance(300); openAll(P); advance(300); });
  step('layer unavailable', () => { deliver(prs('unavailable', { reason: 'not a GitHub repository' })); advance(300); openAll(P); advance(300); });
  check(tag('a permanent reason (not a GitHub repository) shows "not on GitHub" (unknown, not "no PR") and no Retry, plus a header note'), /class="q unk"[^>]*>not on GitHub</.test(rowOf(id(2))) && !/no PR/.test(rowOf(id(2))) && !/data-k="p1"/.test(rowOf(id(2))) && /Pull requests unavailable for 1 repository: not a GitHub repository\./.test(els.get('note').innerHTML));
  step('layer transient', () => { deliver(prs('unavailable', { reason: 'GitHub not reachable' })); advance(300); openAll(P); advance(300); });
  check(tag('a transient reason shows the reason in the PR cell (not "no PR") with Retry on each row of the repository'), /class="q unk"[^>]*>offline</.test(rowOf(id(2))) && !/no PR/.test(rowOf(id(2))) && /data-k="p1"/.test(rowOf(id(2))));
  // end lists unfinished PR keys; stale scans are dropped.
  step('stale', () => { deliver(prs('ok', { scan: 0, by: {} })); deliver(chk(81, 'failing', { scan: 5, total: 1, failing: 1, names: [] })); advance(300); openAll(P); advance(300); });
  check(tag('PR and check messages of another scan are dropped'), /class="q unk"[^>]*>offline</.test(rowOf(id(2))));
  step('2nd scan', () => { deliver({ type: 'chats', scan: 2, rows: rowsP, indexing: false, scanning: true }); deliver(mainRepo(2, ['f1', 'f2'])); deliver(prs('queued', { scan: 2 })); deliver(prs('checking', { scan: 2 })); advance(300); openAll(P); advance(300); });
  step('end with p1', () => { deliver({ type: 'end', scan: 2, open: ['p1'] }); advance(300); openAll(P); advance(300); });
  check(tag('end listing p1 turns a checking layer into unavailable with Retry'), !/class="spin"/.test(rowOf(id(2))) && /data-k="p1"/.test(rowOf(id(2))) && prog.hidden === true);
  step('scan-wide silence', () => { deliver({ type: 'chats', scan: 3, rows: rowsP, indexing: false, scanning: true }); deliver(mainRepo(3, ['f1', 'f2'])); deliver(prs('checking', { scan: 3 })); deliver(chk(81, 'checking', { scan: 3 })); advance(300); openAll(P); advance(300); });
  step('silence', () => advance(45500));
  check(tag('a silent scan ends every PR spinner as unavailable'), !/class="spin"/.test(body.innerHTML.replace(/data-id="[^"]*"[^]*$/, '') + rowOf(id(1)) + rowOf(id(2))));
  // Odd payloads never throw.
  for (const m of [{ type: 'prs' }, { type: 'prs', scan: 3 }, { type: 'prs', scan: 3, repo: 5 }, { type: 'prs', scan: 3, repo: 'r1', state: 'ok', by: null }, { type: 'prs', scan: 3, repo: 'r2', state: 'ok', by: { x: null, y: {}, z: { n: -1 } } }, { type: 'checks' }, { type: 'checks', scan: 3, repo: 'r1' }, { type: 'checks', scan: 3, repo: 'r1', n: 81, state: 'bogus' }, { type: 'checks', scan: 3, repo: 'r9', n: 1, state: 'failing', names: 'x' }, { type: 'progress', scan: 3, git: { done: 1, total: 2 }, prs: 5 }, { type: 'progress', scan: 3, git: { done: 1, total: 2 }, prs: {} }, { type: 'notes', scan: 3, more: 0, prsOn: 'x' }]) { step('odd ' + JSON.stringify(m).slice(0, 50), () => { deliver(m); advance(300); openAll(P); advance(300); }); }
  // Lookups off: no PR column, no PR text, no PR progress, a quiet tooltip, messages ignored.
  step('off', () => { deliver({ type: 'init', v: 3, prsOn: false, days: 14, hidden: [], ws: 1, done: {} }); advance(300); openAll(P); advance(300); });
  check(tag('lookups off: no PR or Checks cells in session rows and no PR states'), !/>Checks</.test(body.innerHTML) && !/class="pr"/.test(body.innerHTML) && !/PR open|PR failing/.test(body.innerHTML) && !/class="kc"/.test(body.innerHTML) && !els.get('wrap').classList.contains('wpr'));
  check(tag('lookups off: the header tooltip says so quietly'), els.get('ttl').dataset.tip === 'Pull requests are off (setting Look Up Pull Requests).' && !/Pull requests/.test(els.get('note').innerHTML));
  step('off messages', () => { deliver({ type: 'chats', scan: 4, rows: rowsP, indexing: false, scanning: true }); deliver(mainRepo(4, ['f1', 'f2'])); deliver(prs('ok', { scan: 4, by: BY })); deliver(chk(81, 'failing', { scan: 4, total: 1, failing: 1, names: ['x'] })); deliver({ type: 'progress', scan: 4, git: { done: 1, total: 2 }, prs: { done: 0, total: 3 } }); advance(300); openAll(P); advance(300); });
  check(tag('lookups off: PR messages are ignored, no PR band move, no PR progress text'), !/checks failing/.test(body.innerHTML) && !/#81/.test(body.innerHTML) && !/pull requests/i.test(prog.textContent) && !/data-a="pr"/.test(body.innerHTML));
  check(tag('indicator: lookups off shows the grey off state whose click opens the setting'), els.get('ghs').dataset.g === 'off' && /g-off/.test(els.get('ghs').className) && els.get('ght').textContent === 'GitHub off' && /Look Up Pull Requests/.test(els.get('ghs').dataset.tip) && (() => { fire(body, 'click', { target: target('ghs') }); return posted.some((p) => p.type === 'prsSetting'); })());
  step('on again', () => { deliver({ type: 'notes', scan: 4, more: 0, prsOn: true }); advance(300); openAll(P); advance(300); });
  check(tag('turning lookups back on restores the columns and clears the tooltip'), /class="pr"/.test(body.innerHTML) && !els.get('ttl').dataset.tip);
  check(tag('no agent name in the PR cells'), !/claude/i.test(body.innerHTML));
  P.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { prScenario(W); }

// GitHub connection indicator, PR-only rows and branch links.
function ghScenario(W) {
  const P = createHarness({ page, name: 'openwork-gh@' + W, width: W, popIds: VIEW_POPS });
  const { els, document, posted, fire, deliver, advance, check, step } = P;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const facts = (o) => Object.assign({ name: 'proj', branch: 'feat', detached: false, upstream: 'origin/feat', ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true }, o || {});
  const fm = (sc, key, state, o) => Object.assign({ type: 'folder', scan: sc, key, state }, o || {});
  const click = (a, n, data) => fire(body, 'click', { target: target(a, n ? id(n) : '', data ? { dataset: Object.assign({ a }, data) } : undefined) });
  /* A stub row button for the keyboard handler: Space expands the chat row n, ArrowLeft collapses it (a click on a row opens the chat now). */
  const rbOf = (n) => ({ classList: { contains: (c) => c === 'rb' }, closest: (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null), dataset: {} });
  const exRow = (n) => fire(document, 'keydown', { key: ' ', target: rbOf(n) });
  const coRow = (n) => fire(document, 'keydown', { key: 'ArrowLeft', target: rbOf(n) });
  const rowsP = [row(1, { fk: 'f1', last: NOW - 1 * H }), row(2, { fk: 'f2', last: NOW - 2 * H })];
  const rowOf = (key) => rowSlice(body, key);
  const prs = (state, o) => Object.assign({ type: 'prs', scan: 1, repo: 'r1', state }, o || {});
  const chk = (n, state, o) => Object.assign({ type: 'checks', scan: 1, repo: 'r1', n, state }, o || {});
  const BY = { feat: { n: 81, title: 'Fix it', draft: false, review: 'approved', link: true }, other: { n: 82, title: 'Draft one', draft: true, review: '', link: true } };
  P.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {} }));
  step('sessions', () => { deliver({ type: 'chats', scan: 1, rows: rowsP, indexing: false, scanning: true }); deliver(fm(1, 'f1', 'ok', { facts: facts() })); deliver(fm(1, 'f2', 'ok', { facts: facts({ branch: 'other' }) })); deliver(mainRepo(1, ['f1', 'f2'])); advance(300); openAll(P); advance(300); });
  // GitHub connection indicator, PR-only branch rows and branch links.
  const gb = els.get('ghs'), gt = els.get('ght'), ghk = () => gb.dataset.g;
  check(tag('indicator: before any answer it waits (checking), it is not green'), ghk() === 'wait' && !/g-ok/.test(gb.className));
  step('gh ok state', () => { deliver(prs('ok', { by: BY })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: lookups on and one repository answered shows OK, green, with the repository count and the age of the lookup'), ghk() === 'ok' && /g-ok/.test(gb.className) && gt.textContent === 'GitHub OK' && /Checked 1 repository, last lookup just now/.test(gb.dataset.tip) && /GitHub connection: GitHub OK/.test(gb.getAttribute('aria-label')));
  step('gh unauth', () => { deliver({ type: 'gh', scan: 1, state: 'unauth', reason: 'not signed in to gh' }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: gh not signed in is red, says gh auth login in the tooltip'), ghk() === 'unauth' && /g-bad/.test(gb.className) && /gh auth login/.test(gb.dataset.tip) && gt.textContent === 'gh not signed in');
  step('click unauth', () => fire(body, 'click', { target: target('ghs') }));
  check(tag('indicator: clicking when gh is signed out checks again (a refresh), it opens no setting'), posted.some((p) => p.type === 'refresh') && !posted.some((p) => p.type === 'prsSetting'));
  step('gh missing', () => { deliver({ type: 'gh', scan: 1, state: 'missing', reason: 'gh not installed' }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: gh not installed is red and names the install'), ghk() === 'missing' && /g-bad/.test(gb.className) && /Install it/.test(gb.dataset.tip));
  step('gh limit', () => { deliver({ type: 'gh', scan: 1, state: 'error', reason: 'GitHub rate limit reached' }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: a rate limit is amber and says so'), ghk() === 'limit' && /g-warn/.test(gb.className) && /rate limit/.test(gb.dataset.tip));
  step('gh other', () => { deliver({ type: 'gh', scan: 1, state: 'error', reason: 'timed out' }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: any other gh failure is amber with its reason'), ghk() === 'error' && /g-warn/.test(gb.className) && /timed out/.test(gb.dataset.tip));
  step('gh ok again', () => { deliver({ type: 'gh', scan: 1, state: 'ok', reason: '' }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  step('repo failed', () => { deliver(prs('ok', { repo: 'r9', by: {} })); deliver(prs('unavailable', { reason: 'timed out' })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: one repository failing while another works is a partial failure with the reason'), ghk() === 'partial' && /1 of 2 repositories: timed out/.test(gb.dataset.tip) && /g-warn/.test(gb.className));
  check(tag('rows of the failed repository show the reason as unknown in the PR cell, never "no PR"'), /class="q unk"[^>]*>timed out</.test(rowOf(id(1))) && !/no PR/.test(rowOf(id(1))));
  step('repo not github', () => { deliver(prs('unavailable', { reason: 'not a GitHub repository' })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('indicator: a repository that is not on GitHub is not a failure'), ghk() === 'ok' && !/data-a="brl"/.test(rowOf(id(1))));
  step('repo ok again', () => { deliver(prs('ok', { by: BY })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('a repository looked up with no PR on the branch says "no PR" (lookup worked)'), /class="q"[^>]*>no PR</.test(rowOf(id(2))) === false && /#82 draft/.test(rowOf(id(2))));
  step('no pr branch', () => { deliver(prs('ok', { by: { feat: BY.feat } })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('"no PR" only after a lookup that worked and found none'), />no PR</.test(rowOf(id(2))));
  step('restore by', () => { deliver(prs('ok', { by: BY })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  // PR-only rows: an open PR on a local branch that has no chat row and no worktree.
  const wtl = (k, name, branch, o) => Object.assign({ k, name, branch, detached: false, sha: 'abc1234', main: false, missing: false, locked: false, merged: false, facts: null, ws: true, fks: [] }, o || {});
  step('repo layer', () => { deliver({ type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: [], ws: true, gh: true, worktrees: [wtl('w1', 'proj', 'main', { main: true, fks: ['f1', 'f2'] })] }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  const LONELY = Object.assign({}, BY, { lonely: { n: 90, title: 'Lonely <b>work</b>', draft: false, review: '', link: true }, main: { n: 91, title: 'on default', draft: false, review: '', link: true } });
  step('lonely pr', () => { deliver(prs('ok', { by: LONELY })); deliver(chk(90, 'failing', { total: 3, failing: 1, pending: 0, names: ['unit'] })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  const brRow = () => trSlice(body, 'b', 'lonely'), prRow = () => trSlice(body, 'b', 'lonely');
  check(tag('PR-only: a branch with an open PR and no session or worktree is a row in Branches and in Pull requests, titled by the PR, escaped'), brRow() !== '' && prRow() !== '' && /Lonely &lt;b&gt;work&lt;\/b&gt;/.test(prRow()) && !/<b>work<\/b>/.test(body.innerHTML) && /PR failing/.test(brRow()));
  check(tag('PR-only: a branch is one row in the Branches table, however many sessions, worktrees and PRs it has'), (body.innerHTML.match(/class="wr"[^>]*data-b="lonely"/g) || []).length === 1 && (body.innerHTML.match(/class="wr"[^>]*data-b="feat"/g) || []).length <= 1);
  step('open the lonely popover', () => click('mnu', 0, { x: 'b:b:lonely' }));
  check(tag('PR-only: failing checks make the row To finish; the PR table row has the PR, the failing badge and the Open PR and Copy PR link buttons'), pillOf(body.innerHTML, 'Your move') >= 1 && /#90/.test(prRow()) && /Checks are failing on PR #90/.test(prRow()) && /data-a="pr" data-k="r1" data-n="90"/.test(prRow()) && /data-a="prc" data-k="r1" data-n="90"/.test(prRow()) && !/data-a="open"/.test(prRow()) && !/data-a="arch"/.test(prRow()));
    step('pb passing', () => { deliver(chk(90, 'passing', { total: 3, failing: 0, pending: 0, names: [] })); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('PR-only: passing checks with no review is PR open, in Waiting (it leaves Needs you)'), /PR open/.test(prRow()) && /checks passing/.test(prRow()) && !/PR failing/.test(prRow()));
  step('pb open pr', () => click('pr', 0, { k: 'r1', n: '90' }));
  check(tag('PR-only: Open PR posts the key and number only'), posted.some((p) => p.type === 'openPr' && p.repo === 'r1' && p.n === 90 && Object.keys(p).length === 3));
  step('pb filter', () => { deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: 'lonely', f: {}, sort: 'recent' } }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  check(tag('PR-only: the filter box finds it by PR title and the Has open PR filter keeps it'), prRow() !== '');
  step('pb clear', () => { deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: '', f: {}, sort: 'recent' } }); advance(300); openAll(P); advance(300); openAll(P); advance(300); });
  // Branch links: the page sends a repository key, a branch name and a number, never a link.
  step('open the chat menu 2', () => { const m = new RegExp('data-a="mnu" data-x="([^"]*' + id(1) + ')"').exec(body.innerHTML); if (m) { click('mnu', 0, { x: m[1] }); } });
  check(tag('branch link: the branch cell is a link and a keyboard button with the key, branch and PR number'), /class="lk" role="link" data-a="brl" data-k="r1" data-b="feat" data-n="81"/.test(rowOf(id(1))) && /<button[^>]*data-a="brl" data-k="r1" data-b="feat" data-n="81"[^>]*aria-label="Open pull request #81 on GitHub: Session 1"/.test(rowOf(id(1))));
  step('branch click', () => click('brl', 1, { k: 'r1', b: 'feat', n: '81' }));
  check(tag('branch link: the click posts openBranch with repo, branch and n only, no link'), posted.some((p) => p.type === 'openBranch' && p.repo === 'r1' && p.branch === 'feat' && p.n === 81 && Object.keys(p).length === 4));
  step('branch bad', () => { click('brl', 1, { k: '../x', b: 'feat', n: '1' }); click('brl', 1, { k: 'r1', b: '', n: '1' }); click('brl', 1, { k: 'r1', b: 'x'.repeat(300), n: '1' }); });
  check(tag('branch link: a bad key, an empty branch and an over-long branch post nothing'), posted.filter((p) => p.type === 'openBranch').length === 1);
  step('pb branch', () => click('brl', 0, { k: 'r1', b: 'lonely', n: '90' }));
  check(tag('branch link: the PR-only row links the branch too'), /data-a="brl" data-k="r1" data-b="lonely" data-n="90"/.test(brRow()) && posted.some((p) => p.type === 'openBranch' && p.branch === 'lonely' && p.n === 90));

  P.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { ghScenario(W); }

// Pull request rules of the model.
{
  const g = (o) => Object.assign({ ok: true, files: 0, ahead: 0, gone: false, up: true, merged: false, isDef: false }, o || {});
  const pr = (review, checks, draft) => ({ n: 7, review, checks, draft: !!draft });
  const b = (dot, gg) => model.bandOf(dot, gg, NOW, NOW);
  if (b('idle', g({ pr: pr('', 'failing') })) !== 'finish') { bad('model: failing checks put a session in To finish'); }
  if (b('running', g({ pr: pr('', 'failing') })) !== 'finish') { bad('model: failing checks put a RUNNING session in To finish'); }
  { const v = model.workVerdict({ name: 'x', defName: 'main', chat: 'waiting', chatTitle: 'Fix login redirect' }), u = model.workVerdict({ name: 'x', defName: 'main', chat: 'unread', chatTitle: 'T' });
    if (v.todo !== 'Answer the question in "Fix login redirect"' || u.todo !== 'Read "T"' || v.rank >= u.rank) { bad('model: the verdict carries an imperative todo and an urgency rank'); }
    const hl = model.workHeadline({ needs: 1, finish: 2, waiting: 1, tidy: 0, idle: 0 }, true, 'p', 'Read "T"');
    if (hl !== 'p — Next: Read "T" · 2 more need you · 1 waiting') { bad('model: headline is "Next: todo · N more need you · N waiting": ' + hl); } }
  if (b('waiting', g({ pr: pr('', 'failing') })) !== 'needs') { bad('model: Needs you still wins over failing checks'); }
  if (b('idle', g({ pr: pr('', 'pending') })) !== 'waiting' || b('idle', g({ pr: pr('', 'passing') })) !== 'waiting' || b('idle', g({ pr: pr('', 'unknown') })) !== 'waiting') { bad('model: a PR in review is Waiting on others'); }
  if (b('idle', g({ pr: pr('', 'passing', true) })) !== 'waiting') { bad('model: a draft PR is Waiting on others'); }
  if (b('idle', g({ pr: pr('approved', 'pending') })) !== 'waiting') { bad('model: approved with checks pending is Waiting on others'); }
  if (b('idle', g({ pr: pr('approved', 'passing') })) !== 'finish' || b('idle', g({ pr: pr('approved', 'none') })) !== 'finish') { bad('model: approved with checks passing or none is To finish'); }
  const po = (p) => ({ wt: true, prOnly: true, ok: true, files: 0, ahead: 0, gone: false, locked: false, pr: p, ready: false });
  if (b('idle', po(pr('', 'failing'))) !== 'finish' || b('idle', po(pr('changes requested', 'passing'))) !== 'finish' || b('idle', po(pr('approved', 'passing'))) !== 'finish' || b('idle', po(pr('approved', 'none'))) !== 'finish') { bad('model: a PR-only row with failing checks, requested changes or an approved clean PR is To finish'); }
  if (b('idle', po(pr('', 'pending'))) !== 'waiting' || b('idle', po(pr('', 'passing'))) !== 'waiting' || b('idle', po(pr('approved', 'pending'))) !== 'waiting' || b('idle', po(pr('', 'unknown'))) !== 'waiting' || b('idle', po(pr('', 'passing', true))) !== 'waiting') { bad('model: a PR-only row in review, pending, unknown or draft is Waiting on others'); }
  if (b('idle', po(undefined)) !== 'idle') { bad('model: a PR-only row without PR facts stays idle'); }
  if (!/pull request branch, no worktree/.test(model.summaryOf([{ band: 'waiting', title: 'T', project: 'p', branch: 'x', wt: true, prOnly: true, pr: { n: 3, checks: 'passing' } }], 14).text)) { bad('model: the summary names a PR-only row'); }
  {
    const rp = (st, o) => Object.assign({ st }, o || {});
    const gs = (o) => model.ghStatus(Object.assign({ on: true, gh: null, repos: [], now: NOW }, o));
    const t = (what, c) => { if (!c) { bad('ghStatus: ' + what); } };
    const off = gs({ on: false });
    t('off names the setting and clicks to open it', off.kind === 'off' && off.cls === 'off' && off.click === 'setting' && /Look Up Pull Requests/.test(off.tip));
    t('before any answer it waits', gs({}).kind === 'wait' && gs({ repos: [rp('queued')] }).kind === 'wait');
    t('gh missing, from the auth answer or from a repository reason', gs({ gh: { st: 'missing', reason: 'gh not installed' } }).kind === 'missing' && gs({ repos: [rp('unavailable', { reason: 'gh not installed' })] }).kind === 'missing' && gs({ gh: { st: 'missing' } }).cls === 'bad');
    t('gh signed out, from the auth answer or from a repository reason, with the login command', gs({ gh: { st: 'unauth' } }).kind === 'unauth' && gs({ repos: [rp('unavailable', { reason: 'not signed in to gh' })] }).kind === 'unauth' && /gh auth login/.test(gs({ gh: { st: 'unauth' } }).tip));
    t('rate limit from either source is amber', gs({ gh: { st: 'error', reason: 'GitHub rate limit reached' } }).kind === 'limit' && gs({ repos: [rp('unavailable', { reason: 'GitHub rate limit reached' })] }).cls === 'warn');
    t('another gh failure is amber with the reason', gs({ gh: { st: 'error', reason: 'timed out' } }).kind === 'error' && /timed out/.test(gs({ gh: { st: 'error', reason: 'timed out' } }).tip));
    t('every repository failing is red; some failing is partial amber; reasons are listed once', gs({ repos: [rp('unavailable', { reason: 'timed out' }), rp('unavailable', { reason: 'timed out' })] }).cls === 'bad' && gs({ repos: [rp('unavailable', { reason: 'timed out' }), rp('ok', { at: NOW })] }).kind === 'partial' && /2 of 2 repositories: timed out\./.test(gs({ repos: [rp('unavailable', { reason: 'timed out' }), rp('unavailable', { reason: 'timed out' })] }).tip));
    t('not a GitHub repository is not a failure and is not counted as checked', gs({ repos: [rp('unavailable', { reason: 'not a GitHub repository' }), rp('ok', { at: NOW })] }).kind === 'ok' && /Checked 1 repository,/.test(gs({ repos: [rp('unavailable', { reason: 'not a GitHub repository' }), rp('ok', { at: NOW })] }).tip));
    t('ok shows the count and the age of the newest lookup', /Checked 2 repositories, last lookup 5 min ago/.test(gs({ gh: { st: 'ok' }, repos: [rp('ok', { at: NOW - 300000 }), rp('ok', { at: NOW - 900000 })] }).tip) && /last lookup just now/.test(gs({ repos: [rp('ok', { at: NOW })] }).tip));
    t('signed-out beats a repository failure and a working gh with failed repositories is not signed out', gs({ gh: { st: 'unauth' }, repos: [rp('ok', { at: NOW })] }).kind === 'unauth' && gs({ gh: { st: 'ok' }, repos: [rp('unavailable', { reason: 'GitHub not reachable' })] }).kind === 'error');
  }
  if (b('idle', g({ pr: pr('changes requested', 'passing') })) !== 'finish') { bad('model: changes requested is To finish'); }
  if (b('idle', g({ ahead: 1, pr: pr('', 'pending') })) !== 'finish') { bad('model: unpushed commits still make To finish with a PR open'); }
  if (b('idle', g({ pr: undefined })) !== 'idle' || b('idle', undefined) !== 'idle') { bad('model: no PR facts do not move a row'); }
  if (b('running', g({ pr: pr('approved', 'unknown') })) !== 'waiting') { bad('model: unknown checks never move a running session'); }
  if (b('idle', { ok: false, pr: pr('', 'failing') }) !== 'idle') { bad('model: PR facts without known git facts do not move a row'); }
  if (model.bandOf('idle', { wt: true, ok: true, files: 0, ahead: 0, ready: true, pr: pr('', 'failing') }) !== 'finish') { bad('model: a worktree whose branch has failing checks is To finish'); }
  if (model.wtReady({ main: false, locked: false, merged: true }, { ok: true, files: 0, ahead: 0, gone: false, pr: pr('', 'passing') }, false) !== false) { bad('model: a worktree with an open PR is not Ready to remove'); }
  const fp = (gg) => model.fingerprint('idle', 5, gg);
  if (model.doneHidden(fp(g({ branch: 'f', pr: pr('approved', 'pending') })), 'idle', 5, g({ branch: 'f', pr: pr('approved', 'passing') })) !== true) { bad('model: pending to passing keeps a done row hidden'); }
  if (model.doneHidden(fp(g({ branch: 'f', pr: pr('approved', 'passing') })), 'idle', 5, g({ branch: 'f', pr: pr('approved', 'failing') })) !== false) { bad('model: failing brings a done row back'); }
  if (model.doneHidden(fp(g({ branch: 'f', pr: pr('approved', 'failing') })), 'idle', 5, g({ branch: 'f', pr: pr('approved', 'passing') })) !== false) { bad('model: failing to passing changes the fingerprint (it was marked while failing)'); }
  if (model.doneHidden(fp(g({ branch: 'f' })), 'idle', 5, g({ branch: 'f', pr: pr('', 'failing') })) !== true) { bad('model: a PR layer that answers after Mark done does not bring the row back by itself'); }
  if (model.doneHidden(fp(g({ branch: 'f', pr: pr('approved', 'passing') })), 'idle', 5, g({ branch: 'f' })) !== true) { bad('model: unknown PR facts never bring a done row back'); }
  if (model.doneHidden(fp(g({ branch: 'f', pr: pr('approved', 'passing') })), 'idle', 5, g({ branch: 'f', pr: { n: 8, review: 'approved', checks: 'passing' } })) !== false) { bad('model: another PR number brings a done row back'); }
  if (model.doneHidden(model.fingerprint('idle', 5, g({ branch: 'f' })), 'idle', 5, g({ branch: 'f' })) !== true || model.doneHidden('5|idle#', 'idle', 5, undefined) !== true) { bad('model: the older two-part fingerprint still works'); }
  if (model.bandOf('idle', g({ branch: 'f', pr: pr('approved', 'unknown') }), 5, 6) !== 'waiting' || model.bandOf('idle', g({ branch: 'f', pr: pr('approved', 'unavailable') }), 5, 6) !== 'waiting') { bad('model: an approved PR with unknown checks never moves a row to To finish'); }
  if (model.bandOf('idle', g({ branch: 'f', pr: pr('approved', 'passing') }), 5, 6) !== 'finish' || model.bandOf('idle', g({ branch: 'f', pr: pr('changes requested', 'unknown') }), 5, 6) !== 'finish') { bad('model: approved with passing checks, and changes requested, are To finish'); }
  { const t = (title) => model.summaryOf([{ band: 'needs', title }], 14).text;
    if (/\u202e/.test(t('fix\u202egnp.exe'))) { bad('summary: bidi control characters are stripped'); }
    if (/AKIAIOSFODNN7EXAMPLE/.test(t('key AKIAIOSFODNN7EXAMPLE here'))) { bad('summary: AWS style keys are redacted'); }
    if (/wJalrXUtnFEMI\/K7MDENG/.test(t('secret wJalrXUtnFEMI/K7MDENG+bPxRfiCY=='))) { bad('summary: base64 style strings with / + = are redacted'); }
    if (!/src\/webview\/openWork\.ts/.test(t('fix src/webview/openWork.ts'))) { bad('summary: an ordinary path is kept'); } }
  if (!/nextStep/.test(model.WORK_MODEL_SRC) || model.nextStep('idle', g({ pr: pr('', 'failing') })).indexOf('A check is failing on pull request #7') !== 0) { bad('model: the next step names a failing check'); }
}

// Slice 4: filter box, state filters, sort, copy summary, keyboard, branches without a worktree, empty states, status line.
const vfacts = (o) => Object.assign({ name: 'proj', branch: 'main', detached: false, upstream: 'origin/main', ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true }, o || {});
const vwt = (k, name, branch, o) => Object.assign({ k, name, path: '/p/' + name, branch, detached: false, main: false, missing: false, locked: false, prunable: false, merged: null, ws: false, fks: [] }, o || {});
const vrepo = (sc, key, name, fks) => ({ type: 'repo', scan: sc, key, state: 'ok', name, def: 'origin/main', defLocal: 'main', merged: [], ws: true, worktrees: [vwt('w' + key.slice(1), name, 'main', { main: true, fks: fks })] });
function viewScenario(W) {
  const V = createHarness({ page, name: 'openwork-view@' + W, width: W, popIds: VIEW_POPS });
  const { els, document, posted, fire, deliver, advance, check, step } = V;
  const body = els.get('body'), fq = els.get('fq'), tag = (s) => s + ' at ' + W;
  const fm = (key, state, o) => Object.assign({ type: 'folder', scan: 1, key, state }, o || {});
  const click = (a, data) => fire(body, 'click', { target: target(a, '', data ? { dataset: Object.assign({ a }, data) } : undefined) });
  const count = () => { advance(300); openAll(V); advance(300); return new Set([...body.innerHTML.matchAll(/class="row" role="listitem" data-id="([^"]+)"/g)].map((m) => m[1])).size; };
  const has = (n) => body.innerHTML.indexOf('data-id="' + id(n) + '"') >= 0;
  const only = (...ns) => count() === ns.length && ns.every(has);
  const typeQ = (v) => { fq.value = v; fire(fq, 'input'); advance(250); };
  const posts = (type) => posted.filter((p) => p.type === type);
  const rowsV = [row(1, { title: 'Fix login', project: 'alpha', fk: 'f1', last: NOW - 1 * H }), row(2, { title: 'Add search', project: 'beta', fk: 'f2', last: NOW - 2 * H }),
    row(3, { title: 'Tidy docs', project: 'alpha', fk: 'f3', last: NOW - 5 * 24 * H }), row(4, { title: 'Refactor', project: 'gamma', fk: 'f4', last: NOW - 1 * H })];
  V.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: '', f: {}, sort: 'recent' } }));
  step('sessions', () => { deliver({ type: 'chats', scan: 1, rows: rowsV, indexing: false, scanning: true }); advance(300); });
  check(tag('before the scan ends there is no All clear and no no-repositories note'), !/All clear/.test(body.innerHTML) && !/No git repositories/.test(body.innerHTML));
  const T0 = 1700000000;
  step('git', () => {
    deliver(fm('f1', 'ok', { facts: vfacts({ branch: 'fix-login', fileTotal: 2, modified: 2, files: [{ s: 'M', p: 'src/login.ts' }, { s: 'M', p: 'README.md' }] }) }));
    deliver(fm('f2', 'ok', { facts: vfacts({ branch: 'feat-search', ahead: 3 }) }));
    deliver(fm('f3', 'ok', { facts: vfacts() }));
    deliver(fm('f4', 'none', { reason: 'Not a git folder' }));
    deliver({ type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: [], ws: true, gh: true,
      branches: [{ n: 'main', ts: T0 - 500, au: 'Ada', up: true, gone: false, a: 0, b: 0 }, { n: 'fix-login', ts: T0 - 100, au: 'Ada', up: true, gone: false, a: 1, b: 0 }, { n: 'feat-search', ts: T0, au: 'Bob', up: true, gone: false, a: 3, b: 0 }],
      worktrees: [vwt('w1', 'proj', 'main', { main: true, fks: ['f3'] }), vwt('w2', 'proj-fix', 'fix-login', { fks: ['f1'], facts: { ok: true, fileTotal: 2, ahead: 0, behind: 0, gone: false, files: [] } }), vwt('w3', 'proj-search', 'feat-search', { fks: ['f2'], facts: { ok: true, fileTotal: 0, ahead: 3, behind: 0, gone: false, files: [] } })] });
    deliver({ type: 'prs', scan: 1, repo: 'r1', state: 'ok', by: { 'feat-search': { n: 81, title: 'Add search box', draft: false, review: '', link: true } } });
    deliver({ type: 'checks', scan: 1, repo: 'r1', n: 81, state: 'failing', total: 3, failing: 1, pending: 0, names: ['build'] });
    deliver({ type: 'end', scan: 1, open: [], gitMissing: false }); advance(300);
  });
  check(tag('sort and the four state filters live in one View menu beside the filter box, not in the header row'), /id="vwm"[^]*id="srm"[^]*id="fch"/.test(page) && page.indexOf('id="fq"') < page.indexOf('id="vwb"') && !/id="flb"|id="srb"/.test(page) && els.get('flc').hidden === true);
  check(tag('four rows, and the filter chips are there and not pressed'), count() === 4 && /Has open PR/.test(els.get('fch').innerHTML) && /Failing checks/.test(els.get('fch').innerHTML) && /Uncommitted/.test(els.get('fch').innerHTML) && /Unpushed/.test(els.get('fch').innerHTML) && !/aria-pressed="true"/.test(els.get('fch').innerHTML));
  check(tag('the filter box is a labelled search field'), /role="search"/.test(page) && /id="fq"[^>]*aria-label="[^"]+"/.test(page) && fq.value === '');
  // Text filter with debounce.
  step('typing', () => { fq.value = 'login'; fire(fq, 'input'); advance(100); });
  check(tag('the filter waits for the debounce'), new Set([...body.innerHTML.matchAll(/class="row" role="listitem" data-id="([^"]+)"/g)].map((m) => m[1])).size === 4 && posts('view').every((p) => p.q === ''));
  step('debounce ends', () => advance(200));
  check(tag('after the debounce only the matching row shows, and the filter is saved'), only(1) && posts('view').some((p) => p.q === 'login'));
  for (const [q, ns, what] of [['readme', [1], 'a file name'], ['feat-search', [2], 'a branch'], ['#81', [2], 'a pull request number with #'], ['81', [2], 'a pull request number'], ['search box', [2], 'a pull request title'], ['proj', [1, 2, 3], 'the repository name'], ['ALPHA', [1, 3], 'a project, any case'], ['alpha login', [1], 'several words']]) {
    step('q ' + q, () => typeQ(q));
    check(tag('the filter matches ' + what), only(...ns));
  }
  step('no match', () => typeQ('zzzzz'));
  check(tag('a filter with no match says so with a Clear filters button and never All clear'), count() === 0 && /Nothing matches these filters/.test(body.innerHTML) && /data-a="clearf"/.test(body.innerHTML) && !/All clear/.test(body.innerHTML));
  step('clear', () => click('clearf'));
  check(tag('Clear filters empties the box, shows every row and saves'), count() === 4 && fq.value === '' && posts('view').pop().q === '');
  // State filters.
  const chip = (f) => click('flt', { f });
  step('dirty', () => chip('dirty')); check(tag('Uncommitted keeps rows with changed files'), only(1) && /data-f="dirty" aria-pressed="true"/.test(els.get('fch').innerHTML));
  step('dirty off, push', () => { chip('dirty'); chip('push'); }); check(tag('Unpushed keeps rows with commits not pushed'), only(2));
  step('push off, pr', () => { chip('push'); chip('pr'); }); check(tag('Has open PR keeps rows with an open pull request'), only(2));
  step('pr off, fail', () => { chip('pr'); chip('fail'); }); check(tag('Failing checks keeps rows whose pull request has failing checks'), only(2));
  step('fail + dirty', () => chip('dirty')); check(tag('the View button shows a badge with the number of filters on'), els.get('flc').hidden === false && els.get('flc').textContent === '2' && /2 filters on/.test(els.get('vwb').getAttribute('aria-label')));
  check(tag('two filters on combine (both must hold)'), count() === 0 && /Nothing matches these filters/.test(body.innerHTML) && posts('view').pop().f.dirty === true && posts('view').pop().f.fail === true);
  step('clear 2', () => click('clearf')); check(tag('Clear filters turns every state filter off and the badge goes'), count() === 4 && !/aria-pressed="true"/.test(els.get('fch').innerHTML) && els.get('flc').hidden === true);
  // Saved view comes back from the host.
  step('init with a saved view', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: 'search', f: { push: true }, sort: 'name' } }));
  advance(300);
  check(tag('a saved filter text, state filter and sort are restored'), fq.value === 'search' && only(2) && /data-f="push" aria-pressed="true"/.test(els.get('fch').innerHTML) && /sorted by Name/.test(els.get('vwb').getAttribute('aria-label')));
  step('reset view', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: '', f: {}, sort: 'recent' } }));
  advance(300);
  // Sort: the rows of each table follow the sort menu (worktrees by newest branch commit, or by name).
  const pos = (n) => body.innerHTML.indexOf('data-id="' + id(n) + '"');
  check(tag('the groups come in the order Needs you, Unfinished work, Waiting, Safe to remove, Idle; the failing PR branch is first'), body.innerHTML.indexOf('data-b="feat-search"') > 0 && body.innerHTML.indexOf('data-b="feat-search"') < body.innerHTML.indexOf('data-b="fix-login"') && body.innerHTML.indexOf('aria-label="Your move"') < body.innerHTML.indexOf('aria-label="Everything else"'));
  step('sort name', () => fire(els.get('srm'), 'change', { target: { value: 'name' } })); advance(300);
  check(tag('sorting by name saves the sort and keeps every row'), posts('view').pop().sort === 'name' && /sorted by Name/.test(els.get('vwb').getAttribute('aria-label')) && body.innerHTML.indexOf('data-b="fix-login"') > 0 && body.innerHTML.indexOf('data-b="feat-search"') > 0);
  step('sort repo', () => fire(els.get('srm'), 'change', { target: { value: 'repo' } })); advance(300);
  check(tag('there is no sort by repository: it is ignored'), /sorted by Name/.test(els.get('vwb').getAttribute('aria-label')) && !/Repository/.test(els.get('srm').innerHTML));
  step('sort junk', () => fire(els.get('srm'), 'change', { target: { value: 'bogus' } }));
  check(tag('an unknown sort value is ignored'), /sorted by Name/.test(els.get('vwb').getAttribute('aria-label')));
  step('sort recent', () => fire(els.get('srm'), 'change', { target: { value: 'recent' } })); advance(300);
  // Density: Relaxed is the default; Compact is chosen in the View menu and saved with the view.
  check(tag('the View menu offers Relaxed and Compact and Relaxed is the default'), /Relaxed/.test(els.get('dnm').innerHTML) && /Compact/.test(els.get('dnm').innerHTML) && !els.get('dnm').innerHTML.includes('checked') && !document.documentElement.classList.contains('dense') && /relaxed density/.test(els.get('vwb').getAttribute('aria-label')));
  step('compact density', () => fire(els.get('dnm'), 'change', { target: { value: 'compact' } })); advance(300);
  check(tag('choosing Compact saves the density and switches the page to the dense variables'), posts('view').pop().density === 'compact' && document.documentElement.classList.contains('dense') && /compact density/.test(els.get('vwb').getAttribute('aria-label')));
  step('bogus density', () => fire(els.get('dnm'), 'change', { target: { value: 'huge' } }));
  check(tag('an unknown density is ignored'), posts('view').pop().density === 'compact');
  step('saved density returns', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { density: 'compact' } }));
  check(tag('a saved Compact density is restored'), document.documentElement.classList.contains('dense'));
  step('reset density', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: '', f: {}, sort: 'recent', density: 'relaxed' } }));
  check(tag('Relaxed removes the dense variables again'), !document.documentElement.classList.contains('dense'));
  const dcss = page.slice(page.indexOf('<style')); 
  check(tag('both densities share one stylesheet through variables: padding, gaps, line height'), /:root\{--rp:1[0-2]px;--rg:[678]px;--gg:2\d+px;--lh:1\.5/.test(dcss) && /:root\.dense\{--rp:/.test(dcss) && /padding:var\(--rp\) 4px/.test(dcss));
  // Copy summary.
  step('copy summary', () => click('summary'));
  const sum = posts('summary').pop();
  check(tag('Copy summary posts the text and the item count (3 open items: two to finish, one to tidy; the idle one is left out)'), sum && sum.n === 3 && /^# Open work: 3 items/.test(sum.text) && /## To finish \(2\)/.test(sum.text) && /## Ready to tidy \(1\)/.test(sum.text) && !/Refactor/.test(sum.text));
  check(tag('the summary names state: files, unpushed commits, pull request and checks'), sum && /Fix login\*\* \(alpha, fix-login\): 2 uncommitted files/.test(sum.text) && /3 unpushed commits; PR #81, checks failing/.test(sum.text) && /Needs you 0, To finish 2, Waiting on others 0, Ready to tidy 1\./.test(sum.text));
  check(tag('the summary holds no link'), sum && !/https?:/.test(sum.text));
  check(tag('the button says Copying while the host works'), els.get('smb').getAttribute('aria-label') === 'Copying...');
  step('host done', () => deliver({ type: 'summaryState', state: 'done', n: 3 }));
  check(tag('a visible Copied confirmation with the item count'), els.get('smb').getAttribute('aria-label') === 'Copied 3 items' && /Copied the summary of 3 items/.test(els.get('live').textContent));
  step('confirm fades', () => advance(2100)); check(tag('the confirmation goes back to Copy summary'), els.get('smb').getAttribute('aria-label') === 'Copy summary');
  step('copy again, no answer', () => click('summary')); step('wait', () => advance(5100));
  check(tag('a copy the host never answers does not stay on Copying'), els.get('smb').getAttribute('aria-label') === 'Copy summary');
  // Keyboard.
  const mkRb = (n) => { const r = Object.assign(V.mkEl(''), { dataset: { a: 'open' }, tabIndex: -1 }); r.classList.add('rb'); r.closest = (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null); return r; };
  const rbs = [mkRb(1), mkRb(2), mkRb(3)];
  document.querySelectorAll = (sel) => (sel === '.rb' ? rbs : []);
  document.querySelector = (sel) => (sel === '.rb' ? rbs[0] : null);
  const key = (k, t) => fire(document, 'keydown', { key: k, target: t });
  step('j', () => key('j', rbs[0])); check(tag('j moves to the next row'), rbs[1].focused === 1);
  step('k', () => key('k', rbs[1])); check(tag('k moves to the previous row'), rbs[0].focused === 1);
  step('slash', () => key('/', rbs[0])); check(tag('/ moves focus to the filter box'), fq.focused >= 1);
  const j0 = rbs[1].focused;
  step('j in the box', () => key('j', fq)); check(tag('typing j in the filter box does not move rows'), rbs[1].focused === j0);
  step('down from the box', () => key('ArrowDown', fq)); check(tag('Down arrow in the filter box goes to the first row'), rbs[0].focused >= 2);
  step('escape clears', () => { fq.value = 'abc'; key('Escape', fq); advance(10); });
  check(tag('Escape in the filter box clears it'), fq.value === '');
  step('question', () => key('?', rbs[0])); check(tag('? opens the shortcuts list'), els.get('shm').hidden === false && /Go to the filter box/.test(page));
  step('escape closes', () => key('Escape', els.get('shb'))); check(tag('Escape closes the shortcuts list'), els.get('shm').hidden === true);
  // A popover open: Escape closes it first and leaves the row expanded; j and k do not move rows behind it.
  step('expand row', () => { count(); key('ArrowRight', rbs[0]); advance(300); });
  const exOpen = () => (body.innerHTML.match(/<div class="ex">/g) || []).length;
  check(tag('a row can be expanded with Right'), exOpen() >= 1);
  step('question again', () => key('?', rbs[0]));
  const j1 = rbs[1].focused;
  step('j behind the popover', () => key('j', rbs[0])); check(tag('j does not move focus while the shortcuts list is open'), rbs[1].focused === j1 && els.get('shm').hidden === false);
  step('escape with a popover', () => key('Escape', rbs[0])); advance(300);
  check(tag('one Escape closes the popover and leaves the row expanded'), els.get('shm').hidden === true && exOpen() >= 1);
  step('second escape', () => { key('Escape', rbs[0]); advance(300); }); check(tag('the next Escape collapses the row'), exOpen() === 0);
  document.querySelectorAll = () => []; document.querySelector = () => null;
  // Sections: three tables and Sessions without a branch collapse, and the choice is saved per workspace.
  check(tag('no branch read is ever asked: the Branches table holds the branches'), posts('branches').length === 0 && /class="wk"/.test(body.innerHTML) && !/Branches without a worktree/.test(body.innerHTML + page));
  check(tag('the session that is not in git is under Everything else with its count'), count() >= 0 && /aria-label="Everything else"[^]*class="pill">\d+</.test(body.innerHTML) && has(4));
  for (const s of ['g:needs', 'g:idle']) {
    count();
    step('collapse ' + s, () => click('sec', { s }));
    check(tag('section ' + s + ' collapses and the state is saved'), new RegExp('data-a="sec" data-s="' + s + '"[^>]*aria-expanded="false"').test(body.innerHTML) && posts('view').pop().sec[s] === false);
    step('expand ' + s, () => click('sec', { s }));
    check(tag('section ' + s + ' expands again and saves'), new RegExp('data-a="sec" data-s="' + s + '"[^>]*aria-expanded="true"').test(body.innerHTML) && posts('view').pop().sec[s] === true);
  }
  step('collapse needs', () => click('sec', { s: 'g:needs' }));
  check(tag('a collapsed group hides its rows but the others stay'), !/<div class="wk" role="table" aria-label="Your move">/.test(body.innerHTML) && /<section[^>]*aria-label="Everything else"/.test(body.innerHTML));
  step('expand needs', () => click('sec', { s: 'g:needs' }));
  // A chat list inside a row expands and collapses; the count stays.
  const hxBtn = () => /data-a="hx" data-x="([^"]*)" data-on="(\d)"/.exec(body.innerHTML);
  const rowsBefore = () => (body.innerHTML.match(/class="row"/g) || []).length;
  let nBefore = 0;
  step('collapse a session list', () => { nBefore = rowsBefore(); const m = hxBtn(); click('hx', { x: m[1], on: m[2] }); });
  check(tag('collapsing the sessions of a row hides them and keeps the count button'), rowsBefore() < nBefore && /data-on="0"/.test(body.innerHTML));
  step('new scan', () => { deliver({ type: 'chats', scan: 2, rows: rowsV, indexing: false, scanning: false }); advance(300); });
  // Status line.
  step('time', () => advance(125000));
  check(tag('the Refresh button tooltip reads Updated 2 min ago and there is no separate status line'), /Updated 2 min ago/.test(els.get('rf').title) && !/id="updw"/.test(page));
  step('status refresh', () => { const n = posts('refresh').length; click('refresh'); check(tag('the Refresh link asks for a refresh'), posts('refresh').length === n + 1); });
  V.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { viewScenario(W); }

// Project status: a repository with worktrees, an unmerged backup branch and a PR-only branch, and no chat at all.
function statusScenario(W) {
  const V = createHarness({ page, name: 'openwork-status@' + W, width: W, popIds: VIEW_POPS });
  const { els, posted, fire, deliver, advance, check, step } = V;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const click = (a, data) => fire(body, 'click', { target: target(a, '', { dataset: Object.assign({ a }, data || {}) }) });
  V.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { q: '', f: {}, sort: 'recent' } }));
  step('no sessions', () => { deliver({ type: 'chats', scan: 1, rows: [], indexing: false, scanning: true }); advance(300); });
  const wts = [vwt('w1', 'contacts', 'main', { main: true, fks: ['f1'], facts: { ok: true, fileTotal: 2, ahead: 0, behind: 0, gone: false, files: [] }, da: 0, db: 0 })];
  for (let i = 1; i <= 4; i++) { wts.push(vwt('w' + (i + 1), 'contacts-wt-' + i, 'wt-' + i, { merged: i === 1, facts: { ok: true, fileTotal: i === 2 ? 3 : 0, ahead: i === 3 ? 2 : 0, behind: 0, gone: false, files: [] }, da: i === 3 ? 2 : 0, db: i === 3 ? 1 : 0 })); }
  const T = 1700000000;
  const br = (n, o) => Object.assign({ n, ts: T, au: 'Ada <b>L</b>', up: true, gone: false, a: 0, b: 0 }, o || {});
  step('repo with no session', () => {
    deliver({ type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'contacts', def: 'origin/main', defLocal: 'main', merged: ['wt-1'], ws: true, gh: true, worktrees: wts, bmore: 0,
      branches: [br('main'), br('wt-1'), br('wt-2'), br('wt-3', { a: 2, b: 1 }), br('wt-4'), br('backup-2026', { up: false, gone: false, a: 9, b: 0, au: 'Linus' }), br('stale', { gone: true })] });
    deliver({ type: 'prs', scan: 1, repo: 'r1', state: 'ok', by: { 'wt-3': { n: 7, title: 'Add <i>x</i>', draft: false, review: 'approved', link: true } },
      all: [{ b: 'wt-3', n: 7, title: 'Add <i>x</i>', draft: false, review: 'approved', link: true }, { b: 'only-remote', n: 9, title: 'Remote only change', draft: true, review: '', link: true }] });
    deliver({ type: 'checks', scan: 1, repo: 'r1', n: 7, state: 'failing', total: 3, failing: 1, pending: 0, names: ['build'] });
    deliver({ type: 'checks', scan: 1, repo: 'r1', n: 9, state: 'passing', total: 2, failing: 0, pending: 0, names: [] });
    advance(300);
  });
  let h = body.innerHTML;
  check(tag('a repository with worktrees and no session shows its non-empty groups, Cleanup closed by default, draws no empty group, and the page title says Claude Project Status'), ['g:needs', 'g:waiting'].every((g) => new RegExp('data-a="sec" data-s="' + g + '" aria-expanded="true"').test(h)) && /data-a="sec" data-s="g:tidy" aria-expanded="false"/.test(h) && !/data-s="g:idle"/.test(h) && !/Sessions without a branch/.test(h) && />Claude Project Status</.test(page));
  step('open the closed groups and every details block', () => { openAll(V); advance(300); h = body.innerHTML; });
  check(tag('the headline and the group headers say the same numbers'), /class="hl"[^>]*>contacts — Next: Fix checks on PR #7 · 3 more need you · 1 waiting · 3 to clean up</.test(h) && pillOf(h, 'Your move') === 4 && pillOf(h, 'In progress') === 1 && pillOf(h, 'Safe to remove') === 3);
  check(tag('the page has one slim summary line with the repository name and its GitHub button, and no totals'), /class="psl"[^>]*><span class="hl" role="status">contacts — /.test(h) && /data-a="repolink" data-k="r1"/.test(h) && !/class="tot"|worktrees ·/.test(h) && !/class="psh"|class="psr"/.test(h));
  check(tag('one table: a row per branch (8), five with a worktree, no separate worktree, branch or pull request tables'), (h.match(/class="wh"/g) || []).length === 0 && (h.match(/class="wr"/g) || []).length === 8 && (h.match(/class="wr"[^>]*data-w=/g) || []).length === 5 && (h.match(/class="wr"[^>]*data-b=/g) || []).length === 8 && !/<table|class="pst/.test(h));
  check(tag('the branch of a worktree and its PR is one row with all three facts'), (() => { const rowS = trSlice(body, 'b', 'wt-3'); return /contacts-wt-3/.test(rowS) && /#7/.test(rowS) && /↑2/.test(rowS) && /Fix checks on PR #7/.test(rowS) && (h.match(/class="wr"[^>]*data-b="wt-3"/g) || []).length === 1; })());
  step('open the backup popover', () => click('mnu', { x: 'b:b:backup-2026' }));
  check(tag('an unmerged backup branch with no worktree says it is only on this computer, with its author in the Created tooltip'), (() => { const rowS = trSlice(body, 'b', 'backup-2026'); return />Push 9 commits</.test(rowS) && /9 commits only on this computer/.test(rowS) && /Linus/.test(rowS) && /↑9/.test(rowS) && !/data-w=/.test(rowS.slice(0, 80)); })());
  check(tag('a PR-only row shows the PR with its checks and is Waiting'), />only-remote</.test(h) && /PR #9 is open, checks passing/.test(trSlice(body, 'b', 'only-remote')) && /draft/.test(trSlice(body, 'b', 'only-remote')) && /PR #7/.test(trSlice(body, 'b', 'wt-3')) && /checks failing|Checks are failing/.test(trSlice(body, 'b', 'wt-3')));
  check(tag('one headline per row: Remove worktree, Commit 3 files, Fix checks on PR #7'), />Remove worktree</.test(trSlice(body, 'w', 'w2')) && /worktree can be removed/.test(trSlice(body, 'w', 'w2')) && />Commit 3 files</.test(trSlice(body, 'w', 'w3')) && /3 files not committed/.test(trSlice(body, 'w', 'w3')) && /Checks are failing on PR #7/.test(trSlice(body, 'w', 'w4')) && /dt-tidy/.test(trSlice(body, 'w', 'w2')) && /dt-finish/.test(trSlice(body, 'w', 'w3')) && /dt-needs/.test(trSlice(body, 'w', 'w4')));
  check(tag('a row shows at most two tags'), (h.match(/class="meta wl2">(?:(?!<\/div>)[^])*<\/div>/g) || []).length === 8 && (h.match(/class="meta wl2">(?:(?!<\/div>)[^])*<\/div>/g) || []).every((t) => (t.match(/class="bd bd-muted"/g) || []).length <= 2));
  step('open the wt-2 popover', () => click('mnu', { x: 'b:w:w3' }));
  check(tag('names and titles are escaped'), !/<b>L<\/b>|<i>x<\/i>/.test(body.innerHTML) && /Ada &lt;b&gt;L/.test(body.innerHTML));
  check(tag('branch names link through the host (brl) with the repository key'), /data-a="brl" data-k="r1" data-b="wt-3" data-n="7"/.test(h) && /data-a="brl" data-k="r1" data-b="backup-2026" data-n="0"/.test(h) && /data-a="brl" data-k="r1" data-b="only-remote" data-n="9"/.test(h));
  check(tag('there is no column header row and no PR note line'), !/class="wh"/.test(h) && !/<p[^>]*>Pull request author/.test(h));
  step('click a branch link', () => click('brl', { k: 'r1', b: 'backup-2026', n: '0' }));
  check(tag('a branch link posts openBranch'), posted.some((p) => p.type === 'openBranch' && p.repo === 'r1' && p.branch === 'backup-2026'));
  step('click the repo link', () => click('repolink', { k: 'r1' }));
  check(tag('the repository button posts openRepo with the key only'), posted.some((p) => p.type === 'openRepo' && p.repo === 'r1' && Object.keys(p).length === 2));
  step('collapse', () => click('sec', { s: 'g:waiting' }));
  check(tag('the group collapses and the choice is saved per workspace'), !/<div class="wk" role="table" aria-label="In progress">/.test(body.innerHTML) && posted.filter((p) => p.type === 'view').pop().sec['g:waiting'] === false);
  step('expand', () => click('sec', { s: 'g:waiting' }));
  check(tag('and opens again'), /<div class="wk" role="table" aria-label="In progress">/.test(body.innerHTML));
  step('another repository outside the workspace', () => { deliver({ type: 'repo', scan: 1, key: 'r2', state: 'ok', name: 'elsewhere', def: '', defLocal: '', merged: [], ws: false, gh: false, worktrees: [vwt('w9', 'elsewhere', 'main', { main: true })], branches: [] }); advance(300); });
  check(tag('a repository outside the workspace is not listed'), !/psn">elsewhere</.test(body.innerHTML) && trSlice(body, 'w', 'w9') === '');
  step('filter', () => { const f = els.get('fq'); f.value = 'backup'; fire(f, 'input'); advance(250); });
  check(tag('the filter box narrows the rows'), />backup-2026</.test(body.innerHTML) && !/>wt-4</.test(body.innerHTML));
  step('clear the filter', () => { const f = els.get('fq'); f.value = ''; fire(f, 'input'); advance(250); });
  check(tag('every group is listed, no group can be turned off, and there is no rows-shown note'), /data-s="g:tidy"/.test(body.innerHTML) && !/rows shown|data-a="showall"|data-a="band"/.test(body.innerHTML));
  step('open Cleanup', () => { openAll(V); advance(300); });
  check(tag('the number next to each group equals the rows listed in it'), groupsAgree(body.innerHTML) && pillOf(body.innerHTML, 'Safe to remove') === 3 && (body.innerHTML.match(/<div class="wr"/g) || []).length === 8);
  // Rows: one labeled action each, no icon-only buttons, secondary actions in the details, no Created column, columns left out when empty.
  const wt = () => (h.match(/<div class="wtab[^>]*>[^]*$/) || [''])[0];
  check(tag('the row buttons are labeled text buttons: Open PR on the failing PR row, Copy remove command on the merged worktree, and no icon-only button in the table'), />Open PR</.test(trSlice(body, 'w', 'w4')) && /data-a="pr" data-k="r1" data-n="7"/.test(trSlice(body, 'w', 'w4')) && />Copy remove command</.test(trSlice(body, 'w', 'w2')) && !/class="ab ib"/.test(wt()));
  check(tag('a dirty row with no creator session has no action button, and every row has a More button'), !/class="ab pb"/.test(trSlice(body, 'w', 'w3').replace(/<div class="ovp wd"[^]*$/, '')) && (h.match(/class="wr"/g) || []).length === (h.match(/data-a="mnu" data-x="b:/g) || []).length);
  check(tag('a row is two lines: a headline and a meta line; there are no columns and no Created cell'), (h.match(/class="wl1"/g) || []).length === (h.match(/class="meta wl2"/g) || []).length && !/class="c-pr"|class="c-vs"|class="c-ch"|data-l="Created"/.test(h));
  step('open the wt-3 popover', () => click('mnu', { x: 'b:w:w4' }));
  check(tag('the popover holds the creator line and the copy PR link action'), /class="ovp wd"/.test(trSlice(body, 'b', 'wt-3')) && /<dt>Creator<\/dt>/.test(trSlice(body, 'b', 'wt-3')) && />Copy PR link</.test(trSlice(body, 'b', 'wt-3')) && /data-a="prc" data-k="r1" data-n="7"/.test(trSlice(body, 'b', 'wt-3')));
  check(tag('the headline carries the full sentence in its tooltip, and there is no default branch tag text'), /class="todo" data-tip="3 files not committed[^"]*">Commit 3 files/.test(trSlice(body, 'w', 'w3')) && !/>default branch</.test(h));
  check(tag('a PR column in use is kept, and the vs default column too'), /class="wtab"/.test(h));
  V.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { statusScenario(W); }

// Related chats: every worktree and branch ends with chats or the evidence line, certain ones in the normal style with a reason badge and tooltip, probable ones muted and labelled.
function relatedScenario(W) {
  const { contactsWorld } = require('./fake_world');
  const { relOf } = require(path.join(OUT, 'workMatch.js'));
  const world = contactsWorld(), out = relOf(world.ix, world.input);
  const R = createHarness({ page, name: 'openwork-related@' + W, width: W, popIds: VIEW_POPS });
  const { els, posted, fire, deliver, advance, check, step } = R;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const T = 1791000000;
  const prow = world.chats.filter((c) => !c.parent && c.dir === '-w-contacts').map((c, i) => ({ id: c.id, title: c.title, project: 'contacts', last: c.last, pinned: false, ctx: undefined }));
  const wtp = world.input.wts.map((w) => vwt(w.k, w.name, w.branch, { path: w.path, main: w.main, facts: { ok: true, fileTotal: 0, ahead: 0, behind: 0, gone: false, files: [] }, da: 0, db: 0 }));
  const brs = world.input.brs.map((b) => ({ n: b.n, ts: b.ts, cr: b.cr, au: b.n === 'ancient-nothing-branch' ? 'Grace <x>' : 'Ada', up: true, gone: false, a: 0, b: 0 }));
  R.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: false, days: 14, hidden: [], ws: 1, done: {}, view: { q: '', f: {}, sort: 'recent' } }));
  step('sessions and repository, before the matcher answers', () => {
    deliver({ type: 'chats', scan: 1, rows: prow, indexing: false, scanning: true });
    deliver({ type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'contacts', def: 'origin/main', defLocal: 'main', merged: [], ws: true, gh: false, worktrees: wtp, branches: brs, bmore: 0 });
    advance(300);
  });
  openGroups(R); advance(300);
  const withOv = (a, v) => { if (/class="ovp wd"/.test(trSlice(body, a, v))) { return trSlice(body, a, v); } fire(body, 'click', { target: target('mnu', '', { dataset: { a: 'mnu', x: 'b:' + a + ':' + v.replace(/[^A-Za-z0-9_-]/g, '_') } }) }); return trSlice(body, a, v); };
  check(tag('before the matcher answers a row with no session says it is matching, not blank'), /Matching sessions/.test(withOv('b', 'ancient-nothing-branch')) && /Last commit|Created/.test(trSlice(body, 'b', 'ancient-nothing-branch')));
  const openRows = () => { openGroups(R); for (let pass = 0; pass < 3; pass++) { /* a pass can reveal folded branch rows with toggles of their own */ for (const m of [...body.innerHTML.matchAll(/data-a="hx" data-x="([^"]*)" data-on="0"/g)]) { if (!/:m$/.test(m[1])) { fire(body, 'click', { target: target('hx', '', { dataset: { a: 'hx', x: m[1], on: '0' } }) }); } } advance(300); } };
  step('matcher answers', () => { deliver({ type: 'rel', scan: 1, rk: 'r1', ok: true, w: out.w, b: out.b }); deliver({ type: 'end', scan: 1, open: [], gitMissing: false }); advance(300); openRows(); });
  const h = body.innerHTML;
  const wtIn = world.input.wts.filter((w) => !w.main), brIn = world.input.brs.filter((b) => b.n !== 'main'); /* an idle default branch is not listed */
  const wtRows = wtIn.map((w) => withOv('w', w.k)), brRows = brIn.map((b) => withOv('b', b.n));
  check(tag('all ' + wtRows.length + ' worktrees and ' + brRows.length + ' branches are listed'), wtRows.every(Boolean) && brRows.every(Boolean));
  const blank = wtRows.concat(brRows).filter((t) => !/class="ab hxb"/.test(t) && !/no matching session found/.test(t));
  check(tag('no Sessions cell is blank: each has a session count or the evidence line (' + blank.length + ' blank)'), blank.length === 0);
  check(tag('the sessions cell never reads a bare 0'), wtRows.concat(brRows).every((t) => !/<div class="c-ch"[^>]*><span class="nb"[^>]*>0<\/span><\/div>/.test(t)));
  check(tag('branches made by one session fold into one row titled with that session, with an "N branches" toggle, and the children are listed once opened'), (() => { const m = /data-a="hx" data-x="[^"]*:f" data-on="1"[^>]*>(\d+) branches/.exec(h); return !!m && Number(m[1]) >= 2 && (h.match(/data-kid="1"/g) || []).length >= Number(m[1]) - 0 && /class="hxr fxr"/.test(h); })());
  check(tag('a worktree made by a subagent shows its session count, and the session sits in the worktree row, open'), /class="ab hxb"[^>]*>1 chat </.test(trSlice(body, 'w', 'w2')) && /Pro rollout/.test(h) && /aria-label="Sessions in feat\/saropa-connection-cloud-icon-search"/.test(h));
  const sub = (name) => { const i = h.indexOf('aria-label="Sessions in ' + name + '"'); const js = ['<div class="wr"', '</section>'].map((m) => h.indexOf(m, i)).filter((v) => v >= 0); return i < 0 ? '' : h.slice(i, Math.min(...js)); };
  check(tag('a certain session has the normal style and a reason badge with its tooltip (reason and confidence)'), (() => { const t = sub('feat/saropa-connection-cloud-icon-search'); return /data-rel="c"/.test(t) && /class="bd bd-info" data-rel="certain">subagent</.test(t) && /Related by: via a subagent \(certain\)/.test(t) && /created contacts-wt-connection-icon/.test(t) && !/data-rel="p"/.test(t); })());
  check(tag('the session that ran in a worktree folder says folder, and keeps the second reason in its tooltip'), (() => { const t = sub('fix/login-reminder-dot-fires-once'); return />folder</.test(t) && /Also: its rows record the branch/.test(t); })());
  check(tag('a session that ran git worktree add itself says created'), />created</.test(sub('feat/pro-pill-gaps')));
  check(tag('a probable session is muted and labelled probable with its reason'), (() => { const t = sub('bahai-mojibake'); return /data-rel="p"/.test(t) && /bd-muted" data-rel="probable">probable: name</.test(t) && /Related by: name in the session \(probable\)/.test(t) && /Probable: no session is certain for this row/.test(t); })());
  check(tag('a time-window session is labelled probable: time'), /probable: time</.test(sub('orphan-spike-branch')));
  const far = withOv('b', 'ancient-nothing-branch');
  check(tag('a branch nothing links to shows the evidence with date and author, no matching session found, and the nearest session by time labelled probable'), /no matching session found; nearest by time is listed/.test(far) && /Grace &lt;x&gt;/.test(far) && /nearest by time \(probable\)</.test(sub('ancient-nothing-branch')) && /Nearest by time \(probable\): started \d+ days after/.test(sub('ancient-nothing-branch')) && !/Related by/.test(sub('ancient-nothing-branch')));
  const none = withOv('b', 'no-time-branch');
  check(tag('a branch with no time and no session still shows an evidence line, not an empty cell'), /no matching session found/.test(none) && !/class="ab hxb"/.test(none));
  check(tag('a session the matcher placed is not also listed under Chats without a branch'), !/aria-label="Sessions without a branch"/.test(h) || !/Pro rollout/.test(h.slice(h.indexOf('aria-label="Sessions without a branch"'))));
  check(tag('a row with a creator lists the creator session in the main list and puts the mention-only session under a closed "Mentions only (1)" toggle, muted'), (() => { const t = sub('langv2-final'); return /Language rule design/.test(t) && !/Who made it/.test(t) && /data-x="w:w7:m" data-on="0"[^>]*>[^]*?Mentions only \(1\)/.test(h) && /class="bd bd-info" data-rel="certain">subagent</.test(t); })());
  step('open the Mentions only toggle on the langv2 row', () => { fire(body, 'click', { target: target('hx', '', { dataset: { a: 'hx', x: 'w:w7:m', on: '0' } }) }); advance(300); });
  check(tag('the opened toggle shows the mention-only session muted with a "mention only" badge, after the creator'), (() => { const h2 = body.innerHTML, i = h2.indexOf('aria-label="Sessions that only mention langv2-final"'); return i > 0 && /Who made it/.test(h2.slice(i, i + 3000)) && /data-rel="mention">mention only</.test(h2.slice(i, i + 3000)) && h2.indexOf('Language rule design') < i; })());
  // Clean-up with receipts: the creator is named in the Created cell with the receipt in its tooltip, the Ask buttons exist only where a chat is a certain creator, and the click posts only keys.
  const LVID = '22eb3898-19ee-4316-be07-d87a8384586d', lv = withOv('w', 'w7');
  check(tag('Created: the cell names the creator session as a button that opens it, beside the age'), /class="c-cr"[^]*class="cby"[^]*data-a="opc" data-c="22eb3898-19ee-4316-be07-d87a8384586d"[^>]*>Language rule design</.test(lv));
  check(tag('Created tooltip: the exact UTC and local time, the tool call time, the exact command, the transcript line, the tool_use id and the subagent'), (() => { const tip = /class="cw" data-tip="([^"]*)"/.exec(lv); return !!tip && /Created \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC, local /.test(tip[1]) && /Tool call at \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC/.test(tip[1]) && /Command: git worktree add \.\.\/contacts-wt-langv2 -b langv2-final origin\/main/.test(tip[1]) && /Transcript line 31, tool_use toolu_01FAKE0201, subagent aeb797a2/.test(tip[1]); })());
  check(tag('Ask buttons: two labeled buttons in the details of a creator row, Copy clean-up prompt and Ask the session, with tooltips naming the session, carrying only the keys'), (lv.match(/data-a="cu"/g) || []).length === 2 && />Copy clean-up prompt</.test(lv) && />Ask Language rule design to clean up</.test(lv) && !/<button[^>]*class="ab ib"/.test(lv.slice(0, lv.indexOf('<div class="hxr"') > 0 ? lv.indexOf('<div class="hxr"') : lv.length)) && /data-k="r1" data-c="22eb3898-19ee-4316-be07-d87a8384586d" data-b="langv2-final" data-w="w7" data-m="copy"/.test(lv) && /data-tip="Copy a prompt for Language rule design with receipts/.test(lv));
  check(tag('the branch tooltip carries the creator line'), /<code data-tip="langv2-final\n(?:[^\n"]*\n)?Created \S+ ago by Language rule design">/.test(lv));
  check(tag('Ask buttons: none on a row whose sessions are only probable or mentions'), !/data-a="cu"/.test(trSlice(body, 'b', 'bahai-mojibake')) && !/data-a="cu"/.test(trSlice(body, 'b', 'orphan-spike-branch')) && !/class="cby"/.test(trSlice(body, 'b', 'bahai-mojibake')));
  const click2 = (a, x) => fire(body, 'click', { target: target(a, '', { dataset: { a, x } }) });
  const cuClick = (d) => fire(body, 'click', { target: target('cu', '', { dataset: Object.assign({ a: 'cu', k: 'r1', c: LVID, b: 'langv2-final', w: 'w7', m: 'copy' }, d || {}) }) });
  step('ask copy', () => cuClick());
  step('ask resume', () => cuClick({ m: 'resume' }));
  check(tag('Ask: Copy posts cleanup with the repository key, the session id and the row keys only; Resume posts mode resume'), posted.some((p) => p.type === 'cleanup' && p.rk === 'r1' && p.id === LVID && p.mode === 'copy' && p.rows.length === 1 && p.rows[0].b === 'langv2-final' && p.rows[0].w === 'w7' && Object.keys(p).sort().join() === 'id,mode,rk,rows,type') && posted.some((p) => p.type === 'cleanup' && p.mode === 'resume'));
  const nCu = posted.filter((p) => p.type === 'cleanup').length;
  step('ask bad', () => { cuClick({ k: '../x' }); cuClick({ c: 'not-an-id' }); cuClick({ b: 'x'.repeat(300) }); cuClick({ w: 'w7; rm' }); });
  check(tag('Ask: a bad key, session id, branch or worktree key posts nothing'), posted.filter((p) => p.type === 'cleanup').length === nCu);
  step('open the creator chat menu', () => click2('mnu', 'c:w:w7:' + LVID));
  const crRow = rowSlice(body, LVID);
  check(tag('Ask about all: the creator session row has its own two buttons, and a session that is not a creator has none'), (crRow.match(/data-a="cua"/g) || []).length === 2 && /aria-label="Ask Language rule design about all of its leftovers: copy the prompt"/.test(crRow) && !/data-a="cua"/.test(rowSlice(body, id(10))));
  step('ask all', () => fire(body, 'click', { target: target('cua', LVID, { dataset: { a: 'cua', k: 'r1', m: 'copy' } }) }));
  check(tag('Ask about all: posts cleanup with all true for that session'), posted.some((p) => p.type === 'cleanup' && p.all === true && p.id === LVID && p.rk === 'r1' && p.mode === 'copy'));
  step('open the creator link', () => fire(body, 'click', { target: target('opc', '', { dataset: { a: 'opc', c: LVID } }) }));
  check(tag('the creator link opens the session'), posted.some((p) => p.type === 'open' && p.id === LVID));
  check(tag('the headline reads as one plain sentence and names the groups'), /class="hl"[^>]*>contacts — (Next: |\d+ )/.test(body.innerHTML) && groupsAgree(body.innerHTML));
  step('the matcher fails', () => { deliver({ type: 'rel', scan: 1, rk: 'r1', ok: false }); advance(300); });
  check(tag('when the matcher fails the evidence says so, still not blank'), /session matching unavailable/.test(withOv('b', 'no-time-branch')));
  step('a new scan clears the old matches', () => { deliver({ type: 'chats', scan: 2, rows: prow, indexing: false, scanning: true }); advance(300); });
  check(tag('a new scan forgets the matches and shows the matching state again'), /session matching not finished|Matching sessions/.test(withOv('b', 'no-time-branch')));
  R.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { relatedScenario(W); }


// Page structure: chats live in the worktree or branch row they belong to; attention chips filter the rows; row badges.
function structureScenario(W) {
  const S = createHarness({ page, name: 'openwork-structure@' + W, width: W, popIds: VIEW_POPS });
  const { els, posted, fire, deliver, advance, check, step } = S;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const click = (a, data) => fire(body, 'click', { target: target(a, '', { dataset: Object.assign({ a }, data || {}) }) });
  const T = 1700000000, DAY = 86400;
  const fct = (o) => Object.assign({ name: 'proj', branch: 'main', detached: false, upstream: 'origin/main', ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true }, o || {});
  const rowsS = [row(1, { title: 'On the worktree', fk: 'f1' }), row(2, { title: 'On a lone branch', fk: 'f2' }), row(3, { title: 'No git here', fk: 'f3' }), row(4, { title: 'Idle one', fk: 'f1' }), row(5, { title: 'On main', fk: 'f4' }), row(6, { title: 'Folder not matched', fk: 'f5' })];
  S.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: {} }));
  step('dots', () => deliver({ type: 'dots', map: { [id(1)]: { s: 'waiting' } } }));
  step('scan', () => {
    deliver({ type: 'chats', scan: 1, rows: rowsS, indexing: false, scanning: true });
    deliver({ type: 'folder', scan: 1, key: 'f1', state: 'ok', facts: fct({ branch: 'feat', fileTotal: 1, files: [{ s: 'M', p: 'a.ts' }] }) });
    deliver({ type: 'folder', scan: 1, key: 'f2', state: 'ok', facts: fct({ branch: 'solo' }) });
    deliver({ type: 'folder', scan: 1, key: 'f3', state: 'none', reason: 'Not a git folder' });
    deliver({ type: 'folder', scan: 1, key: 'f4', state: 'ok', facts: fct({ branch: 'main' }) });
    deliver({ type: 'folder', scan: 1, key: 'f5', state: 'ok', facts: fct({ branch: 'feat', fileTotal: 1, files: [{ s: 'M', p: 'a.ts' }] }) }); // a folder the worktree list does not name (a path that differs in spelling): the branch still places the chat
    deliver({ type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'proj', def: 'origin/main', defLocal: 'main', merged: ['done-br'], ws: true, gh: true,
      branches: [{ n: 'main', ts: T, au: 'A', up: true, gone: false, a: 0, b: 0 }, { n: 'feat', ts: T - DAY, au: 'A', up: true, gone: false, a: 1, b: 2 }, { n: 'solo', ts: T - 2 * DAY, au: 'A', up: true, gone: false, a: 0, b: 0 }, { n: 'done-br', ts: T - 9 * DAY, au: 'A', up: true, gone: false, a: 0, b: 0 }, { n: 'lost', ts: T - 9 * DAY, au: 'A', up: true, gone: true, a: 1, b: 0 }],
      worktrees: [wtm('w1', 'proj', 'main', { main: true, fks: ['f4'] }), wtm('w2', 'proj-feat', 'feat', { fks: ['f1'], facts: { ok: true, fileTotal: 1, ahead: 0, behind: 0, gone: false, files: [] }, db: 2 })] });
    deliver({ type: 'prs', scan: 1, repo: 'r1', state: 'ok', by: { feat: { n: 5, title: 'Feat', draft: false, review: 'review requested', link: true } } });
    deliver({ type: 'end', scan: 1, open: [], gitMissing: false }); advance(300);
  });
  const h = () => body.innerHTML;
  const inTr = (tr, n) => tr.indexOf('data-id="' + id(n) + '"') >= 0;
  const after = (attr, val) => { const i = h().search(new RegExp('<div class="wr"[^>]*data-' + attr + '="' + val + '"')); if (i < 0) { return ''; } const js = ['<div class="wr"', '</section>'].map((m) => h().indexOf(m, i + 10)).filter((v) => v >= 0); return h().slice(i, Math.min(...js)); }; // the table row and the chat sub-rows that follow it
  const rowN = () => (h().match(/class="wr"/g) || []).length;
  openGroups(S);
  check(tag('session lists are closed by default, whatever the state of their sessions, each with a count button'), ['w:w2', 'b:solo'].every((x) => new RegExp('data-x="' + x + '" data-on="0"').test(h())) && /class="wr"[^>]*data-b="solo"[^]*?data-a="hx" data-x="b:solo"[^>]*>1 chat </.test(h()) && (h().match(/class="row"/g) || []).length === 2);
  step('open every session list', () => { openAll(S); advance(300); });
  check(tag('a session run in a worktree folder is a sub-row of that worktree row, with title, age, context, state and the icon actions'), inTr(after('w', 'w2'), 1) && inTr(after('w', 'w2'), 4) && />61%</.test(rowSlice(body, id(1))) && /class="st b-needs"/.test(rowSlice(body, id(1))) && ['open', 'pin', 'done', 'mnu'].every((a) => new RegExp('data-a="' + a + '"').test(rowSlice(body, id(1)))));
  check(tag('a row with a waiting session has one Open chat button for that session'), (() => { const r = after('w', 'w2').split('<div class="ovp wd"')[0]; return (r.match(/class="ab pb"/g) || []).length === 1 && new RegExp('data-a="opc" data-c="' + id(1) + '"[^>]*>Open chat<').test(r); })());
  check(tag('a session whose folder the worktree list does not name is placed by its branch, on that worktree'), inTr(after('w', 'w2'), 6));
  check(tag('a session whose recorded branch is a branch is under that branch row, also when a worktree has it'), inTr(after('b', 'feat'), 1) && inTr(after('b', 'feat'), 6) && inTr(after('b', 'solo'), 2));
  check(tag('the pull request is folded into the row of its branch: the sessions of the head branch are under it and it shows #5'), inTr(after('b', 'feat'), 1) && inTr(after('b', 'feat'), 4) && inTr(after('b', 'feat'), 6) && !inTr(after('b', 'feat'), 2) && /#5/.test(after('b', 'feat')) && !/data-n="5"[^]*class="wr"[^]*data-n="5"/.test(h()));
  check(tag('a session run in the idle main checkout has no row of its own: it is listed under Chats without a branch'), after('w', 'w1') === '' && inTr(/aria-label="Chats without a branch"[^]*/.exec(h())[0], 5) && !inTr(after('w', 'w2'), 5));
  check(tag('every session of the repository is visible somewhere: the six sessions are all on the page'), [1, 2, 3, 4, 5, 6].every((n) => new RegExp('data-id="' + id(n) + '"').test(h())));
  step('collapse the lone branch sessions', () => click('hx', { x: 'b:solo', on: '1' }));
  check(tag('a row can collapse its sessions: the count button stays and the choice is saved with the view'), !new RegExp('data-id="' + id(2) + '"').test(h()) && /data-x="b:solo" data-on="0"/.test(h()) && posted.filter((p) => p.type === 'view').pop().sec['x:b:solo'] === false);
  step('saved view comes back', () => { deliver({ type: 'init', v: 3, prsOn: true, days: 14, hidden: [], ws: 1, done: {}, view: { sec: { 'x:b:solo': false } } }); advance(300); openGroups(S); });
  check(tag('the saved collapse is restored'), /data-x="b:solo" data-on="0"/.test(h()));
  step('open it again', () => { click('hx', { x: 'b:solo', on: '0' }); openAll(S); advance(300); });
  check(tag('and opens again'), new RegExp('data-id="' + id(2) + '"').test(h()) && /data-x="b:solo" data-on="1"/.test(h()));
  check(tag('one list with a row per branch (4, the idle default branch is left out) and one with a worktree; the headline counts them and the numbers match the groups'), rowN() === 4 && (h().match(/class="wr"[^>]*data-w=/g) || []).length === 1 && groupsAgree(h()) && !/class="sub psh"|class="tot"/.test(h()));
  check(tag('a session outside git is under Chats without a branch in Everything else'), /aria-label="Chats without a branch"/.test(h()) && /aria-label="Everything else"/.test(h()) && inTr(/aria-label="Chats without a branch"[^]*/.exec(h())[0], 3));
  check(tag('one verdict and one reason per row: a waiting session is Needs you; a deleted remote branch and a merged branch are Merged clean'), />Answer the question in/.test(trSlice(body, 'w', 'w2')) && /A session is waiting for your answer/.test(trSlice(body, 'w', 'w2')) && /The remote branch was deleted/.test(trSlice(body, 'b', 'lost')) && />Delete branch</.test(trSlice(body, 'b', 'done-br')) && /remote branch deleted/.test(trSlice(body, 'b', 'lost')));
  check(tag('the idle default branch is not listed, and a plain branch has no tag'), trSlice(body, 'b', 'main') === '' && !/class="bd/.test(trSlice(body, 'b', 'solo')));
  check(tag('the page has no session bands and no Project status block: the title is Claude Project Status'), !/class="band"[^>]*aria-label="(To finish|Waiting on others|Ready to tidy)"/.test(h()) && /<h1 id="ttl">Claude Project Status<\/h1>/.test(page) && !/aria-label="Project status"/.test(h()));
  check(tag('every group is listed (Needs you included) with the waiting worktree row and the others'), /class="wr"[^>]*data-w="w2"/.test(h()) && new RegExp('data-id="' + id(1) + '"').test(h()));
  check(tag('every icon button has an accessible name and a tooltip'), [...h().matchAll(/<button type="button" class="ab ib"[^>]*>/g)].every((m) => /aria-label="[^"]+"/.test(m[0]) && /title="[^"]+"/.test(m[0])));
  check(tag('no repository sort and no This workspace only chip'), !/Repository/.test(els.get('srm').innerHTML) && els.get('wsb') === undefined);
  S.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { structureScenario(W); }

// The live contacts case: the old saved chip state turned every chip off, 135 chats ran on main, one branch exists only on the remote and one folder is not a registered worktree.
function liveScenario(W) {
  const S = createHarness({ page, name: 'openwork-live@' + W, width: W, popIds: VIEW_POPS });
  const { els, deliver, advance, check, step, fire } = S;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  const click = (a, data) => fire(body, 'click', { target: target(a, '', { dataset: Object.assign({ a }, data || {}) }) });
  const T = 1791000000, N = 135;
  const rowsL = Array.from({ length: N }, (_, i) => row(i + 1, { title: 'Main session ' + (i + 1), fk: 'f1', last: NOW - i * H })).concat([row(500, { title: 'Names the worktree', fk: 'f9' })]);
  S.start();
  step('init (the host ignores the chip state an older build saved)', () => deliver({ type: 'init', v: 3, prsOn: false, days: 14, hidden: [], ws: 1, done: {}, view: {} }));
  step('dots', () => deliver({ type: 'dots', map: Object.fromEntries(rowsL.map((r, i) => [r.id, { s: 'idle' }])) }));
  step('scan', () => {
    deliver({ type: 'chats', scan: 1, rows: rowsL, indexing: false, scanning: true });
    deliver({ type: 'folder', scan: 1, key: 'f1', state: 'ok', facts: { name: 'contacts', branch: 'main', detached: false, upstream: 'origin/main', ahead: 32, behind: 7, gone: false, staged: 0, modified: 59, untracked: 0, fileTotal: 59, files: [], rk: 'r1', ws: true } });
    deliver({ type: 'repo', scan: 1, key: 'r1', state: 'ok', name: 'contacts', def: 'origin/main', defLocal: 'main', merged: [], ws: true, gh: false,
      branches: [{ n: 'main', ts: T, au: 'A', up: true, gone: false, a: 0, b: 0 }, { n: 'worktree-agent-ac629da4a945a5227', ts: T - 5, au: 'A', up: false, gone: false, a: 1, b: 0 }, { n: 'feat/saropa-connection-cloud-icon-search', ts: T - 9, au: 'A', up: true, gone: false, a: 2, b: 0 }],
      remotes: [{ n: 'docs/grid-menu-to-tab-plan', ts: T - 50, au: 'Ada' }],
      stray: [{ k: 's1', name: 'contacts-wt-langv2', path: '/Users/x/Documents/contacts-wt-langv2', git: false }],
      worktrees: [wtm('w1', 'contacts', 'main', { main: true, fks: ['f1'] }), wtm('w2', 'contacts-wt-connection-icon', 'feat/saropa-connection-cloud-icon-search')] });
    deliver({ type: 'rel', scan: 1, rk: 'r1', ok: true, w: { w2: [{ id: id(500), why: 'name-in-text', conf: 'probable', note: 'the session mentions "contacts-wt-connection-icon"' }], s1: [] }, b: { 'feat/saropa-connection-cloud-icon-search': [{ id: id(500), why: 'name-in-text', conf: 'probable' }], 'docs/grid-menu-to-tab-plan': [] } });
    deliver({ type: 'end', scan: 1, open: [], gitMissing: false }); advance(300);
  });
  const h = () => body.innerHTML;
  const trs = (attr) => (h().match(new RegExp('class="wr"[^>]*data-' + attr + '=', 'g')) || []).length;
  const wrBlock = (k) => { const i = h().search(new RegExp('<div class="wr"[^>]*data-w="' + k + '"')); if (i < 0) { return ''; } const js = ['<div class="wr"', '</section>'].map((m) => h().indexOf(m, i + 10)).filter((v) => v >= 0); return h().slice(i, Math.min(...js)); };
  step('open every group', () => { openAll(S); advance(300); });
  check(tag('with the saved state of an older build ignored (nothing turned off) no row is hidden: 5 rows, 2 with a worktree, and no "N of M" note'), trs('b') === 4 && trs('w') === 2 && trs('s') === 1 && !/class="sub psh"/.test(h()) && !/0 of 2 worktrees/.test(h()));
  check(tag('the main checkout shows a small default badge, a PR column nobody uses is left out, and the stray folder is a Cleanup row that asks for nothing without a creator session'), !/dflt|>default</.test(wrBlock('w1')) && /class="wtab"/.test(h()) && /data-s="s1"[^]*?Leftover folder/.test(h()) && !/class="ab pb"/.test(h().slice(h().search(/data-s="s1"/), h().search(/data-s="s1"/) + 900).replace(/<div class="hxr"[^]*$/, '')));
  check(tag('the numbers next to the groups equal the rows listed, strays included in Cleanup'), groupsAgree(h()) && pillOf(h(), 'Safe to remove') >= 1 && /to clean up/.test(hlOf(h())));
  step('an old saved list of groups turned off is ignored', () => { deliver({ type: 'init', v: 4, prsOn: false, days: 14, hidden: ['needs', 'finish', 'waiting', 'tidy', 'idle'], ws: 1, done: {}, view: {} }); advance(300); openAll(S); advance(300); });
  check(tag('every row is still listed and there is no N of M note or Show all button'), trs('b') === 4 && trs('s') === 1 && !/rows shown|data-a="showall"/.test(h()));
  step('open the main sessions', () => click('hx', { x: 'w:w1', on: '0' }));
  const mainBlock = () => wrBlock('w1');
  check(tag('main shows its 5 newest sessions with a Show 20 more button, not 135 hidden'), (mainBlock().match(/data-id="/g) || []).length === 5 && /data-a="hxm"[^>]*>Show 20 more</.test(mainBlock()) && !/135 hidden/.test(mainBlock()) && /Main session 1</.test(mainBlock()));
  check(tag('the main checkout is Dirty with its count in words, not pushed and behind in one reason'), />Commit 59 files</.test(mainBlock()) && /59 files not committed, 32 commits not pushed, 7 behind origin/.test(mainBlock()));
  step('Show more', () => click('hxm', { x: 'w:w1' }));
  check(tag('Show more lists 20 more sessions'), (mainBlock().match(/data-id="/g) || []).length === 25);
  step('open the connection icon sessions', () => click('hx', { x: 'w:w2', on: '0' }));
  check(tag('the session that only names the worktree sits in the row of the worktree and its branch, labelled probable: name'), /probable: name</.test(wrBlock('w2')));
  step('open the remote-only popover', () => click('mnu', { x: 'b:b:docs_grid-menu-to-tab-plan' }));
  const rb = trSlice(body, 'b', 'docs/grid-menu-to-tab-plan');
  check(tag('a remote-only branch that is not merged is a row, Remote only, with an evidence line (no blank cell)'), /Remote only/.test(rb) && /Only on GitHub/.test(rb) && /no matching session found/.test(rb));
  step('open the stray popover', () => click('mnu', { x: 'b:s:s1' }));
  const st = trSlice(body, 's', 's1');
  check(tag('an unregistered worktree folder is a row in Cleanup, Leftover folder, Not a git worktree, with its path, a hint and an evidence line'), /Leftover folder/.test(st) && /g="tidy"/.test(st) && /contacts-wt-langv2/.test(st) && /plain folder/.test(st) && /Users\/x\/Documents\/contacts-wt-langv2/.test(st) && /no matching session found/.test(st));
  check(tag('the agent branch with no worktree that was never pushed is Unpushed: only on this computer'), />Push 1 commit</.test(trSlice(body, 'b', 'worktree-agent-ac629da4a945a5227')) && /1 commit only on this computer/.test(trSlice(body, 'b', 'worktree-agent-ac629da4a945a5227')));
  S.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { liveScenario(W); }


// Empty states: All clear, no repositories, git missing, and every way a scan can end with parts never read.
const CLEAR_OK = ['clear', 'clearpr'], CLEAR_NO = ['clearmore', 'clearrepo', 'clearnofolder', 'clearprdown'];
function emptyScenario(W, mode) {
  const E = createHarness({ page, name: 'openwork-empty-' + mode + '@' + W, width: W, popIds: VIEW_POPS });
  const { els, deliver, advance, check, step } = E;
  const body = els.get('body'), tag = (s) => s + ' (' + mode + ') at ' + W;
  const git = mode !== 'none';
  E.start();
  step('init', () => deliver({ type: 'init', v: 3, prsOn: /^clearpr/.test(mode), days: 14, hidden: [], ws: 1, done: {}, view: {} }));
  const rs = [row(1, { fk: 'f1', last: NOW - H })].concat(mode === 'clearnofolder' ? [row(2, { fk: 'f2', last: NOW - H })] : []);
  step('sessions', () => { deliver({ type: 'chats', scan: 1, rows: rs, indexing: false, scanning: true }); advance(300); });
  step('folder', () => deliver(git ? { type: 'folder', scan: 1, key: 'f1', state: 'ok', facts: vfacts() } : { type: 'folder', scan: 1, key: 'f1', state: 'none', reason: 'Not a git folder' }));
  if (git) { step('repo', () => deliver(Object.assign(vrepo(1, 'r1', 'alpha-repo', ['f1']), mode === 'clearrepo' ? { state: 'timeout' } : {}))); }
  if (mode === 'clearmore') { step('notes', () => deliver({ type: 'notes', scan: 1, gitMissing: false, more: 3, prsOn: false })); }
  if (mode === 'clearpr') { step('prs', () => deliver({ type: 'prs', scan: 1, repo: 'r1', state: 'ok', by: {} })); }
  if (mode === 'clearprdown') { step('prs', () => deliver({ type: 'prs', scan: 1, repo: 'r1', state: 'unavailable', reason: 'timed out' })); }
  check(tag('nothing is claimed before the scan ends'), !/Nothing is open/.test(body.innerHTML) && !/No git repositories/.test(body.innerHTML));
  step('end', () => { deliver({ type: 'end', scan: 1, open: [], gitMissing: mode === 'gitmissing' }); advance(300); });
  if (CLEAR_OK.includes(mode)) { check(tag('every session clean: the headline says nothing is open'), /class="hl"[^>]*>[^<]* — (No branches besides the default one\. )?Nothing is open/.test(body.innerHTML) && /role="status"/.test(body.innerHTML) && /Scan finished: 0 items open\./.test(els.get('live').textContent)); }
  if (CLEAR_NO.includes(mode)) { check(tag('parts never read: no "Nothing is open" and no "0 items open" claim'), !/Nothing is open/.test(body.innerHTML) && !/Scan finished: 0 items open/.test(els.get('live').textContent) && /some parts were not read/.test(els.get('live').textContent)); }
  if (mode === 'none') { check(tag('a workspace folder that is not a git repository gives the one plain message and never All clear'), /Open a git repository folder/.test(body.innerHTML) && !/Nothing is open/.test(body.innerHTML) && !/<table/.test(body.innerHTML)); }
  if (mode === 'gitmissing') { check(tag('git missing never claims nothing is open'), !/Nothing is open/.test(body.innerHTML)); }
  E.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 1400]) { for (const m of ['clear', 'none', 'gitmissing'].concat(CLEAR_OK.slice(1), CLEAR_NO)) { emptyScenario(W, m); } }

// Resize on one page: layout class follows.
{
  const R = createHarness({ page, name: 'openwork-resize', width: 400, popIds: VIEW_POPS });
  R.start();
  R.step('resize', () => { R.resize(1400); });
  R.check('resizing to 1400 turns on the table layout', R.els.get('wrap').classList.contains('wide'));
  R.step('resize back', () => { R.resize(400); });
  R.check('resizing to 400 returns to cards', !R.els.get('wrap').classList.contains('wide'));
  R.errors.forEach((e) => failures.push(e));
}

// Static scans of the page: fonts, colors, names.
const css = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join('\n');
const decls = [...css.matchAll(/\{([^{}]*)\}/g)].map((x) => x[1]).join(';');
const fams = [...decls.matchAll(/font-family:([^;}]*)/g)].map((x) => x[1].trim());
const FAM = /^(var\(--vscode-(editor-)?font-family\)|inherit)$/;
if (!fams.length || !fams.every((f) => FAM.test(f))) { bad('every font-family is a VS Code variable or inherit (' + fams.filter((f) => !FAM.test(f)).join('|') + ')'); }
const SIZE = /^(var\(--vscode-(editor-)?font-size\)|calc\(var\(--vscode-font-size\) [-+] \d+px\)|inherit)$/;
const sizes = [...decls.matchAll(/font-size:([^;}]*)/g)].map((x) => x[1].trim());
if (!sizes.every((f) => SIZE.test(f))) { bad('every font-size is a VS Code variable or inherit (' + sizes.filter((f) => !SIZE.test(f)).join('|') + ')'); }
if (![...decls.matchAll(/(?:^|[;\s])font:([^;}]*)/g)].every((x) => x[1].trim() === 'inherit')) { bad('no font shorthand other than inherit'); }
const hex = [...decls.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((x) => x[0]);
if (hex.length) { bad('no hex colors in the page CSS (' + hex.join(',') + ')'); }
const rgba = [...decls.matchAll(/(rgba?\([^)]*\))/g)].filter((x) => !/var\([^)]*,\s*rgba?\([^)]*\)\)?$/.test(decls.slice(Math.max(0, x.index - 80), x.index + x[0].length + 1)));
if (rgba.length) { bad('rgba() only as a var() fallback (' + rgba.map((x) => x[1]).join(',') + ')'); }
if (/color-mix|named-color/.test(decls)) { bad('no color-mix in the page CSS'); }
const named = [...decls.matchAll(/(?:^|;)\s*(?:color|background|background-color|border(?:-[a-z]+)?|outline)\s*:\s*(?:\d+px\s+\w+\s+)?(white|black|red|green|blue|gray|grey|yellow|orange)\b/g)];
if (named.length) { bad('no named colors in the page CSS'); }
if (/claude/i.test(page.replace(/Claude Project Status/g, ''))) { bad('no agent name anywhere in the page: ' + (/.{0,20}claude.{0,20}/i.exec(page) || [''])[0]); }
if (!/--vscode-saropaChatExplorer-dotRunning/.test(css) || !/--vscode-testing-iconPassed/.test(css)) { bad('dot colors use the contributed variables'); }
if (!/background:var\(--vscode-editor-background\)/.test(css)) { bad('page background is the editor background'); }
if (!/Content-Security-Policy[^>]*default-src 'none'/.test(page)) { bad('page keeps the strict content security policy'); }

// Pure model on the real compiled functions.
{
  const dots = { a: { s: 'waiting' }, b: { s: 'running' }, c: { s: 'unread' }, d: { s: 'idle' } };
  const rs = [{ id: 'a', last: 1, project: 'p' }, { id: 'b', last: 2, project: 'q' }, { id: 'c', last: 3, project: 'p' }, { id: 'd', last: 4, project: 'q' }, { id: 'e', last: 5, project: '' }];
  const by = model.bandRows(rs, dots);
  if (Object.keys(by).join() !== 'needs,finish,waiting,tidy,idle' || by.needs.map((r) => r.id).join() !== 'c,a' || by.waiting.map((r) => r.id).join() !== 'b' || by.idle.map((r) => r.id).join() !== 'e,d') { bad('bands: needs, waiting and idle hold the rows, newest first inside a band'); }
  if (model.bandRows(rs, dots, (r, dot) => (r.id === 'a' ? 'tidy' : 'idle')).tidy.map((r) => r.id).join() !== 'a') { bad('bands: a held band function places the row'); }
  if (model.bandRows([], dots).needs.length !== 0) { bad('no rows, empty bands'); }
  if (model.groupRows !== undefined || /function groupRows/.test(model.WORK_MODEL_SRC)) { bad('the groups of the old page are gone from the model'); }
  if (!/BAND_ORDER/.test(model.WORK_MODEL_SRC) || !/function bandOf/.test(model.WORK_MODEL_SRC)) { bad('the page embeds the model source'); }
}

// Slice 4 pure model: filter words, state filters, sort order, summary text.
{
  const fm = model.filterMatch;
  if (!fm('Fix Login src/a.ts', 'login') || !fm('Fix Login src/a.ts', 'LOGIN fix') || fm('Fix Login', 'login zzz') || !fm('anything', '') || !fm('anything', '   ') || !fm('pr #81', '#81') || fm('pr #81', '#82')) { bad('filterMatch: every word must appear, any case; empty matches all'); }
  const g = (o) => Object.assign({ ok: true, files: 0, ahead: 0, pr: null }, o || {});
  const fp = model.flagPass;
  if (!fp(undefined, {}) || !fp(g(), { pr: false, fail: false, dirty: false, push: false }) || fp(undefined, { dirty: true }) || fp({ ok: false }, { push: true })) { bad('flagPass: no filter on passes; unknown git fails a filter'); }
  if (!fp(g({ files: 1 }), { dirty: true }) || fp(g(), { dirty: true }) || !fp(g({ ahead: 1 }), { push: true }) || fp(g(), { push: true })) { bad('flagPass: dirty and push at the boundary (0 fails, 1 passes)'); }
  if (!fp(g({ pr: { n: 1, checks: 'failing' } }), { pr: true, fail: true }) || fp(g({ pr: { n: 1, checks: 'passing' } }), { fail: true }) || fp(g(), { pr: true }) || fp(g({ pr: { n: 1, checks: 'failing' } }), { pr: true, dirty: true })) { bad('flagPass: pull request, failing checks, and all filters must hold'); }
  const rs = [{ id: 'a', title: 'beta', project: 'z', last: 1 }, { id: 'b', title: 'Alpha', project: 'z', last: 3 }, { id: 'c', title: 'gamma', project: 'a', last: 2 }];
  const ids = (m) => rs.slice().sort(model.rowCmp(m)).map((x) => x.id).join('');
  if (ids() !== 'bca' || ids('recent') !== 'bca' || ids('name') !== 'bac' || ids('repo') !== 'bca') { bad('rowCmp: recent newest first, name alphabetical any case, no repository sort (' + ids() + ',' + ids('name') + ',' + ids('repo') + ')'); }
  const gr = model.bandRows(rs.map((x) => Object.assign({}, x)), {}, undefined, 'name');
  if (gr.idle.map((x) => x.id).join('') !== 'bac') { bad('bandRows: the sort applies inside a band'); }
  const items = [{ band: 'finish', title: 'Fix [x] *bold* <b> `c` | #1\nline', project: 'p_q', branch: 'b', state: 'waiting for you', files: 1, ahead: 2, pr: { n: 7, review: 'approved', checks: 'failing' }, wt: false },
    { band: 'tidy', title: 'See https://example.com/a?token=abc', project: '', branch: '', files: 0, ahead: 0, pr: null, wt: true, ready: true },
    { band: 'finish', title: 'key ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD here', project: 'p', branch: '', files: 0, ahead: 0, pr: null }, { band: 'idle', title: 'idle one' }];
  const sm = model.summaryOf(items, 14);
  if (sm.n !== 3 || !/^# Open work: 3 items\n/.test(sm.text) || /idle one/.test(sm.text)) { bad('summaryOf: counts open items and leaves idle out'); }
  if (/https?:|example\.com|token=|ghp_|abcdefghijklmnopqrstuvwxyz0123456789/.test(sm.text) || !/\\\[link\\\]/.test(sm.text) || !/\\\[redacted\\\]/.test(sm.text)) { bad('summaryOf: links and key-like strings are replaced, never copied'); }
  if (!/Fix \\\[x\\\] \\\*bold\\\* \\<b\\> \\`c\\` \\\| \\#1 line/.test(sm.text) || /\n[^\n]*\n[^\n]*line\*\*/.test(sm.text.split('## To finish')[1] || '')) { bad('summaryOf: markdown characters escaped and line breaks flattened: ' + sm.text.split('\n').slice(6, 9).join(' | ')); }
  if (!/worktree, ready to remove/.test(sm.text) || !/1 uncommitted file; 2 unpushed commits; PR #7 approved, checks failing/.test(sm.text) || !/## Ready to tidy \(1\)/.test(sm.text)) { bad('summaryOf: worktree, singular and plural counts, pull request text'); }
  if (model.summaryOf([], 14).n !== 0 || !/Nothing is open\./.test(model.summaryOf([], 14).text) || model.summaryOf([{ band: 'idle', title: 'x' }], 14).n !== 0) { bad('summaryOf: nothing open'); }
  if (!/function summaryOf/.test(model.WORK_MODEL_SRC) || !/function filterMatch/.test(model.WORK_MODEL_SRC) || !/function flagPass/.test(model.WORK_MODEL_SRC) || !/function rowCmp/.test(model.WORK_MODEL_SRC)) { bad('the page embeds the slice 4 model source'); }
}

// Worker rows on a fake index: scope, boundary, archived, live, pinned.
{
  const wc = require(path.join(OUT, 'workChats.js'));
  const mk = (idv, last, o) => Object.assign({ id: idv, dir: '-x-proj', title: 't' + idv, last, first: last, count: 1, files: [], size: 1, mtime: 1, rec: '', len: 0, bloom: new Uint8Array(0) }, o || {});
  const DAY = 86400000, now = 1e12, days = 14, since = now - days * DAY;
  const chats = [mk('in', since), mk('out', since - 1), mk('live', since - 5 * DAY), mk('arch', now), mk('pin', now - 1)];
  const r = wc.openWorkRows({ tops: () => chats }, { days, now, live: new Set(['live']), archived: new Set(['arch']), pins: new Set(['pin']) });
  const idsOut = r.rows.map((x) => x.id).join();
  if (idsOut !== 'pin,in,live' && idsOut !== 'pin,live,in') { bad('rows: boundary session in, one ms older out, live in, archived out, newest first (' + idsOut + ')'); }
  if (!r.rows[0].pinned || r.rows[1].pinned || r.total !== 3 || r.rows[0].project !== 'proj') { bad('rows carry pinned, project and total'); }
}

// Mark done keeps working with long branch names, and the 500 cap drops stale marks first.
{
  const g = (b) => ({ ok: true, branch: b, files: 1, ahead: 1 });
  const long = 'feature/' + 'x'.repeat(300), fp = model.fingerprint('idle', 5, g(long));
  if (fp.length > 200) { bad('model: a fingerprint with a 300 character branch is ' + fp.length + ' characters (the host stores at most 200)'); }
  if (model.doneHidden(fp, 'idle', 5, g(long)) !== true) { bad('model: a long branch keeps its done row hidden'); }
  if (model.doneHidden(fp, 'idle', 5, g(long + 'y')) !== false) { bad('model: a different long branch brings the done row back'); }
  if (model.doneHidden(model.fingerprint('idle', 5, g('a#b|c')), 'idle', 5, g('a#b|c')) !== true || model.fingerprint('idle', 5, g('a#b|c')).split('#').length !== 2) { bad('model: a branch holding # and | is hashed so the parts stay intact'); }
  if (model.fingerprint('idle', 5, g('feat')) !== '5|idle#feat|1|1') { bad('model: a short branch keeps the readable fingerprint'); }
  const list = [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4'], ['e', '5']];
  const k1 = model.capDone(list, new Set(['a', 'c', 'e']), 4).map((x) => x[0]).join();
  if (k1 !== 'a,c,d,e') { bad('capDone: the oldest stale mark goes first, listed sessions stay (' + k1 + ')'); }
  const k2 = model.capDone(list, new Set(['a', 'b', 'c', 'd', 'e']), 3).map((x) => x[0]).join();
  if (k2 !== 'c,d,e') { bad('capDone: with every session listed the oldest marks go (' + k2 + ')'); }
  if (model.capDone(list, new Set(), 3).map((x) => x[0]).join() !== 'c,d,e' || model.capDone(list, new Set(['a']), 9).length !== 5) { bad('capDone: unknown list judges nothing stale; under the cap nothing goes'); }
}

// The real worker thread: a soft chat-list request answers at once, with the chats and the indexing flag.
function workerCheck() {
  const { Worker } = require('worker_threads');
  const base = fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-ow-'));
  const root = path.join(base, 'projects', '-tmp-proj');
  fs.mkdirSync(root, { recursive: true });
  const line = (t, c) => JSON.stringify({ type: t, timestamp: new Date().toISOString(), cwd: '/tmp/proj', message: { role: t, content: c } });
  const N = 40;
  for (let i = 0; i < N; i++) { fs.writeFileSync(path.join(root, id(900 + i) + '.jsonl'), line('user', 'hello number ' + i) + '\n' + line('assistant', [{ type: 'text', text: 'reply ' + i }]) + '\n'); }
  return new Promise((resolve) => {
    const w = new Worker(path.join(OUT, 'worker.js'));
    const t0 = Date.now();
    let done = false;
    const end = (why) => { if (done) { return; } done = true; clearTimeout(timer); w.terminate().then(() => { try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* scratch only */ } resolve(why); }); };
    const timer = setTimeout(() => { bad('worker openWork did not answer within 3 s (the soft request must not wait for the index build)'); end('timeout'); }, 3000);
    let relSent = false;
    const askRel = () => { if (relSent) { return; } relSent = true; w.postMessage({ t: 'openWorkRel', req: 2, ids: Array.from({ length: N }, (_, i) => id(900 + i)), roots: ['/tmp/proj'], wts: [{ k: 'w1', name: 'proj', path: '/tmp/proj', real: '/tmp/proj', branch: 'main', main: true, detached: false }], brs: [{ n: 'main', cr: 0, ts: 0 }], def: 'main' }); };
    w.on('message', (m) => {
      if (m.t === 'indexed') { askRel(); return; }
      if (m.t === 'reply' && m.req === 2) { // the chat matcher request: soft like the chat list, never waits for the index
        const v = m.value;
        if (!v || typeof v.ok !== 'boolean') { bad('worker openWorkRel reply shape: ' + JSON.stringify(v).slice(0, 120)); }
        else if (v.ok && !(v.w && v.b && Array.isArray(v.w.w1) && v.w.w1.length > 0 && v.w.w1.every((h) => h.why === 'cwd' && h.conf === 'certain' && /^[0-9a-f-]{36}$/.test(h.id)))) { bad('worker openWorkRel: sessions that ran in the main folder are cwd matches: ' + JSON.stringify(v).slice(0, 160)); }
        else if (!v.ok) { bad('worker openWorkRel: after the index build the matcher must answer ok: ' + JSON.stringify(v).slice(0, 120)); }
        end('answered');
        return;
      }
      if (m.t !== 'reply' || m.req !== 1) { return; }
      const v = m.value;
      if (!v || typeof v.indexing !== 'boolean' || !Array.isArray(v.rows) || typeof v.total !== 'number') { bad('worker openWork reply shape: ' + JSON.stringify(v).slice(0, 120)); }
      else if (v.rows.length === 0 && v.indexing !== true) { bad('worker openWork: with no rows yet it must say indexing'); }
      else if (v.rows.length > N) { bad('worker openWork returned more rows than exist'); }
      else if (v.rows.some((r) => !/^[0-9a-f-]{36}$/.test(r.id) || typeof r.title !== 'string')) { bad('worker rows carry id and title'); }
      if (Date.now() - t0 > 2500) { bad('worker openWork answered too late'); }
      if (v && v.indexing === true && !relSent) { return; } // wait for the index build, then ask the matcher
      askRel();
    });
    w.on('error', (e) => { bad('worker error', e); end('error'); });
    w.postMessage({ t: 'init', dir: path.join(base, 'store'), root: path.join(base, 'projects') });
    w.postMessage({ t: 'openWork', req: 1, days: 14, pins: [], archived: [], live: [] });
  });
}

// A slow disk read: the soft request answers 'indexing' at once and the host is told when the chats are readable.
function slowLoadCheck() {
  const { Worker } = require('worker_threads');
  const base = fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-ow-slow-'));
  fs.mkdirSync(path.join(base, 'projects'), { recursive: true });
  return new Promise((resolve) => {
    // the slow disk read is injected here: a wrapper thread delays the index folder read, then loads the real worker file
    const wrap = "const fs=require('fs');const o=fs.promises.readdir;fs.promises.readdir=async(...a)=>{await new Promise((r)=>setTimeout(r,2500));return o.apply(fs.promises,a);};require(" + JSON.stringify(path.join(OUT, 'worker.js')) + ");";
    const w = new Worker(wrap, { eval: true });
    const t0 = Date.now();
    let answered = 0, changed = 0, done = false;
    const end = () => { if (done) { return; } done = true; clearTimeout(timer); w.terminate().then(() => { try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* scratch only */ } resolve(); }); };
    const timer = setTimeout(() => { if (!answered) { bad('slow load: the soft openWork request was not answered while the index was loading'); } else if (!changed) { bad('slow load: the host was not told when the sessions became readable'); } end(); }, 5500);
    w.on('message', (m) => {
      if (m.t === 'reply' && m.req === 7) { answered = Date.now() - t0; const v = m.value; if (answered > 1200) { bad('slow load: answered after ' + answered + ' ms (it must not wait for the disk read)'); } if (!v || v.indexing !== true || !Array.isArray(v.rows) || v.rows.length !== 0) { bad('slow load: the early answer must be indexing with no rows'); } }
      if (m.t === 'changed' && answered) { changed++; end(); }
    });
    w.on('error', (e) => { bad('slow load worker error', e); end(); });
    w.postMessage({ t: 'init', dir: path.join(base, 'store'), root: path.join(base, 'projects') });
    w.postMessage({ t: 'openWork', req: 7, days: 14, pins: [], archived: [], live: [] });
  });
}

workerCheck().then(slowLoadCheck).then(() => {
  const uniq = [...new Set(failures)];
  if (uniq.length) {
    console.error('check_openwork FAILED (' + uniq.length + ')');
    uniq.slice(0, 20).forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('check_openwork OK: page at 400, 760 and 1400 px, model, worker rows and the worker thread');
  process.exit(0);
});
