// Fails the build when chat digests break their promises. Drives out/digest.js, out/digestAi.js, out/digestMd.js,
// out/digestStore.js, out/digestBuild.js, out/query.js, out/match.js and out/search.js with a fixture chat file
// (scripts/checks/fixtures/digest/chat.jsonl) and a stub AI runner: claude is never started.
// Covers exact-part extraction (files, references, dialog answers), staleness, the size-cap trim order,
// slug and file name, digest: query parsing, the bloom gate (a digest-only hit survives it), the build round trip
// and the panel's Digest section.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHarness } = require('./webview_harness');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', '..', 'out');
const dg = require(path.join(OUT, 'digest.js'));
const ai = require(path.join(OUT, 'digestAi.js'));
const md = require(path.join(OUT, 'digestMd.js'));
const store = require(path.join(OUT, 'digestStore.js'));
const { DigestBuilder, scanChatFile } = require(path.join(OUT, 'digestBuild.js'));
const { parseQuery, compile } = require(path.join(OUT, 'query.js'));
const { matchChat } = require(path.join(OUT, 'match.js'));
const { searchIndex } = require(path.join(OUT, 'search.js'));
const { parseFile } = require(path.join(OUT, 'parse.js'));
const { encodeRec, decodeRec } = require(path.join(OUT, 'blob.js'));
const { buildBloom } = require(path.join(OUT, 'bloom.js'));

const FIX = path.join(__dirname, 'fixtures', 'digest', 'chat.jsonl');
const ID = '11111111-2222-4333-8444-555555555555';
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const OPTS = { all: true, cs: false, ww: false, re: false, any: false, when: 'any', subs: true, last: 0, from: 'both' };

/** A record built the way the index builds it: parse the file, encode, decode. */
async function recOf(file) {
  const p = await parseFile(file, 1, 20000);
  return { p, rec: decodeRec(encodeRec(p)) };
}

function refsTests() {
  const css = dg.extractRefs(['p { color: #333; background:#000000; border: 1px solid #123 } .a{fill: #000} PR #42 and #7, see https://github.com/o/r/pull/9']);
  check('refs: CSS hex colors are not PR numbers (' + JSON.stringify(css) + ')', !css.includes('#333') && !css.includes('#000000') && !css.includes('#123') && !css.includes('#000') && css.includes('#42') && css.includes('#7') && css.includes('https://github.com/o/r/pull/9'));
  const r = dg.extractRefs([
    'See https://github.com/o/r/pull/7, then fix. Commit a1b2c3d and 3028413a61aa; not deadbeef or 1234567.',
    'Session 07edf7b3-0b92-4f5e-921e-4d3781769fae and color #ff00aa are not refs. PR #42 and &#39; entity.',
    'Plans: plans/PLAN_chat_digests.md and D:\\src\\docs\\guide.md; https://github.com/o/r/pull/7 again.',
  ]);
  check('refs: URL with trailing comma cut, kept once', r.filter((x) => x === 'https://github.com/o/r/pull/7').length === 1);
  check('refs: mixed hex runs are commit hashes', r.includes('a1b2c3d') && r.includes('3028413a61aa'));
  check('refs: plain words, plain numbers, UUID pieces and colors are not hashes (' + r.join(' ') + ')', !r.includes('deadbeef') && !r.includes('1234567') && !r.some((x) => x.startsWith('07edf7b3')) && !r.includes('ff00aa'));
  check('refs: PR number, not an HTML entity', r.includes('#42') && !r.includes('#39'));
  check('refs: Markdown paths in both slash styles', r.includes('plans/PLAN_chat_digests.md') && r.includes('D:\\src\\docs\\guide.md'));
  check('refs: first-appearance order', r.indexOf('https://github.com/o/r/pull/7') < r.indexOf('a1b2c3d') && r.indexOf('a1b2c3d') < r.indexOf('#42'));
  check('refs: cap stops the list', dg.extractRefs(['#1 #2 #3 #4'], 2).length === 2);
}

async function fileTests() {
  const s = await scanChatFile(FIX);
  const qs = s.dialogs.map((d) => d.q + '=' + d.a);
  check('dialog: structured answers from toolUseResult (' + qs.join(' / ') + ')', qs.includes('Which billing period?=Monthly (Recommended)') && qs.includes('Show a free tier?=Yes'));
  check('dialog: text fallback when the row has no toolUseResult', qs.includes('Which accent color?=Blue'));
  check('dialog: a rejected dialog adds no decision', s.dialogs.length === 3 && !qs.some((x) => x.startsWith('Delete the old page?')));
  check('dialog: options and line kept', eq(s.dialogs[0].opts, ['Monthly (Recommended)', 'Yearly']) && s.dialogs[0].line === 3 && s.dialogs[0].src === 'dialog');
  check('compaction row line found', s.compact.has(8) && s.compact.size === 1);
  check('ended without a close: last counted row is a tool call (the meta row after it does not count)', s.noClose === true);
  const end = (stop) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }], stop_reason: stop } });
  check('clean end: a finished agent reply closes the chat', dg.finishFile(dg.newFileAcc(), [end('tool_use'), end('end_turn')]).noClose === false);
  check('no message rows: not marked as cut off', dg.finishFile(dg.newFileAcc(), ['{"type":"summary"}']).noClose === false);
  const t = dg.answersFromText('Your questions have been answered: "A?"="x, y", "B?"="z". You can now continue.');
  check('text fallback parses several pairs', t.get('A?') === 'x, y' && t.get('B?') === 'z');
}

function staleTests() {
  const d = { size: 10, mtime: 5 };
  check('stale: same size and mtime is fresh', dg.digestStale(d, { size: 10, mtime: 5 }) === false);
  check('stale: size or mtime differ', dg.digestStale(d, { size: 11, mtime: 5 }) && dg.digestStale(d, { size: 10, mtime: 6 }));
  const now = 100 * 60000;
  check('auto: waits 10 minutes of quiet and skips busy chats', !dg.autoDue(now - 9 * 60000, now, false) && dg.autoDue(now - 11 * 60000, now, false) && !dg.autoDue(now - 11 * 60000, now, true));
}

function base(extra) {
  return Object.assign({ v: 1, id: ID, dir: '-w-shop', title: 'T', size: 1, mtime: 1, built: 1, first: 1, last: 1, folder: '/w/shop', decisions: [], files: [], refs: [], ai: 'ok' }, extra || {});
}

function capTests() {
  const big = (c) => c.repeat(3000);
  const files = Array.from({ length: 800 }, (_, i) => ({ path: '/w/shop/src/file' + i + '.ts', edited: i % 2 === 0 }));
  const d = base({
    goal: big('g'), open: [big('o'), big('p')], refs: Array.from({ length: 10 }, (_, i) => 'https://example.com/' + i + big('r').slice(0, 900)),
    decisions: [{ src: 'dialog', q: 'Q', a: big('d'), line: 1 }, { src: 'message', a: big('m'), i: 3, line: 5 }, { src: 'message', a: big('n'), i: 4, line: 6 }], files,
  });
  const size = (x) => Buffer.byteLength(JSON.stringify(Object.assign({}, x, { files: [] })));
  const full = size(d);
  // Cap just below the full size: only Left open loses an item.
  let c = dg.capDigest(d, full - 100);
  check('cap: Left open goes first', eq(c.capTrimmed, ['open']) && c.open.length === 1 && c.goal && c.decisions.length === 3);
  check('cap: Files changed stays complete and is not counted', c.files.length === 800 && Buffer.byteLength(JSON.stringify(c)) > full - 100);
  // Cap that needs Left open, Goal and one message decision gone.
  // The cap is the size with Left open, Goal and the last message decision gone, plus slack for the capTrimmed note (far less than one more item).
  const want = size(Object.assign({}, d, { open: undefined, goal: undefined, decisions: d.decisions.slice(0, 2) })) + 200;
  c = dg.capDigest(d, want);
  check('cap: then Goal, then Message decisions (' + JSON.stringify(c.capTrimmed) + ')', eq(c.capTrimmed, ['open', 'goal', 'message decisions']) && !c.open && c.goal === undefined && c.decisions.filter((x) => x.src === 'message').length === 1);
  check('cap: the last message decision goes before the first', c.decisions.some((x) => x.i === 3) && !c.decisions.some((x) => x.i === 4));
  // A tiny cap: References before Dialog decisions, and everything but the files can go.
  c = dg.capDigest(d, 1000);
  check('cap: References before Dialog decisions (' + JSON.stringify(c.capTrimmed) + ')', eq(c.capTrimmed, ['open', 'goal', 'message decisions', 'references', 'dialog decisions']) && c.refs.length === 0 && c.decisions.length === 0 && c.files.length === 800);
  c = dg.capDigest(d, 1e9);
  check('cap: under the cap nothing changes', c.capTrimmed === undefined && eq(c, d));
  check('cap: the input is not changed', d.open.length === 2 && d.decisions.length === 3 && d.refs.length === 10);
}

function nameTests() {
  check('slug: lowercase, runs to one dash, trimmed', md.slugOf('🐛 Fix  the Login-Bug!!') === 'fix-the-login-bug');
  check('slug: empty is untitled', md.slugOf('🎉🎉') === 'untitled' && md.slugOf('') === 'untitled');
  const long = md.slugOf('a'.repeat(59) + ' bc');
  check('slug: at most 60 characters, no trailing dash', long.length <= 60 && !long.endsWith('-') && long === 'a'.repeat(59));
  const first = new Date(2026, 9, 5, 12, 0, 0).getTime();
  check('file name: date, slug and first 8 chars of the id', md.digestFileName({ first, title: 'Pricing page', id: ID }) === '2026-10-05_pricing-page_11111111.md');
  check('project: the start folder wins over the project dir', md.inProject({ start: '/w/shop', dir: '-w-other' }, '/w/shop') && !md.inProject({ start: '/w/other', dir: '-w-shop' }, '/w/shop'));
  check('project: no start folder falls back to the project dir', md.inProject({ dir: '-w-shop' }, '/w/shop'));
}

function queryTests() {
  const q = parseQuery('pricing digest:"free tier" from:you');
  check('digest: token parsed, value lowercased, plain text kept', eq(q.tokens, [{ kind: 'digest', value: 'free tier' }]) && q.plain === 'pricing' && q.from === 'you');
  check('digest: bare value', eq(parseQuery('digest:Stripe').tokens, [{ kind: 'digest', value: 'stripe' }]));
  const c = compile('digest:stripe', OPTS);
  check('digest: value adds no bloom grams (the bloom holds chat text only)', c.grams.length === 0 && c.terms.length === 0);
}

function chatOf(text, extra) {
  return Object.assign({ id: ID, dir: '-w-shop', title: 'Pricing', mtime: 1, size: 1, last: Date.now(), first: 1, count: 1, files: [], rec: 'r', len: 1, bloom: buildBloom(text.toLowerCase()) }, extra || {});
}
const recFrom = (texts, roles) => decodeRec(encodeRec({ texts, ts: texts.map(() => Date.now()), roles: roles || texts.map(() => 0), lines: texts.map((_, i) => i + 1), cmds: [], cmdAt: [] }));

function gateTests() {
  const text = 'we talked about colors only';
  const c = chatOf(text), rec = recFrom([text]);
  const lines = dg.digestLines(base({ goal: 'Launch the Stripe checkout', decisions: [{ src: 'dialog', q: 'Billing?', a: 'Monthly', line: 3 }] }));
  const ctx = { pins: new Set(), tags: {} };
  let loads = 0;
  const load = () => { loads++; return rec; };
  const cmp = compile('stripe checkout', OPTS);
  check('gate: the bloom rejects the chat text alone', matchChat(c, cmp, ctx, ID, load, Date.now()) === null);
  const h = matchChat(c, cmp, ctx, ID, load, Date.now(), undefined, lines);
  check('gate: a digest-only hit survives the bloom gate, without reading the record', !!h && h.dig === true && h.at === 0 && h.mc === 0 && h.snippet.includes('Stripe checkout') && loads === 0);
  const mixed = matchChat(c, compile('colors', OPTS), ctx, ID, load, Date.now(), undefined, lines);
  check('gate: a message hit keeps its message snippet', !!mixed && !mixed.dig && mixed.snippet.includes('colors'));
  const any = Object.assign({}, OPTS, { any: true });
  const both = matchChat(c, compile('colors stripe', any), ctx, ID, load, Date.now(), undefined, lines);
  check('gate: one term in the body and one in the digest still match (snippet prefers the message)', !!both && !both.dig && both.snippet.includes('colors'));
  check('gate: a term in neither drops the chat', matchChat(c, compile('colors paypal', any), ctx, ID, load, Date.now(), undefined, lines) === null);
  check('gate: from: filters keep plain terms out of digest text', matchChat(c, compile('stripe from:you', OPTS), ctx, ID, load, Date.now(), undefined, lines) === null);
  const tok = matchChat(c, compile('digest:monthly', OPTS), ctx, ID, load, Date.now(), undefined, lines);
  check('gate: digest: alone matches digest text, snippet is the digest line', !!tok && tok.dig === true && tok.snippet.includes('Monthly'));
  check('gate: digest: on a chat without a digest never matches', matchChat(c, compile('digest:monthly', OPTS), ctx, ID, load, Date.now()) === null);
  check('gate: digest: AND plain words: the words still scan the body', !!matchChat(c, compile('colors digest:monthly', OPTS), ctx, ID, load, Date.now(), undefined, lines)
    && matchChat(c, compile('nothinghere digest:monthly', OPTS), ctx, ID, load, Date.now(), undefined, lines) === null);
}

async function aiTests() {
  const { rec } = await recOf(FIX);
  const inp = ai.aiInput(rec, new Set([2]));
  check('ai input: owner and agent text, summaries marked input only', inp.pieces.length === 1 && /\[0\] You: Build the pricing page/.test(inp.pieces[0]) && /\[1\] Agent: Two questions first/.test(inp.pieces[0]) && /\[2\] Summary/.test(inp.pieces[0]));
  check('ai input: summaries and harness text are never decision candidates (' + inp.allowed.join(',') + ')', eq(inp.allowed, [0, 3]));
  const many = recFrom(Array.from({ length: 40 }, (_, i) => 'm' + i + ' ' + 'x'.repeat(1000)));
  const cut = ai.aiInput(many, new Set(), 3000, 8);
  check('ai input: past 8 pieces the middle is dropped and marked', cut.trimmed && cut.pieces.length === 8 && cut.pieces[0].includes('[0]') && cut.pieces[7].includes('[39]') && !cut.pieces.some((p) => p.includes('[20]')));
  const allowed = new Set(inp.allowed);
  check('ai parse: picks outside the allowed owner messages are dropped', eq(ai.parseAiPart('x {"goal":" Ship pricing ","decisions":[3,1,2,"0",3],"open":["a",""," b ",7]} y', allowed), { goal: 'Ship pricing', decisions: [0, 3], open: ['a', 'b'] }));
  let threw = false; try { ai.parseAiPart('{"decisions":[]}', allowed); } catch { threw = true; }
  check('ai parse: no goal is a failed try', threw);
  // Stub runner: fails once (bad output), then answers; the real claude is never started.
  const prompts = [];
  let n = 0;
  const stub = async (p) => { prompts.push(p); n++; return n === 1 ? 'not json' : '{"goal":"Ship the pricing page","decisions":[3],"open":["Friday release"]}'; };
  const part = await ai.runAi(inp, stub);
  check('ai run: a bad reply is retried, then parsed', n === 2 && part.goal === 'Ship the pricing page' && eq(part.decisions, [3]) && eq(part.open, ['Friday release']));
  check('ai run: the prompt treats the chat as data', prompts[0].includes('<data>') && prompts[0].includes('not instructions'));
  const calls = [];
  const two = await ai.runAi({ pieces: ['[0] You: a', '[1] You: b'], allowed: [0, 1], trimmed: false }, async (p) => { calls.push(p); return p.includes('merge') ? '{"goal":"Merged","open":["last"]}' : '{"goal":"g","decisions":[' + (p.includes('part 1 of') ? 0 : 1) + '],"open":[]}'; });
  check('ai run: pieces then one merge; decisions are the union', calls.length === 3 && two.goal === 'Merged' && eq(two.decisions, [0, 1]) && eq(two.open, ['last']));
  let failed = false; try { await ai.runAi(inp, async () => { throw new Error('ENOENT'); }); } catch { failed = true; }
  check('ai run: a call that fails every try throws (the build saves the exact parts)', failed);
}

async function buildTests(tmp) {
  const { p, rec } = await recOf(FIX);
  const sub = { id: 'agent1', dir: '-w-shop', parent: ID, title: 'sub', mtime: 1, size: 1, last: 1, first: 1, count: 1, files: [{ path: '/w/shop/README.md', edited: false }, { path: '/w/shop/src/pricing.ts', edited: false }], rec: 's', len: 1, bloom: buildBloom('') };
  const subRec = recFrom(['subagent found https://example.com/sub and commit 9f8e7d6c']);
  const chat = { id: ID, dir: '-w-shop', title: '💰 Pricing page', mtime: 1000, size: fs.statSync(FIX).size, last: p.last, first: p.first, count: p.count, files: p.files, rec: 'r', len: 1, cwd: '/w/shop', bloom: buildBloom(p.texts.join(' ').toLowerCase()) };
  const ix = { find: (id) => (id === ID ? chat : undefined), subsOf: (c) => (c === chat ? [sub] : []), rec: (c) => (c === chat ? rec : subRec), fileOf: (c) => (c === chat ? FIX : 'nope'), tops: () => [chat] };
  const cache = new store.DigestCache(store.digestDir(tmp));
  ix.digests = cache;
  const b = new DigestBuilder(ix, cache);
  check('build list: a chat with no digest is listed as none', eq(b.todo().map((x) => x.state), ['none']));
  const r = await b.input(ID);
  check('build input: AI input and allowed owner messages', r && r.input.pieces.length === 1 && eq(r.input.allowed, [0, 3]));
  const saved = await b.save(ID, 'ok', { goal: 'Ship the pricing page', decisions: [3, 2], open: ['Friday release'] });
  check('build save: goal returned for the list marker', saved && saved.goal === 'Ship the pricing page');
  check('build save: an expired or unknown build saves nothing', (await b.save(ID, 'ok', { goal: 'x', decisions: [], open: [] })) === undefined);
  const file = path.join(store.digestDir(tmp), ID + '.json');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('store: one file per chat id in digests-v1', fs.existsSync(file) && path.basename(path.dirname(file)) === 'digests-v1');
  check('digest: files merged with the subagent, edited first, complete', eq(d.files.map((f) => f.path + ':' + f.edited), ['/w/shop/src/pricing.ts:true', '/w/shop/README.md:false']));
  check('digest: references from the chat and its subagents (' + d.refs.join(' ') + ')', ['plans/PLAN_pricing.md', 'https://example.com/docs/pricing', 'a1b2c3d4', '#42', 'https://example.com/sub', '9f8e7d6c'].every((x) => d.refs.includes(x)) && !d.refs.some((x) => x.startsWith('07edf7b3')));
  const msg = d.decisions.filter((x) => x.src === 'message');
  check('digest: message decision quoted verbatim with index and line; the summary pick is dropped', msg.length === 1 && msg[0].i === 3 && msg[0].a === 'Ship it on Friday, not before. Reference https://example.com/docs/pricing.' && msg[0].line === 9);
  check('digest: decisions in chat order, dialogs before the later message', eq(d.decisions.map((x) => x.src), ['dialog', 'dialog', 'dialog', 'message']));
  check('digest: dates, folder, start, close flag and size/mtime for staleness', d.first === p.first && d.folder === '/w/shop' && d.start === '/w/shop' && d.noClose === true && d.size === chat.size && d.mtime === 1000 && d.ai === 'ok');
  check('build list: fresh after the build, stale after the chat changes', b.todo()[0].state === 'fresh' && (chat.mtime = 2000, b.todo()[0].state === 'stale'));
  check('cache: the stored digest is stale for the changed chat', dg.digestStale(cache.get(ID).d, chat) && cache.get(ID).d.goal === 'Ship the pricing page');
  // The same chat again with AI off: the exact parts only, and the cache sees the rewrite at once.
  await b.input(ID);
  await b.save(ID, 'off');
  const off = cache.get(ID).d;
  check('AI off: exact parts only, marked off', off.ai === 'off' && off.goal === undefined && off.decisions.length === 3 && off.files.length === 2);
  await b.input(ID);
  await b.save(ID, 'ok', { goal: 'Ship the pricing page', decisions: [3], open: ['Friday release'] });

  // Search through the real searchIndex: a digest-only word lands on the parent row, labeled as a digest hit.
  const res = await searchIndex(ix, compile('friday release', OPTS), OPTS, [], { pins: new Set(), tags: {} }, { aborted: false });
  const row = res.results[0];
  check('search: digest-only hit found, marked and labeled (' + JSON.stringify(row && { snipDig: row.snipDig, dg: row.dg, snippet: row.snippet }) + ')', res.results.length === 1 && row.snipDig === true && row.dg === true && row.dgGoal === 'Ship the pricing page' && row.snippet.toLowerCase().includes('friday release'));
  const arcOff = await searchIndex(ix, compile('friday release', OPTS), OPTS, [], { pins: new Set(), tags: {}, archived: new Set([ID]) }, { aborted: false });
  const arcOn = await searchIndex(ix, compile('friday release', OPTS), Object.assign({}, OPTS, { arc: true }), [], { pins: new Set(), tags: {}, archived: new Set([ID]) }, { aborted: false });
  check('search: archived chats are found only in Archive scope', arcOff.results.length === 0 && arcOn.results.length === 1);
  const ed = await require(path.join(OUT, 'editorSearch.js')).editorIndex(ix, compile('friday release', OPTS), OPTS, [], { pins: new Set(), tags: {} }, { aborted: false }, { statuses: require(path.join(OUT, 'status.js')).STATUS_KEYS, sort: 'score', max: 50 }, () => undefined);
  check('results editor: a digest-only hit lists its labeled digest line', ed.chats.length === 1 && ed.chats[0].hits.some((h) => h.n === 0 && h.rows[0].t.startsWith('Digest: ') && h.rows[0].r.length > 0));
  const sub2 = await searchIndex(ix, compile('example.com/sub', OPTS), OPTS, [], { pins: new Set(), tags: {} }, { aborted: false });
  check('search: a subagent fact in the digest lands on the parent row', sub2.results.length === 1 && sub2.results[0].id === ID);

  // Results editor with a message hit AND a digest: token: the digest line is listed too (it was only listed for digest-only hits).
  const ctx0 = { pins: new Set(), tags: {} }, xo = { statuses: require(path.join(OUT, 'status.js')).STATUS_KEYS, sort: 'score', max: 50 };
  const edMix = await require(path.join(OUT, 'editorSearch.js')).editorIndex(ix, compile('pricing digest:friday', OPTS), OPTS, [], ctx0, { aborted: false }, xo, () => undefined);
  check('results editor: a message hit plus digest: lists the digest line', edMix.chats.length === 1 && edMix.chats[0].hits.some((h) => h.rows[0].t.startsWith('Digest: ') && h.rows[0].t.toLowerCase().includes('friday')) && edMix.chats[0].hits.some((h) => h.n > 0));
  // A from: filter selects messages, so plain terms are not counted against the digest and its lines must not be listed.
  const fromOpts = compile('friday from:you', OPTS);
  const edFrom = await require(path.join(OUT, 'editorSearch.js')).editorIndex(ix, fromOpts, OPTS, [], ctx0, { aborted: false }, xo, () => undefined);
  check('results editor: from:you lists no plain-term digest lines (' + JSON.stringify(edFrom.chats.map((c) => c.hits.length)) + ')', edFrom.chats.length === 1 && !edFrom.chats[0].hits.some((h) => h.rows[0].t.startsWith('Digest: ')));
  check('digestTermsApply: only without a message filter', require(path.join(OUT, 'match.js')).digestTermsApply(compile('friday', OPTS)) && !require(path.join(OUT, 'match.js')).digestTermsApply(fromOpts));
  // Export: a digest-only chat passes the filter, so its digest lines must be exported (it exported nothing before).
  const xp = await require(path.join(OUT, 'export.js')).exportIndex(ix, compile('friday release', OPTS), OPTS, [], ctx0, { aborted: false }, { context: true, unique: false, statuses: xo.statuses }, () => undefined);
  check('export: a digest-only chat exports its digest lines (' + JSON.stringify(xp.text.slice(0, 120)) + ')', xp.chats === 1 && xp.text.includes(' | Digest | ') && xp.text.includes('Friday release'));
  const xt = await require(path.join(OUT, 'export.js')).exportIndex(ix, compile('digest:friday', OPTS), OPTS, [], ctx0, { aborted: false }, { context: false, unique: false, statuses: xo.statuses }, () => undefined);
  check('export: a digest: token exports the matching digest line', xt.lines >= 1 && xt.text.toLowerCase().includes('friday'));

  // Pending builds: a gathered build outlives another chat's input() (the sweep), until PENDING_MS has passed.
  const ID2 = '33333333-2222-4333-8444-555555555555';
  const chat2 = Object.assign({}, chat, { id: ID2 });
  const ixp = Object.assign({}, ix, { find: (id) => (id === ID ? chat : id === ID2 ? chat2 : undefined), tops: () => [chat, chat2], fileOf: () => FIX, subsOf: () => [], rec: (c) => (c === chat2 ? rec : ix.rec(c)) });
  let clock = 1e9;
  const bp = new DigestBuilder(ixp, new store.DigestCache(path.join(tmp, 'pend')), () => clock);
  await bp.input(ID);
  clock += 16 * 60 * 1000; // longer than the old fixed 15 minutes
  await bp.input(ID2); // runs the sweep
  check('pending: a build in flight survives the sweep of another chat', (await bp.save(ID, 'off')) !== undefined);
  await bp.input(ID);
  clock += require(path.join(OUT, 'digestBuild.js')).PENDING_MS + 1;
  await bp.input(ID2);
  check('pending: a build older than PENDING_MS is swept', (await bp.save(ID, 'off')) === undefined);
  const ai2 = require(path.join(OUT, 'digestAi.js'));
  check('pending: lifetime covers every piece, retry and queue slot', require(path.join(OUT, 'digestBuild.js')).PENDING_MS >= (ai2.MAX_PIECES + 1) * ai2.AI_TRIES * ai2.AI_TIMEOUT_MS);

  // Re-export after a title change: the old file of the same session is superseded; INDEX.md and other sessions stay.
  check('export: an old-slug file of the same session is removed', eq(md.supersededExports(['2026-10-05_old-title_11111111.md', '2026-10-05_new-title_11111111.md', 'INDEX.md', 'notes.md', '2026-10-05_other_22222222.md'], ['2026-10-05_new-title_11111111.md']), ['2026-10-05_old-title_11111111.md']));

  // Export: one file per digest of the project, plus INDEX.md.
  const ex = b.exportFor('/w/shop');
  check('export: file name and content', ex.files.length === 1 && ex.files[0].name === md.digestFileName({ first: p.first, title: chat.title, id: ID }) && ex.files[0].text.includes('## Decisions') && ex.files[0].text.includes('Dialog: Which billing period?') && ex.files[0].text.includes('(line 9 of the session file)') && ex.files[0].text.includes('Note: Session ended without a close'));
  check('export: INDEX.md links each file with its goal', ex.index.includes('](' + ex.files[0].name + ') - Ship the pricing page'));
  check('export: other projects get nothing', b.exportFor('/w/other').files.length === 0);
  check('store: a damaged file is no digest', (fs.writeFileSync(path.join(store.digestDir(tmp), '22222222-2222-4333-8444-555555555555.json'), '{bad'), store.readDigest(store.digestDir(tmp), '22222222-2222-4333-8444-555555555555') === undefined));
  check('store: an id that is not a session id names no file', store.digestFile(tmp, '../x') === undefined);
  return d;
}

function panelTests(d) {
  const page = require(path.join(OUT, 'webview.js')).html();
  const H = createHarness({ page, name: 'digest panel', width: 400 });
  if (H.syntaxFailed) { return H.errors; }
  H.start();
  H.run("{const real=patch;patch=function(el,h){el.innerHTML=h;return real(el,h);};}", 'wrap patch');
  const list = H.els.get('list');
  const row = { file: '/x/' + ID + '.jsonl', id: ID, title: 'Pricing page', hits: 0, last: Date.now(), snippet: '', ranges: [], score: 0, project: 'shop', msgs: 5, first: 1, edited: 1, size: 10, dg: true, dgGoal: 'Ship the pricing page' };
  H.step('restore', () => H.deliver({ type: 'restore', max: 500, state: { query: '', results: [], searched: '', subs: true, when: 'any', sort: 'time' }, history: [], archOpen: false, advOpen: false }));
  H.step('sessions', () => H.deliver({ type: 'sessions', sn: 0, rows: [row], total: 1, arch: [], archTotal: 0, max: 500 }));
  H.check('row marker with the goal as its tooltip', /class="dgm"[^>]*data-a="dig"/.test(list.innerHTML) && list.innerHTML.includes('Digest: Ship the pricing page'));
  H.step('open card', () => H.run('openCard(' + JSON.stringify(ID) + ');rerender();', 'open card'));
  H.step('expanded', () => H.deliver({ type: 'expanded', id: ID, offset: 0, lite: false, items: [], total: 0, files: [], commands: [], git: { prs: [], commits: [], moreCommits: 0 }, digest: { d, stale: true } }));
  const html = list.innerHTML;
  H.check('Digest section above the other card sections', html.includes('data-sec="dig:' + ID + '"') && html.indexOf('data-sec="dig:') < html.indexOf('data-sec="git:'));
  H.check('Digest section parts', ['Goal', 'Decisions (4)', 'Files changed (2)', 'References (', 'Left open', 'Friday release', '>Dialog<', '>Message<', 'data-a="dgmsg" data-i="3"', 'This session changed after the digest was built', 'Session ended without a close', 'Rebuild digest'].every((x) => html.includes(x)));
  H.check('no raw hex colors in the digest CSS', !/#[0-9a-fA-F]{3,8}\b/.test(require(path.join(OUT, 'webviewDigest.js')).DIGEST_CSS));
  H.step('no digest yet', () => H.deliver({ type: 'expanded', id: ID, offset: 0, lite: false, items: [], total: 0, files: [], commands: [], git: { prs: [], commits: [], moreCommits: 0 }, digest: null }));
  H.check('no digest: a Build button', list.innerHTML.includes('No digest yet') && list.innerHTML.includes('data-a="dgbuild"'));
  H.step('build click', () => H.run("digClick('dgbuild'," + JSON.stringify(ID) + ",{dataset:{}});", 'build click'));
  H.check('build click posts digestBuild and shows busy', H.posted.some((m) => m.type === 'digestBuild' && m.id === ID) && list.innerHTML.includes('Building...'));
  H.step('digest built', () => { H.deliver({ type: 'digestState', id: ID, state: 'done' }); H.deliver({ type: 'digestChanged', id: ID, goal: 'New goal' }); });
  H.check('digestChanged reloads the open card', H.posted.filter((m) => m.type === 'expand' && m.id === ID && !m.lite).length >= 2);
  H.step('digest hit row', () => H.deliver({ type: 'results', sn: 0, results: [Object.assign({}, row, { hits: 1, snippet: 'Friday release', ranges: [[0, 6]], snipDig: true })], searched: '' }));
  H.check('digest-only hit: labeled snippet that opens the Digest section', /class="s dgsn" data-a="dig"/.test(list.innerHTML) && list.innerHTML.includes('<b class="dgl">Digest</b>'));
  return [...new Set(H.errors)];
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-digest-'));
  try {
    refsTests();
    await fileTests();
    staleTests();
    capTests();
    nameTests();
    queryTests();
    gateTests();
    await aiTests();
    const d = await buildTests(tmp);
    for (const e of panelTests(d)) { failures.push('panel: ' + e); }
  } catch (e) { failures.push('threw: ' + (e && e.stack || e)); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (failures.length) { console.error('Digest check FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('Digest check passed.');
})();
