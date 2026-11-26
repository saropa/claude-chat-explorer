// Fails the build when the Activity diagram maps a chat log line to the wrong group. Drives out/activityMap.js, out/activityFeed.js
// and out/activityHtml.js: message to group mapping, no flash for tool results, no replay of old messages, eight nodes in the page.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { toolGroup, eventsOf, captionOf, subEventsOf } = require(path.join(OUT, 'activityMap.js'));
const flashesOf = (line) => eventsOf(line, new Map()).flatMap((e) => (e.t === 'flash' ? [e.g] : [])); // the flashed groups of one line
const { fadeMsOf } = require(path.join(OUT, 'activityFeed.js'));
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
// Regression: end_turn ends every normal turn, so it must not set a live 'Waiting for you' caption (that wording belongs to the idle caption, which reads the dot).
check('end_turn emits no live caption, so "waiting for you" comes only from the dot-based idle caption', !ev(endTurn).some((e) => e.t === 'caption') && !JSON.stringify(ev(endTurn)).includes('Waiting for you'));
check('other stop reasons do not wait', !ev(asst({ type: 'text' })).some((e) => e.t === 'wait'));
check('AskUserQuestion waits on the Chat node, not busy', eq(ev(asst({ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: {} })).filter((e) => e.t !== 'caption'), [{ t: 'flash', g: 'chat' }, { t: 'wait', g: 'chat' }]));
const bashDesc = { type: 'tool_use', id: 't1', name: 'Bash', input: { description: 'Run the unit tests', command: 'SECRET=hunter2 npm test --all' } };
const bashEv = ev(asst(bashDesc));
check('Bash caption uses the description, never the command', eq(bashEv.find((e) => e.t === 'caption'), { t: 'caption', text: 'Running: Run the unit tests' }) && !JSON.stringify(bashEv).includes('hunter2'));
check('Bash without description falls back to the program name only', captionOf('Bash', { command: 'npm test --secret=1' }) === 'Running: npm' && captionOf('Bash', { command: '/usr/bin/git status' }) === 'Running: git');
check('Bash fallback skips VAR=value words and odd words', captionOf('Bash', { command: 'TOKEN=abc curl x' }) === 'Running: curl' && captionOf('Bash', { command: 'API_TOKEN=abc' }) === 'Running a command' && captionOf('Bash', { command: '"$X" y' }) === 'Running a command');
check('caption clip keeps emoji whole', captionOf('Agent', { description: '\u{1F600}'.repeat(100) }) === 'Agent: ' + '\u{1F600}'.repeat(72) + '…');
const lastLine = (...blocks) => JSON.stringify({ type: 'assistant', message: { stop_reason: 'end_turn', content: blocks } });
check('end_turn on a thinking or tool_use line does not wait; only the final text line does', !ev(lastLine({ type: 'thinking' })).some((e) => e.t === 'wait') && !ev(lastLine({ type: 'tool_use', id: 'k', name: 'Bash', input: {} })).some((e) => e.t === 'wait') && ev(lastLine({ type: 'thinking' }, { type: 'text' })).some((e) => e.t === 'wait'));
check('meta user lines do not wake', eq(ev(JSON.stringify({ type: 'user', isMeta: true, message: { content: 'x' } })), []));
check('a tool without a caption clears the old text', eq(ev(asst(tool('Monitor'))).find((e) => e.t === 'caption'), { t: 'caption', text: '' }));
const apiErr = (n) => JSON.stringify({ type: 'system', subtype: 'api_error', retryAttempt: n });
check('api_error flashes once per run of retries', ev(apiErr(1)).length === 1 && ev(apiErr(2)).length === 0 && ev(apiErr(undefined)).length === 1);
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
check('page uses the error color with a dashed shape cue, and a ripple and busy ring', page.includes('--vscode-editorError-foreground,var(--vscode-errorForeground)') && !page.includes('#f14c4c') && page.includes('stroke-dasharray:3 2') && page.includes('.rip .rp') && page.includes('.busy .br'));
check('page clears busy on reset and after a safety timeout, and has no external resources', page.includes('function reset(keepPills)') && page.includes('pend.clear()') && page.includes('600000') && !/https?:\/\//.test(page));
check('page shows static states with reduced motion', page.includes('.busy .br,.rip .rp,.pill{animation:none;}'));
check('page has a glowing pill per background kind (shell, agent), hidden until used', ['shell', 'agent'].every((k) => page.includes('class="pill" data-k="' + k + '"')) && page.includes('@keyframes pill') && page.includes("v.t === 'bg'"));
const { feed: bgFeed } = require('../../out/bgAgents');
const open = new Map();
bgFeed(open, '{"toolUseResult":{"backgroundTaskId":"b1"}}');
bgFeed(open, '{"toolUseResult":{"status":"async_launched","agentId":"a1"}}');
check('background launches are tracked by kind', open.get('b1') === 'shell' && open.get('a1') === 'agent');
bgFeed(open, '<task-notification><task-id>b1</task-id>');
check('a finish notice removes the task', !open.has('b1') && open.has('a1'));

// All-chats mode: palette, stable colours, tailed set, tagging, page support.
const { CHAT_PALETTE, ColorBook } = require(path.join(OUT, 'chatColors.js'));
const { tailIds, tagEvents } = require(path.join(OUT, 'activityFeed.js'));
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return Math.max(x, y) / Math.min(x, y); };
check('palette has 20 distinct hex colours', CHAT_PALETTE.length === 20 && new Set(CHAT_PALETTE).size === 20 && CHAT_PALETTE.every((c) => /^#[0-9a-f]{6}$/.test(c)));
check('every palette colour has contrast >= 3:1 on a dark and a white sidebar', CHAT_PALETTE.every((c) => ratio(c, '#1e1e1e') >= 3 && ratio(c, '#ffffff') >= 3));
let saved; const book = new ColorBook(undefined, (m) => { saved = m; });
const ids = Array.from({ length: 20 }, (_, i) => 'chat' + i), first = book.resolve(ids);
check('20 live chats get 20 different colours', new Set(first.values()).size === 20 && saved && Object.keys(saved).length === 20);
// Two windows, one shared store: each book's write is merged with what is stored, so neither overwrites the other's new assignments.
{
  let store; const sav = (m) => { store = { ...m }; }, ld = () => store;
  const w1 = new ColorBook(undefined, sav, Date.now, ld), w2 = new ColorBook(undefined, sav, Date.now, ld); // both opened on an empty store
  const c1 = w1.resolve(['a1']); // window 1 saves a1
  const c2 = w2.resolve(['b1']); // window 2 (stale memory) saves b1: a1 must survive in the store
  check('two windows: the second write keeps the other window entry', store && store.a1 !== undefined && store.b1 !== undefined);
  check('two windows: a newcomer avoids the color the other window already handed out', c1.get('a1') !== c2.get('b1'));
  // Same id, different index on each side: the stored index wins and the in-memory map adopts it.
  let st2 = { x: 7 }; const w3 = new ColorBook({ x: 2 }, (m) => { st2 = { ...m }; }, Date.now, () => st2);
  // A newcomer forces a real write, so the assertion on st2 checks the PERSISTED value (without a write it would pass vacuously).
  check('stored index wins for an id already saved (last persisted write wins)', w3.resolve(['x', 'newcomer']).get('x') === CHAT_PALETTE[7] && st2.x === 7 && st2.newcomer !== undefined);
  // Without load nothing changes: the book writes only its own map (backward compatible).
  let st3; const w4 = new ColorBook(undefined, (m) => { st3 = m; }); w4.resolve(['solo']);
  check('without load the book persists exactly its own map', Object.keys(st3).join() === 'solo');
  // A damaged stored value is ignored rather than thrown on.
  check('a damaged stored value is ignored', new ColorBook(undefined, () => {}, Date.now, () => 'junk').resolve(['z']).size === 1);
  // The cap still holds after a merge: a store full of other-window entries is trimmed to 500 on write, live chats kept.
  const bigStore = {}; for (let i = 0; i < 600; i++) { bigStore['o' + i] = i % 20; }
  let st4; const w5 = new ColorBook(undefined, (m) => { st4 = m; }, Date.now, () => bigStore); w5.resolve(['live1']);
  check('the 500 cap holds after a merge and keeps the live chat', Object.keys(st4).length === 500 && st4.live1 !== undefined);
  // Two windows at the cap with stable live sets must settle: no write on every refresh, and each window's newest entry survives.
  {
    const cap0 = {}; for (let i = 0; i < 500; i++) { cap0['f' + i] = i % 20; }
    let store = { ...cap0 }, writes = 0; const sav = (m) => { store = { ...m }; writes++; }, ld = () => store;
    const wa = new ColorBook(store, sav, Date.now, ld), wb = new ColorBook(store, sav, Date.now, ld);
    wa.resolve(['A1']); wb.resolve(['B1']); // each window adds its own newcomer at the cap
    for (let i = 0; i < 3; i++) { wa.resolve(['A1']); wb.resolve(['B1']); } // let the merge settle
    const settled = writes;
    for (let i = 0; i < 10; i++) { wa.resolve(['A1']); wb.resolve(['B1']); }
    check('two windows at the cap: no persist thrash with stable live sets', writes === settled);
    check('two windows at the cap: both newest entries remain and the cap holds', store.A1 !== undefined && store.B1 !== undefined && Object.keys(store).length === 500);
  }
}
const reloaded = new ColorBook(saved, () => { throw new Error('nothing changed, nothing to save'); });
check('colours are stable across a reload and a smaller live set', [...reloaded.resolve(['chat7', 'chat3']).entries()].every(([id, c]) => first.get(id) === c));
const again = new ColorBook(saved, () => {}), mixed = again.resolve(['chat1', 'chat5', ...Array.from({ length: 10 }, (_, i) => 'new' + i)]);
check('after a reload, up to 20 live chats (old and new) never share a colour', new Set(mixed.values()).size === 12 && mixed.get('chat1') === first.get('chat1') && mixed.get('chat5') === first.get('chat5'));
check('a chat beyond 20 still gets a colour', new ColorBook(undefined, () => {}).resolve(Array.from({ length: 25 }, (_, i) => 'c' + i)).size === 25);
check('a damaged saved map is ignored', new ColorBook({ a: 99, b: 'x', c: 2 }, () => {}).resolve(['a', 'b', 'c']).get('c') === CHAT_PALETTE[2]);
const mix = new ColorBook({ old: 5 }, () => {}).resolve(['new', 'old']);
check('a new chat never takes a colour a live established chat holds', mix.get('old') === CHAT_PALETTE[5] && mix.get('new') !== CHAT_PALETTE[5]);
// A saved colour is permanent: a clash shows a temporary colour only, the saved entry is never overwritten.
let clashSaves = 0;
const clash = new ColorBook({ A: 0, B: 0 }, () => { clashSaves++; });
const c1 = clash.resolve(['A', 'B']);
check('a clashing returning chat shows another colour and nothing is saved', c1.get('A') === CHAT_PALETTE[0] && c1.get('B') !== CHAT_PALETTE[0] && clashSaves === 0);
const c2 = clash.resolve(['B']);
check('once the holder is gone the clash loser gets its saved colour back', c2.get('B') === CHAT_PALETTE[0] && clashSaves === 0);
let lastSaved; const grow = new ColorBook({ A: 0, B: 0 }, (m) => { lastSaved = m; });
grow.resolve(['A', 'B', 'N']);
check('a clash never rewrites the saved entry, a new chat is saved', lastSaved && lastSaved.B === 0 && lastSaved.A === 0 && typeof lastSaved.N === 'number');
// Cap: oldest non-live entries are evicted, live chats never are.
const big = {}; for (let i = 0; i < 500; i++) { big['o' + i] = i % 20; }
let capSaved; const cap = new ColorBook(big, (m) => { capSaved = m; });
cap.resolve(['o0', 'fresh']);
check('over the cap the oldest non-live entry goes, a live old chat stays', capSaved && Object.keys(capSaved).length === 500 && capSaved.o0 !== undefined && capSaved.o1 === undefined && capSaved.fresh !== undefined);
// Review fixes: reserved colours, caller-order independence, dormant avoidance, recency bump.
const rsv = new ColorBook({ A: 0, B: 0, C: 1 }, () => {}).resolve(['A', 'B', 'C']);
check("a clash loser never takes a later established chat's own colour", rsv.get('C') === CHAT_PALETTE[1] && rsv.get('B') !== CHAT_PALETTE[0] && rsv.get('B') !== CHAT_PALETTE[1]);
const o1 = new ColorBook({ A: 0, B: 0, C: 1 }, () => {}).resolve(['A', 'B', 'C', 'N1', 'N2']), o2 = new ColorBook({ A: 0, B: 0, C: 1 }, () => {}).resolve(['N2', 'C', 'N1', 'B', 'A']);
check('resolve gives the same map whatever order the caller lists the chats in', eq([...o1].sort(), [...o2].sort()) && o1.size === 5 && o1.get('A') === CHAT_PALETTE[0]);
const dorm = new ColorBook({ D1: 0, D2: 1, D3: 2 }, () => {}).resolve(['fresh']);
check('a new chat avoids a colour a dormant saved chat owns while a free one exists', ![0, 1, 2].some((i) => dorm.get('fresh') === CHAT_PALETTE[i]));
// Recency: a frequently-live old chat survives the cap; throttled persist uses the injected clock.
let clock = 0; const bigR = {}; for (let i = 0; i < 500; i++) { bigR['o' + i] = i % 20; }
let rSaved, rWrites = 0; const rec = new ColorBook(bigR, (m) => { rSaved = m; rWrites++; }, () => clock);
rec.resolve(['o0']);
check('a live chat refresh alone does not write inside the throttle window', rWrites === 0);
clock = 11 * 60 * 1000; rec.resolve(['o0']);
check('after the throttle window the recency bump is written', rWrites === 1 && Object.keys(rSaved).pop() === 'o0');
rec.resolve(['o0', 'fresh2']);
check('with the bump, the cap evicts the oldest non-live chat, not the old chat that is often live', rSaved.o0 !== undefined && rSaved.o1 === undefined && rSaved.fresh2 !== undefined && Object.keys(rSaved).length === 500);
check('tailed chats: current first, capped, no blanks or repeats', eq(tailIds('b', ['a', 'b', 'c', '']), ['b', 'a', 'c']) && tailIds('', Array.from({ length: 20 }, (_, i) => 'x' + i)).length === 8);
const tagged = tagEvents([{ t: 'flash', g: 'files' }, { t: 'caption', text: 'x' }, { t: 'busy', id: '1', g: 'files' }, { t: 'sub', g: 'web' }, { t: 'bg', shell: 1, agent: 0 }], 'c1', '#f51b50', false);
check('another chat keeps flashes, sub flashes and pills only, tagged with its colour', eq(tagged.map((e) => e.t), ['flash', 'sub', 'bg']) && tagged.every((e) => e.ch === 'c1' && e.col === '#f51b50' && e.cur === false));
check('the current chat keeps every event', tagEvents([{ t: 'caption', text: 'x' }, { t: 'wait', g: 'think' }], 'c1', '#f51b50', true).length === 2);
check('page glows per chat colour and keeps pills and last group per chat', page.includes("style.setProperty('--hl', col)") && page.includes('const bgBy = new Map()') && page.includes('const lastOf = new Map()') && page.includes('function drawPills()'));
const pk = require(path.join(ROOT, 'package.json')).contributes;
check('allChats setting is a boolean on by default, with a toggled command titled without "Show"', pk.configuration.properties['saropaChats.activity.allChats'].default === true && pk.commands.some((c) => c.command === 'saropaChats.activityAllChats' && c.toggled === 'saropaChats.activityAll' && c.title === 'All Chats'));
// The Activity settings live on the section's own header, not in the whole view's ... menu (where they read as settings of the entire panel).
const ACT_CMDS = ['saropaChats.activityRefreshSpeed', 'saropaChats.activityFadeSpeed', 'saropaChats.activityAllChats', 'saropaChats.activityBrowser'];
check('no Activity item is in the view ... menu (view/title)', !pk.menus['view/title'].some((m) => ACT_CMDS.includes(m.command)));
// The section header: the gear is a sibling of the collapse button (a nested button would also collapse the section), and the popover
// holds the speed radios built from SPEED_CHOICES, a real All chats checkbox (no "Show" wording) and an Open in browser button.
const { ACT_HTML } = require(path.join(OUT, 'webviewActivity.js'));
const { SPEED_CHOICES } = require(path.join(OUT, 'activityFeed.js'));
check('Activity header has a settings button beside (not inside) the collapse button', /<div id="acthr"><button type="button" id="acth"[^]*?Activity<\/button><div class="pw"><button type="button" id="acts"[^>]*aria-haspopup="true"[^>]*aria-expanded="false"[^>]*aria-controls="actm"/.test(ACT_HTML));
check('Activity settings popover has the All chats checkbox, no "Show" wording', ACT_HTML.includes('<input type="checkbox" id="actall"><span>All chats') && !/>\s*Show\b/.test(ACT_HTML));
check('Activity settings popover has Open in browser as a button', /<button type="button" class="acto" id="actbr"[^>]*>Open in browser<\/button>/.test(ACT_HTML));
check('speed radios carry the SPEED_CHOICES values in order', ['refreshMs', 'fadeMs'].every((k, j) => SPEED_CHOICES[k].every((ms, i) => ACT_HTML.includes(`id="${['actr', 'actf'][j]}${i}" value="${ms}"`))));
// Single source: the speed numbers are not repeated in the host module.
check('activity.ts keeps no copy of the speed values', !/1000,\s*250,\s*100|8000,\s*4000,\s*2000/.test(fs.readFileSync(path.join(ROOT, 'src', 'activity.ts'), 'utf8')));
// Title generation: the sparkle left the view title bar for the Session Manager header menu; the row context menu generates one session's title.
check('regenTitles is not in view/title (it moved to the Session Manager menu), but stays registered and in the palette', !pk.menus['view/title'].some((m) => m.command === 'saropaChats.regenTitles') && pk.commands.some((c) => c.command === 'saropaChats.regenTitles') && !(pk.menus.commandPalette || []).some((m) => m.command === 'saropaChats.regenTitles' && m.when === 'false'));
check('bulk command is titled Generate (no "Regenerate"), id unchanged', pk.commands.find((c) => c.command === 'saropaChats.regenTitles').title === 'Saropa Chats: Generate Session Titles' && !JSON.stringify(pk).includes('Regenerate'));
const { SM_MENU_HTML } = require(path.join(OUT, 'webviewSm.js'));
const sidebarHtml = require(path.join(OUT, 'webview.js')).html();
check('Session Manager has a menu button beside (not inside) the collapse button', /<div id="smhr"><button type="button" id="smh"[^]*?Session Manager<\/button><div class="pw"><button type="button" id="smm"[^>]*aria-haspopup="true"[^>]*aria-expanded="false"[^>]*aria-controls="smmm"/.test(sidebarHtml));
check('Session Manager menu item reads "Generate session titles"', /<button type="button" class="acto" id="smgen"[^>]*>Generate session titles<\/button>/.test(SM_MENU_HTML) && !/Regenerate/.test(sidebarHtml));
// Keep warm toggle in the Session Manager menu: checkable item, host flips the setting and mirrors its state back.
check('Session Manager menu has a checkable Keep Claude sessions warm item (menuitemcheckbox, aria-checked, check mark)', /<button type="button" class="acto" id="smkw" role="menuitemcheckbox" aria-checked="false"[^>]*><span class="smck"[^>]*>[^<]*<\/span>Keep Claude sessions warm<\/button>/.test(SM_MENU_HTML) && require(path.join(OUT, 'webviewSm.js')).SM_CSS.includes('#smkw[aria-checked=true] .smck'));
const smJs = require(path.join(OUT, 'webviewSm.js'));
check('menu item posts the shared message and follows the host reply', SM_MENU_HTML !== undefined && smJs.SM_MENU_JS.includes("type: '" + smJs.SM_KEEPWARM_MSG + "'") && smJs.SM_MENU_JS.includes("d.type !== '" + smJs.SM_PREFS_MSG + "'") && smJs.SM_MENU_JS.includes("setAttribute('aria-checked'"));
// Menu command items: one key per item, host whitelist from the same table, grouped by separators.
const smKeys = smJs.SM_CMD_ITEMS.filter(Boolean);
const wantCmds = { build: 'saropaChats.buildDigests', export: 'saropaChats.exportDigests', timeline: 'saropaChats.showDecisionsTimeline', tiny: 'saropaChats.archiveTiny', usage: 'saropaChats.usageSummary', editor: 'saropaChats.openResultsInEditor' };
check('menu lists the six commands with their ids, each a registered command', Object.entries(wantCmds).every(([k, c]) => smKeys.some((i) => i.key === k && i.cmd === c) && pk.commands.some((x) => x.command === c)) && smKeys.length === 6);
check('each command item has a button with its key, and groups are separated (3 dividers incl. before Keep warm)', smKeys.every((i) => SM_MENU_HTML.includes('data-key="' + i.key + '"')) && (SM_MENU_HTML.match(/role="separator"/g) || []).length === 3 && SM_MENU_HTML.indexOf('id="smkw"') > SM_MENU_HTML.lastIndexOf('role="separator"'));
check('page posts only the key (no command id)', smJs.SM_MENU_JS.includes("type: '" + smJs.SM_CMD_MSG + "', key:") && !smJs.SM_MENU_JS.includes('saropaChats.'));
const extSm = fs.readFileSync(path.join(OUT, 'extension.js'), 'utf8');
check('host runs only the command SM_CMD_ITEMS lists for the key', /m\.type === webviewSm_1\.SM_CMD_MSG\)\s*\{[^}]*SM_CMD_ITEMS\.find\(\(i\) => i !== null && i\.key === m\.key\)[^}]*executeCommand\(it\.cmd\)/.test(extSm));
const smPrefsSrc = fs.readFileSync(path.join(OUT, 'smPrefs.js'), 'utf8');
check('host flips saropaChats keepWarm.enabled at Global scope, with an error on failure', /\.update\(REL_KEY, !\(0, exports\.keepWarmOn\)\(\), vscode\.ConfigurationTarget\.Global\)/.test(smPrefsSrc) && smPrefsSrc.includes('KEEP_WARM_KEY') && smPrefsSrc.includes('showErrorMessage'));
const extJs = fs.readFileSync(path.join(OUT, 'extension.js'), 'utf8');
check('host routes the message, sends state on ready and on any keepWarm setting change', /m\.type === webviewSm_1\.SM_KEEPWARM_MSG\)\s*\{\s*await \(0, smPrefs_1\.toggleKeepWarm\)/.test(extJs) && /m\.type === 'ready'\)\s*\{[^}]*postSmPrefs/.test(extJs) && /affectsConfiguration\(keepWarmSettings_1\.KEEP_WARM_KEY\)\)\s*\{\s*provider\.postSmPrefs/.test(extJs));
const gt = pk.commands.find((c) => c.command === 'saropaChats.generateTitle');
check('Generate Title is a row context item, hidden from the palette', !!gt && gt.title === 'Generate Title' && pk.menus['webview/context'].some((m) => m.command === 'saropaChats.generateTitle' && m.when === "webviewId == 'saropaChats.view' && webviewSection == 'chat'") && pk.menus.commandPalette.some((m) => m.command === 'saropaChats.generateTitle' && m.when === 'false'));
const ext = fs.readFileSync(path.join(OUT, 'extension.js'), 'utf8');
check('host handles smRegen by running regenTitles, and registers generateTitle with a session-id guard', ext.includes("m.type === 'smRegen'") && /smRegen[^]*?executeCommand\('saropaChats\.regenTitles'\)/.test(ext) && /registerCommand\('saropaChats\.generateTitle',[^]*?isSessionId[^]*?generateTitleFor/.test(ext));
// Generate Title must skip a chat the live watcher reports open anywhere (another tab or window), not only this window's current chat: pickFiles alone misses an idle chat open elsewhere.
check('Generate Title consults the live watcher (RegenDeps.liveIds wired from the watcher, and generateTitleFor skips on it)', /liveIds: \(\) => provider\.watcher\?\.liveIds \?\? \[\], refresh:/.test(ext) && /\(d\.liveIds\?\.\(\) \?\? \[\]\)\.includes\(id\)/.test(fs.readFileSync(path.join(OUT, 'regenTitlesRun.js'), 'utf8')));
check('host handles the popover messages (actSet, actBrowser) and sends prefs on ready', ext.includes("m.type === 'actSet'") && ext.includes("m.type === 'actBrowser'") && /m\.type === 'ready'\) \{[^}]*prefs/.test(ext));
const css = require(path.join(OUT, 'webviewCss.js')).CSS;
check('session list CSS has one colour class per palette entry and the row bar', CHAT_PALETTE.every((c, i) => css.includes('.cc' + i + '{--cc:' + c + '}')) && css.includes('.r.cc>.rh{box-shadow:inset 3px 0 0 var(--cc)}'));

const fast = activityHtml(2000);
check('fade value reaches the page: CSS custom property, animations and timer', page.includes(':root{--fade:4000ms;}') && fast.includes(':root{--fade:2000ms;}') && fast.includes('let fade = 2000;') && fast.includes('calm.matches ? 600 : fade') && page.includes('animation:glow var(--fade)') && !/animation:[a-z]+ 4s/.test(page));
check('page applies a fade change without reload', page.includes("m.type === 'fade'") && page.includes("setProperty('--fade'"));
check('fadeMsOf clamps to 1000..10000, else 4000', fadeMsOf(500) === 1000 && fadeMsOf(99999) === 10000 && fadeMsOf(8000) === 8000 && fadeMsOf('x') === 4000 && fadeMsOf(undefined) === 4000 && fadeMsOf(NaN) === 4000);
check('sheen is delicate and hidden while a node is lit', page.includes('.hot .sh,.hold .sh{opacity:0;}') && /#sheen stop:nth-child\(1\)\{stop-opacity:\.0\d;\}/.test(page) && /\.vscode-light #sheen stop:nth-child\(1\)\{stop-opacity:\.[0-3];\}/.test(page));

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
const prop = require(path.join(ROOT, 'package.json')).contributes.configuration.properties['saropaChats.activity.refreshMs'];
check('refreshMs setting has default 250, min 100, max 2000', !!prop && prop.default === 250 && prop.minimum === 100 && prop.maximum === 2000);
const { refreshMsOf } = require(path.join(OUT, 'activityFeed.js'));
check('refreshMs clamps and defaults', refreshMsOf(undefined) === 250 && refreshMsOf(5) === 100 && refreshMsOf(99999) === 2000 && refreshMsOf(500) === 500 && refreshMsOf('x') === 250);

// Idle caption: followed chat, its state and the other busy chats (activityIdle.js), and the page script's handling of it.
const { idleText, othersWorking } = require(path.join(OUT, 'activityIdle.js'));
const D = (s, also) => (also ? { s, also } : { s }); // a dot as liveState.dotState builds it
check('idle: waiting chat reads "waiting for you"', idleText({ title: 'your look scroll fade', dot: D('waiting'), others: 0 }) === 'your look scroll fade — waiting for you');
check('idle: other busy chats are counted, singular and plural', idleText({ title: 'a', dot: D('waiting'), others: 1 }) === 'a — waiting for you · 1 other chat working' && idleText({ title: 'a', dot: D('running'), others: 2 }) === 'a — working · 2 other chats working' && idleText({ title: '', dot: undefined, others: 1 }) === '1 other chat working' && idleText({ title: '', dot: undefined, others: 5 }) === '5 other chats working');
check('idle: no dot or unknown state reads idle; no title gives only the hint or nothing', idleText({ title: 'a', dot: undefined, others: 0 }) === 'a — idle' && idleText({ title: 'a', dot: D('zzz'), others: 0 }) === 'a — idle' && idleText({ title: '', dot: undefined, others: 3 }) === '3 other chats working' && idleText({ title: '', dot: undefined, others: 0 }) === '');
check('idle: background hidden in also is named behind waiting and idle, not doubled behind running or background', idleText({ title: 'a', dot: D('waiting', ['background']), others: 0 }) === 'a — waiting for you · background tasks running' && idleText({ title: 'a', dot: D('unread', ['background']), others: 0 }) === 'a — idle · background tasks running' && idleText({ title: 'a', dot: D('running', ['background']), others: 0 }) === 'a — working' && idleText({ title: 'a', dot: D('background'), others: 0 }) === 'a — background tasks running');
check('idle: long titles are cut', idleText({ title: 'x'.repeat(100), dot: D('idle'), others: 0 }).startsWith('x'.repeat(59) + '… —'));
const smile = '\u{1F600}';
check('idle: titles are cut by code points, never inside an emoji', idleText({ title: smile.repeat(100), dot: D('idle'), others: 0 }) === smile.repeat(59) + '… — idle' && idleText({ title: smile.repeat(60), dot: D('idle'), others: 0 }) === smile.repeat(60) + ' — idle');
const wrapped = idleText({ title: 'a', dot: D('waiting', ['background']), others: 2 }, (m, ...args) => '~' + m.replace(/\{(\d+)\}/g, (x, k) => args[k]) + '~');
check('idle: every string goes through the translator', wrapped.includes('~waiting for you~') && wrapped.includes('~2 other chats working~') && wrapped.includes('background tasks running~'));
check('idle: only running and background chats other than the followed one count, in s or also', othersWorking({ a: D('running'), b: D('background'), c: D('waiting'), d: D('idle'), me: D('running'), e: D('waiting', ['background']), f: D('unread', ['background']), g: D('unread') }, 'me') === 4);
check('page script handles the idle message and keeps live captions first', activityHtml(4000).includes("m.type === 'idle'") && activityHtml(4000).includes('capText = text || idleText'));

// Malformed dots (the map crosses the watcher / IPC boundary): a missing dot, a missing or non-array `also`, non-string entries and unknown
// or non-string states read as idle / not working and never throw.
const { isWorking, pickBusiest, idleMsg, IdleGate, TitleCache, IDLE_STRINGS } = require(path.join(OUT, 'activityIdle.js'));
const noThrow = (f) => { try { return f(); } catch (e) { return 'threw: ' + e.message; } };
check('guard: isWorking tolerates missing, null and odd dots', [undefined, null, 0, 'running', {}, { s: 5 }, { s: 'zzz' }, { s: 'idle', also: 'background' }, { s: 'idle', also: [null, 3] }].every((d) => noThrow(() => isWorking(d)) === false));
check('guard: isWorking still reads background in also when s is unreadable', isWorking({ s: undefined, also: ['background'] }) === true && isWorking({ also: ['running'] }) === true);
check('guard: idleText reads malformed dots as idle', [undefined, null, {}, { s: 7 }, { s: 'zzz' }, { s: 'waiting', also: 'background' }].map((d) => noThrow(() => idleText({ title: 'a', dot: d, others: 0 }))).join('|') === 'a — idle|a — idle|a — idle|a — idle|a — idle|a — waiting for you');
check('guard: othersWorking tolerates a missing map and null dots', othersWorking(undefined, 'x') === 0 && othersWorking(null, 'x') === 0 && noThrow(() => othersWorking({ a: null, b: undefined, c: { s: 'running' } }, 'x')) === 1);

// Click-to-focus pick: running beats background (in s or also), then the most recent activity, then the id; never the followed chat.
check('pick: a running chat beats a background one even when older', pickBusiest({ a: D('background'), b: D('running') }, 'me', { a: 9, b: 1 }) === 'b');
check('pick: background hidden in also counts as background', pickBusiest({ a: D('waiting', ['background']), b: D('idle') }, 'me') === 'a');
check('pick: within a rank the most recently active wins', pickBusiest({ a: D('running'), b: D('running'), c: D('running') }, 'me', { a: 5, b: 50, c: 20 }) === 'b');
check('pick: ties fall back to the id; missing or odd recency counts as oldest', pickBusiest({ b: D('running'), a: D('running') }, 'me') === 'a' && pickBusiest({ a: D('running'), b: D('running') }, 'me', { a: 'x', b: 3 }) === 'b');
check('pick: the followed chat and non-working chats are never picked', pickBusiest({ me: D('running'), w: D('waiting'), u: D('unread') }, 'me') === '' && pickBusiest(undefined, 'me') === '' && pickBusiest({ me: D('running'), x: null }, 'me') === '');

// The idle message: a caption that names the followed chat is clickable (it opens that chat); with the busiest-other rule below.
const { clickTargetsSelf, clickKind, focusTarget, isWaiting, hasDot } = require(path.join(OUT, 'activityIdle.js'));
const opening = (t) => IDLE_STRINGS.opening.replace('{0}', t); // expected click-time text, built from the string table
check('idle message: a named chat with no other working opens itself (self label, click text names the chat)', eq(idleMsg({ title: 'a', dot: D('idle'), others: 0 }), { type: 'idle', text: 'a — idle', go: IDLE_STRINGS.focusSelf, looking: opening('a'), kind: 'self', waiting: false }));
check('idle message: others working and the followed chat not waiting keeps the busiest-other target', eq(idleMsg({ title: 'a', dot: D('idle'), others: 2 }), { type: 'idle', text: 'a — idle · 2 other chats working', go: IDLE_STRINGS.focusOther, looking: IDLE_STRINGS.looking, kind: 'other', waiting: false }));
check('idle message: a waiting followed chat wins over other working chats', idleMsg({ title: 'a', dot: D('waiting'), others: 2 }).kind === 'self' && idleMsg({ title: 'a', dot: D('waiting', ['background']), others: 2 }).go === IDLE_STRINGS.focusSelf);
check('idle message: no followed chat and no others stays plain; no followed chat with others targets the others', idleMsg({ title: '', dot: undefined, others: 0, followed: false }).go === '' && idleMsg({ title: '', dot: D('waiting'), others: 1, followed: false }).kind === 'other');
check('click target rule: self when waiting or nobody else works; other otherwise; malformed dots are not waiting', clickTargetsSelf(D('waiting'), 3) && clickTargetsSelf(D('idle'), 0) && !clickTargetsSelf(D('running'), 1) && !clickTargetsSelf(undefined, 1) && !clickTargetsSelf({ s: 5 }, 1));
// Regression (label vs host): an UNTITLED followed chat that waits, with others working, used to be labelled "busiest other" while the host opened itself.
const untitledWaiting = idleMsg({ title: '', dot: D('waiting'), others: 2, followed: true });
check('idle message: an untitled followed waiting chat is labelled self, with the untitled fallback in the click text', untitledWaiting.kind === 'self' && untitledWaiting.go === IDLE_STRINGS.focusSelf && untitledWaiting.looking === opening(IDLE_STRINGS.untitled));
// Host-level: the chat the host click opens (focusTarget, the pure decision activity.ts runs) must be the one the label promised, titled and untitled, self and other.
{
  const dots = { me: D('waiting'), a: D('running'), b: D('background') }, recency = { a: 1, b: 9 };
  for (const [name, info] of [['titled waiting', { title: 'T', dot: dots.me, others: 2, followed: true }], ['untitled waiting', { title: '', dot: dots.me, others: 2, followed: true }],
    ['titled idle, others', { title: 'T', dot: D('idle'), others: 2, followed: true }], ['untitled idle, others', { title: '', dot: D('idle'), others: 2, followed: true }],
    ['titled idle, no others', { title: 'T', dot: D('idle'), others: 0, followed: true }], ['untitled idle, no others', { title: '', dot: D('idle'), others: 0, followed: true }]]) {
    const m = idleMsg(info), want = m.kind === 'self' ? 'me' : 'a'; // 'a' is the running chat: running outranks b's background tasks
    check('host click matches the label promise: ' + name, focusTarget(m.kind, 'me', dots, recency) === want);
  }
  check('host click: kind other with nobody working opens nothing (the none-working note), never switches to self', focusTarget('other', 'me', { me: D('waiting') }) === '' && focusTarget('self', '', {}) === ''); // the no-kind case has its own check below
  // Older page (no kind in its actFocusOther message): resolves as 'other', the only click the old caption offered.
  check('actFocusOther without a kind resolves as other through focusTarget', focusTarget(undefined, 'me', dots, recency) === 'a' && focusTarget(null, 'me', dots, recency) === 'a' && focusTarget('zzz', 'me', dots, recency) === 'a');
  // Stale followed id: no dot means the chat is gone (closed tab, deleted); self then opens nothing and the host shows the none-working note.
  check('focusTarget self: an id with no dot (stale or deleted chat) opens nothing; one with a dot opens itself', focusTarget('self', 'gone', dots, recency) === '' && focusTarget('self', 'me', undefined) === '' && focusTarget('self', 'me', dots, recency) === 'me');
  // The page outline follows the dot: waiting is true only for a primary 'waiting' state.
  check('idle message: waiting flag follows the dot', idleMsg({ title: 'a', dot: D('waiting'), others: 0 }).waiting === true && idleMsg({ title: 'a', dot: D('idle', ['waiting']), others: 0 }).waiting === false && idleMsg({ title: '', dot: undefined, others: 0 }).waiting === undefined && isWaiting(D('waiting')) && !isWaiting({ s: 5 }));
  // One helper decides "has a dot" for the caption (followed) and the click (self), so they cannot disagree; odd inputs are not chats.
  check('hasDot: only an id that is a key of the dots map with a dot counts', hasDot(dots, 'me') && !hasDot(dots, 'gone') && !hasDot(dots, '') && !hasDot(undefined, 'me') && !hasDot({ me: null }, 'me') && !hasDot(dots, 'toString'));
  check('hasDot and the click agree: self opens exactly when hasDot says so', ['me', 'gone', ''].every((id) => (focusTarget('self', id, dots, recency) === id && id !== '') === hasDot(dots, id)));
  check('notOpen has its own translation-ready text, distinct from none-working', IDLE_STRINGS.notOpen.includes('{0}') && IDLE_STRINGS.notOpen !== IDLE_STRINGS.noneWorking);
  check('clickKind: no followed chat never targets self', clickKind(false, D('waiting'), 0) === '' && clickKind(true, D('running'), 0) === 'self' && clickKind(true, D('running'), 1) === 'other');
}
check('idle message: labels go through the translator', idleMsg({ title: '', dot: undefined, others: 1 }, (m) => '~' + m).go === '~' + IDLE_STRINGS.focusOther && idleMsg({ title: 'a', dot: D('idle'), others: 0 }, (m) => '~' + m).go === '~' + IDLE_STRINGS.focusSelf);
check('click-to-focus strings have no first-person voice', !Object.values(IDLE_STRINGS).some((v) => /\b(I|I'm|we|my|our|me)\b/.test(v)));

// Host ordering (IdleGate, used by registerActivity): idle() sends nothing while a chat switch is pending; poke() sends reset, then idle.
{
  const g = new IdleGate(), M = (text) => () => ({ type: 'idle', text, go: '', looking: '' });
  check('gate: first poke resets, then sends the idle caption', eq(g.poke('a', M('A'), true), [{ type: 'reset', keepPills: true }, { type: 'idle', text: 'A', go: '', looking: '' }]));
  check('gate: an unchanged caption is not re-sent', eq(g.poke('a', M('A'), true), []) && eq(g.idle('a', M('A')), []));
  check('gate: a changed caption for the shown chat is sent by idle()', eq(g.idle('a', M('A2')), [{ type: 'idle', text: 'A2', go: '', looking: '' }]));
  let built = 0;
  check('gate: idle() sends nothing (and builds nothing) while currentId differs from the shown chat', eq(g.idle('b', () => { built++; return M('B')(); }), []) && built === 0);
  check('gate: the next poke for the new chat sends reset first, then its caption', eq(g.poke('b', M('B'), false), [{ type: 'reset', keepPills: false }, { type: 'idle', text: 'B', go: '', looking: '' }]));
  check('gate: after reset the same text as before the switch is sent again', eq(g.poke('a', M('A2'), false).map((m) => m.type), ['reset', 'idle']));
  g.forget();
  check('gate: forget() makes the next poke reset and re-send', eq(g.poke('a', M('A2'), true).map((m) => m.type), ['reset', 'idle']));
}

// Title fallback (TitleCache): one lookup per id, cached; a miss retried only after retryMs; the arrival hook fires once per title.
// Async, so the promise is awaited by the final report below (its failures would otherwise land after the OK line).
const titleChecks = (async () => {
  let now = 1000, calls = 0; const arrived = [], answers = { a: 'Title A', b: undefined, c: 'boom' };
  const tc = new TitleCache(async (id) => { calls++; if (answers[id] === 'boom') { throw new Error('worker down'); } return answers[id]; }, (id) => arrived.push(id), 30000, () => now);
  const flush = () => new Promise((r) => setImmediate(r));
  check('titles: unknown id gives "" and starts a lookup', tc.get('a') === '' && calls === 1);
  check('titles: a lookup in flight is not repeated', tc.get('a') === '' && calls === 1);
  await flush();
  check('titles: the arrived title is cached and announced once', tc.get('a') === 'Title A' && eq(arrived, ['a']) && calls === 1);
  for (let i = 0; i < 20; i++) { tc.get('a'); }
  check('titles: repeated gets (one per poke) make no further lookups', calls === 1);
  tc.get('b'); tc.get('c'); await flush();
  check('titles: a miss or a failed lookup is not cached as a title and not announced', calls === 3 && eq(arrived, ['a']) && tc.get('b') === '' && tc.get('c') === '' && calls === 3);
  now += 30001; answers.b = 'Title B'; tc.get('b'); await flush();
  check('titles: a miss is retried after retryMs and then cached', calls === 4 && tc.get('b') === 'Title B' && eq(arrived, ['a', 'b']));
  check('titles: an empty id never looks anything up', tc.get('') === '' && calls === 4);

  // TTL: a hit older than ttlMs is still shown but refreshed once in the background; a changed title is announced, an unchanged one is not.
  let n2 = 0, now2 = 0; const said2 = [], idx = { a: 'Old' };
  const tc2 = new TitleCache(async (id) => { n2++; return idx[id]; }, (id) => said2.push(id), 30000, () => now2, 300000);
  tc2.get('a'); await flush();
  now2 = 299999; tc2.get('a');
  check('ttl: a fresh hit makes no lookup', n2 === 1 && tc2.get('a') === 'Old');
  now2 = 300000; idx.a = 'New';
  check('ttl: a stale hit is still returned while it refreshes', tc2.get('a') === 'Old' && n2 === 2);
  tc2.get('a');
  check('ttl: the refresh is not repeated while in flight', n2 === 2);
  await flush();
  check('ttl: the refreshed title replaces the old one and is announced', tc2.get('a') === 'New' && eq(said2, ['a', 'a']));
  now2 = 600000; tc2.get('a'); await flush();
  check('ttl: a refresh that finds the same title is not announced again', n2 === 3 && eq(said2, ['a', 'a']));
  idx.a = undefined; now2 = 900000; tc2.get('a'); await flush();
  check('ttl: a refresh that misses keeps the last good title', tc2.get('a') === 'New');

  // set: the auto-titler's rename is cached at once (no lookup); set(id, '') invalidates so the next get looks it up.
  const before = n2;
  tc2.set('a', 'Renamed');
  check('set: a rename shows at once without a lookup', tc2.get('a') === 'Renamed' && n2 === before);
  idx.a = 'From index'; tc2.set('a', '');
  check('set: an empty title invalidates the entry and the next get fetches', tc2.get('a') === '' && n2 === before + 1);
  await flush();
  check('set: the re-fetched title is cached', tc2.get('a') === 'From index');
  tc2.set('', 'x');
  check('set: an empty id is ignored', tc2.get('') === '');

  // prune: ids not kept are forgotten (titles and miss back-off), so the maps stay the size of the live chats.
  idx.b = 'B'; idx.c = undefined; tc2.get('b'); tc2.get('c'); await flush();
  tc2.prune(['b']);
  const n3 = n2;
  check('prune: a kept id keeps its title', tc2.get('b') === 'B' && n2 === n3);
  check('prune: a dropped id is looked up again when it comes back', tc2.get('a') === '' && n2 === n3 + 1);
  await flush();
  tc2.get('c');
  check('prune: a dropped miss back-off is forgotten too', n2 === n3 + 2);
  await flush();
  tc2.prune([]);
  check('prune: an empty keep list empties the cache', (tc2.got.size + tc2.missAt.size) === 0);
})();

// Click-to-focus page wiring: listeners in the script (no inline handlers), the section posts actFocusOther, the standalone page cannot.
{
  const { activitySection } = require(path.join(OUT, 'activityHtml.js'));
  const sec = activitySection(4000), standalone = activityHtml(4000);
  check('page: the caption click handler exists and posts actFocusOther in the section', sec.script.includes("cap.addEventListener('click', goOther)") && sec.script.includes("toHost({ type: 'actFocusOther', kind: idleKind })") && sec.script.includes('vs.postMessage'));
  check('page: the standalone and browser script has no host to post to', standalone.includes('const toHost = null;') && !/\son(click|keydown)=/.test(standalone));
  check('page: the clickable caption uses theme tokens only', sec.css.includes('#cap.go{cursor:pointer;color:var(--vscode-textLink-foreground)') && !/#cap\.(go|bad)[^}]*#[0-9a-fA-F]{3,6}/.test(sec.css));
}

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
    // Let the clock move past the coarse file-time resolution: without this the new file's birth time can land
    // just before the feed's first-look time, so it is judged "born before" and marked at its end (flaky on Windows).
    spin();
    fs.writeFileSync(hid, asst({ type: 'text' }) + '\n');
    check('missing log is not searched again within the gap', eq(await gs(slow, 'fff'), []));
    const t0 = Date.now(); while (Date.now() - t0 < 320) { /* wait out the gap */ }
    check('missing log is found after the gap (born after first look, so it replays)', eq(await gs(slow, 'fff'), ['chat']));
    fs.appendFileSync(hid, asst(tool('Bash')) + '\n');
    check('and then read on the fast path', eq(await gs(slow, 'fff'), ['terminal']));
    // Sub-agent logs: <chat id>/subagents/agent-*.jsonl next to the chat log.
    check('sub-agent Bash line is a terminal sub event', eq(subEventsOf(asst(tool('Bash'))), [{ t: 'sub', g: 'terminal' }]));
    check('sub-agent text and thinking are agents only', eq(subEventsOf(asst({ type: 'thinking' }, { type: 'text' })), [{ t: 'sub', g: 'agents' }, { t: 'sub', g: 'agents' }]));
    check('sub-agent lines carry no caption, busy or wait', eq(subEventsOf(asst(tool('Agent'), { type: 'text' }, tool('Read'))).map((e) => e.t), ['sub', 'sub', 'sub']));
    const sd = path.join(dir, 'aaa', 'subagents'), sf = path.join(sd, 'agent-1.jsonl');
    fs.mkdirSync(sd, { recursive: true }); fs.writeFileSync(sf, asst(tool('Bash')) + '\n');
    const sfeed = new ActivityFeed();
    await sfeed.check('aaa'); // marks the chat and the sub-agent log
    check('first sight of a sub-agent log replays nothing', eq(await sfeed.check('aaa'), []));
    fs.appendFileSync(sf, asst(tool('Bash')) + '\n');
    check('a new sub-agent Bash line is an agents-to-terminal event', eq((await sfeed.check('aaa')).filter((e) => e.t === 'sub'), [{ t: 'sub', g: 'terminal' }]));
    check('and it is not read twice', eq(await sfeed.check('aaa'), []));
    fs.appendFileSync(sf, asst(tool('Bash'), tool('Bash'), tool('Read')) + '\n');
    check('identical neighbouring sub events flash once', eq((await sfeed.check('aaa')).map((e) => e.g), ['terminal', 'files']));
    // A log idle for long is registered at first sight and resumes from its offset when it wakes.
    const sf2 = path.join(sd, 'agent-2.jsonl'); fs.writeFileSync(sf2, asst(tool('Read')) + '\n');
    const idleAt = new Date(Date.now() - 10 * 60 * 1000); fs.utimesSync(sf2, idleAt, idleAt);
    const sfeed2 = new ActivityFeed(2000, 0); await sfeed2.check('aaa');
    fs.appendFileSync(sf2, asst(tool('Bash')) + '\n');
    check('a woken idle log resumes from its offset, not from its start', eq((await sfeed2.check('aaa')).filter((e) => e.t === 'sub').map((e) => e.g), ['terminal']));
  } finally { os.homedir = realHome; fs.rmSync(home, { recursive: true, force: true }); }
  await titleChecks; // the TitleCache checks above run async; their results must be in before the verdict
  if (failures.length) { console.error('check_activity FAILED (' + failures.length + ')'); failures.forEach((e) => console.error('  - ' + e)); process.exit(1); }
  console.log('check_activity OK: tool and log mapping, memory reads, page nodes, no replay');
})();
