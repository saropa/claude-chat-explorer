// Fails the build when cumulative token totals break: compact_boundary must not reset them, a streamed message id counts once, sidechain rows count,
// a work item sums its chats. Drives out/parse.js, out/tokens.js and out/workChats.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { parseFile } = require(path.join(OUT, 'parse.js'));
const { workTotals, chatTotals } = require(path.join(OUT, 'workChats.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

const asst = (id, u, extra) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-30T10:00:00Z', message: { id, model: 'claude-opus-4-8', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage: u }, ...extra });
const boundary = JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: '2026-10-30T10:30:00Z', content: 'Conversation compacted' });
const u = (i, o, cr, cw) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok-'));
  const f = path.join(dir, 'chat.jsonl');
  fs.writeFileSync(f, [
    asst('m1', u(10, 5, 100, 7)),
    asst('m1', u(10, 5, 100, 7)), // streamed repeat of the same message: counted once
    asst('m1', u(10, 9, 100, 7)),
    boundary,
    asst('m2', u(20, 6, 200, 0)),
    asst('m3', u(1, 2, 3, 4), { isSidechain: true }), // sub-agent reply inside the file: counted
    JSON.stringify({ type: 'user', timestamp: '2026-10-30T10:31:00Z', message: { role: 'user', content: 'hi' } }),
  ].join('\n') + '\n');
  const p = await parseFile(f, Date.now(), 1000);
  check('replies counted once each (m1, m2, m3)', p.tok && p.tok[4] === 3);
  check('input sums 10+20+1', p.tok && p.tok[0] === 31);
  check('output sums 9+6+2 (last row of a repeated id wins: m1 counts 9)', p.tok && p.tok[1] === 17);
  check('cache read sums 100+200+3', p.tok && p.tok[2] === 303);
  check('cache write sums 7+0+4', p.tok && p.tok[3] === 11);
  check('compact_boundary did not reset: context counted a compaction, totals kept m1', p.use && p.use.comp === 1 && p.tok[0] >= 10 + 20);
  fs.writeFileSync(f, [asst('s1', u(3, 5, 0, 0)), asst('s1', u(3, 40, 0, 0))].join('\n') + '\n');
  const sp = await parseFile(f, Date.now(), 1000);
  check('same id, output 5 then 40: output 40 counted once', sp.tok && sp.tok[1] === 40 && sp.tok[0] === 3 && sp.tok[4] === 1);
  fs.writeFileSync(f, JSON.stringify({ type: 'user', timestamp: '2026-10-30T10:31:00Z', message: { role: 'user', content: 'hi' } }) + '\n');
  check('no replies: no totals', (await parseFile(f, Date.now(), 1000)).tok === undefined);
  fs.rmSync(dir, { recursive: true, force: true });

  // Work and chat sums over an index stub.
  const chat = (id, tok, extra) => ({ id, tok, ...extra });
  const a = chat('a', [10, 1, 2, 3, 2], { seen: ['feat/x'], use: { comp: 2 } });
  const b = chat('b', [5, 5, 5, 5, 1], { git: { branches: ['feat/x'], prs: [[42, 'r']], commits: [] } });
  const c = chat('c', [100, 0, 0, 0, 1], { seen: ['other'] });
  const sub = chat('s', [1, 1, 1, 1, 1], { parent: 'a' });
  const ix = { tops: () => [a, b, c], subsOf: (p) => (p === a ? [sub] : []) };
  const w = workTotals(ix, 'feat/x');
  check('work sums chats and their subagents', w && w.input === 16 && w.output === 7 && w.cacheRead === 8 && w.cacheWrite === 9 && w.replies === 4);
  check('work compactions summed', w && w.compactions === 2);
  const pr = workTotals(ix, '#42');
  check('work by pull request number', pr && pr.input === 5);
  check('PR number without # works', workTotals(ix, '42') && workTotals(ix, '42').input === 5);
  check('unknown key is undefined', workTotals(ix, 'nope') === undefined);
  // Key rule: "#123" is always a PR; bare "123" is a PR unless some chat recorded a branch named "123".
  const prChat = chat('p', [7, 0, 0, 0, 1], { git: { branches: [], prs: [[123, 'r']], commits: [] } });
  const brChat = chat('q', [11, 0, 0, 0, 1], { seen: ['123'] });
  const mk = (...cs) => ({ tops: () => cs, subsOf: () => [] });
  check('"#123" is a PR even when a branch "123" exists', workTotals(mk(prChat, brChat), '#123')?.input === 7);
  check('bare "123" matches branch "123" when a chat has it', workTotals(mk(prChat, brChat), '123')?.input === 11);
  check('bare "123" is a PR when no chat has branch "123"', workTotals(mk(prChat), '123')?.input === 7);
  check('"#123" is a PR when no branch "123" exists', workTotals(mk(prChat), '#123')?.input === 7);
  check('"#123" with only a branch "123" and no PR is undefined', workTotals(mk(brChat), '#123') === undefined);
  check('chat total includes subagents', chatTotals(ix, a).input === 11);

  if (failures.length) { console.error('check_tokens failed:\n' + failures.map((x) => ' - ' + x).join('\n')); process.exit(1); }
  console.log('check_tokens ok');
})();
