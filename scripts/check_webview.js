// Fails the build when the panel script throws (ReferenceError, TypeError) on realistic messages.
// Builds the real page with out/webview.js html(), runs its script in node vm with a stub DOM, and feeds
// rows with live state, an expand reply with related chats, git payloads, search results and archived rows.
// Any exception, window.onerror or console.error from the script (including a section's "could not show" fallback) is a failure.
const path = require('path');
const { createHarness } = require('./webview_harness');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const page = require(path.join(OUT, 'webview.js')).html();
const H = createHarness({ page, name: 'panel', width: 400 });
const { errors, fail, els, mkEl, document, window, posted, run, fire, deliver } = H;
if (H.syntaxFailed) { H.report(); }

// 3. Run the script, then drive it.
H.start();
// patch() diffs real DOM nodes, which the stub cannot hold: keep the real call (it must not throw) and record the html it was given.
run("{const real=patch;patch=function(el,h){el.innerHTML=h;return real(el,h);};}", 'wrap patch');
const asyncChecks = [];
if (!errors.length) drive();
Promise.all(asyncChecks).then(report);

function drive() {
  const NOW = Date.now(), H = 3600e3;
  const id = (n) => '00000000-0000-4000-8000-00000000000' + n;
  const row = (n, o) => Object.assign({
    file: '/x/' + id(n) + '.jsonl', id: id(n), title: 'Chat ' + n, hits: 0, last: NOW - n * H, snippet: '', ranges: [], score: 0, project: 'proj',
    msgs: 120, first: NOW - (n + 30) * H, edited: 4, size: 123456, cost: 12.5, add: 280, rem: 64, models: ['sonnet', 'opus'], commits: 2,
    ctx: { pct: 61, tokens: 619392, window: 1000000, model: 'sonnet-5-5', comp: 9, pend: false, approx: false },
  }, o || {});
  const rows = [row(1), row(2), row(3, { cost: undefined, add: undefined, rem: undefined, models: undefined, ctx: undefined })];
  const hit = (n) => row(n, { hits: 3, mc: 2, snippet: 'the match here', ranges: [[4, 9]], score: 9, snipAt: NOW - H, snipSub: 'Explore' });
  const git = {
    state: 'ok', ahead: 4, behind: 1, staged: 0, modified: 2, untracked: 1, fileTotal: 3, commits: [{ sha: 'abc1234', subject: 'fix the thing' }],
    files: [{ s: 'M', p: 'a/b.dart' }, { s: 'A', p: 'c.dart' }, { s: '?', p: 'd.md' }],
    worktrees: [{ path: '/r', branch: 'main', detached: false, main: true, missing: false, here: true }, { path: '/r-wt', branch: 'fix/x', detached: false, main: false, missing: false, here: false }],
    prs: [{ number: 7, title: 'A PR', draft: false, review: 'approved', url: 'u' }], top: '/r', branch: 'main', detached: false, upstream: 'origin/main', gone: false, prPending: false,
  };
  const expandReply = (n, o) => Object.assign({
    type: 'expanded', id: id(n), offset: 0, lite: false, items: [], total: 0, files: [], commands: [],
    git: { prs: [{ number: 7, repository: 'o/r' }], commits: [{ sha: '3028413a61aa', branch: 'main' }], moreCommits: 2 },
  }, o || {});
  const item = { i: 0, role: 'user', t: NOW - H, text: 'a message', ranges: [[0, 1]], sub: '', n: 1 };
  const step = (what, fn) => { try { fn(); } catch (e) { fail(what, e); } };
  const check = (what, cond) => { if (!cond) fail(what, 'expected output missing'); };
  const list = els.get('list');

  step('restore', () => deliver({ type: 'restore', max: 500, state: { query: '', results: [], searched: '', subs: true, when: 'any', sort: 'time' }, history: [], archOpen: false, advOpen: false }));
  step('meta', () => deliver({ type: 'meta', pins: [id(2)], tags: { [id(1)]: ['alpha'] }, all: ['alpha'], pinned: [rows[1]], arch: [id(3)] }));
  step('dots', () => deliver({ type: 'dots', map: { [id(1)]: { s: 'unread' }, [id(2)]: { s: 'live' } } }));
  step('sessions', () => deliver({ type: 'sessions', sn: 0, rows, total: 3, arch: [row(4), row(5)], archTotal: 2, max: 500 }));
  step('archived open', () => { run('archOpen=true;rerender();', 'archived open'); });
  step('open card', () => { run('openCard(' + JSON.stringify(id(1)) + ');rerender();', 'open card'); });
  check('card shows Loading before reply', /Loading\.\.\./.test(list.innerHTML));
  // Item 1: the five card sections are collapsed and lazy.
  const secOf = (k) => { const m = new RegExp('<section class="x' + k + '">[\\s\\S]*?</section>').exec(list.innerHTML); return m ? m[0] : ''; };
  const asked = (type, part, n) => posted.filter((p) => p.type === type && p.id === id(n) && (!part || p.part === part)).length;
  const parts = ['git', 'unc', 'unp', 'wt', 'rel'];
  check('five lazy sections present and collapsed', parts.every((k) => new RegExp('data-sec="' + k + ':' + id(1) + '" role="button" tabindex="0" aria-expanded="false"').test(list.innerHTML)));
  check('no section request before it is opened', asked('gitLive', '', 1) === 0 && asked('related', '', 1) === 0);
  check('card open sends the expand request', posted.some((p) => p.type === 'expand' && p.id === id(1)));
  check('no pill before loading', parts.every((k) => !/class="pill"/.test(secOf(k))));
  // Item: counts load by themselves when a card expands, bodies stay lazy.
  const countPosts = () => posted.filter((p) => p.type === 'counts');
  const rq1 = (countPosts().find((p) => p.id === id(1)) || {}).rq;
  check('counts requested once on expand, only for the expanded card', countPosts().length === 1 && countPosts()[0].id === id(1) && typeof rq1 === 'number');
  check('every section shows a reserved ... placeholder pill', parts.every((k) => /class="pill w"[^>]*>\u2026</.test(secOf(k))));
  check('placeholder is not announced as a count', parts.every((k) => !/aria-label="[^"]*, \u2026/.test(secOf(k))));
  const fake = {};
  const hdr = (k) => (fake[k] = { dataset: { sec: k + ':' + id(1) }, ins: [], gone: 0, labels: [], querySelector(s) { return s === '.pill' ? { remove() { fake[k].gone++; } } : { textContent: 'Sec' }; }, insertAdjacentHTML(w, h) { this.ins.push(h); }, setAttribute(n, v) { this.labels.push(v); } });
  document.querySelectorAll = (sel) => (/data-sec/.test(sel) ? parts.map(hdr) : []);
  run('globalThis.RRN=0;{const r=rerender;rerender=function(){RRN++;return r();};}', 'count rerenders');
  const cnt = (o) => deliver(Object.assign({ type: 'counts', id: id(1), rq: rq1 }, o));
  step('count rel 3', () => cnt({ part: 'rel', n: 3 }));
  check('Related pill filled in place with 3', fake.rel.ins.length === 1 && fake.rel.gone === 1 && /class="pill"[^>]*>3</.test(fake.rel.ins[0]) && /Sec, 3/.test(fake.rel.labels[0]));
  step('count unc 0', () => cnt({ part: 'unc', n: 0 }));
  check('zero count gets the dimmed class', /class="pill z"[^>]*>0</.test(fake.unc.ins[0]));
  step('count unp null', () => cnt({ part: 'unp', n: null }));
  check('failed count shows no pill', fake.unp.ins.length === 1 && fake.unp.ins[0] === '');
  step('count wt 2', () => cnt({ part: 'wt', n: 2 }));
  step('stale counts ignored', () => { deliver({ type: 'counts', id: id(1), rq: rq1 - 1, part: 'git', n: 9 }); deliver({ type: 'counts', id: id(2), rq: rq1, part: 'git', n: 9 }); });
  check('stale or not-expanded counts change nothing', !fake.git || fake.git.ins.length === 0);
  check('pills fill without redrawing the card', run('RRN', 'rr') === 0);
  step('count git 1', () => cnt({ part: 'git', n: 1 }));
  document.querySelectorAll = () => [];
  check('Git pill filled', /class="pill"[^>]*>1</.test(fake.git.ins[0]));
  step('rerender keeps counts', () => run('rerender();', 'rerender'));
  check('counts survive a redraw (0 dimmed, 3 shown, failed has none)', /class="pill z"[^>]*>0</.test(secOf('unc')) && /class="pill"[^>]*>3</.test(secOf('rel')) && !/class="pill/.test(secOf('unp')));
  step('expanded for lazy test', () => deliver(expandReply(1)));
  step('open Uncommitted', () => run("toggleSec('unc:' + " + JSON.stringify(id(1)) + ');', 'toggle unc'));
  check('Uncommitted request sent once on open', asked('gitLive', 'unc', 1) === 1 && asked('gitLive', 'git', 1) === 0);
  check('Uncommitted shows Loading, no pill', /Loading/.test(secOf('unc')) && !/class="pill"/.test(secOf('unc')));
  step('unc reply', () => deliver({ type: 'gitLive', id: id(1), part: 'unc', data: git }));
  check('Uncommitted pill and files after reply', /class="pill"[^>]*>3</.test(secOf('unc')) && /d\.md/.test(secOf('unc')));
  step('close and reopen Uncommitted', () => { run("toggleSec('unc:' + " + JSON.stringify(id(1)) + ');', 'close unc'); run("toggleSec('unc:' + " + JSON.stringify(id(1)) + ');', 'reopen unc'); });
  check('reopening does not ask again', asked('gitLive', 'unc', 1) === 1);
  step('open Git', () => run("toggleSec('git:' + " + JSON.stringify(id(1)) + ');', 'toggle git'));
  step('git partial', () => deliver({ type: 'gitLive', id: id(1), part: 'git', data: Object.assign({}, git, { prPending: true, prs: [] }) }));
  check('Git shows PR lookup in progress', /Looking up pull requests/.test(secOf('git')));
  step('git final', () => deliver({ type: 'gitLive', id: id(1), part: 'git', data: git }));
  check('Git pill and PR rendered', /class="pill"[^>]*>5</.test(secOf('git')) && /#7 A PR/.test(secOf('git')));
  step('open Unpushed and Worktrees', () => { run("toggleSec('unp:' + " + JSON.stringify(id(1)) + ');', 'unp'); run("toggleSec('wt:' + " + JSON.stringify(id(1)) + ');', 'wt'); });
  check('Unpushed and Worktrees requests', asked('gitLive', 'unp', 1) === 1 && asked('gitLive', 'wt', 1) === 1);
  step('unp wt replies', () => { deliver({ type: 'gitLive', id: id(1), part: 'unp', data: git }); deliver({ type: 'gitLive', id: id(1), part: 'wt', data: git }); });
  check('Unpushed lists commits', /abc1234/.test(secOf('unp')) && /class="pill"[^>]*>4</.test(secOf('unp')));
  check('Worktrees lists both', /r-wt/.test(secOf('wt')) && /class="pill"[^>]*>2</.test(secOf('wt')));
  check('Related not asked until opened', asked('related', '', 1) === 0);
  step('open Related', () => run("toggleSec('rel:' + " + JSON.stringify(id(1)) + ');', 'rel'));
  check('Related request sent on open', asked('related', '', 1) === 1);
  step('related reply', () => deliver({ type: 'related', id: id(1), related: [{ id: id(8), title: 'Related one', shared: 13, last: NOW - 5 * H, score: 33 }, { id: id(9), title: 'Related two', shared: 1, last: NOW - 50 * H, score: 3 }] }));
  check('Related chats rendered with pill', /Related one/.test(list.innerHTML) && /class="pill"[^>]*>2</.test(secOf('rel')));
  step('related failed', () => { run("lz['rel:' + " + JSON.stringify(id(1)) + "]={s:'loading'};", 'rel reset'); deliver({ type: 'relatedFailed', id: id(1), reason: 'Could not load related chats' }); });
  check('failed Related shows Retry', /data-a="lretry"/.test(secOf('rel')));
  step('unc timeout', () => deliver({ type: 'gitLive', id: id(1), part: 'unc', data: { state: 'timeout', reason: 'Git info timed out' } }));
  check('timed-out section shows Retry', /data-a="lretry"/.test(secOf('unc')));
  check('Lines cell rendered', /<dt>Lines<\/dt>/.test(list.innerHTML));
  step('expanded no git', () => deliver(expandReply(1, { git: null })));
  step('expanded with items', () => deliver(expandReply(1, { items: [item], total: 1, files: [{ path: '/a/b.ts', edited: true }, { path: '/a/c.ts', edited: false }], commands: ['ls -la'] })));
  step('expand failed', () => deliver({ type: 'expandFailed', id: id(1), lite: false, reason: 'Could not load details' }));
  check('failed card shows Retry', /data-a="xretry"/.test(list.innerHTML));
  step('git error', () => deliver({ type: 'gitLive', id: id(1), part: 'git', data: { state: 'error', reason: 'x' } }));
  step('second card opened', () => { run('openCard(' + JSON.stringify(id(3)) + ');rerender();', 'open card 2'); deliver(expandReply(3)); });
  check('second expanded card asks once; collapsed rows never ask', countPosts().length === 2 && countPosts()[1].id === id(3) && !countPosts().some((p) => p.id === id(2)));
  step('live dots', () => deliver({ type: 'dots', map: { [id(1)]: { s: 'live' }, [id(3)]: { s: 'unread' } } }));
  step('index progress', () => { deliver({ type: 'indexing', done: 1, total: 5, subs: 0, first: false }); deliver({ type: 'indexed' }); });
  step('history', () => deliver({ type: 'history', history: [{ query: 'a', cs: false, ww: false, any: false, re: false, all: false, subs: true, when: 'any', last: 0 }] }));
  // Search with a query: start, batch, done, then expand on a result, then error and short.
  step('set query', () => { els.get('q').value = 'match'; run('qSync();', 'qSync'); });
  step('search start', () => deliver({ type: 'start', sn: 0 }));
  step('search batch', () => deliver({ type: 'batch', sn: 0, results: [hit(1), hit(2)], done: 1, total: 4, totals: { chats: 2, matches: 6, max: 500 } }));
  step('search done', () => deliver({ type: 'done', sn: 0, results: [hit(1), hit(2), hit(3)], searched: 'match', totals: { chats: 3, matches: 9, max: 500 } }));
  step('expand under query', () => { run('openCard(' + JSON.stringify(id(2)) + ');rerender();', 'open card q'); deliver(expandReply(2, { items: [item, Object.assign({}, item, { i: 1 })], total: 2 })); });
  step('lite expand', () => deliver(expandReply(2, { lite: true, related: undefined, git: undefined, files: undefined, commands: undefined })));
  step('search done empty', () => deliver({ type: 'done', sn: 0, results: [], searched: 'zzz' }));
  step('search error', () => deliver({ type: 'error', message: 'Search timed out' }));
  step('short query', () => deliver({ type: 'short', message: 'Type at least 2 characters' }));
  step('results', () => deliver({ type: 'results', sn: 0, results: [hit(1)], searched: 'match' }));
  step('clear query', () => { els.get('q').value = ''; run('qSync();rerender();', 'clear'); deliver({ type: 'sessions', sn: 0, rows, total: 3, arch: [], archTotal: 0, max: 500 }); });
  // Item 7: in the All sessions list, open chats (with a dot) come before chats that are not open, with a divider between.
  const at = (x) => list.innerHTML.indexOf(x);
  const sessionsOnly = () => run("sessOn=true;lastQ='';hasResults=false;lastRs=[];lastMsg='';busy=false;", 'sessions only');
  step('open-first order', () => {
    sessionsOnly();
    deliver({ type: 'dots', map: { [id(7)]: { s: 'idle' } } });
    deliver({ type: 'sessions', sn: 0, rows: [row(5), row(6), row(7)], total: 3, arch: [], archTotal: 0, max: 500 });
  });
  const ordered = () => at('data-id="' + id(7) + '"') >= 0 && at('data-id="' + id(7) + '"') < at('class="osep"') && at('class="osep"') < at('data-id="' + id(5) + '"') && at('data-id="' + id(5) + '"') < at('data-id="' + id(6) + '"');
  check('open chat sorts above newer chats that are not open, with a divider (time sort)', ordered());
  step('title sort order', () => { run("sortSet('title');rerender();", 'sort title'); });
  check('open chats first under another sort too', at('data-id="' + id(7) + '"') < at('class="osep"') && at('class="osep"') < at('data-id="' + id(5) + '"'));
  step('no open chats', () => { run("sortSet('time');", 'sort time'); deliver({ type: 'dots', map: {} }); });
  check('no divider when no chat is open', at('class="osep"') < 0);
  step('all open', () => deliver({ type: 'dots', map: { [id(5)]: { s: 'idle' }, [id(6)]: { s: 'idle' }, [id(7)]: { s: 'idle' } } }));
  check('no divider when every chat is open', at('class="osep"') < 0);
  step('reset dots', () => deliver({ type: 'dots', map: {} }));

  // Sort, status filter and search tips live in the view title bar; the host posts setSort, setStatuses and setQuery.
  const KNOWN = ['file:', 'edited:', 'cmd:', 'tag:', 'sha:', 'pr:', 'branch:', 'last:', 'from:'];
  const { TIPS, SORT_LIST } = require('../out/headerData');
  const tipEx = TIPS.flatMap((g) => g[1].map((t) => t[1]));
  check('the three header icon buttons and popovers are gone from the page', !/id="(srb|sfb|tpb|srm|sfm|tpm)"/.test(page) && !/class="hbs"/.test(page));
  check('tips list every parser prefix with an example', KNOWN.every((k) => tipEx.some((e) => e.startsWith(k))) && tipEx.length === KNOWN.length);
  check('sort list matches the sort keys the script accepts', run('JSON.stringify(SORTS.map(o=>o[0]))', 'sorts') === JSON.stringify(SORT_LIST.map((o) => o[0])));
  check('placeholder is the short text and the long hint is gone', /placeholder="Search chats"/.test(page) && !/placeholder="[^"]*file:/.test(page));
  step('host sets a sort', () => deliver({ type: 'setSort', sort: 'time' }));
  check('setSort applies and saves the sort', run('sort.value', 'sort') === 'time' && posted.some((p) => p.type === 'draft' && p.sort === 'time'));
  step('host sets a bad sort', () => deliver({ type: 'setSort', sort: 'bogus' }));
  check('unknown sort falls back to score', run('sort.value', 'sort2') === 'score');
  step('host turns a status off', () => deliver({ type: 'setStatuses', checked: ['normal', 'active'] }));
  check('setStatuses updates the filter', run('stOn.size', 'stOn') === 2 && run('stOn.has("tiny")', 'tiny') === false);
  step('reset status', () => run('stReset();', 'stReset'));
  check('status reset restores all and is saved', posted.some((p) => p.type === 'status' && p.checked.length === run('STATUS_KEYS.length', 'n')));
  step('host sets a query', () => deliver({ type: 'setQuery', query: 'file:extension.ts' }));
  check('setQuery fills the search box and runs it', els.get('q').value === 'file:extension.ts' && posted.some((p) => p.type === 'search' && p.query === 'file:extension.ts'));
  step('clear tip query', () => { els.get('q').value = ''; run('qSync();', 'qSync'); });
  check('sort and status are gone from the details panel', !/id="sort"/.test(page) && !/id="lbst"/.test(page));
  check('Export button is gone', !/id="exb"/.test(page) && !/>Export</.test(page));
  check('status Normal is renamed Mid-size', run('STATUS_LABELS.normal', 'label') === 'Mid-size' && !/Normal/.test(run('JSON.stringify(STATUS_LABELS)', 'labels')));
  // Messages from: the control, its plumbing into every request, the summary note and the query prefix.
  step('pick messages from you', () => { els.get('frm').value = 'you'; fire('frm', 'change'); });
  check('author choice is sent with the search and saved in the draft', posted.some((p) => p.type === 'draft' && p.from === 'you') && run('cur().from', 'cur') === 'you');
  check('summary notes a non-default author', run("fromNote()", 'note') === ' · from you only');
  step('query prefix wins over the drop-down', () => { els.get('q').value = 'x from:claude'; });
  check('from:claude (old alias) and from:agent both show the agent note', run('fromNote()', 'note2') === ' · from agent only' && (() => { els.get('q').value = 'x from:agent'; return run('fromNote()', 'note2b') === ' · from agent only'; })());
  step('restore author', () => { els.get('q').value = ''; deliver({ type: 'restore', max: 500, state: { query: '', results: [], searched: '', subs: true, when: 'any', sort: 'time', from: 'claude' }, history: [], archOpen: false, advOpen: false }); });
  check('restore sets the author drop-down', els.get('frm').value === 'agent');
  step('back to both', () => { els.get('frm').value = 'both'; fire('frm', 'change'); });
  check('both shows no note', run('fromNote()', 'note3') === '');

  // Neutral wording: no "claude" in the generated page except the from:claude alias handling.
  const left = [...page.matchAll(/.{0,30}claude.{0,30}/gi)].map((x) => x[0]).filter((x) => !/\|claude\||===\s*'claude'|\|claude\)/.test(x));
  check('no "claude" in the generated page outside the from:claude alias (' + left.slice(0, 3).join(' / ') + ')', left.length === 0);
  check('messages from drop-down is Both / You / Agent', /<option value="agent">agent<\/option>/.test(page) && !/value="claude"/.test(page));
  check('stat labels have a 1px top margin', /\.xs dt\{margin-top:1px/.test(page));
  // Tag editor: wraps, no visible hint, tooltip carries it.
  step('tag editor open', () => run('tagIn={id:' + JSON.stringify(id(1)) + ",v:''};", 'tagIn'));
  const tin = run('tagInput(' + JSON.stringify(id(1)) + ')', 'tagInput');
  check('no visible "Enter to add" text in the tag editor', !/>[^<]*Enter to add/.test(tin) && !/class="k"/.test(tin));
  check('tag input has the tooltip, accessible description and short placeholder', /data-tip="Enter to add · Esc to cancel"/.test(tin) && /aria-description="Enter to add, Escape to cancel"/.test(tin) && /placeholder="Add tag"/.test(tin));
  check('tag editor wraps with a 4px row gap, 80px input and ellipsis chips', /\.xt\{display:flex;flex-wrap:wrap;[^}]*row-gap:4px/.test(page) && /\.xin\{[^}]*flex:1 1 80px;min-width:80px/.test(page) && /\.xt \.ct\{[^}]*text-overflow:ellipsis/.test(page));
  step('tag editor close', () => run('tagIn=null;', 'tagIn off'));
  // Related zero pill is dimmed and the section still opens.
  step('back to the session list with two open cards', () => {
    run("sessOn=true;lastQ='';hasResults=false;lastRs=[];lastMsg='';busy=false;open.clear();", 'reset list');
    deliver({ type: 'sessions', sn: run('sn', 'sn'), rows, total: 3, arch: [], archTotal: 0, max: 500 });
    for (const n of [1, 3]) { run('openCard(' + JSON.stringify(id(n)) + ');rerender();', 'open ' + n); deliver(expandReply(n)); }
  });
  const rq3 = countPosts().filter((p) => p.id === id(3)).pop().rq;
  step('related count 0', () => { deliver({ type: 'counts', id: id(3), rq: rq3, part: 'rel', n: 0 }); run('rerender();', 'rr'); });
  const relSec = (n) => { const m = new RegExp('<section class="xrel"><div class="xh[^"]*" data-sec="rel:' + id(n) + '"[\\s\\S]*?</div>').exec(list.innerHTML); return m ? m[0] : ''; };
  check('Related header shows a dimmed 0 pill', /class="pill z"[^>]*>0</.test(relSec(3)));
  step('related count failed', () => { deliver({ type: 'counts', id: id(3), rq: rq3, part: 'rel', n: null }); run('rerender();', 'rr2'); });
  check('Related header still shows the dimmed 0 pill when the count is unknown', /class="pill z"[^>]*>0</.test(relSec(3)));
  step('open empty Related', () => { run("toggleSec('rel:' + " + JSON.stringify(id(3)) + ');', 'rel3'); deliver({ type: 'related', id: id(3), related: [] }); });
  check('empty Related opens and says so', /No other chat touched the same files/.test(list.innerHTML) && /class="pill z"[^>]*>0</.test(relSec(3)));
  // Hand-over button feedback.
  step('handover busy', () => deliver({ type: 'handoverState', id: id(1), state: 'busy' }));
  check('hand-over button shows busy', /aria-busy="true"/.test(list.innerHTML) && /Copying\.\.\./.test(list.innerHTML));
  step('handover done', () => deliver({ type: 'handoverState', id: id(1), state: 'done' }));
  check('hand-over button shows Copied', />Copied</.test(list.innerHTML));
  step('handover cleared', () => deliver({ type: 'handoverState', id: id(1), state: '' }));
  asyncChecks.push(handoverChecks(check));
  roleChecks(check);
  // No font family or size in the generated CSS other than the VS Code variables (code/paths use the editor font).
  const css = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join('\n');
  const fams = [...css.matchAll(/font-family:([^;}]*)/g)].map((x) => x[1].trim());
  check('every font-family is a VS Code variable or inherit (' + fams.filter((f) => !/^(var\(--vscode-(editor-)?font-family\)|inherit)$/.test(f)).join('|') + ')', fams.length > 0 && fams.every((f) => /^(var\(--vscode-(editor-)?font-family\)|inherit)$/.test(f)));
  const sizes = [...css.matchAll(/font-size:([^;}]*)/g)].map((x) => x[1].trim());
  check('every font-size is a VS Code variable or inherit (' + sizes.filter((f) => !/^(var\(--vscode-(editor-)?font-size\)|calc\(var\(--vscode-font-size\) - \d+px\)|inherit)$/.test(f)).join('|') + ')', sizes.every((f) => /^(var\(--vscode-(editor-)?font-size\)|calc\(var\(--vscode-font-size\) - \d+px\)|inherit)$/.test(f)));
  check('no font shorthand other than inherit', [...css.matchAll(/[;{\s]font:([^;}]*)/g)].every((x) => x[1].trim() === 'inherit'));

  // Item 2: Up and Down in the search box walk the history (the list is only reached from the newest end).
  step('history walk', () => {
    deliver({ type: 'history', history: ['beta', 'alpha'].map((query) => ({ query, cs: false, ww: false, any: false, re: false, all: false, subs: true, when: 'any', last: 0 })) });
    els.get('q').value = '';
    fire('q', 'keydown', { key: 'ArrowUp' });
  });
  check('ArrowUp shows the newest earlier search', els.get('q').value === 'beta');
  step('up again', () => fire('q', 'keydown', { key: 'ArrowUp' }));
  check('second ArrowUp goes further back', els.get('q').value === 'alpha');
  step('down', () => fire('q', 'keydown', { key: 'ArrowDown' }));
  check('ArrowDown comes forward again', els.get('q').value === 'beta');
  step('down to start', () => fire('q', 'keydown', { key: 'ArrowDown' }));
  check('ArrowDown past the newest restores what was typed', els.get('q').value === '');
  step('down on empty box', () => fire('q', 'keydown', { key: 'ArrowDown' }));
  check('ArrowDown in an empty box shows previous searches', els.get('q').value === 'beta');
  step('escape restores', () => fire('q', 'keydown', { key: 'Escape' }));
  check('Escape restores the typed text', els.get('q').value === '');
  step('list step does not take the search box arrows', () => fire(document, 'keydown', { key: 'ArrowUp', target: els.get('q') }));
  check('document handler leaves the search box alone', els.get('q').value === '');
  step('final rerender', () => run('rerender();', 'rerender'));
}

// Message-author filter on the real compiled modules: parser, options, windows, matching and expand.
function roleChecks(check) {
  const q = require(path.join(OUT, 'query.js')), w = require(path.join(OUT, 'window.js')), mo = require(path.join(OUT, 'msgOpts.js')), mt = require(path.join(OUT, 'match.js')), pr = require(path.join(OUT, 'parse.js'));
  const o = (x) => Object.assign({ all: false, cs: false, ww: false, re: false, when: 'any', subs: true, last: 0 }, x);
  check('parser reads from:you and from:claude and removes them from the text', q.parseQuery('from:you hello').from === 'you' && q.parseQuery('hello from:Claude').plain === 'hello' && q.parseQuery('from:claude').from === 'agent' && q.parseQuery('from:agent').from === 'agent' && q.parseQuery('from:bob x').from === undefined);
  check('compile takes the prefix first, then the option, then both', q.compile('a from:claude', o({ from: 'you' })).from === 'agent' && q.compile('a', o({ from: 'you' })).from === 'you' && q.compile('a', o()).from === 'both');
  check('options validate the author value', mo.opts({ from: 'you' }).from === 'you' && mo.opts({ from: 'claude' }).from === 'agent' && mo.opts({ from: 'agent' }).from === 'agent' && mo.opts({ from: 'x' }).from === 'both' && mo.opts({}).from === 'both');
  const texts = ['hello from me', 'hello from bot', 'hello again bot'], roles = [0, 1, 1];
  const rec = { text: texts.join(pr.SEP), ts: [1, 2, 3], ends: [], roles, cmds: [], cmdAt: [], lines: new Uint32Array(3) };
  let p = 0; texts.forEach((t, i) => { rec.ends.push(p + t.length); p += t.length + pr.SEP.length; });
  const cmp = (from) => Object.assign(q.compile('hello', o({ from })), { grams: [] });
  const run1 = (from) => mt.matchChat({ files: [], bloom: new Uint8Array(0), last: 3 }, cmp(from), { pins: new Set(), tags: {} }, 'x', () => rec, 10, w.topWinOf(0, from));
  check('both counts every message, you only user messages, agent only assistant messages', run1('both').hits === 3 && run1('you').hits === 1 && run1('agent').hits === 2 && run1('you').role === 0 && run1('agent').role === 1);
  check('hit counts and matching messages follow the author', run1('both').mc === 3 && run1('you').mc === 1 && run1('agent').mc === 2);
  check('author filter combines with last:N (last 1 message is Claude)', (() => { const h = mt.matchChat({ files: [], bloom: new Uint8Array(0), last: 3 }, cmp('you'), { pins: new Set(), tags: {} }, 'x', () => rec, 10, w.topWinOf(1, 'you')); return h === null; })());
  check('subagents are skipped for you only and kept for Claude', w.noSubs('you') && !w.noSubs('agent') && !w.noSubs('both') && !w.noSubs(undefined));
}


// Hand-over note on the real compiled modules: every card section is written, a missing part is "not available", the live gather obeys its deadline.
function handoverChecks(check) {
  const h = require(path.join(OUT, 'handover.js')), lv = require(path.join(OUT, 'handoverLive.js'));
  const d = { id: '00000000-0000-4000-8000-000000000001', title: 'Fix  the thing', folder: '/Users/x/proj', branch: 'feat/x', last: Date.now() - 3600e3, pct: 61, files: [{ path: '/Users/x/proj/a.ts', edited: true }] };
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const ok = { state: 'ok', top: '/Users/x/proj', branch: 'feat/x', upstream: 'origin/feat/x', ahead: 25, behind: 2, staged: 1, modified: 30, untracked: 2, fileTotal: 33,
    files: many(25, (i) => ({ s: 'M', p: 'f' + i + '.ts' })), commits: many(25, (i) => ({ sha: 'abc' + String(1000 + i), subject: 'subject ' + i })),
    worktrees: [{ path: '/Users/x/proj', branch: 'feat/x', detached: false, main: true, missing: false, here: true }, { path: '/Users/x/proj-wt', branch: 'fix/y', detached: false, main: false, missing: false, here: false }],
    prs: [{ number: 7, title: 'A PR', draft: true, review: 'approved' }] };
  const live = { git: ok, prUrls: new Map([[7, 'https://example.com/pr/7']]), prsOn: true, unc: ok, unp: ok, wt: ok, rel: [{ id: '00000000-0000-4000-8000-000000000009', title: 'Related one', shared: 3, last: 0, score: 9 }] };
  const t = h.handoverText(d, [], Date.now(), live);
  const heads = ['## Git', '## Uncommitted files', '## Unpushed commits', '## Worktrees', '## Related chats'];
  check('hand-over note has every card section heading', heads.every((x) => t.includes(x)));
  check('hand-over note keeps the existing fields', /Chat: Fix the thing/.test(t) && /Session id: 0000/.test(t) && /Project folder: \/Users\/x\/proj/.test(t) && /Git branch: feat\/x/.test(t) && /Last active:/.test(t) && /Context: 61% full/.test(t));
  check('hand-over Git section has branch, ahead/behind and PR number, title and url', /ahead 25, behind 2/.test(t) && /Pull request: #7 A PR \(open, draft, approved\) https:\/\/example\.com\/pr\/7/.test(t));
  check('hand-over lists at most 20 uncommitted files and 20 commits with the rest counted', (t.match(/^- M f\d+\.ts/gm) || []).length === 20 && /\(\+13 more\)/.test(t) && (t.match(/^- abc\d+ subject/gm) || []).length === 20 && /\(\+5 more\)/.test(t));
  check('hand-over worktrees mark this chat and related lists title, id and shared files', /proj-wt \[fix\/y\]/.test(t) && /\(this chat's\)/.test(t) && /Related one \(0000.*0009\) - 3 shared files/.test(t));
  check('hand-over note has no "claude"', !/claude/i.test(t));
  const none = h.handoverText(d, [], Date.now(), {});
  check('missing parts are written as not available, never dropped', heads.every((x) => none.includes(x)) && (none.match(/Not available/g) || []).length === 5);
  check('a failed git part says why', /Not available: Git is unavailable/.test(h.handoverText(d, [], Date.now(), { git: { state: 'error', reason: 'Git is unavailable: x' } })));
  check('empty related says so', /No other chat touched the same files/.test(h.handoverText(d, [], Date.now(), { rel: [] })));
  const hang = new Promise(() => {});
  const deps = (load, request) => ({ request, log() {}, folders: () => [], prsOn: () => true, gitLive: { load } });
  const fast = async (cwd, part) => ({ live: Object.assign({}, ok, { fileTotal: 1 }), targets: part === 'git' ? { urls: new Map([[7, 'u']]) } : undefined });
  const req = async (m) => (m.t === 'chatCwd' ? '/r' : []);
  return lv.gatherLive('x', deps(fast, req), 200).then((g) => {
    check('gather returns every part when all answer', g.git && g.unc && g.unp && g.wt && Array.isArray(g.rel) && g.prUrls.get(7) === 'u');
    const t0 = Date.now();
    const stuck = (cwd, part) => (part === 'wt' ? hang : fast(cwd, part));
    return lv.gatherLive('x', deps(stuck, req), 150).then((g2) => {
      check('a stuck part is left out at the deadline while the others are kept', Date.now() - t0 < 1500 && !g2.wt && g2.git && g2.unc);
      return lv.gatherLive('x', deps((c, p) => Promise.reject(new Error('boom')), () => Promise.reject(new Error('no'))), 150).then((g3) => check('failing services never throw', !g3.git && !g3.rel));
    });
  }).catch((e) => fail('handover gather', e)).then(() => {});
}

function report() { H.report('panel script ran ' + posted.length + ' posts, no exceptions'); }
