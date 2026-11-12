// Fails the build when the Activity diagram maps a chat log line to the wrong group. Drives out/activityMap.js, out/activityFeed.js
// and out/activityHtml.js: message to group mapping, no flash for tool results, no replay of old messages, eight nodes in the page.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { flashesOf, toolGroup, eventsOf, captionOf } = require(path.join(OUT, 'activityMap.js'));
const { activityHtml } = require(path.join(OUT, 'activityHtml.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asst = (...blocks) => JSON.stringify({ type: 'assistant', message: { content: blocks } });
const tool = (name, input) => ({ type: 'tool_use', name, input: input || {} });

// 1. Tools by name.
const want = {
  files: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'NotebookEdit'], terminal: ['Bash'], web: ['WebSearch', 'WebFetch'], agents: ['Agent', 'SendMessage', 'ListAgents'],
  connect: ['mcp__claude_ai_Supabase__execute_sql', 'Skill', 'ToolSearch'], chat: ['AskUserQuestion'],
  control: ['Monitor', 'TaskStop', 'ExitPlanMode', 'EnterWorktree', 'ScheduleWakeup', 'Workflow', 'SomethingNew'],
};
for (const [g, names] of Object.entries(want)) { names.forEach((n) => check(n + ' is ' + g, toolGroup(n) === g)); }

// 2. Memory: a Read of CLAUDE.md or of a file under a memory folder of .claude; other tools and other reads stay Files.
check('Read CLAUDE.md is memory', toolGroup('Read', { file_path: '/p/CLAUDE.md' }) === 'memory');
check('Read of Windows CLAUDE.md is memory', toolGroup('Read', { file_path: 'C:\\p\\CLAUDE.md' }) === 'memory');
check('Read under .claude memory is memory', toolGroup('Read', { file_path: '/Users/a/.claude/projects/x/memory/MEMORY.md' }) === 'memory');
check('Read of a normal file is files', toolGroup('Read', { file_path: '/p/src/a.ts' }) === 'files');
check('Read of a memory folder outside .claude is files', toolGroup('Read', { file_path: '/p/memory/a.md' }) === 'files');
check('Edit of CLAUDE.md is files', toolGroup('Edit', { file_path: '/p/CLAUDE.md' }) === 'files');

// 3. Log lines.
check('text is chat', eq(flashesOf(asst({ type: 'text', text: 'hi' })), ['chat']));
check('thinking is the center', eq(flashesOf(asst({ type: 'thinking', thinking: 'x' })), ['think']));
check('mixed blocks keep their order', eq(flashesOf(asst({ type: 'thinking' }, { type: 'text' }, tool('Bash'))), ['think', 'chat', 'terminal']));
check('nested_memory attachment is memory', eq(flashesOf(JSON.stringify({ type: 'attachment', attachment: { type: 'nested_memory', path: '/p/x.md' } })), ['memory']));
check('other attachments do not flash', eq(flashesOf(JSON.stringify({ type: 'attachment', attachment: { type: 'hook_success' } })), []));
check('tool results do not flash', eq(flashesOf(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } })), []));
check('user text does not flash', eq(flashesOf(JSON.stringify({ type: 'user', message: { content: 'hello' } })), []));
check('junk does not flash or throw', eq(flashesOf('{not json'), []) && eq(flashesOf('null'), []) && eq(flashesOf('[]'), []));

// 3a. Events: waiting for you, captions, busy calls and failed results mapped back to their group.
const ev = (line, pending) => eventsOf(line, pending || new Map());
const endTurn = JSON.stringify({ type: 'assistant', message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } });
check('end_turn flashes chat, then waits on the core', eq(ev(endTurn).filter((e) => e.t !== 'caption'), [{ t: 'flash', g: 'chat' }, { t: 'wait', g: 'think' }]));
check('other stop reasons do not wait', !ev(asst({ type: 'text' })).some((e) => e.t === 'wait'));
check('AskUserQuestion waits on the Chat node, not busy', eq(ev(asst({ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: {} })).filter((e) => e.t !== 'caption'), [{ t: 'flash', g: 'chat' }, { t: 'wait', g: 'chat' }]));
const bashDesc = { type: 'tool_use', id: 't1', name: 'Bash', input: { description: 'Run the unit tests', command: 'SECRET=hunter2 npm test --all' } };
const bashEv = ev(asst(bashDesc));
check('Bash caption uses the description, never the command', eq(bashEv.find((e) => e.t === 'caption'), { t: 'caption', text: 'Running: Run the unit tests' }) && !JSON.stringify(bashEv).includes('hunter2'));
check('Bash without description falls back to the first word only', captionOf('Bash', { command: 'npm test --secret=1' }) === 'Running: npm');
check('file tools caption the basename only', captionOf('Edit', { file_path: '/a/b/c/activityHtml.ts' }) === 'Editing activityHtml.ts' && captionOf('Read', { file_path: 'C:\\a\\b.md' }) === 'Reading b.md');
check('web captions: query and host only', captionOf('WebSearch', { query: 'codicons license' }) === 'Searching the web: codicons license' && captionOf('WebFetch', { url: 'https://example.com/a/b?x=1' }) === 'Fetching example.com');
check('agent and skill captions', captionOf('Agent', { description: 'Opus review of diff', prompt: 'long secret prompt' }) === 'Agent: Opus review of diff' && captionOf('Skill', { skill: 'simplify' }) === 'Skill: simplify');
check('thinking caption names the seconds', eq(ev(JSON.stringify({ type: 'assistant', thinkingDurationMs: 6200, message: { content: [{ type: 'thinking' }] } })).find((e) => e.t === 'caption'), { t: 'caption', text: 'Thought for 6 s' }));
check('caption is truncated with an ellipsis', captionOf('Agent', { description: 'x'.repeat(200) }).length === 80 && captionOf('Agent', { description: 'x'.repeat(200) }).endsWith('\u2026'));
check('tool call is busy', bashEv.some((e) => e.t === 'busy' && e.id === 't1' && e.g === 'terminal'));
const result = (id, isErr) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isErr, content: 'x' }] } });
const pend = new Map(); ev(asst(bashDesc), pend);
check('ok result ends the call without a flash', eq(ev(result('t1', false), pend), [{ t: 'end', id: 't1', g: 'terminal' }]) && pend.size === 0);
ev(asst(bashDesc), pend);
check('is_error result maps back to its group and flashes it as an error', eq(ev(result('t1', true), pend), [{ t: 'end', id: 't1', g: 'terminal' }, { t: 'flash', g: 'terminal', err: true }]));
check('result of an unknown call gives nothing', eq(ev(result('nope', true)), []));
check('user text wakes', eq(ev(JSON.stringify({ type: 'user', message: { content: 'hello' } })), [{ t: 'wake' }]));
check('api_error flashes the core as an error', eq(ev(JSON.stringify({ type: 'system', subtype: 'api_error' })), [{ t: 'flash', g: 'think', err: true }]));
check('rejected permission flashes the core as an error', ev(JSON.stringify({ type: 'user', permissionDecision: { decision: 'reject' }, message: { content: [{ type: 'tool_result', tool_use_id: 'zz', is_error: true }] } })).some((e) => e.t === 'flash' && e.g === 'think' && e.err));

// 4. Page: eight groups plus the center, labels, no emoji.
const page = activityHtml();
check('page has the nine groups', (page.match(/class="grp"/g) || []).length === 9);
check('page labels Claude and the eight groups', ['Claude', 'Chat', 'Memory', 'Files', 'Terminal', 'Web', 'Agents', 'Connect', 'Control'].every((n) => page.includes('>' + n + '<')));
check('page honors reduced motion', page.includes('prefers-reduced-motion'));
check('page has no emoji', !/\p{Extended_Pictographic}/u.test(page));
check('page has a polite caption line with reserved height, throttled to 2 a second', page.includes('id="cap" aria-live="polite"') && /#cap\{[^}]*height:1\.4em/.test(page) && page.includes('500 - (Date.now() - capAt)'));
check('page uses the error color with a dashed shape cue, and a ripple and busy ring', page.includes('--vscode-errorForeground') && page.includes('stroke-dasharray:3 2') && page.includes('.rip .rp') && page.includes('.busy .br'));
check('page clears busy on reset and after a safety timeout, and has no external resources', page.includes('function reset()') && page.includes('pend.clear()') && page.includes('600000') && !/https?:\/\//.test(page));
check('page shows static states with reduced motion', page.includes('.busy .br,.rip .rp{animation:none;}'));

// 4a. Connectors: one per pair, each an arc of the ring (both ends at radius 68, so never inside the core of radius 28); thinking hold is in the page script.
const arcs = [...page.matchAll(/<path class="cn" data-c="([a-z-]+)" d="M([\d.]+) ([\d.]+) A68 68 0 0 1 ([\d.]+) ([\d.]+)"/g)];
check('page has 28 connectors', arcs.length === 28);
check('connector ends sit on the ring', arcs.every((m) => [[m[2], m[3]], [m[4], m[5]]].every(([x, y]) => Math.abs(Math.hypot(x - 100, y - 100) - 68) < 0.2)));
const ORDER = ['chat', 'memory', 'files', 'terminal', 'web', 'agents', 'connect', 'control'];
check('each connector takes the short way round (clockwise angle matches the shorter step count, under 180 degrees)', arcs.every((m) => {
  const [p, q] = m[1].split('-').map((n) => ORDER.indexOf(n)), d = Math.abs(p - q), steps = Math.min(d, 8 - d);
  let sweep = Math.atan2(m[5] - 100, m[4] - 100) - Math.atan2(m[3] - 100, m[2] - 100); sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return sweep < Math.PI && Math.abs(sweep - (steps * Math.PI) / 4 + 0.5) < 0.6 && steps > 0;
}));
check('connector timers are keyed per pair', page.includes("'c:' + cn.dataset.c") && !page.includes("pulse(cn, 'c')"));
check('page holds the center while thinking', page.includes("classList.add('hold')") && page.includes('10000'));

// 4b. Setting: declared with default 250, range 100..2000; the clamp keeps any value in range.
const prop = require(path.join(ROOT, 'package.json')).contributes.configuration.properties['saropaChatExplorer.activity.refreshMs'];
check('refreshMs setting has default 250, min 100, max 2000', !!prop && prop.default === 250 && prop.minimum === 100 && prop.maximum === 2000);
const { refreshMsOf } = require(path.join(OUT, 'activityFeed.js'));
check('refreshMs clamps and defaults', refreshMsOf(undefined) === 250 && refreshMsOf(5) === 100 && refreshMsOf(99999) === 2000 && refreshMsOf(500) === 500 && refreshMsOf('x') === 250);

(async () => {
  // 5. Feed: opening a chat does not replay it; later lines flash once; a switch does not replay either.
  const { ActivityFeed } = require(path.join(OUT, 'activityFeed.js'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'act-'));
  const dir = path.join(home, '.claude', 'projects', 'p');
  fs.mkdirSync(dir, { recursive: true });
  const a = path.join(dir, 'aaa.jsonl'), b = path.join(dir, 'bbb.jsonl');
  fs.writeFileSync(a, asst({ type: 'text' }) + '\n');
  fs.writeFileSync(b, asst({ type: 'text' }) + '\n');
  const gs = async (f, id) => (await f.check(id)).filter((e) => e.t === 'flash').map((e) => e.g); // the flashed groups of one check
  const realHome = os.homedir; os.homedir = () => home;
  try {
    const feed = new ActivityFeed(0);
    check('first look at a chat replays nothing', eq(await gs(feed, 'aaa'), []));
    fs.appendFileSync(a, asst(tool('Bash')) + '\n' + asst({ type: 'thinking' }).slice(0, 20));
    check('new line flashes, unfinished line waits', eq(await gs(feed, 'aaa'), ['terminal']));
    fs.appendFileSync(a, asst({ type: 'thinking' }).slice(20) + '\n');
    check('finished line flashes', eq(await gs(feed, 'aaa'), ['think']));
    check('no change gives nothing', eq(await gs(feed, 'aaa'), []));
    check('switching chats replays nothing', eq(await gs(feed, 'bbb'), []));
    check('no chat gives nothing', eq(await gs(feed, ''), []));
    const spin = () => { const t = Date.now(); while (Date.now() - t < 20) { /* let the clock move past the file times */ } };
    // An old log that was missing for a moment only marks its end; a log created after we first looked replays its new lines.
    const old = path.join(dir, 'ddd.jsonl');
    fs.writeFileSync(old + '.tmp', asst({ type: 'text' }) + '\n'); spin();
    check('old log missing at first look gives nothing', eq(await gs(feed, 'ddd'), []));
    fs.renameSync(old + '.tmp', old);
    check('old log that shows up only marks its end', eq(await gs(feed, 'ddd'), []));
    fs.appendFileSync(old, asst(tool('Bash')) + '\n');
    check('old log flashes only new lines', eq(await gs(feed, 'ddd'), ['terminal']));
    check('missing log of a new chat gives nothing', eq(await gs(feed, 'eee'), [])); spin();
    fs.writeFileSync(path.join(dir, 'eee.jsonl'), asst({ type: 'thinking' }) + '\n' + asst({ type: 'text' }) + '\n');
    check('brand-new log replays its first messages', eq(await gs(feed, 'eee'), ['think', 'chat']));
    check('and then only what is added', eq(await gs(feed, 'eee'), []));
    // mark(): what arrived while hidden does not flash.
    fs.appendFileSync(a, asst(tool('Bash')) + '\n'); feed.mark();
    check('after mark, hidden messages do not flash', eq(await gs(feed, 'aaa'), []));
    fs.appendFileSync(a, asst(tool('Bash')) + '\n');
    check('after mark, later messages flash', eq(await gs(feed, 'aaa'), ['terminal']));
    // The feed remembers calls in flight; mark() clears them, so a late result of an old call ends nothing and flashes no error.
    const call = { type: 'tool_use', id: 'p1', name: 'Bash', input: {} };
    fs.appendFileSync(a, asst(call) + '\n');
    check('feed reports a busy call', (await feed.check('aaa')).some((e) => e.t === 'busy' && e.id === 'p1'));
    fs.appendFileSync(a, result('p1', true) + '\n');
    check('feed maps a failed result to its group', eq((await feed.check('aaa')).filter((e) => e.t !== 'end'), [{ t: 'flash', g: 'terminal', err: true }]));
    fs.appendFileSync(a, asst(call) + '\n'); await feed.check('aaa'); feed.mark(); await feed.check('aaa');
    fs.appendFileSync(a, result('p1', true) + '\n');
    check('busy pending is cleared on reset', eq(await feed.check('aaa'), []));
    // A check in flight when mark() is called must not write state back or flash.
    const flight = feed.check('aaa'); fs.appendFileSync(a, asst(tool('Bash')) + '\n'); const mid = feed.check('aaa'); feed.mark();
    check('check in flight during mark() flashes nothing', eq(await flight, []) && eq(await mid, []));
    check('and its late write did not undo the mark', eq(await gs(feed, 'aaa'), []));
    fs.appendFileSync(a, asst(tool('Bash')) + '\n');
    check('later messages still flash after that', eq(await gs(feed, 'aaa'), ['terminal']));
    check('missing log of the open chat keeps its position', eq(await gs(feed, 'zzz'), []) && eq(await gs(feed, 'eee'), []));
    // A missing log is searched for at most once per gap; an existing log is read at once.
    const slow = new ActivityFeed(300), hid = path.join(dir, 'fff.jsonl');
    check('missing log gives nothing', eq(await gs(slow, 'fff'), []));
    fs.writeFileSync(hid, asst({ type: 'text' }) + '\n');
    check('missing log is not searched again within the gap', eq(await gs(slow, 'fff'), []));
    const t0 = Date.now(); while (Date.now() - t0 < 320) { /* wait out the gap */ }
    check('missing log is found after the gap (born after first look, so it replays)', eq(await gs(slow, 'fff'), ['chat']));
    fs.appendFileSync(hid, asst(tool('Bash')) + '\n');
    check('and then read on the fast path', eq(await gs(slow, 'fff'), ['terminal']));
  } finally { os.homedir = realHome; fs.rmSync(home, { recursive: true, force: true }); }
  if (failures.length) { console.error('check_activity FAILED (' + failures.length + ')'); failures.forEach((e) => console.error('  - ' + e)); process.exit(1); }
  console.log('check_activity OK: tool and log mapping, memory reads, page nodes, no replay');
})();
