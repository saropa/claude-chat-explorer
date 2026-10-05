// Fails the build when the panel script throws (ReferenceError, TypeError) on realistic messages.
// Builds the real page with out/webview.js html(), runs its script in node vm with a stub DOM, and feeds
// rows with live state, an expand reply with related chats, git payloads, search results and archived rows.
// Any exception, window.onerror or console.error from the script (including a section's "could not show" fallback) is a failure.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const page = require(path.join(OUT, 'webview.js')).html();
const m = /<script nonce="[^"]*">([\s\S]*)<\/script>/.exec(page);
if (!m) { console.error('check_webview: no <script> found in the panel page'); process.exit(1); }
const script = m[1];

const errors = [];
const fail = (where, e) => errors.push(where + ': ' + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '));

// 1. Syntax only.
try { new vm.Script(script, { filename: 'panel.js' }); } catch (e) { fail('syntax', e); report(); }

// 2. Stub DOM.
const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
const listeners = { window: {}, document: {} };
function mkEl(id) {
  const cls = new Set();
  const el = {
    id, value: '', checked: false, hidden: false, disabled: false, title: '', textContent: '', innerHTML: '', className: '', tabIndex: 0,
    scrollTop: 0, scrollHeight: 0, clientHeight: 0, offsetWidth: 300, offsetHeight: 20, dataset: {}, style: { setProperty() {}, removeProperty() {} },
    children: [], childNodes: [], parentNode: null, get parentElement() { return mkEl(""); }, options: [{ text: "Any", value: "" }], selectedIndex: 0, nextElementSibling: null, previousElementSibling: null, isConnected: true, open: false, type: '', selectionStart: 0,
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; } },
    _l: {}, attrs: {}, addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }, removeEventListener() {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; }, removeAttribute(k) { delete this.attrs[k]; },
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {}, appendChild() {}, remove() {}, insertAdjacentHTML() {}, setSelectionRange() {},
    closest(sel) { return this.inPw && sel === '.pw' ? {} : null; }, matches: () => false, contains: () => false, querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 20, width: 300, height: 20 }),
  };
  return el;
}
const els = new Map(ids.map((i) => [i, mkEl(i)]));
for (const t of page.matchAll(/<[^>]*\sid="([^"]+)"[^>]*>/g)) { if (/\shidden(\s|>|=)/.test(t[0])) { els.get(t[1]).hidden = true; } } // honor hidden in the markup
['srb', 'srm', 'sfb', 'sfm', 'tpb', 'tpm'].forEach((i) => { els.get(i).inPw = true; }); // these sit inside a .pw popover wrapper
const document = {
  body: mkEl('body'), documentElement: mkEl('html'), activeElement: null,
  getElementById: (i) => els.get(i) || null, querySelector: () => null, querySelectorAll: () => [], createElement: (t) => Object.assign(mkEl(''), t === 'template' ? { content: { children: [] } } : {}),
  addEventListener(t, f) { (listeners.document[t] = listeners.document[t] || []).push(f); }, removeEventListener() {},
};
const window = {
  addEventListener(t, f) { (listeners.window[t] = listeners.window[t] || []).push(f); }, removeEventListener() {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: () => ({ matches: false, addEventListener() {} }),
  innerWidth: 400, innerHeight: 800, requestAnimationFrame: (f) => setTimeout(f, 0), getSelection: () => ({ toString: () => '' }),
};
const posted = [];
const sandbox = {
  window, document, console: { log() {}, warn() {}, error: (...a) => fail('console.error', a.map(String).join(' ')) },
  acquireVsCodeApi: () => ({ postMessage: (x) => posted.push(x), getState: () => undefined, setState() {} }),
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
  navigator: { clipboard: {} }, Date, Math, JSON, Array, Object, Set, Map, String, Number, RegExp, Error, Promise, Intl, URL, Symbol,
  ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} }, CSS: { escape: (s) => s },
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;
Object.assign(window, { document, console: sandbox.console });
const ctx = vm.createContext(sandbox);

function run(code, where) { try { return vm.runInContext(code, ctx, { filename: where }); } catch (e) { fail(where, e); } }
// Fire an event on a stub element (its own listeners) or on document.
function fire(idOrEl, type, extra) {
  const el = typeof idOrEl === 'string' ? els.get(idOrEl) : idOrEl;
  const ev = Object.assign({ type, key: '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault() {}, stopPropagation() {}, target: el }, extra || {});
  const fs = el === document ? listeners.document[type] || [] : (el._l[type] || []).concat(listeners.document[type] || []);
  for (const f of fs) { try { f(ev); } catch (e) { fail('event ' + type, e); } }
}
function deliver(msg, where) {
  for (const f of listeners.window.message || []) { try { f({ data: msg }); } catch (e) { fail(where || msg.type, e); } }
}

// 3. Run the script, then drive it.
run(script, 'panel.js');
// patch() diffs real DOM nodes, which the stub cannot hold: keep the real call (it must not throw) and record the html it was given.
run("{const real=patch;patch=function(el,h){el.innerHTML=h;return real(el,h);};}", 'wrap patch');
if (!errors.length) drive();
report();

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

  // Items 3, 9: sort and status icon buttons with popovers.
  const hid = (n) => els.get(n).hidden;
  const exp = (n) => els.get(n).getAttribute('aria-expanded');
  const out = mkEl('outside');
  step('sort popover opens', () => fire('srb', 'click'));
  check('sort popover open with aria-expanded', !hid('srm') && exp('srb') === 'true' && hid('sfm'));
  step('status popover replaces it', () => fire('sfb', 'click'));
  check('only one popover open', hid('srm') && !hid('sfm') && exp('sfb') === 'true' && exp('srb') === 'false');
  step('Escape closes', () => fire(document, 'keydown', { key: 'Escape', target: els.get('sfb') }));
  check('Escape closes the popover', hid('sfm') && exp('sfb') === 'false');
  step('outside click closes', () => { fire('srb', 'click'); fire(document, 'click', { target: out }); });
  check('outside click closes the popover', hid('srm'));
  step('click inside keeps it open', () => { fire('srb', 'click'); fire(document, 'click', { target: els.get('srm') }); });
  check('click inside the popover keeps it open', !hid('srm'));
  step('pick a sort', () => fire('srm', 'change', { target: Object.assign(mkEl(''), { value: 'time' }) }));
  check('sort change shows the dot and is saved', !hid('srd') && posted.some((p) => p.type === 'draft' && p.sort === 'time'));
  step('back to default sort', () => fire('srm', 'change', { target: Object.assign(mkEl(''), { value: 'score' }) }));
  check('default sort hides the dot', hid('srd'));
  step('turn a status off', () => fire('sfm', 'change', { target: { dataset: { k: 'tiny' }, checked: false } }));
  check('status filter on shows the dot and is saved', !hid('sfp') && posted.some((p) => p.type === 'status' && !p.checked.includes('tiny')));
  step('reset status', () => fire('sfm', 'click', { target: Object.assign(mkEl('sfx'), { inPw: true }) }));
  check('status reset hides the dot', hid('sfp'));
  step('close popovers', () => fire(document, 'keydown', { key: 'Escape', target: els.get('srb') }));
  check('sort and status are gone from the details panel', !/id="sort"/.test(page) && !/id="lbst"/.test(page));
  check('Export button is gone', !/id="exb"/.test(page) && !/>Export</.test(page));
  check('status Normal is renamed Mid-size', run('STATUS_LABELS.normal', 'label') === 'Mid-size' && !/Normal/.test(run('JSON.stringify(STATUS_LABELS)', 'labels')));

  // Search tips popover: opens from the info icon, lists only prefixes the parser knows, and an example fills the search box.
  const tipsPage = els.get('tpm').innerHTML;
  const KNOWN = ['file:', 'edited:', 'cmd:', 'tag:', 'sha:', 'pr:', 'branch:', 'last:', 'from:'];
  step('tips popover opens', () => fire('tpb', 'click'));
  check('tips popover opens beside sort and status, aria-expanded set', !hid('tpm') && exp('tpb') === 'true' && hid('srm') && hid('sfm'));
  check('tips list every parser prefix with an example', KNOWN.every((k) => new RegExp('data-ex="' + k).test(tipsPage)) && (tipsPage.match(/data-ex=/g) || []).length === KNOWN.length);
  check('placeholder is the short text and the long hint is gone', /placeholder="Search chats"/.test(page) && !/placeholder="[^"]*file:/.test(page));
  step('click an example', () => {
    const ex = Object.assign(mkEl(''), { closest: (sel) => (sel === '[data-ex]' ? { dataset: { ex: 'file:extension.ts' } } : sel === '.pw' ? {} : null) });
    fire('tpm', 'click', { target: ex });
  });
  check('tip example fills the search box and runs it', els.get('q').value === 'file:extension.ts' && hid('tpm') && posted.some((p) => p.type === 'search' && p.query === 'file:extension.ts'));
  step('clear tip query', () => { els.get('q').value = ''; run('qSync();', 'qSync'); });
  // Popovers stay inside the panel at narrow, medium and wide widths (the wrapper that used to clip them is gone).
  for (const W of [220, 330, 600]) {
    for (const [b, mid] of [['srb', 'srm'], ['sfb', 'sfm'], ['tpb', 'tpm']]) {
      const m = els.get(mid);
      window.innerWidth = W; m.offsetWidth = 400; // wider than the panel on purpose
      els.get(b).getBoundingClientRect = () => ({ top: 8, left: W - 34, right: W - 8, bottom: 34, width: 26, height: 26 });
      step('place ' + mid + ' at ' + W, () => { fire(b, 'click'); });
      const left = parseFloat(m.style.left), w = Math.min(400, W - 16);
      check(mid + ' sits inside a ' + W + 'px panel with an 8px margin', left >= 8 && left + w <= W - 8 && /px$/.test(m.style.top));
      step('close ' + mid, () => fire(document, 'keydown', { key: 'Escape', target: els.get(b) }));
    }
  }
  step('scrolling closes a popover', () => { fire('srb', 'click'); fire(document, 'scroll', { target: document }); });
  check('scrolling the panel closes the open popover', hid('srm'));
  check('popover css is fixed, wraps, and has no 100% clamp to the icon wrapper', /\.pop\{position:fixed/.test(page) && /overflow-wrap:anywhere/.test(page) && !/#sfm,#exm/.test(page));
  check('sort options use a 2-column left-aligned grid', /\.pg\{display:grid;grid-template-columns:1fr 1fr;justify-items:start/.test(page));
  // Messages from: the control, its plumbing into every request, the summary note and the query prefix.
  step('pick messages from you', () => { els.get('frm').value = 'you'; fire('frm', 'change'); });
  check('author choice is sent with the search and saved in the draft', posted.some((p) => p.type === 'draft' && p.from === 'you') && run('cur().from', 'cur') === 'you');
  check('summary notes a non-default author', run("fromNote()", 'note') === ' · from you only');
  step('query prefix wins over the drop-down', () => { els.get('q').value = 'x from:claude'; });
  check('from:claude shows in the note', run('fromNote()', 'note2') === ' · from Claude only');
  step('restore author', () => { els.get('q').value = ''; deliver({ type: 'restore', max: 500, state: { query: '', results: [], searched: '', subs: true, when: 'any', sort: 'time', from: 'claude' }, history: [], archOpen: false, advOpen: false }); });
  check('restore sets the author drop-down', els.get('frm').value === 'claude');
  step('back to both', () => { els.get('frm').value = 'both'; fire('frm', 'change'); });
  check('both shows no note', run('fromNote()', 'note3') === '');
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
  check('parser reads from:you and from:claude and removes them from the text', q.parseQuery('from:you hello').from === 'you' && q.parseQuery('hello from:Claude').plain === 'hello' && q.parseQuery('from:bob x').from === undefined);
  check('compile takes the prefix first, then the option, then both', q.compile('a from:claude', o({ from: 'you' })).from === 'claude' && q.compile('a', o({ from: 'you' })).from === 'you' && q.compile('a', o()).from === 'both');
  check('options validate the author value', mo.opts({ from: 'you' }).from === 'you' && mo.opts({ from: 'x' }).from === 'both' && mo.opts({}).from === 'both');
  const texts = ['hello from me', 'hello from bot', 'hello again bot'], roles = [0, 1, 1];
  const rec = { text: texts.join(pr.SEP), ts: [1, 2, 3], ends: [], roles, cmds: [], cmdAt: [], lines: new Uint32Array(3) };
  let p = 0; texts.forEach((t, i) => { rec.ends.push(p + t.length); p += t.length + pr.SEP.length; });
  const cmp = (from) => Object.assign(q.compile('hello', o({ from })), { grams: [] });
  const run1 = (from) => mt.matchChat({ files: [], bloom: new Uint8Array(0), last: 3 }, cmp(from), { pins: new Set(), tags: {} }, 'x', () => rec, 10, w.topWinOf(0, from));
  check('both counts every message, you only user messages, Claude only assistant messages', run1('both').hits === 3 && run1('you').hits === 1 && run1('claude').hits === 2 && run1('you').role === 0 && run1('claude').role === 1);
  check('hit counts and matching messages follow the author', run1('both').mc === 3 && run1('you').mc === 1 && run1('claude').mc === 2);
  check('author filter combines with last:N (last 1 message is Claude)', (() => { const h = mt.matchChat({ files: [], bloom: new Uint8Array(0), last: 3 }, cmp('you'), { pins: new Set(), tags: {} }, 'x', () => rec, 10, w.topWinOf(1, 'you')); return h === null; })());
  check('subagents are skipped for you only and kept for Claude', w.noSubs('you') && !w.noSubs('claude') && !w.noSubs('both') && !w.noSubs(undefined));
}

function report() {
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.error('check_webview FAILED: the panel script threw on realistic messages (' + uniq.length + ')');
    uniq.slice(0, 12).forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('check_webview OK: panel script ran ' + (posted.length) + ' posts, no exceptions');
  process.exit(0);
}
