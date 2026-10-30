// Unit check for out/claudeConfig.js, claudeConfigMd.js, claudeConfigHtml.js: deterministic rules with an injected reader. No VS Code needed.
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const c = require(path.join(OUT, 'claudeConfig.js'));
const m = require(path.join(OUT, 'claudeConfigMd.js'));
const h = require(path.join(OUT, 'claudeConfigHtml.js'));
const fails = [];
const check = (n, ok) => { if (!ok) { fails.push(n); } };
const rd = (files, dirs = {}) => ({ read: (p) => files[p], list: (p) => dirs[p] });
const has = (lv, cat, re) => lv.findings.some((f) => f.category === cat && re.test(f.text));

const G = '/h/.claude', P = '/w';
const files = {
  [G + '/CLAUDE.md']: 'x'.repeat(21000),
  [G + '/settings.json']: JSON.stringify({ cleanupPeriodDays: 3650, permissions: { allow: ['Bash(*)', 'Read', 'Read', 'Edit(x)'], deny: ['Edit(x)'] }, hooks: { Stop: [] }, mcpServers: { a: {} } }),
  [G + '/settings.local.json']: '{bad',
  [P + '/.claude/settings.json']: JSON.stringify({ permissions: { allow: ['Read'] } }),
};
const dirs = { [G + '/rules']: ['a.md'], [G + '/skills']: [], [P + '/.claude/rules']: ['a.md'] };
const rep = c.analyse(rd(files, dirs), G, P);
const g = rep.global, p = rep.project;
check('retention fact', g.facts.some((f) => f.label === 'cleanupPeriodDays' && f.value === '3650 days (10 years)'));
check('retention risk', has(g, 'risks', /cleanupPeriodDays is 3650 days \(10 years\)/) && g.findings.find((f) => /cleanupPeriodDays/.test(f.text)).severity === 'high');
check('bloat', has(g, 'bloat', /over/));
check('broad allow', has(g, 'risks', /Bash\(\*\)/));
check('dup allow', has(g, 'duplication', /"Read"/));
check('allow+deny', has(g, 'redundancy', /Edit\(x\)/));
check('invalid json', has(g, 'risks', /not valid JSON/));
check('empty dir', has(g, 'redundancy', /skills\/ exists but is empty/));
check('hooks+mcp facts', g.facts.some((f) => /hooks/.test(f.label) && f.value === 'Stop') && g.facts.some((f) => /MCP/.test(f.label)));
check('missing project CLAUDE.md', has(p, 'gaps', /No CLAUDE\.md/));
check('cross permission dup', has(p, 'duplication', /both global and project/));
check('cross rule dup', has(p, 'duplication', /"a\.md"/));
const none = c.analyse(rd({}), G);
check('no project when no root', none.project === undefined);
check('global gaps + opportunity', has(none.global, 'gaps', /CLAUDE\.md/) && has(none.global, 'opportunities', /allow/));
check('small retention ok', !has(c.analyse(rd({ [G + '/settings.json']: '{"cleanupPeriodDays":30}' }), G).global, 'risks', /cleanupPeriodDays/));
check('retention text', c.retentionText(30) === '30 days' && c.retentionText(365) === '365 days (1 year)' && c.retentionText(730) === '730 days (2 years)');
const md = m.configMarkdown(rep);
check('markdown', md.includes('## Global') && md.includes('### Findings') && md.includes('[risks, high]') && md.includes(m.OPT_PROMPT));
const html = h.configHtml({ global: { facts: [{ label: '<b>', value: 'v' }], findings: [] } });
check('html escapes + button', !html.includes('<b>') && html.includes('id="copy"') && html.includes('No workspace folder'));

if (fails.length) { console.error('Claude config check FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('Claude config check passed.');
