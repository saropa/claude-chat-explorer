// Unit check for out/optionsForm.js and out/optionsHtml.js: schema-to-form builder and host-side validation. No VS Code needed.
const fs = require('fs');
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const f = require(path.join(OUT, 'optionsForm.js'));
const h = require(path.join(OUT, 'optionsHtml.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;
const fails = [];
const check = (n, c) => { if (!c) { fails.push(n); } };

const entries = f.parseSchema(props);
const own = Object.keys(props).filter((k) => k.startsWith('saropaChatExplorer.'));
check('all own properties parsed', entries.length === own.length && own.every((k) => entries.some((e) => e.key === k)));
const vals = Object.fromEntries(entries.map((e) => [e.key, e.def]));
const html = f.buildFormHtml(entries, vals);
for (const e of entries) {
  check('rendered ' + e.key, html.includes(`data-k="${e.key}"`) || e.type === 'other');
  check('label ' + e.key, e.label.length > 0);
  const want = { boolean: 'type="checkbox"', enum: '<select', number: 'type="number"', integer: 'type="number"', string: 'type="text"' }[e.type];
  if (want) { check('control ' + e.key, f.controlHtml(e, e.def).includes(want)); }
}
check('webSessions is a checkbox', f.controlHtml(entries.find((e) => e.key === 'saropaChatExplorer.webSessions.enabled'), false).includes('type="checkbox"'));

// synthetic schema: each type, min/max, enum descriptions, escaping
const syn = f.parseSchema({
  'saropaChatExplorer.g.b': { type: 'boolean', default: true, description: 'B <b>' },
  'saropaChatExplorer.g.e': { type: 'string', enum: ['a', 'b'], enumDescriptions: ['Alpha', 'Beta'], default: 'a' },
  'saropaChatExplorer.n': { type: 'number', minimum: 1, maximum: 5, default: 2, title: 'My N' },
  'saropaChatExplorer.i': { type: 'integer', minimum: 1, default: 2 },
  'saropaChatExplorer.s': { type: 'string', default: '"><script>x</script>' },
  'saropaChatExplorer.o': { type: 'array', default: [] },
  'other.ext.setting': { type: 'boolean' },
});
check('foreign key filtered', syn.length === 6);
check('types', syn.map((e) => e.type).join() === 'boolean,enum,number,integer,string,other');
check('title used', syn[2].label === 'My N' && syn[0].group === 'G' && syn[2].group === 'General');
check('enum descriptions', f.controlHtml(syn[1], 'a').includes('a: Alpha') && f.controlHtml(syn[1], 'b').includes('value="b" selected'));
check('min/max attrs', f.controlHtml(syn[2], 2).includes('min="1"') && f.controlHtml(syn[2], 2).includes('max="5"'));
const full = h.optionsHtml(syn, { 'saropaChatExplorer.s': '"><script>x</script>' });
check('escaped', !full.includes('<script>x') && !full.includes('B <b>') && full.includes('&lt;script&gt;'));
check('csp nonce, no inline handlers', /script-src 'nonce-/.test(full) && !/ on[a-z]+=/i.test(f.buildFormHtml(syn, {})));
check('settings link', full.includes('Open in VS Code Settings'));

// host validation
const v = (e, x) => f.validateValue(e, x).ok;
check('bool ok', v(syn[0], true) && !v(syn[0], 'true') && !v(syn[0], 1));
check('enum', v(syn[1], 'a') && !v(syn[1], 'z') && !v(syn[1], 1));
check('number range', v(syn[2], 3) && v(syn[2], 1) && v(syn[2], 5) && !v(syn[2], 0) && !v(syn[2], 6) && !v(syn[2], '3') && !v(syn[2], NaN) && !v(syn[2], Infinity));
check('integer', v(syn[3], 2) && !v(syn[3], 1.5) && !v(syn[3], 0) && v(syn[3], 1e9));
check('string', v(syn[4], 'x') && !v(syn[4], 5) && !v(syn[4], 'x'.repeat(5000)));
check('reset ok', v(syn[2], undefined));
check('array rejected', !v(syn[5], [1]));
check('unknown key rejected', !v(undefined, 1));
const real = Object.fromEntries(entries.map((e) => [e.key, e]));
check('real maxResults bounds', !v(real['saropaChatExplorer.maxResults'], 10) && v(real['saropaChatExplorer.maxResults'], 500) && !v(real['saropaChatExplorer.search.contextLines'], 2.5));

if (fails.length) { console.error('Options check FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('Options check passed.');
