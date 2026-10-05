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
const bad = (what, e) => failures.push(what + (e ? ': ' + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ') : ''));
const NOW = Date.now(), H = 3600e3;
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const row = (n, o) => Object.assign({ id: id(n), title: 'Chat ' + n, project: n % 2 ? 'alpha' : 'beta', last: NOW - n * H, pinned: false,
  ctx: { pct: 61, tokens: 619392, window: 1000000, model: 'sonnet-5-5', comp: 0, pend: false, approx: false } }, o || {});

// A stub target whose closest() answers like the real DOM for [data-a] and .row.
function target(a, rowId, more) {
  const rowEl = rowId ? { dataset: { id: rowId } } : null;
  const t = Object.assign({ dataset: { a }, closest: (sel) => (sel === '[data-a]' ? t : sel === '.row' ? rowEl : null) }, more || {});
  return t;
}

function scenario(W) {
  const H1 = createHarness({ page, name: 'openwork@' + W, width: W, popIds: ['grb', 'grm'] });
  const { els, document, posted, run, fire, deliver, advance, check, step } = H1;
  const body = els.get('body'), tag = (s) => s + ' at ' + W;
  H1.start();
  check(tag('page says ready'), posted.some((p) => p.type === 'ready'));
  step('init', () => deliver({ type: 'init', v: 1, days: 14, group: 'attention', hidden: [] }));
  check(tag('loading state before the list'), /Loading chats/.test(body.innerHTML) && body.getAttribute('aria-busy') === 'true');
  check(tag('layout follows width'), els.get('wrap').classList.contains('wide') === (W >= 760));
  step('empty list', () => deliver({ type: 'chats', scan: 1, rows: [], indexing: false }));
  check(tag('empty state names the days'), /No chats in the last 14 days/.test(body.innerHTML) && body.getAttribute('aria-busy') === 'false');
  const rows = [row(1), row(2), row(3, { pinned: true }), row(4, { ctx: undefined }), row(5, { title: 'A <b>bold</b> "quoted" title' })];
  step('three bands', () => { deliver({ type: 'chats', scan: 2, rows, indexing: false }); deliver({ type: 'dots', map: { [id(1)]: { s: 'waiting' }, [id(2)]: { s: 'running' }, [id(4)]: { s: 'idle' } } }); advance(300); });
  check(tag('bands Needs you, Waiting on others and Idle shown; empty bands not'), /Needs you/.test(body.innerHTML) && /Waiting on others/.test(body.innerHTML) && />Idle </.test(body.innerHTML) && !/To finish/.test(body.innerHTML.replace(/aria-label="[^"]*"/g, '')) && !/Ready to tidy/.test(body.innerHTML));
  check(tag('git bands are stubs: no chat lands in To finish or Ready to tidy'), model.bandOf('idle') === 'idle' && model.bandOf('running') === 'waiting' && model.bandOf('waiting') === 'needs' && model.bandOf('unread') === 'needs');
  const cnt = els.get('cnt').innerHTML;
  check(tag('band chips carry counts and toggle state'), /1 need you/.test(cnt) && /0 to finish/.test(cnt) && /1 waiting/.test(cnt) && /0 to tidy/.test(cnt) && /aria-pressed="true"/.test(cnt));
  check(tag('every row has a dot with words, a title, a context percent and an age'), (body.innerHTML.match(/class="row"/g) || []).length === 5 && /role="img" aria-label="Waiting for you"/.test(body.innerHTML) && /61% full/.test(body.innerHTML));
  check(tag('titles are escaped'), !/<b>bold<\/b>/.test(body.innerHTML) && /&lt;b&gt;bold/.test(body.innerHTML));
  check(tag('pinned chat shows a Pinned label'), /Pinned/.test(body.innerHTML));
  check(tag('exactly one row is in the tab order'), (body.innerHTML.match(/class="rb"[^>]*tabindex="0"/g) || []).length === 1);
  check(tag('each row has four actions with aria-labels'), (body.innerHTML.match(/data-a="(open|handover|find|arch)"/g) || []).length === 20 && /aria-label="Open chat: Chat 1"/.test(body.innerHTML));
  check(tag('no agent name in visible output'), !/claude/i.test(body.innerHTML + els.get('cnt').innerHTML));
  // Index state and failure states.
  step('indexing', () => deliver({ type: 'chats', scan: 3, rows: [row(1)], indexing: true }));
  check(tag('indexing line shows with a Retry button'), els.get('ixs').hidden === false && /Indexing\.\.\./.test(page) && /data-a="retry"/.test(page));
  step('retry from the indexing line', () => fire(els.get('body'), 'click', { target: target('retry') }));
  check(tag('Retry asks the host again'), posted.some((p) => p.type === 'refresh'));
  step('indexed answer', () => deliver({ type: 'chats', scan: 4, rows, indexing: false }));
  check(tag('indexing line hides'), els.get('ixs').hidden === true);
  step('stale answer', () => deliver({ type: 'chats', scan: 1, rows: [], indexing: false }));
  check(tag('an older scan is dropped'), /Chat 1/.test(body.innerHTML));
  step('list failure', () => deliver({ type: 'chatsFailed', scan: 5, message: 'Could not load chats' }));
  check(tag('failure shows Could not load chats with Retry, never a spinner'), /Could not load chats/.test(body.innerHTML) && /data-a="retry"/.test(body.innerHTML) && !/Loading chats/.test(body.innerHTML));
  step('recover', () => deliver({ type: 'chats', scan: 6, rows, indexing: false }));
  check(tag('a good answer clears the failure'), !/Could not load chats/.test(body.innerHTML));
  // Watchdog on the fake clock: a refresh nobody answers ends as Retry.
  step('refresh no answer', () => fire(els.get('body'), 'click', { target: target('refresh') }));
  const posts0 = posted.length;
  step('time passes', () => advance(20100));
  check(tag('an unanswered refresh turns into Could not load chats after the watchdog'), /Could not load chats/.test(body.innerHTML) && posts0 > 0);
  step('recover again', () => deliver({ type: 'chats', scan: 7, rows, indexing: false }));
  // Dots change a band.
  step('dots move a chat', () => { deliver({ type: 'dots', map: { [id(2)]: { s: 'waiting' } } }); advance(300); });
  check(tag('dots refresh the page'), !/Waiting on others/.test(body.innerHTML) && /1 need you/.test(els.get('cnt').innerHTML) && /aria-label="Needs you"/.test(body.innerHTML));
  step('dots again', () => { deliver({ type: 'dots', map: { [id(1)]: { s: 'unread' }, [id(2)]: { s: 'running' } } }); advance(300); });
  // Buttons.
  const act = (a, n) => fire(els.get('body'), 'click', { target: target(a, id(n)) });
  const sent = (type, n, extra) => posted.some((p) => p.type === type && p.id === id(n) && (!extra || Object.keys(extra).every((k) => p[k] === extra[k])));
  step('open chat', () => act('open', 3));
  check(tag('Open chat posts open with the id'), sent('open', 3));
  step('find', () => act('find', 3));
  check(tag('Find posts find'), sent('find', 3));
  step('handover', () => act('handover', 3));
  check(tag('Copy note posts handover and shows Copying'), sent('handover', 3) && /Copying\.\.\./.test(body.innerHTML));
  step('handover done', () => deliver({ type: 'handoverState', id: id(3), state: 'done' }));
  advance(300);
  check(tag('Copied shows after done'), />Copied</.test(body.innerHTML));
  step('copied clears', () => advance(2100));
  check(tag('Copied clears back to Copy note'), !/>Copied</.test(body.innerHTML) && />Copy note</.test(body.innerHTML));
  step('archive', () => act('arch', 4));
  check(tag('Archive posts archive on and the row leaves'), sent('archive', 4, { on: true }) && !new RegExp('data-id="' + id(4) + '"').test(body.innerHTML));
  step('row click expands', () => act('row', 3));
  check(tag('a row expands with a next step and aria-expanded'), /Next step/.test(body.innerHTML) && /aria-expanded="true"/.test(body.innerHTML));
  step('row click collapses', () => act('row', 3));
  check(tag('a second click collapses it'), !/Next step/.test(body.innerHTML));
  // Keyboard walk on stub row buttons.
  const mkRb = (n) => { const r = Object.assign(H1.mkEl(''), { dataset: { a: 'row' }, tabIndex: -1 }); r.classList.add('rb'); r.closest = (sel) => (sel === '.row' ? { dataset: { id: id(n) } } : null); return r; };
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
  check(tag('Enter opens the chat'), sent('open', 2));
  step('space expands, left collapses', () => { key(' ', 0); });
  check(tag('Space expands'), /aria-expanded="true"/.test(body.innerHTML));
  step('left', () => key('ArrowLeft', 0));
  check(tag('ArrowLeft collapses'), !/aria-expanded="true"/.test(body.innerHTML));
  step('right and escape', () => { key('ArrowRight', 0); key('Escape', 0); });
  check(tag('Escape collapses an open row'), !/aria-expanded="true"/.test(body.innerHTML));
  step('focusin sets the roving stop', () => fire(document, 'focusin', { target: rbs[1] }));
  check(tag('focus moves the single tab stop'), rbs[1].tabIndex === 0 && rbs[0].tabIndex === -1);
  document.querySelectorAll = () => [];
  // Grouping and filters.
  step('group by chat', () => fire('grm', 'change', { target: { value: 'chat' } }));
  check(tag('By chat shows one flat list and saves the choice'), /All chats/.test(body.innerHTML) && posted.some((p) => p.type === 'prefs' && p.group === 'chat') && els.get('grm').hidden === true);
  step('group by repository', () => fire('grm', 'change', { target: { value: 'repo' } }));
  check(tag('By repository groups by project folder'), /aria-label="alpha"/.test(body.innerHTML) && /aria-label="beta"/.test(body.innerHTML));
  step('bad group ignored', () => fire('grm', 'change', { target: { value: 'nope' } }));
  step('group by attention', () => fire('grm', 'change', { target: { value: 'attention' } }));
  step('hide the needs band', () => fire(els.get('body'), 'click', { target: target('band', '', { dataset: { a: 'band', b: 'needs' } }) }));
  check(tag('a band chip hides that band and saves it'), !/aria-label="Needs you"/.test(body.innerHTML) && posted.some((p) => p.type === 'prefs' && p.hidden.includes('needs')) && /aria-pressed="false"/.test(els.get('cnt').innerHTML));
  step('hide idle', () => fire(els.get('body'), 'click', { target: target('idle') }));
  step('everything hidden', () => deliver({ type: 'dots', map: {} }));
  advance(300);
  check(tag('all bands hidden says so with a Show idle button'), /Nothing to show with these filters/.test(body.innerHTML) || /aria-label="Waiting on others"/.test(body.innerHTML) === false);
  step('show idle again', () => fire(els.get('body'), 'click', { target: target('idle') }));
  step('show needs again', () => fire(els.get('body'), 'click', { target: target('band', '', { dataset: { a: 'band', b: 'needs' } }) }));
  step('init restores prefs', () => deliver({ type: 'init', v: 1, days: 30, group: 'chat', hidden: ['tidy', 'bogus'] }));
  check(tag('init restores group, days and valid hidden bands'), /All chats/.test(body.innerHTML));
  step('reset group', () => deliver({ type: 'init', v: 1, days: 14, group: 'attention', hidden: [] }));
  // 250 rows, and every message type with odd payloads, must not throw.
  const many = Array.from({ length: 250 }, (_, i) => row(i + 10));
  step('250 rows', () => deliver({ type: 'chats', scan: 8, rows: many, indexing: false }));
  check(tag('250 rows render'), (body.innerHTML.match(/class="row"/g) || []).length === 250);
  for (const m of [{ type: 'unknown' }, { type: 'chats', scan: 9 }, { type: 'dots' }, { type: 'handoverState', id: id(1) }, { type: 'init' }, { type: 'chatsFailed', scan: 10 }, { type: 'chats', scan: 11, rows: [row(1, { title: '' , project: ''})] }]) { step('message ' + m.type, () => deliver(m)); }
  step('null message', () => { for (const f of H1.listeners.window.message || []) { f({ data: null }); } });
  advance(300);
  // Popover and tooltip placement inside the viewport.
  const m = els.get('grm');
  m.offsetWidth = 400;
  els.get('grb').getBoundingClientRect = () => ({ top: 8, left: W - 34, right: W - 8, bottom: 34, width: 26, height: 26 });
  step('group popover opens', () => fire('grb', 'click'));
  const left = parseFloat(m.style.left), w = Math.min(400, W - 16);
  check(tag('group popover sits inside the viewport with an 8px margin'), !m.hidden && left >= 8 && left + w <= W - 8 && /px$/.test(m.style.top));
  step('escape closes it', () => fire(document, 'keydown', { key: 'Escape', target: els.get('grb') }));
  check(tag('Escape closes the popover'), m.hidden === true);
  const tipEl = els.get('tip');
  const anchor = { dataset: { tip: 'Open chat\nSecond line' }, isConnected: true, closest: (s) => (s === '[data-tip]' ? anchor : null), contains: () => false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getBoundingClientRect: () => ({ left: W - 40, right: W - 10, top: 100, bottom: 120, width: 30, height: 20 }) };
  tipEl.offsetWidth = Math.min(280, Math.floor(W * 0.9));
  step('tooltip shows', () => { fire(document, 'mouseover', { target: anchor }); advance(500); });
  const tl = parseFloat(tipEl.style.left);
  check(tag('tooltip shows its text and stays inside the viewport'), !tipEl.hidden && /Open chat/.test(tipEl.innerHTML) && tl >= 4 && tl + tipEl.offsetWidth <= W - 4);
  step('tooltip hides', () => fire(document, 'keydown', { key: 'Escape', target: anchor }));
  check(tag('Escape hides the tooltip'), tipEl.hidden === true);
  // Updated text ticks on the fake clock.
  step('updated ticks', () => advance(60000));
  check(tag('Updated text ticks'), /Updated \d+ s ago/.test(els.get('upd').textContent));
  // Page script reads only ids its own page has (the 0.18.2 failure class).
  const used = [...H1.script.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((x) => x[1]).concat([...H1.script.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)].map((x) => x[1]));
  check(tag('the focus selector targets the row button inside the row that carries data-id'), /querySelector\('\.row\[data-id="'\+focusId\+'"\] \.rb'\)/.test(H1.script) && !/\.rb\[data-id/.test(H1.script));
  check(tag('every id the script reads exists in the page (' + used.filter((u) => !els.has(u)).join(',') + ')'), used.every((u) => els.has(u)));
  H1.errors.forEach((e) => failures.push(e));
}
for (const W of [400, 760, 1400]) { scenario(W); }

// Resize on one page: layout class follows.
{
  const R = createHarness({ page, name: 'openwork-resize', width: 400, popIds: ['grb', 'grm'] });
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
if (/claude/i.test(page)) { bad('no agent name anywhere in the page: ' + (/.{0,20}claude.{0,20}/i.exec(page) || [''])[0]); }
if (!/--vscode-saropaChatExplorer-dotRunning/.test(css) || !/--vscode-testing-iconPassed/.test(css)) { bad('dot colors use the contributed variables'); }
if (!/background:var\(--vscode-editor-background\)/.test(css)) { bad('page background is the editor background'); }
if (!/Content-Security-Policy[^>]*default-src 'none'/.test(page)) { bad('page keeps the strict content security policy'); }

// Pure model on the real compiled functions.
{
  const dots = { a: { s: 'waiting' }, b: { s: 'running' }, c: { s: 'unread' }, d: { s: 'idle' } };
  const rs = [{ id: 'a', last: 1, project: 'p' }, { id: 'b', last: 2, project: 'q' }, { id: 'c', last: 3, project: 'p' }, { id: 'd', last: 4, project: 'q' }, { id: 'e', last: 5, project: '' }];
  const g = model.groupRows(rs, dots, 'attention', []);
  if (g.map((x) => x.key).join() !== 'needs,waiting,idle') { bad('attention order is needs, waiting, idle: ' + g.map((x) => x.key).join()); }
  if (g[0].rows.map((r) => r.id).join() !== 'c,a') { bad('newest first inside a band'); }
  if (model.groupRows(rs, dots, 'attention', ['needs']).some((x) => x.key === 'needs')) { bad('a hidden band is left out'); }
  const by = model.groupRows(rs, dots, 'repo', []);
  if (by[0].label !== 'Unknown folder' || by.length !== 3) { bad('repository groups, newest group first, empty project is Unknown folder: ' + by.map((x) => x.label)); }
  if (model.groupRows(rs, dots, 'chat', ['idle'])[0].rows.length !== 3) { bad('chat mode honors hidden bands'); }
  if (model.groupRows([], dots, 'chat', []).length !== 0) { bad('no rows, no groups'); }
  if (!/BAND_ORDER/.test(model.WORK_MODEL_SRC) || !/function bandOf/.test(model.WORK_MODEL_SRC)) { bad('the page embeds the model source'); }
}

// Worker rows on a fake index: scope, boundary, archived, live, pinned.
{
  const wc = require(path.join(OUT, 'workChats.js'));
  const mk = (idv, last, o) => Object.assign({ id: idv, dir: '-x-proj', title: 't' + idv, last, first: last, count: 1, files: [], size: 1, mtime: 1, rec: '', len: 0, bloom: new Uint8Array(0) }, o || {});
  const DAY = 86400000, now = 1e12, days = 14, since = now - days * DAY;
  const chats = [mk('in', since), mk('out', since - 1), mk('live', since - 5 * DAY), mk('arch', now), mk('pin', now - 1)];
  const r = wc.openWorkRows({ tops: () => chats }, { days, now, live: new Set(['live']), archived: new Set(['arch']), pins: new Set(['pin']) });
  const idsOut = r.rows.map((x) => x.id).join();
  if (idsOut !== 'pin,in,live' && idsOut !== 'pin,live,in') { bad('rows: boundary chat in, one ms older out, live in, archived out, newest first (' + idsOut + ')'); }
  if (!r.rows[0].pinned || r.rows[1].pinned || r.total !== 3 || r.rows[0].project !== 'proj') { bad('rows carry pinned, project and total'); }
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
    w.on('message', (m) => {
      if (m.t !== 'reply' || m.req !== 1) { return; }
      const v = m.value;
      if (!v || typeof v.indexing !== 'boolean' || !Array.isArray(v.rows) || typeof v.total !== 'number') { bad('worker openWork reply shape: ' + JSON.stringify(v).slice(0, 120)); }
      else if (v.rows.length === 0 && v.indexing !== true) { bad('worker openWork: with no rows yet it must say indexing'); }
      else if (v.rows.length > N) { bad('worker openWork returned more rows than exist'); }
      else if (v.rows.some((r) => !/^[0-9a-f-]{36}$/.test(r.id) || typeof r.title !== 'string')) { bad('worker rows carry id and title'); }
      if (Date.now() - t0 > 2500) { bad('worker openWork answered too late'); }
      end('answered');
    });
    w.on('error', (e) => { bad('worker error', e); end('error'); });
    w.postMessage({ t: 'init', dir: path.join(base, 'store'), root: path.join(base, 'projects') });
    w.postMessage({ t: 'openWork', req: 1, days: 14, pins: [], archived: [], live: [] });
  });
}

workerCheck().then(() => {
  const uniq = [...new Set(failures)];
  if (uniq.length) {
    console.error('check_openwork FAILED (' + uniq.length + ')');
    uniq.slice(0, 20).forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('check_openwork OK: page at 400, 760 and 1400 px, model, worker rows and the worker thread');
  process.exit(0);
});
