// Fails the build when the chat dot states break their promises. Drives out/liveState.js, out/bgAgents.js, out/group.js,
// out/status.js, out/workModel.js and out/dotCss.js: state priority and the also list, background agent detection from a
// transcript (launch without finish notice), tooltip and class text, band placement, and the animation switches.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { dotState, buildDots, stateMap } = require(path.join(OUT, 'liveState.js'));
const { BgTracker, feed } = require(path.join(OUT, 'bgAgents.js'));
const { dotText, dotAttrs } = require(path.join(OUT, 'group.js'));
const { statusesOf } = require(path.join(OUT, 'status.js'));
const model = require(path.join(OUT, 'workModel.js'));
const { DOT_ANIM_CSS } = require(path.join(OUT, 'dotCss.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. State priority: waiting, running, unread, background; s is the first, also the rest; old shapes are unchanged.
check('idle dot has no also', eq(dotState('idle', false), { s: 'idle' }) && eq(dotState(undefined, false), { s: 'idle' }));
check('plain running, waiting, unread keep their old shape', eq(dotState('busy', false), { s: 'running' }) && eq(dotState('waiting', false), { s: 'waiting' }) && eq(dotState('idle', true), { s: 'unread' }) && eq(dotState(undefined, true), { s: 'unread' }));
check('busy chat is running even when marked unread', eq(dotState('busy', true), { s: 'running' }));
check('a dormant chat with background agents is background', eq(dotState('idle', false, undefined, true), { s: 'background' }));
check('unread + background: unread first', eq(dotState('idle', true, undefined, true), { s: 'unread', also: ['background'] }));
check('running + background: running first', eq(dotState('busy', false, undefined, true), { s: 'running', also: ['background'] }));
check('waiting wins over background', eq(dotState('waiting', false, undefined, true), { s: 'waiting', also: ['background'] }));
check('window mark is kept for live chats only', dotState('idle', false, 'this', true).win === 'this' && dotState(undefined, true, 'this').win === undefined);
const dots = buildDots(new Map([['a', 'idle'], ['b', 'busy']]), new Set(['a']), undefined, ['t'], new Set(['a', 'b', 't']));
check('buildDots: background only for live sessions', eq(dots.a, { s: 'unread', also: ['background'] }) && eq(dots.b, { s: 'running', also: ['background'] }) && eq(dots.t, { s: 'idle' }));
check('stateMap keeps the primary state only', eq(stateMap(dots), { a: 'unread', b: 'running', t: 'idle' }));

// 2. Background detection: a launch counts until its task-notification names it.
{
  const launchAgent = (id) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_' + id }] }, toolUseResult: { isAsync: true, status: 'async_launched', agentId: id, prompt: 'x "agentId":"fake" y' } });
  const launchBash = (id) => JSON.stringify({ type: 'user', toolUseResult: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: id } });
  const note = (id, st) => JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: '<task-notification>\n<task-id>' + id + '</task-id>\n<status>' + st + '</status>\n</task-notification>' });
  const open = new Set();
  [launchAgent('a1'), launchBash('b1'), JSON.stringify({ type: 'assistant', message: 'ordinary line' })].forEach((l) => feed(open, l));
  check('launches are open', eq([...open].sort(), ['a1', 'b1']));
  feed(open, note('a1', 'completed'));
  check('a finish notice closes its task only', eq([...open], ['b1']));
  feed(open, note('b1', 'killed'));
  check('killed closes too', open.size === 0);
  const q = new Set();
  feed(q, JSON.stringify({ type: 'user', message: { content: 'text mentioning "agentId":"zz" and async_launched' } }));
  check('quoted text is not a launch', q.size === 0);

  const dir = fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-dots-'));
  fs.mkdirSync(path.join(dir, 'proj'));
  const id = '11111111-2222-4333-8444-555555555555', file = path.join(dir, 'proj', id + '.jsonl');
  fs.writeFileSync(file, launchAgent('a1') + '\n' + launchBash('b1') + '\n' + note('a1', 'completed') + '\n');
  const t = new BgTracker(dir);
  (async () => {
    check('tracker: one task still running', (await t.running([id])).has(id));
    const half = note('b1', 'completed');
    fs.appendFileSync(file, half.slice(0, 20)); // a line still being written
    check('tracker: a partial line changes nothing', (await t.running([id])).has(id));
    fs.appendFileSync(file, half.slice(20) + '\n');
    check('tracker: the finished line closes the last task', !(await t.running([id])).has(id));
    check('tracker: an unknown session is not running', (await t.running(['99999999-2222-4333-8444-555555555555'])).size === 0);
    fs.rmSync(dir, { recursive: true, force: true });
    done();
  })();
}

function done() {
  // 3. Text, class and tooltip.
  check('dotText background', dotText({ s: 'background' }) === 'Background agents running');
  check('dotText lists every state', /^Unread.*\. Also: Background agents running$/.test(dotText({ s: 'unread', also: ['background'] })) && dotText({ s: 'running', also: ['background'] }) === 'Running. Also: Background agents running');
  check('dotAttrs single state is a plain class', dotAttrs({ s: 'background' }) === 'class="dot background"');
  check('dotAttrs two states alternate', dotAttrs({ s: 'running', also: ['background'] }) === 'class="dot running m2 c1-running c2-background"');
  check('dotAttrs three states', /m3/.test(dotAttrs({ s: 'waiting', also: ['running', 'unread'] })) && /c3-unread/.test(dotAttrs({ s: 'waiting', also: ['running', 'unread'] })));
  // Regression: the webviews' CSP forbids inline styles, so a multi-state dot with a style attribute lost its colors and vanished.
  const multi = dotAttrs({ s: 'running', also: ['background'] });
  check('dotAttrs never emits an inline style (CSP)', !/style=/.test(multi) && !/style=/.test(dotAttrs({ s: 'waiting', also: ['running', 'unread'] })));
  check('every c-class used by dotAttrs has a CSS rule', ['waiting', 'running', 'unread', 'background'].every((k) => [1, 2, 3].every((n) => DOT_ANIM_CSS.includes('.dot.c' + n + '-' + k + '{--c' + n + ':var(--k-' + k + ')}'))));
  for (const f of ['webview.js', 'openWorkHtml.js']) {
    const src = fs.readFileSync(path.join(OUT, f), 'utf8');
    check(f + ' CSP keeps styles nonce-only (so dots must use classes)', /style-src 'nonce-/.test(src) && !/style-src[^;]*unsafe-inline/.test(src));
  };

  // 4. Bands and the Active status.
  check('background is Active', statusesOf({ msgs: 10, last: Date.now(), size: 1 }, false, Date.now(), 'background').includes('active'));
  check('background sits in Waiting like running', model.bandOf('background') === 'waiting' && model.bandOf('running') === 'waiting' && model.bandOf('unread') === 'needs');
  check('background has its own next step', /Background agents/.test(model.nextStep('background')));

  // 5. Animation switches and the manifest.
  check('animation off by the setting class', /\.noanim \.dot\{animation:none!important\}/.test(DOT_ANIM_CSS));
  check('animation off for reduced motion', /prefers-reduced-motion:reduce\)\{\.dot\{animation:none!important\}\}/.test(DOT_ANIM_CSS));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const set = pkg.contributes.configuration.properties['saropaChatExplorer.animateDots'];
  check('animateDots setting is a boolean defaulting to true', !!set && set.type === 'boolean' && set.default === true);
  check('dotBackground color is contributed', pkg.contributes.colors.some((c) => c.id === 'saropaChatExplorer.dotBackground'));
  for (const f of ['webviewCss.js', 'openWorkCss.js']) {
    const css = Object.values(require(path.join(OUT, f))).join('');
    check(f + ' styles the background dot and the animation', /\.dot\.background\{/.test(css) && /dotAlt2/.test(css) && /\.noanim \.dot/.test(css));
  }
  if (failures.length) { console.error('check_dots FAILED (' + failures.length + ')'); failures.forEach((e) => console.error('  - ' + e)); process.exit(1); }
  console.log('check_dots OK: state priority, background detection, text, bands and animation switches');
}
