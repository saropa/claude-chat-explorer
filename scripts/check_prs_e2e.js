// End to end: the real WorkPrs on real recorded gh JSON (scripts/fixtures/gh) -> its streamed prs and checks messages -> the real Open Work page in the harness.
// Fails when review words, bands, the summary text or the unknown-checks rule break between the layers (a unit test on one side cannot see that).
const fs = require('fs');
const path = require('path');
const { createHarness } = require('./webview_harness');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { WorkPrs } = require(path.join(OUT, 'workPrs.js'));
const { PrCache } = require(path.join(OUT, 'wipPrs.js'));
const { Limiter } = require(path.join(OUT, 'execLimit.js'));
const page = require(path.join(OUT, 'openWorkHtml.js')).openWorkHtml();
const FIX = (f) => path.join(__dirname, 'fixtures', 'gh', f);
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ok = (s) => ({ code: 0, stdout: s, stderr: '', timedOut: false, aborted: false });

// Real list JSON; the one changes-requested PR that is a fork PR in the recording is made a repository PR, nothing else is edited.
const list = JSON.parse(fs.readFileSync(FIX('cli_list.json'), 'utf8')).map((x) => (x.number === 13899 ? Object.assign({}, x, { isCrossRepository: false }) : x));
const CASES = [
  { n: 1, pr: 14583, branch: 'bagtoad/add-accessibility-md', band: 'To finish', cell: /approved/, what: 'approved with passing checks' },
  { n: 2, pr: 13899, branch: 'fix/13804-gh-issue-create-errors-after-successful', band: 'To finish', cell: /changes requested/, what: 'changes requested' },
  { n: 3, pr: 14580, branch: 'bagtoad/artifact-restore-version', band: 'Waiting on others', cell: /review requested/, what: 'review requested' },
  { n: 4, pr: 13665, branch: 'use-actions-firewall', band: 'Waiting on others', cell: /approved/, what: 'approved but the checks lookup failed (unknown facts never move a row)' },
];
const exec = async (cmd, args) => {
  if (cmd !== 'gh') { return ok(''); }
  if (args[1] === 'list') { return ok(JSON.stringify(list)); }
  const n = Number(args[2]);
  if (n === 13665) { return { code: 1, stdout: '', stderr: 'HTTP 502', timedOut: false, aborted: false }; }
  const f = FIX('cli_view_' + n + '.json');
  return ok(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '{"statusCheckRollup":[],"headRefOid":"' + 'a'.repeat(40) + '"}');
};
const target = (a) => { const t = { dataset: { a }, closest: (sel) => (sel === '[data-a]' ? t : null) }; return t; };

(async () => {
  const w = new WorkPrs({ exec, limiter: new Limiter(2, 2), cache: new PrCache() });
  const msgs = [], ac = new AbortController();
  const run = w.begin({ post: (m) => msgs.push(Object.assign({}, m, { scan: 1 })), signal: ac.signal, force: false, changed() {} });
  for (const c of CASES) { run.join('r1', '/c', '/top', c.branch); }
  await run.settled();
  const by = msgs.find((m) => m.type === 'prs' && m.state === 'ok').by;
  check('e2e: the host posts lower case review words', by[CASES[0].branch].review === 'approved' && by[CASES[1].branch].review === 'changes requested' && by[CASES[2].branch].review === 'review requested');
  const H = createHarness({ page, name: 'e2e', width: 1400, popIds: ['grb', 'grm', 'srb', 'srm', 'shb', 'shm'] });
  H.start();
  H.deliver({ type: 'init', v: 3, prsOn: true, days: 14, group: 'attention', hidden: [], wsOnly: false, ws: 0, done: {}, view: {} });
  H.deliver({ type: 'dots', map: {} });
  const rows = CASES.map((c) => ({ id: id(c.n), title: 'Chat ' + c.n, project: 'cli', last: Date.now() - 3600e3, fk: 'f' + c.n }));
  H.deliver({ type: 'chats', scan: 1, rows, indexing: false, scanning: true });
  for (const c of CASES) { H.deliver({ type: 'folder', scan: 1, key: 'f' + c.n, state: 'ok', facts: { name: 'cli', branch: c.branch, detached: false, upstream: 'origin/' + c.branch, ahead: 0, behind: 0, gone: false, staged: 0, modified: 0, untracked: 0, fileTotal: 0, files: [], rk: 'r1', ws: true } }); }
  for (const m of msgs) { H.deliver(m); }
  H.advance(300);
  const html = H.els.get('body').innerHTML;
  for (const c of CASES) {
    const j = html.indexOf('data-id="' + id(c.n) + '"');
    const secs = [...html.matchAll(/<section class="band" aria-label="([^"]*)"/g)].filter((m) => m.index < j);
    const cell = /<span class="pr">(.*?)<\/span><span class="kc">/.exec(html.slice(j));
    check('e2e: PR ' + c.pr + ' (' + c.what + ') lands in ' + c.band + ', got ' + (secs.length ? secs[secs.length - 1][1] : 'none'), secs.length > 0 && secs[secs.length - 1][1] === c.band);
    check('e2e: PR ' + c.pr + ' shows its review word in the PR column', !!cell && c.cell.test(cell[1]));
  }
  H.fire(H.els.get('body'), 'click', { target: target('summary') });
  const sum = H.posted.find((p) => p.type === 'summary');
  check('e2e: the summary names the review state in plain words', !!sum && /PR #14583 approved/.test(sum.text) && /PR #13899 changes requested/.test(sum.text) && !/APPROVED|CHANGES_REQUESTED|REVIEW_REQUIRED/.test(sum.text));
  H.errors.forEach((e) => failures.push(e));
  if (failures.length) { console.error('check_prs_e2e FAILED (' + failures.length + ')'); failures.forEach((f) => console.error('  - ' + f)); process.exit(1); }
  console.log('check_prs_e2e OK: real recorded gh JSON through WorkPrs into the page: review words, bands, summary, unknown checks');
  process.exit(0);
})().catch((e) => { console.error('check_prs_e2e crashed: ' + ((e && e.stack) || e)); process.exit(1); });
