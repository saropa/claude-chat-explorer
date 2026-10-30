// Fails the build when the Account & Usage maths breaks: account parsing, usage lines (repeat drop), the six windows (rolling 5 hours, 3, 5 and 7 days, today and yesterday at local midnight), the four-way token split and the per-model 7-day split. Drives out/accountUsage.js.
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { accountOf, dedupe, eventOf, shortModel, totals } = require(path.join(OUT, 'accountUsage.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

const acct = accountOf(JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', displayName: 'A', organizationName: 'Org', seatTier: 'max' } }));
check('account fields', acct && acct.email === 'a@b.c' && acct.name === 'A' && acct.org === 'Org' && acct.plan === 'max');
check('plan falls back to organizationType, then billingType', accountOf(JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', organizationType: 'claude_max', billingType: 'b' } })).plan === 'claude_max' && accountOf(JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', billingType: 'stripe' } })).plan === 'stripe');
check('no oauthAccount is signed out', accountOf('{}') === null);
check('bad json is signed out', accountOf('{nope') === null);
check('empty text is signed out', accountOf('') === null);

const now = Date.parse('2026-10-30T12:00:00Z');
const line = (iso, id, u, model) => JSON.stringify({ type: 'assistant', timestamp: iso, message: { id, model, usage: u } });
const e1 = eventOf(line('2026-10-30T11:00:00Z', 'm1', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 7 }));
check('event fields', e1 && e1[1] === 10 && e1[2] === 5 && e1[3] === 100 && e1[4] === 7 && e1[6] === '');
check('event model', eventOf(line('2026-10-30T11:00:00Z', 'x', { input_tokens: 1 }, 'claude-opus-4-1'))[6] === 'claude-opus-4-1');
check('short model names', shortModel('claude-opus-4-1') === 'opus' && shortModel('claude-sonnet-4-5') === 'sonnet' && shortModel('claude-3-5-haiku-x') === 'haiku' && shortModel('claude-fable-1') === 'fable' && shortModel('') === 'unknown' && shortModel('claude-zeta-1') === 'zeta-1');
const rep = eventOf(line('2026-10-30T11:00:01Z', 'm1', { input_tokens: 10, output_tokens: 9, cache_read_input_tokens: 100, cache_creation_input_tokens: 7 }));
const d1 = dedupe([e1, rep]);
check('repeat id (even across files) counts once, keeping the larger output', d1.length === 1 && d1[0][2] === 9);
check('repeat with smaller output keeps first', dedupe([rep, e1]).length === 1 && dedupe([rep, e1])[0][2] === 9);
check('events without id are all kept', dedupe([eventOf(line('2026-10-30T11:00:00Z', '', { input_tokens: 1 })), eventOf(line('2026-10-30T11:00:00Z', '', { input_tokens: 1 }))]).length === 2);
check('user line ignored', eventOf(JSON.stringify({ type: 'user', timestamp: '2026-10-30T11:00:00Z', message: { usage: { input_tokens: 1 } } })) === undefined);
check('garbage line ignored', eventOf('{"usage" nope') === undefined);

const evs = dedupe([e1, eventOf(line('2026-10-30T05:00:00Z', 'm2', { input_tokens: 20, output_tokens: 20 })), eventOf(line('2026-10-20T05:00:00Z', 'm3', { input_tokens: 1000 })), eventOf(line('2026-10-30T13:00:00Z', 'm4', { input_tokens: 5000 }))]);
const t = totals(evs, now);
check('5h window', t.h5.io === 15 && t.h5.cache === 107);
check('7d window', t.d7.io === 55 && t.d7.cache === 107);


// Breakdown and per-model split. Cache writes and reads are kept apart.
const mv = (id, iso, model, i, o, cr, cw) => eventOf(line(iso, id, { input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw }, model));
const evs2 = dedupe([
  mv('a', '2026-10-30T11:00:00Z', 'claude-opus-4-1', 10, 1, 3, 4),
  mv('a', '2026-10-30T11:00:01Z', 'claude-opus-4-1', 10, 5, 3, 4),
  mv('b', '2026-10-30T10:00:00Z', 'claude-sonnet-4-5', 100, 50, 1000, 20),
  mv('c', '2026-10-27T10:00:00Z', 'claude-haiku-4-5', 7, 3, 0, 0),
  mv('d', '2026-10-26T10:00:00Z', 'claude-opus-4-1', 1, 1, 0, 0),
  mv('e', '2026-10-25T10:00:00Z', 'claude-fable-1', 2, 2, 0, 0),
  mv('f', '2026-10-25T10:00:00Z', 'other-model', 1, 0, 0, 0),
  mv('g', '2026-10-20T10:00:00Z', 'claude-opus-4-1', 9999, 0, 0, 0),
]);
const t2 = totals(evs2, now);
check('5h four-way breakdown', t2.h5.i === 110 && t2.h5.o === 55 && t2.h5.cr === 1003 && t2.h5.cw === 24 && t2.h5.io === 165 && t2.h5.cache === 1027);
check('7d breakdown', t2.d7.i === 121 && t2.d7.o === 61 && t2.d7.io === 182);
check('models sorted, top 4 by input+output', t2.models.length === 4 && t2.models[0].model === 'sonnet' && t2.models[0].io === 150 && t2.models[1].model === 'opus' && t2.models[1].io === 17 && t2.models[1].id === 'claude-opus-4-1' && t2.models[2].model === 'haiku' && t2.models[3].model === 'fable');
const few = totals(evs2.slice(0, 5), now);
check('model sums equal 7d total when at most 4 models', few.models.reduce((a, m) => a + m.io, 0) === few.d7.io);
// Today and yesterday: local midnight boundaries (works in any time zone), with events just either side of midnight.
const L = (y, mo, d, h, mi, sec, ms) => new Date(y, mo, d, h, mi, sec, ms || 0).getTime();
const now3 = L(2026, 9, 30, 0, 30, 0);
const ev3 = (at, id, i) => [at, i, 0, 0, 0, id, ''];
const t3 = totals([
  ev3(L(2026, 9, 30, 0, 10, 0), 'a', 1),        // today
  ev3(L(2026, 9, 30, 0, 0, 0), 'b', 10),         // exactly midnight: today
  ev3(L(2026, 9, 29, 23, 59, 59, 999), 'c', 100), // last ms of yesterday
  ev3(L(2026, 9, 29, 0, 0, 0), 'd', 1000),        // first ms of yesterday
  ev3(L(2026, 9, 28, 23, 59, 59, 999), 'e', 10000), // day before: neither
  ev3(L(2026, 9, 30, 1, 0, 0), 'f', 100000),      // future: ignored
], now3);
check('today boundary', t3.today.io === 11);
check('yesterday boundary (bounded range)', t3.yest.io === 1100);
check('rolling 3, 5 and 7 days end now', t3.h5.io === 111 && t3.d3.io === 11111 && t3.d5.io === 11111 && t3.d7.io === 11111);
check('fresh totals have all windows', ['h5', 'today', 'yest', 'd3', 'd5', 'd7'].every((k) => t3[k] && t3[k].io >= 0));
check('model sums never exceed 7d total', t2.models.reduce((a, m) => a + m.io, 0) <= t2.d7.io);

if (failures.length) { console.error('check_account failed:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('check_account ok');
