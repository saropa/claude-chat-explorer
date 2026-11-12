// Fails the build when the Activity diagram maps a chat log line to the wrong group. Drives out/activityMap.js, out/activityFeed.js
// and out/activityHtml.js: message to group mapping, no flash for tool results, no replay of old messages, eight nodes in the page.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { flashesOf, toolGroup } = require(path.join(OUT, 'activityMap.js'));
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

// 4. Page: eight groups plus the center, labels, no emoji.
const page = activityHtml();
check('page has the nine groups', (page.match(/class="grp"/g) || []).length === 9);
check('page labels Claude and the eight groups', ['Claude', 'Chat', 'Memory', 'Files', 'Terminal', 'Web', 'Agents', 'Connect', 'Control'].every((n) => page.includes('>' + n + '<')));
check('page honors reduced motion', page.includes('prefers-reduced-motion'));
check('page has no emoji', !/\p{Extended_Pictographic}/u.test(page));

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
  const realHome = os.homedir; os.homedir = () => home;
  try {
    const feed = new ActivityFeed();
    check('first look at a chat replays nothing', eq(await feed.check('aaa'), []));
    fs.appendFileSync(a, asst(tool('Bash')) + '\n' + asst({ type: 'thinking' }).slice(0, 20));
    check('new line flashes, unfinished line waits', eq(await feed.check('aaa'), ['terminal']));
    fs.appendFileSync(a, asst({ type: 'thinking' }).slice(20) + '\n');
    check('finished line flashes', eq(await feed.check('aaa'), ['think']));
    check('no change gives nothing', eq(await feed.check('aaa'), []));
    check('switching chats replays nothing', eq(await feed.check('bbb'), []));
    check('no chat gives nothing', eq(await feed.check(''), []));
    const spin = () => { const t = Date.now(); while (Date.now() - t < 20) { /* let the clock move past the file times */ } };
    // An old log that was missing for a moment only marks its end; a log created after we first looked replays its new lines.
    const old = path.join(dir, 'ddd.jsonl');
    fs.writeFileSync(old + '.tmp', asst({ type: 'text' }) + '\n'); spin();
    check('old log missing at first look gives nothing', eq(await feed.check('ddd'), []));
    fs.renameSync(old + '.tmp', old);
    check('old log that shows up only marks its end', eq(await feed.check('ddd'), []));
    fs.appendFileSync(old, asst(tool('Bash')) + '\n');
    check('old log flashes only new lines', eq(await feed.check('ddd'), ['terminal']));
    check('missing log of a new chat gives nothing', eq(await feed.check('eee'), [])); spin();
    fs.writeFileSync(path.join(dir, 'eee.jsonl'), asst({ type: 'thinking' }) + '\n' + asst({ type: 'text' }) + '\n');
    check('brand-new log replays its first messages', eq(await feed.check('eee'), ['think', 'chat']));
    check('and then only what is added', eq(await feed.check('eee'), []));
    // mark(): what arrived while hidden does not flash.
    fs.appendFileSync(a, asst(tool('Bash')) + '\n'); feed.mark();
    check('after mark, hidden messages do not flash', eq(await feed.check('aaa'), []));
    fs.appendFileSync(a, asst(tool('Bash')) + '\n');
    check('after mark, later messages flash', eq(await feed.check('aaa'), ['terminal']));
    check('missing log of the open chat keeps its position', eq(await feed.check('zzz'), []) && eq(await feed.check('eee'), []));
  } finally { os.homedir = realHome; fs.rmSync(home, { recursive: true, force: true }); }
  if (failures.length) { console.error('check_activity FAILED (' + failures.length + ')'); failures.forEach((e) => console.error('  - ' + e)); process.exit(1); }
  console.log('check_activity OK: tool and log mapping, memory reads, page nodes, no replay');
})();
