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
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {}, appendChild() {}, remove() {}, insertAdjacentHTML() {}, setSelectionRange() {},
    closest: () => null, matches: () => false, contains: () => false, querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 20, width: 300, height: 20 }),
  };
  return el;
}
const els = new Map(ids.map((i) => [i, mkEl(i)]));
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
    state: 'ok', ahead: 4, behind: 1, staged: 0, modified: 2, untracked: 1, fileTotal: 3,
    files: [{ s: 'M', p: 'a/b.dart' }, { s: 'A', p: 'c.dart' }, { s: '?', p: 'd.md' }],
    worktrees: [{ path: '/r', branch: 'main', detached: false, main: true, missing: false, here: true }, { path: '/r-wt', branch: 'fix/x', detached: false, main: false, missing: false, here: false }],
    prs: [{ number: 7, title: 'A PR', draft: false, review: 'approved', url: 'u' }], top: '/r', branch: 'main', detached: false, upstream: 'origin/main', gone: false, prPending: false,
  };
  const expandReply = (n, o) => Object.assign({
    type: 'expanded', id: id(n), offset: 0, lite: false, items: [], total: 0, files: [], commands: [],
    related: [{ id: id(8), title: 'Related one', shared: 13, last: NOW - 5 * H, score: 33 }, { id: id(9), title: 'Related two', shared: 1, last: NOW - 50 * H, score: 3 }],
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
  step('git live', () => deliver({ type: 'gitLive', id: id(1), data: Object.assign({}, git, { prPending: true }) }));
  step('git live ok', () => deliver({ type: 'gitLive', id: id(1), data: git }));
  step('expanded with related', () => deliver(expandReply(1)));
  check('related chats rendered', /Related one/.test(list.innerHTML));
  check('git rendered', /class="xg"/.test(list.innerHTML));
  check('Lines cell rendered', /<dt>Lines<\/dt>/.test(list.innerHTML));
  step('expanded no related', () => deliver(expandReply(1, { related: [], git: null })));
  step('expanded with items', () => deliver(expandReply(1, { items: [item], total: 1, files: [{ path: '/a/b.ts', edited: true }, { path: '/a/c.ts', edited: false }], commands: ['ls -la'] })));
  step('expand failed', () => deliver({ type: 'expandFailed', id: id(1), lite: false, reason: 'Could not load details' }));
  check('failed card shows Retry', /data-a="xretry"/.test(list.innerHTML));
  step('git timeout', () => deliver({ type: 'gitLive', id: id(1), data: { state: 'timeout', reason: 'Git info timed out' } }));
  step('git error', () => deliver({ type: 'gitLive', id: id(1), data: { state: 'error', reason: 'x' } }));
  step('second card opened', () => { run('openCard(' + JSON.stringify(id(3)) + ');rerender();', 'open card 2'); deliver(expandReply(3)); });
  step('live dots', () => deliver({ type: 'dots', map: { [id(1)]: { s: 'live' }, [id(3)]: { s: 'unread' } } }));
  step('index progress', () => { deliver({ type: 'indexing', done: 1, total: 5, subs: 0, first: false }); deliver({ type: 'indexed' }); });
  step('history', () => deliver({ type: 'history', history: [{ query: 'a', cs: false, ww: false, any: false, re: false, all: false, subs: true, when: 'any', last: 0 }] }));
  // Search with a query: start, batch, done, then expand on a result, then error and short.
  step('set query', () => { els.get('q').value = 'match'; run('qSync();', 'qSync'); });
  step('search start', () => deliver({ type: 'start', sn: 0 }));
  step('search batch', () => deliver({ type: 'batch', sn: 0, results: [hit(1), hit(2)], done: 1, total: 4, totals: { chats: 2, matches: 6, max: 500 } }));
  step('search done', () => deliver({ type: 'done', sn: 0, results: [hit(1), hit(2), hit(3)], searched: 'match', totals: { chats: 3, matches: 9, max: 500 } }));
  step('expand under query', () => { run('openCard(' + JSON.stringify(id(2)) + ');rerender();', 'open card q'); deliver(expandReply(2, { items: [item, Object.assign({}, item, { i: 1 })], total: 2 })); deliver({ type: 'gitLive', id: id(2), data: git }); });
  step('lite expand', () => deliver(expandReply(2, { lite: true, related: undefined, git: undefined, files: undefined, commands: undefined })));
  step('search done empty', () => deliver({ type: 'done', sn: 0, results: [], searched: 'zzz' }));
  step('search error', () => deliver({ type: 'error', message: 'Search timed out' }));
  step('short query', () => deliver({ type: 'short', message: 'Type at least 2 characters' }));
  step('results', () => deliver({ type: 'results', sn: 0, results: [hit(1)], searched: 'match' }));
  step('clear query', () => { els.get('q').value = ''; run('qSync();rerender();', 'clear'); deliver({ type: 'sessions', sn: 0, rows, total: 3, arch: [], archTotal: 0, max: 500 }); });
  step('final rerender', () => run('rerender();', 'rerender'));
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
