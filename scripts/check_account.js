// Fails the build when the Account & Usage maths breaks: account parsing, usage lines (repeat drop) and the rolling 5-hour and 7-day sums. Drives out/accountUsage.js.
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { accountOf, dedupe, eventOf, totals } = require(path.join(OUT, 'accountUsage.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

const acct = accountOf(JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', displayName: 'A', organizationName: 'Org', seatTier: 'max' } }));
check('account fields', acct && acct.email === 'a@b.c' && acct.name === 'A' && acct.org === 'Org' && acct.plan === 'max');
check('plan falls back to organizationType, then billingType', accountOf(JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', organizationType: 'claude_max', billingType: 'b' } })).plan === 'claude_max' && accountOf(JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c', billingType: 'stripe' } })).plan === 'stripe');
check('no oauthAccount is signed out', accountOf('{}') === null);
check('bad json is signed out', accountOf('{nope') === null);
check('empty text is signed out', accountOf('') === null);

const now = Date.parse('2026-10-30T12:00:00Z');
const line = (iso, id, u) => JSON.stringify({ type: 'assistant', timestamp: iso, message: { id, usage: u } });
const e1 = eventOf(line('2026-10-30T11:00:00Z', 'm1', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 7 }));
check('event fields', e1 && e1[1] === 10 && e1[2] === 5 && e1[3] === 100 && e1[4] === 7);
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

if (failures.length) { console.error('check_account failed:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('check_account ok');
