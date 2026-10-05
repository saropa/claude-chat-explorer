// Real-run timing of the Open Work pull request layer (not part of the build). Usage: node scripts/bench_prs.js <folder> [<folder> ...]
// Runs the real scan (real git and gh) over the folders, prints when each message arrived, then times one `gh pr view` per folder.
const path = require('path');
const { execFileSync } = require('child_process');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { Limiter } = require(path.join(OUT, 'execLimit.js'));
const { PrCache } = require(path.join(OUT, 'wipPrs.js'));
const { WorkPrs } = require(path.join(OUT, 'workPrs.js'));
const { WorkScan } = require(path.join(OUT, 'workScan.js'));
const { realExec } = require(path.join(OUT, 'wipExec.js'));

async function once(label, folders, cache, prsOn) {
  const t0 = Date.now(), seen = [];
  const scan = new WorkScan({ exec: realExec, limiter: new Limiter(4, 3), workspace: () => [], prsOn: () => prsOn, prs: new WorkPrs({ exec: realExec, limiter: new Limiter(2, 2), cache }) });
  await scan.start(1, folders.map((cwd, i) => ({ cwd, last: 10 - i })), false, (m) => {
    if (['prs', 'checks', 'end'].includes(m.type)) { seen.push((Date.now() - t0) + ' ms  ' + m.type + (m.repo ? ' ' + m.repo : '') + (m.state ? ' ' + m.state : '') + (m.n ? ' #' + m.n : '') + (m.by ? ' by=' + Object.keys(m.by).join(',') : '')); }
  });
  console.log(label + ': scan ended after ' + (Date.now() - t0) + ' ms');
  seen.forEach((l) => console.log('  ' + l));
}
(async () => {
  const folders = process.argv.slice(2);
  const cache = new PrCache();
  await once('cold, lookups on', folders, cache, true);
  await once('warm (caches), lookups on', folders, cache, true);
  await once('lookups off', folders, new PrCache(), false);
  for (const f of folders) {
    try {
      const list = JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'all', '--limit', '1', '--json', 'number'], { cwd: f, encoding: 'utf8' }));
      if (!list.length) { console.log(f + ': no pull request to time'); continue; }
      const t = Date.now();
      execFileSync('gh', ['pr', 'view', String(list[0].number), '--json', 'statusCheckRollup,headRefOid'], { cwd: f, encoding: 'utf8' });
      console.log(f + ': gh pr view #' + list[0].number + ' took ' + (Date.now() - t) + ' ms');
    } catch (e) { console.log(f + ': timing skipped (' + String(e.message).split('\n')[0] + ')'); }
  }
})();
