// Fails the build when the Open Work pull request layer breaks its promises. Drives out/workPrs.js, out/wipPrs.js, out/wipGit.js
// and out/workScan.js with a fake gh runner on a FAKE CLOCK (timers run only when the test advances time):
// check roll-up for every state, fork skip, older gh fallback, streaming order, per-repository serial lookups, 8 s call kill,
// layer deadline, retry, 2 minute check cache and 5 minute list cache with head commit invalidation, failures never cached,
// 60 repositories never above the gh cap of 2, abort kills running gh and posts nothing after, lookups off means zero gh calls.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fakeGit, collect, mkWorld } = require('./fake_world');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { Limiter } = require(path.join(OUT, 'execLimit.js'));
const { PrCache, parsePrs, fetchPrs, ownerOfRemote, ghReason, authState } = require(path.join(OUT, 'wipPrs.js'));
const { GitLiveService } = require(path.join(OUT, 'gitLive.js'));
const FIX = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', 'gh', f), 'utf8'); // real gh output recorded from a public repository
const { rollupChecks, parseView, WorkPrs, CHECKS_CACHE_MS } = require(path.join(OUT, 'workPrs.js'));
const { WorkScan } = require(path.join(OUT, 'workScan.js'));
const { gh: ghRun, AUTH_ARGS } = require(path.join(OUT, 'wipGit.js'));
const { githubBranchUrl, githubRepoOf } = require(path.join(OUT, 'workRepo.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

// ---- fake clock: setTimeout, clearTimeout and Date.now follow advance() only ----
const realImmediate = setImmediate;
const clock = { t: 1e12, seq: 0, timers: new Map() };
globalThis.setTimeout = (f, ms) => { const id = ++clock.seq; clock.timers.set(id, { f, at: clock.t + Math.max(0, Number(ms) || 0) }); return id; };
globalThis.clearTimeout = (id) => { clock.timers.delete(id); };
Date.now = () => clock.t;
const flush = async () => { for (let i = 0; i < 5; i++) { await new Promise((r) => realImmediate(r)); } };
async function advance(ms) {
  const end = clock.t + ms;
  await flush();
  for (;;) {
    let next = null;
    for (const [id, t] of clock.timers) { if (t.at <= end && (!next || t.at < next[1].at)) { next = [id, t]; } }
    if (!next) { break; }
    clock.t = Math.max(clock.t, next[1].at);
    clock.timers.delete(next[0]);
    next[1].f();
    await flush();
  }
  clock.t = end;
  await flush();
}
async function until(cond, stepMs, maxMs) { let spent = 0; while (!cond() && spent < maxMs) { await advance(stepMs); spent += stepMs; } return cond(); }

// ---- fake gh ----
const ABORTED = { code: null, stdout: '', stderr: '', timedOut: false, aborted: true };
const ok = (stdout) => ({ code: 0, stdout, stderr: '', timedOut: false, aborted: false });
const SHA = (c) => c.repeat(40);
const pr = (n, branch, o) => Object.assign({ number: n, title: 'PR ' + n, headRefName: branch, isDraft: false, reviewDecision: '', url: 'https://example.com/pr/' + n, headRefOid: SHA('a'), isCrossRepository: false }, o || {});
const run1 = (name, status, conclusion) => ({ __typename: 'CheckRun', name, status, conclusion });

/** world.lists[cwd] = array of PRs; world.views[n] = items | 'hang' | 'fail'; delays in ms of fake time. */
function mkGh(world) {
  const f = { calls: [], lists: 0, views: [], running: 0, max: 0, killed: 0, delay: 50 };
  f.exec = (cmd, args, opt) => new Promise((resolve) => {
    if (opt.signal && opt.signal.aborted) { resolve(ABORTED); return; }
    if (cmd === 'git') { f.remotes = (f.remotes || 0) + 1; resolve(ok(world.origin || '')); return; } // `git remote get-url origin`, the fork owner lookup
    if (args[0] === 'auth') { f.auths = (f.auths || 0) + 1; f.authArgs = args.join(' '); resolve(world.auth ? world.auth : ok('Logged in to github.com account me')); return; } // `gh auth status`: instant, not a PR lookup
    f.calls.push({ cmd, args: args.join(' '), cwd: opt.cwd, at: Date.now() });
    f.running++; f.max = Math.max(f.max, f.running);
    let fin = false, t = 0;
    const end = (r) => { if (fin) { return; } fin = true; f.running--; clearTimeout(t); clearTimeout(kill); resolve(r); };
    const kill = setTimeout(() => end({ code: null, stdout: '', stderr: '', timedOut: true, aborted: false }), opt.timeout); // the runner's own hard timeout
    if (opt.signal) { opt.signal.addEventListener('abort', () => { if (!fin) { f.killed++; end(ABORTED); } }, { once: true }); }
    if (args[1] === 'list') {
      f.lists++;
      const body = world.listStderr && f.lists === 1 ? null : JSON.stringify(world.lists[opt.cwd] || world.lists['*'] || []);
      if (body === null) { t = setTimeout(() => end({ code: 1, stdout: '', stderr: world.listStderr, timedOut: false, aborted: false }), f.delay); return; }
      t = setTimeout(() => end(ok(body)), f.delay);
      return;
    }
    const n = Number(args[2]);
    f.views.push(n);
    const v = world.views[n];
    if (v === 'hang') { return; } // never answers: only the 8 s kill ends it
    if (v === 'fail') { t = setTimeout(() => end({ code: 1, stdout: '', stderr: 'HTTP 502', timedOut: false, aborted: false }), f.delay); return; }
    t = setTimeout(() => end(ok(JSON.stringify({ statusCheckRollup: v === undefined ? [] : v, headRefOid: SHA('a') }))), f.delay);
  });
  return f;
}
function env(g, o) {
  o = o || {};
  const lim = o.lim || new Limiter(2, 2), cache = o.cache || new PrCache();
  const wp = new WorkPrs({ exec: g.exec, limiter: lim, cache, deadlineMs: o.deadline || 20000, now: Date.now });
  const begin = (force) => {
    const ac = new AbortController(), msgs = [];
    const run = wp.begin({ post: (m) => msgs.push({ m, at: Date.now() }), signal: ac.signal, force: !!force, changed() {} });
    return { run, ac, msgs, of: (t) => msgs.map((x) => x.m).filter((m) => m.type === t) };
  };
  return { wp, lim, cache, begin };
}
async function settle(r, max) { let d = false; r.run.settled().then(() => { d = true; }); return until(() => d, 100, max || 120000); }

async function main() {
  // ---- roll-up: every state ----
  const R = (items) => rollupChecks(items);
  for (const c of ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']) { check('roll-up: conclusion ' + c + ' is failing', R([run1('a', 'COMPLETED', c)]).state === 'failing'); }
  for (const c of ['SUCCESS', 'NEUTRAL', 'SKIPPED']) { check('roll-up: conclusion ' + c + ' is passing', R([run1('a', 'COMPLETED', c)]).state === 'passing'); }
  for (const s of ['IN_PROGRESS', 'QUEUED', 'WAITING', 'PENDING', 'REQUESTED']) { check('roll-up: status ' + s + ' is pending', R([run1('a', s, '')]).state === 'pending'); }
  for (const s of ['FAILURE', 'ERROR']) { check('roll-up: context ' + s + ' is failing', R([{ __typename: 'StatusContext', context: 'ci', state: s }]).state === 'failing'); }
  for (const s of ['PENDING', 'EXPECTED']) { check('roll-up: context ' + s + ' is pending', R([{ __typename: 'StatusContext', context: 'ci', state: s }]).state === 'pending'); }
  check('roll-up: context SUCCESS is passing', R([{ __typename: 'StatusContext', context: 'ci', state: 'SUCCESS' }]).state === 'passing');
  check('roll-up: empty, null and missing are none', R([]).state === 'none' && R(null).state === 'none' && R(undefined).state === 'none' && R([]).total === 0);
  check('roll-up: failing beats pending and passing, with counts', (() => { const r = R([run1('a', 'COMPLETED', 'SUCCESS'), run1('b', 'IN_PROGRESS', ''), run1('c', 'COMPLETED', 'FAILURE'), run1('d', 'COMPLETED', 'FAILURE')]); return r.state === 'failing' && r.total === 4 && r.failing === 2 && r.pending === 1 && r.names.join() === 'c,d'; })());
  check('roll-up: pending beats passing', R([run1('a', 'COMPLETED', 'SUCCESS'), run1('b', 'QUEUED', '')]).state === 'pending');
  check('roll-up: lower case values still count', R([{ status: 'completed', conclusion: 'failure', name: 'x' }]).state === 'failing');
  check('roll-up: a failing check never counts as pending', (() => { const r = R([run1('a', 'COMPLETED', 'FAILURE')]); return r.pending === 0 && r.failing === 1; })());
  const many = R(Array.from({ length: 9 }, (_, i) => run1('check-' + i + ' https://evil.example/x\u0001', 'COMPLETED', 'FAILURE')));
  check('roll-up: at most 5 failing names, links and control characters removed, length capped', many.failing === 9 && many.names.length === 5 && many.names.every((n) => !/https?:|[\u0000-\u001f]/.test(n) && n.length <= 80));
  check('roll-up: a long name is cut', R([run1('x'.repeat(500), 'COMPLETED', 'FAILURE')]).names[0].length <= 80);
  check('view parse: object with a list', parseView('{"statusCheckRollup":[],"headRefOid":"abc1234"}').roll.state === 'none' && parseView('{"statusCheckRollup":null}').roll.state === 'none');
  check('view parse: junk is undefined', parseView('nope') === undefined && parseView('[]') === undefined && parseView('{"statusCheckRollup":5}') === undefined && parseView('null') === undefined);

  // ---- list parser: fork PRs skipped, new fields kept, old gh tolerated ----
  const listJson = JSON.stringify([pr(1, 'feat'), pr(2, 'feat', { isCrossRepository: true }), pr(3, 'other', { headRefOid: undefined, isCrossRepository: undefined }), pr(4, 'bad', { headRefOid: 'zz;rm' })]);
  const lm = parsePrs(listJson, true);
  check('list: for Open Work a fork PR with the same branch name is skipped, the repository PR kept', lm.get('feat').number === 1 && lm.size === 3);
  const all = parsePrs(listJson);
  check('sidebar: the default parse keeps a fork PR when it is the only one; an own PR beats a fork PR of the same branch name even with a lower number', all.get('feat').number === 1 && all.size === 3 && parsePrs(JSON.stringify([pr(5, 'x'), pr(9, 'x', { isCrossRepository: true })])).get('x').number === 5 && parsePrs(JSON.stringify([pr(9, 'x', { isCrossRepository: true }), pr(5, 'x')])).get('x').number === 5 && parsePrs(JSON.stringify([pr(5, 'x'), pr(7, 'x')])).get('x').number === 7 && parsePrs(JSON.stringify([pr(2, 'x', { isCrossRepository: true }), pr(9, 'x', { isCrossRepository: true })])).get('x').number === 9);
  {
    const forkOnly = JSON.stringify([pr(7, 'fk', { isCrossRepository: true })]);
    const r = await fetchPrs({ exec: async () => ok(forkOnly), gitMs: 1, ghMs: 1, flags: { gitMissing: false } }, '/x');
    check('sidebar: fetchPrs lists a fork-only branch for the sidebar but not for Open Work matching', r.byBranch.get('fk').number === 7 && r.own && !r.own.has('fk'));
  }
  check('list: head commit kept; missing new fields (older gh) accepted; a junk commit id dropped', lm.get('feat').sha === SHA('a') && lm.get('other').sha === undefined && lm.get('other').number === 3 && lm.get('bad').sha === undefined);
  { // an older gh rejects the two newer fields: one retry without them
    const calls = [];
    const exec = async (cmd, args) => { calls.push(args.join(' ')); return calls.length === 1 ? { code: 1, stdout: '', stderr: 'Unknown JSON field: "headRefOid"', timedOut: false, aborted: false } : ok(JSON.stringify([{ number: 7, title: 't', headRefName: 'b', isDraft: false, reviewDecision: '', url: 'https://example.com/pr/7' }])); };
    const r = await fetchPrs({ exec, gitMs: 1, ghMs: 1, flags: { gitMissing: false } }, '/x');
    check('older gh: second call drops headRefOid and isCrossRepository and the list still works', calls.length === 2 && /headRefOid/.test(calls[0]) && !/headRefOid|isCrossRepository/.test(calls[1]) && r.byBranch.get('b').number === 7 && !r.error);
    const calls2 = [];
    await fetchPrs({ exec: async (c, a) => { calls2.push(a.join(' ')); return { code: 1, stdout: '', stderr: 'auth required', timedOut: false, aborted: false }; }, gitMs: 1, ghMs: 1, flags: { gitMissing: false } }, '/x');
    check('other failures are not retried', calls2.length === 1);
  }

  // ---- streaming order, serial lookups, command shape ----
  {
    const world = { lists: { '*': [pr(1, 'a'), pr(2, 'b'), pr(3, 'c'), pr(4, 'forkb', { isCrossRepository: true })] }, views: { 1: [run1('lint', 'COMPLETED', 'FAILURE')], 2: [run1('t', 'COMPLETED', 'SUCCESS')], 3: [] } };
    const g = mkGh(world), e = env(g), r = e.begin();
    r.run.join('r1', '/c/.git', '/c', 'a'); r.run.join('r1', '/c/.git', '/c', 'b'); r.run.join('r1', '/c/.git', '/c', 'forkb'); r.run.join('r1', '/c/.git', '/c', undefined);
    check('stream: the layer starts queued before any gh call', r.of('prs')[0].state === 'queued' && g.calls.length <= 1);
    check('stream: settles', await settle(r));
    const kinds = r.msgs.filter((x) => x.m.type !== 'gh').map((x) => x.m.type + ':' + (x.m.state || '') + (x.m.n ? '#' + x.m.n : ''));
    check('stream: order is queued, checking, ok, checking per matched PR, then results one at a time (' + kinds.join(' ') + ')', kinds.join(' ') === 'prs:queued prs:checking prs:ok checks:checking#1 checks:checking#2 checks:failing#1 checks:passing#2');
    check('stream: the list posts only the matched PRs by branch, forks and unmatched never', (() => { const by = r.of('prs').find((m) => m.state === 'ok').by; return Object.keys(by).sort().join() === 'a,b' && by.a.n === 1 && by.a.link === true && !('forkb' in by); })());
    check('stream: PR 3 (branch c) and the fork PR get no check lookup', g.views.join() === '1,2');
    const v = g.calls.filter((c) => / view /.test(' ' + c.args));
    check('stream: the check command is exactly pr view <n> --json statusCheckRollup,headRefOid', v.length === 2 && v.every((c) => /^pr view \d+ --json statusCheckRollup,headRefOid$/.test(c.args) && c.cmd === 'gh'));
    check('stream: one lookup at a time for one repository', g.max === 1);
    const f = r.of('checks').find((m) => m.state === 'failing');
    check('stream: the failing result carries counts and the failing check names', f.total === 1 && f.failing === 1 && f.names.join() === 'lint');
    check('stream: the link is kept host-side by repository key and number', e.wp.url('r1', 1) === 'https://example.com/pr/1' && e.wp.url('r1', 99) === undefined && e.wp.url('r2', 1) === undefined);
    check('stream: progress counts the repository as done', r.run.progress().done === 1 && r.run.progress().total === 1 && r.run.open().length === 0);
    // A branch that joins after the layer finished is matched and looked up on its own.
    r.run.join('r1', '/c/.git', '/c', 'c'); await settle(r);
    check('late branch: PR 3 is looked up and its none result is posted', g.views.join() === '1,2,3' && r.of('checks').some((m) => m.n === 3 && m.state === 'none'));
    check('late branch: the list is not fetched again', g.lists === 1);
  }

  // ---- GitHub connection: gh auth status, rate limit, remote links, PR-only branches ----
  {
    const R = (code, stderr, o) => Object.assign({ code, stdout: '', stderr: stderr || '', timedOut: false, aborted: false }, o || {});
    check('auth: exit 0 is ok', authState(R(0)).state === 'ok');
    check('auth: gh missing', authState(R('ENOENT')).state === 'missing' && authState(R('ENOENT')).reason === 'gh not installed');
    check('auth: not logged in', authState(R(1, 'You are not logged into any GitHub hosts. To log in, run: gh auth login')).state === 'unauth');
    check('auth: timeout and network failures are errors with a reason, not sign-out', authState(R(null, '', { timedOut: true })).reason === 'timed out' && authState(R(1, 'dial tcp: lookup api.github.com: no such host')).state === 'error');
    check('auth: rate limit is an error that says so', authState(R(1, 'API rate limit exceeded. Authenticated requests get a higher rate limit')).reason === 'GitHub rate limit reached');
    check('reason: a rate limit is named before the sign-in rule', ghReason(R(1, 'HTTP 403: API rate limit exceeded; authenticated requests get a higher rate limit')) === 'GitHub rate limit reached');
    let threw = 0;
    for (const bad of [['auth', 'status', '--show-token'], ['auth', 'login'], ['auth'], ['auth', 'token']]) { try { ghRun({ exec: async () => R(0), gitMs: 1, ghMs: 1, flags: { gitMissing: false } }, '/x', bad); } catch { threw++; } }
    check('allow-list: gh auth status only as exactly [auth, status]; --show-token, login, token and a bare auth are refused', threw === 4 && AUTH_ARGS.join(' ') === 'auth status');
    const world = { lists: { '*': [pr(1, 'a')] }, views: { 1: [] } };
    const g = mkGh(world), e = env(g), r = e.begin();
    r.run.join('r1', '/c/.git', '/c', 'a'); r.run.join('r2', '/d/.git', '/d', 'a');
    check('gh message: one gh auth status per scan, posted as a gh message with state ok', await settle(r) && g.auths === 1 && r.of('gh').length === 1 && r.of('gh')[0].state === 'ok' && g.authArgs === 'auth status');
    const r2 = e.begin(); r2.run.join('r1', '/c/.git', '/c', 'a'); await settle(r2);
    check('gh message: a second scan inside 60 s uses the cached answer (no second call), and still posts it', g.auths === 1 && r2.of('gh').length === 1);
    await advance(61000);
    const r3 = e.begin(); r3.run.join('r1', '/c/.git', '/c', 'a'); await settle(r3);
    check('gh message: after 60 s it asks again', g.auths === 2);
    const r4 = e.begin(true); r4.run.join('r1', '/c/.git', '/c', 'a'); await settle(r4);
    check('gh message: a forced scan asks again', g.auths === 3);
    const gm = mkGh({ lists: { '*': [] }, views: {}, auth: R('ENOENT') }), em = env(gm), rm = em.begin();
    rm.run.join('r1', '/c/.git', '/c', 'a'); await settle(rm);
    check('gh message: a missing gh is posted as missing', rm.of('gh')[0].state === 'missing' && rm.of('gh')[0].reason === 'gh not installed');
    const gu = mkGh({ lists: { '*': [] }, views: {}, auth: R(1, 'You are not logged into any GitHub hosts. To log in, run: gh auth login') }), eu = env(gu), ru = eu.begin();
    ru.run.join('r1', '/c/.git', '/c', 'a'); await settle(ru);
    check('gh message: a signed-out gh is posted as unauth', ru.of('gh')[0].state === 'unauth');
    // A local branch that has an open PR but no chat or worktree is matched through addBranches, and posted in the list.
    const wp = mkGh({ lists: { '*': [pr(1, 'a'), pr(5, 'lonely'), pr(6, 'remoteonly')] }, views: { 1: [], 5: [run1('t', 'COMPLETED', 'FAILURE')] } }), ep = env(wp), rp = ep.begin();
    rp.run.join('r1', '/c/.git', '/c', 'a'); rp.run.addBranches('r1', ['a', 'lonely', 'plain']); await settle(rp);
    const by = rp.of('prs').filter((m) => m.state === 'ok').pop().by;
    check('PR-only branch: a local branch with an open PR is in the list with its checks; a PR whose branch is not local is not', Object.keys(by).sort().join() === 'a,lonely' && wp.views.join() === '1,5' && rp.of('checks').some((m) => m.n === 5 && m.state === 'failing'));
    // Remote links: github.com only, https only, branch segments encoded.
    check('remote: https, scp and ssh forms of github.com give the owner and repository', ['https://github.com/o/r.git', 'https://user@github.com/o/r', 'git@github.com:o/r.git', 'ssh://git@github.com/o/r.git', 'git://github.com/o/r/'].every((u) => { const x = githubRepoOf(u + '\n'); return x && x.owner === 'o' && x.repo === 'r'; }));
    check('remote: other hosts, look-alike hosts, odd names and local paths give nothing', ['https://gitlab.com/o/r.git', 'https://github.com.evil.example/o/r', 'https://github.com@evil.example/o/r', 'git@github.com:o/..', 'https://github.com/o/r/extra', '/home/me/repo', 'file:///x/github.com/o/r', 'https://github.com/o%2Fx/r', ''].every((u) => githubRepoOf(u) === undefined));
    check('branch url: the branch is encoded per segment and the host is fixed', githubBranchUrl('git@github.com:o/r.git', 'feat/a b#1?x') === 'https://github.com/o/r/tree/feat/a%20b%231%3Fx' && githubBranchUrl('https://github.com/o/r', 'main') === 'https://github.com/o/r/tree/main');
    check('branch url: unusual branch names and non-GitHub remotes give nothing', githubBranchUrl('https://github.com/o/r', '') === undefined && githubBranchUrl('https://github.com/o/r', 'a/../b') === undefined && githubBranchUrl('https://github.com/o/r', 'a//b') === undefined && githubBranchUrl('https://github.com/o/r', 'a\u0001b') === undefined && githubBranchUrl('https://gitlab.com/o/r', 'main') === undefined);
  }

  // ---- 8 s kill, layer deadline, retry ----
  {
    const world = { lists: { '*': [pr(1, 'a'), pr(2, 'b'), pr(3, 'c')] }, views: { 1: 'hang', 2: [run1('t', 'COMPLETED', 'SUCCESS')], 3: [] } };
    const g = mkGh(world), e = env(g), r = e.begin(), t0 = Date.now();
    ['a', 'b'].forEach((b) => r.run.join('r1', '/c/.git', '/c', b));
    await until(() => r.of('checks').some((m) => m.n === 1 && m.state === 'unavailable'), 100, 30000);
    const u = r.of('checks').find((m) => m.n === 1 && m.state === 'unavailable');
    check('timeout: a gh view that never answers ends "unavailable: timed out" at the 8 s kill (fake time ' + (Date.now() - t0) + ' ms)', u && u.reason === 'timed out' && Date.now() - t0 >= 8000 && Date.now() - t0 < 8600);
    check('timeout: the next PR still gets its result (a hung lookup never blocks the layer)', await settle(r) && r.of('checks').some((m) => m.n === 2 && m.state === 'passing'));
    check('timeout: the layer itself ends as ok (git facts and the list are not lost)', r.of('prs').some((m) => m.state === 'ok') && !r.of('prs').some((m) => m.state === 'unavailable'));
    // Retry: ignores the caches, asks again, the answer now works.
    world.views[1] = [run1('lint', 'COMPLETED', 'FAILURE')];
    const before = g.views.length;
    r.run.retry('r1'); await settle(r);
    check('retry: the list and both PRs are looked up again, ignoring the caches', g.lists === 2 && g.views.length === before + 2);
    check('retry: PR 1 now shows failing', r.of('checks').filter((m) => m.n === 1).pop().state === 'failing');
    check('retry: the layer posts queued again first', r.of('prs').filter((m) => m.state === 'queued').length === 2);
  }
  {
    // Layer deadline: 3 hung lookups. The 8 s kills add up; the layer ends at 20 s of gh time and the running call is killed.
    const world = { lists: { '*': [pr(1, 'a'), pr(2, 'b'), pr(3, 'c')] }, views: { 1: 'hang', 2: 'hang', 3: 'hang' } };
    const g = mkGh(world), e = env(g), r = e.begin(), t0 = Date.now();
    ['a', 'b', 'c'].forEach((b) => r.run.join('r1', '/c/.git', '/c', b));
    check('deadline: settles', await settle(r, 60000));
    const last = r.of('checks').filter((m) => m.state === 'unavailable');
    check('deadline: every PR ends unavailable timed out, none left on checking', last.length === 3 && last.every((m) => m.reason === 'timed out'));
    check('deadline: the whole layer ended within 20 s of gh time plus the list call (fake time ' + (Date.now() - t0) + ' ms)', Date.now() - t0 <= 20000 + 200);
    check('deadline: the third call was killed at the deadline, not left running', g.running === 0 && g.killed >= 1);
  }
  {
    // A slow queue must not time out a repository that has barely started: waiting for a slot does not count.
    const world = { lists: { '*': [pr(1, 'a')] }, views: { 1: [run1('t', 'COMPLETED', 'SUCCESS')] } };
    const g = mkGh(world); g.delay = 4000;
    const e = env(g), runs = [];
    for (let i = 0; i < 8; i++) { const r = e.begin(); r.run.join('r' + (i + 1), '/c' + i + '/.git', '/c' + i, 'a'); runs.push(r); }
    await until(() => runs.every((r) => r.run.open().length === 0), 500, 120000);
    check('queue: 8 repositories behind 2 gh slots all finish with results, none timed out by waiting', runs.every((r) => r.of('checks').some((m) => m.state === 'passing')) && !runs.some((r) => r.of('checks').some((m) => m.state === 'unavailable')));
  }

  // ---- caches ----
  {
    const world = { lists: { '*': [pr(1, 'a')] }, views: { 1: [run1('t', 'COMPLETED', 'SUCCESS')] } };
    const g = mkGh(world), e = env(g);
    const go = async (force) => { const r = e.begin(force); r.run.join('r1', '/c/.git', '/c', 'a'); await settle(r); return r; };
    await go();
    check('cache: first run: 1 list, 1 view', g.lists === 1 && g.views.length === 1);
    await advance(60000); await go();
    check('cache: a second run 1 minute later uses both caches (zero gh calls)', g.lists === 1 && g.views.length === 1);
    await advance(CHECKS_CACHE_MS); await go(); // 3 minutes after the first run
    check('cache: after 2 minutes the checks are looked up again, the list (5 min) is not', g.lists === 1 && g.views.length === 2);
    world.lists['*'] = [pr(1, 'a', { headRefOid: SHA('b') })];
    await advance(300000); await go(); // list cache has expired, the head commit changed
    check('cache: after 5 minutes the list is fetched again', g.lists === 2);
    check('cache: a new head commit invalidates the checks even though they are younger than 2 minutes', g.views.length === 3);
    await advance(10000); await go();
    check('cache: the same head commit again is served from the cache', g.views.length === 3);
    await go(true);
    check('cache: a forced run bypasses every cache', g.lists === 3 && g.views.length === 4);
  }
  {
    const world = { lists: { '*': [pr(1, 'a')] }, views: { 1: 'fail' } };
    const g = mkGh(world), e = env(g);
    const go = async () => { const r = e.begin(); r.run.join('r1', '/c/.git', '/c', 'a'); await settle(r); return r; };
    const r1 = await go();
    check('failure: a failed lookup shows unavailable with a short reason', r1.of('checks').pop().state === 'unavailable' && r1.of('checks').pop().reason === 'gh failed');
    await go();
    check('failure: a failed lookup is not cached (asked again on the next run)', g.views.length === 2);
    world.lists['*'] = [];
    const g2 = mkGh({ lists: {}, views: {} }); g2.exec = async () => ({ code: 'ENOENT', stdout: '', stderr: '', timedOut: false, aborted: false });
    const e2 = env(g2), r2 = e2.begin(); r2.run.join('r1', '/c/.git', '/c', 'a'); await settle(r2);
    check('failure: gh not installed ends the layer as unavailable with that reason, no lookups', r2.of('prs').pop().state === 'unavailable' && r2.of('prs').pop().reason === 'gh not installed' && r2.of('checks').length === 0);
  }

  // ---- 60 repositories x lookups never exceed the gh cap of 2 ----
  {
    const lists = {};
    const world = { lists, views: {} };
    for (let i = 0; i < 60; i++) { lists['/r' + i] = [pr(1000 + i, 'a'), pr(2000 + i, 'b')]; world.views[1000 + i] = [run1('t', 'COMPLETED', i % 7 === 0 ? 'FAILURE' : 'SUCCESS')]; world.views[2000 + i] = [run1('t', 'IN_PROGRESS', '')]; }
    const g = mkGh(world), e = env(g, { deadline: 20000 });
    const r = e.begin();
    for (let i = 0; i < 60; i++) { ['a', 'b'].forEach((b) => r.run.join('r' + (i + 1), '/r' + i + '/.git', '/r' + i, b)); }
    check('60 repos: settles', await settle(r, 600000));
    check('60 repos: never more than 2 gh processes at once (max ' + g.max + ')', g.max <= 2 && g.max >= 2);
    check('60 repos: 60 lists and 120 views, every PR has one final result', g.lists === 60 && g.views.length === 120 && r.of('checks').filter((m) => m.state !== 'checking').length === 120);
    check('60 repos: no PR timed out from waiting in the queue', !r.of('checks').some((m) => m.state === 'unavailable'));
    check('60 repos: progress is 60 of 60', r.run.progress().done === 60 && r.run.progress().total === 60);
    check('60 repos: the limiter is idle at the end', e.lim.load.running === 0 && e.lim.load.waiting === 0);
  }

  // ---- abort ----
  {
    const lists = {}, world = { lists, views: {} };
    for (let i = 0; i < 6; i++) { lists['/r' + i] = [pr(i + 1, 'a')]; world.views[i + 1] = 'hang'; }
    const g = mkGh(world), e = env(g), r = e.begin();
    for (let i = 0; i < 6; i++) { r.run.join('r' + (i + 1), '/r' + i + '/.git', '/r' + i, 'a'); }
    await advance(500);
    const runningBefore = g.running;
    check('abort: gh children are running before the page closes', runningBefore === 2);
    const n = r.msgs.length;
    r.ac.abort();
    await advance(60000);
    check('abort: every running gh child was killed and none is left', g.running === 0 && g.killed >= 2 && e.lim.load.running === 0);
    check('abort: queued lookups never started (only the 2 that were already running ever ran)', g.views.length === 2);
    check('abort: nothing is posted after the abort', r.msgs.length === n);
    check('abort: the layer settles', await settle(r, 5000));
    r.run.join('r9', '/r9/.git', '/r9', 'a'); r.run.retry('r1'); await advance(1000);
    check('abort: later joins and retries start nothing and post nothing', r.msgs.length === n && g.running === 0);
  }

  // ---- a caller that leaves does not kill a shared list call another caller waits on (the sidebar card) ----
  {
    const world = { lists: { '*': [pr(1, 'a')] }, views: {} };
    const g = mkGh(world), cache = new PrCache(), a = new AbortController(), b = new AbortController();
    const ctx = (s) => ({ exec: g.exec, signal: s.signal, gitMs: 5000, ghMs: 8000, flags: { gitMissing: false } });
    const pa = cache.get(ctx(a), '/c/.git', '/c', false, Date.now()), pb = cache.get(ctx(b), '/c/.git', '/c', false, Date.now());
    a.abort(); await advance(200);
    const rb = await pb, ra = await pa;
    check('shared list: the page leaving does not cancel the call the sidebar waits for', !rb.error && rb.byBranch.get('a').number === 1 && g.killed === 0 && ra.error === 'canceled' && g.lists === 1);
  }

  // ---- WorkScan with the layer: streaming, off switch, cancel ----
  const base = fs.realpathSync(fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-prs-')));
  try {
    const world = mkWorld(base, 4);
    const ghWorld = { lists: {}, views: {} };
    world.repos.forEach((r, i) => { const wtA = r.top + '-wt-a'; ghWorld.lists[wtA] = [pr(100 + i, 'feat'), pr(900 + i, 'feat', { isCrossRepository: true }), pr(300 + i, 'unrelated')]; ghWorld.lists[r.top] = ghWorld.lists[wtA]; ghWorld.views[100 + i] = [run1('t', 'COMPLETED', i % 2 ? 'SUCCESS' : 'FAILURE')]; });
    const mk = (opt) => {
      const git = fakeGit(world), gh = mkGh(ghWorld);
      const exec = (cmd, args, o) => (cmd === 'gh' ? gh.exec(cmd, args, o) : git.exec(cmd, args, o));
      const lim = new Limiter(4, 3), ghl = new Limiter(2, 2);
      const scan = new WorkScan({ exec, limiter: lim, deadlineMs: 5000, gitMs: 3000, workspace: () => [], prsOn: opt.prsOn, prs: new WorkPrs({ exec, limiter: ghl, cache: new PrCache(), deadlineMs: 20000, now: Date.now }) });
      return { git, gh, scan, c: collect() };
    };
    const folders = world.repos.map((r, i) => ({ cwd: r.top + '-wt-a', last: 10 - i }));
    {
      const s = mk({ prsOn: () => true });
      let done = false; s.scan.start(1, folders, false, s.c.post).then(() => { done = true; });
      check('scan with PRs: finishes', await until(() => done, 100, 120000));
      const prs = s.c.of('prs'), chk = s.c.of('checks'), end = s.c.of('end')[0];
      check('scan with PRs: every repository posts queued then an ok list with only its own repository PR (fork PR and unrelated PR left out)', world.repos.every((_, i) => { const ok1 = prs.find((m) => m.repo === 'r' + (i + 1) && m.state === 'ok'); return ok1 && Object.keys(ok1.by).join() === 'feat' && ok1.by.feat.n === 100 + i; }));
      check('scan with PRs: one check result per repository, failing for even repositories, passing for odd ones', world.repos.every((_, i) => { const m = chk.find((x) => x.repo === 'r' + (i + 1) && x.state !== 'checking'); return m && m.state === (i % 2 ? 'passing' : 'failing'); }));
      check('scan with PRs: end comes after every PR result and lists no unfinished key', end && s.c.msgs.findIndex((x) => x.m.type === 'end') > s.c.msgs.map((x) => x.m.type + x.m.state).lastIndexOf('checksfailing') && end.open.length === 0);
      check('scan with PRs: progress messages carry a prs counter that reaches 4 of 4', s.c.of('progress').some((m) => m.prs && m.prs.done === 4 && m.prs.total === 4));
      check('scan with PRs: the PR layer never waited for git (a PR list was asked before the scan ended) and gh never exceeded 2', s.gh.max <= 2 && s.gh.lists === 4);
      check('scan with PRs: the page can ask for the link by repository key and number', s.scan.prUrl('r1', 100) === 'https://example.com/pr/100' && s.scan.prUrl('r1', 900) === undefined);
      s.scan.retry('p1'); await advance(2000);
      check('scan with PRs: retry p1 reruns that repository only (a queued state again, others untouched)', s.c.of('prs').filter((m) => m.repo === 'r1' && m.state === 'queued').length === 2 && s.gh.lists === 5);
    }
    {
      const s = mk({ prsOn: () => false });
      let done = false; s.scan.start(1, folders, false, s.c.post).then(() => { done = true; });
      check('lookups off: the scan still finishes', await until(() => done, 100, 120000));
      check('lookups off: ZERO gh calls', s.gh.calls.length === 0);
      check('lookups off: no prs or checks message and no prs counter at all', s.c.of('prs').length === 0 && s.c.of('checks').length === 0 && !s.c.of('progress').some((m) => 'prs' in m) && s.c.of('end').length === 1);
      s.scan.retry('p1'); await advance(1000);
      check('lookups off: a retry of a PR key starts nothing', s.gh.calls.length === 0);
    }
    {
      const s = mk({ prsOn: undefined }); // no switch given: lookups are on (the setting defaults to on)
      let done = false; s.scan.start(1, folders, false, s.c.post).then(() => { done = true; });
      await until(() => done, 100, 120000);
      check('switch default: an absent switch means lookups on', s.gh.lists === 4);
    }
    {
      for (const v of Object.keys(ghWorld.views)) { ghWorld.views[v] = 'hang'; }
      const s = mk({ prsOn: () => true });
      s.scan.start(1, folders, false, s.c.post);
      await until(() => s.gh.running >= 2 && s.gh.views.length >= 1, 50, 60000);
      const n = s.c.msgs.length;
      s.scan.cancel(); await advance(60000);
      check('scan abort: closing the page kills the running gh children', s.gh.running === 0 && s.gh.killed >= 1);
      check('scan abort: nothing is posted after the cancel', s.c.msgs.length === n);
      check('scan abort: no end message after a cancel', s.c.of('end').length === 0);
    }

    // ---- real recorded gh JSON: fork clone, review words, not a GitHub repository, bad numbers, sidebar lane ----
    {
      const real = JSON.parse(FIX('cli_list.json'));
      const CR = 'fix/13804-gh-issue-create-errors-after-successful', UP = 'bagtoad/add-accessibility-md';
      // A fork clone: origin is me/cli, the list comes from the parent. Only the PR whose head repository belongs to me is mine.
      const fork = real.map((x) => Object.assign({}, x, { headRepositoryOwner: { login: x.number === 13899 ? 'me' : x.isCrossRepository ? 'someone-' + x.number : 'cli' } }));
      const g = mkGh({ lists: { '*': fork }, views: { 13899: [] }, origin: 'git@github.com:me/cli.git\n' });
      const e = env(g), r = e.begin();
      r.run.join('r1', '/c/.git', '/c', CR); r.run.join('r1', '/c/.git', '/c', UP);
      check('fork clone: settles', await settle(r));
      const by = r.of('prs').find((m) => m.state === 'ok').by;
      check('fork clone: my own cross-repository PR is matched, the upstream repository PR of another branch is not', Object.keys(by).join() === CR && by[CR].n === 13899 && g.remotes === 1);
      check('fork clone: only my PR gets a check lookup', g.views.join() === '13899');
      check('review words: CHANGES_REQUESTED from real gh JSON reaches the page as "changes requested"', by[CR].review === 'changes requested');
      check('owner of a remote: https, ssh and scp styles', ownerOfRemote('https://github.com/Me/cli.git\n') === 'me' && ownerOfRemote('git@github.com:me/cli.git') === 'me' && ownerOfRemote('ssh://git@github.com/me/cli') === 'me' && ownerOfRemote('') === undefined);
      // The same list in a plain clone (origin is cli/cli, no head owner known): the fork flag decides.
      const g2 = mkGh({ lists: { '*': real }, views: {}, origin: 'https://github.com/cli/cli.git' }), e2 = env(g2), r2 = e2.begin();
      r2.run.join('r1', '/c/.git', '/c', CR); r2.run.join('r1', '/c/.git', '/c', UP);
      await settle(r2);
      const by2 = r2.of('prs').find((m) => m.state === 'ok').by;
      check('plain clone: the fork PR is skipped, the repository PR kept with the word "approved"', Object.keys(by2).join() === UP && by2[UP].review === 'approved');
    }
    {
      const stderr = 'none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`';
      const calls = [];
      const exec = async (cmd, args) => { calls.push(cmd); return cmd === 'gh' ? { code: 1, stdout: '', stderr, timedOut: false, aborted: false } : ok(''); };
      const c = { exec, gitMs: 1, ghMs: 1, flags: { gitMissing: false } };
      const r = await fetchPrs(c, '/x');
      check('not GitHub: a non-GitHub remote is reported as "not a GitHub repository", never "not signed in"', r.error === 'not a GitHub repository' && r.notGithub === true);
      check('auth failure: a real sign-in message still says not signed in', ghReason({ code: 4, stderr: 'To get started with GitHub CLI, please run:  gh auth login', stdout: '', timedOut: false, aborted: false }) === 'not signed in to gh');
      const cache = new PrCache(); const t0 = Date.now();
      await cache.get(c, 'k', '/x', false, t0); await cache.get(c, 'k', '/x', false, t0 + 4 * 60 * 1000);
      check('not GitHub: cached for 5 minutes, gh runs once', calls.filter((x) => x === 'gh').length === 2); // fetchPrs above + one cached fetch
      await cache.get(c, 'k', '/x', false, t0 + 6 * 60 * 1000);
      check('not GitHub: asked again after 5 minutes', calls.filter((x) => x === 'gh').length === 3);
      const flaky = async () => ({ code: 1, stdout: '', stderr: 'HTTP 502', timedOut: false, aborted: false }); let n = 0;
      const c2 = { exec: async (...a) => { n++; return flaky(...a); }, gitMs: 1, ghMs: 1, flags: { gitMissing: false } }, cache2 = new PrCache();
      await cache2.get(c2, 'k', '/x', false, t0); await cache2.get(c2, 'k', '/x', false, t0 + 1000);
      check('failures other than not-GitHub are still never cached', n === 2);
    }
    {
      const world = { lists: { '*': [pr(0, 'zero'), pr(1234567890, 'huge'), pr(4, 'ok')] }, views: {} };
      const g = mkGh(world), e = env(g), r = e.begin();
      r.run.join('r1', '/c/.git', '/c', 'zero'); r.run.join('r1', '/c/.git', '/c', 'huge'); r.run.join('r1', '/c/.git', '/c', 'ok');
      check('bad number: settles', await settle(r));
      check('bad number: a PR number gh would never print is skipped, the repository and the other PR still work', r.of('prs').every((m) => m.state !== 'unavailable') && Object.keys(r.of('prs').find((m) => m.state === 'ok').by).join() === 'ok' && g.views.join() === '4');
    }
    { // Sidebar lane: the page holds 1 of 2 gh slots with two 6 s calls; a 5 s sidebar call must finish inside its 10 s card deadline.
      const repo = path.join(base, 'lane-repo'); fs.mkdirSync(repo, { recursive: true });
      const slow = (ms) => (c, a, o) => new Promise((res) => { setTimeout(() => res(ok('[]')), ms); });
      const lane = async (pageSlots, firstDelay) => {
        const L = new Limiter(2, pageSlots), t0 = clock.t;
        const bg = L.wrap(slow(6000), 'bg'); bg('gh', ['pr', 'list'], { cwd: '/', timeout: 8000 }); bg('gh', ['pr', 'list'], { cwd: '/', timeout: 8000 });
        const side = new GitLiveService(realExecSafe, L.wrap(slow(5000), 'ui'), new PrCache());
        let res; side.load(repo, 'git', true).then((x) => { res = x; });
        await until(() => res, 100, 30000);
        return { res, at: clock.t - t0 };
      };
      const realExecSafe = async (cmd, args, o) => { const a = args.slice(2); // a fake git on the fake clock (real processes would not keep up with it)
        return ok(a[0] === 'rev-parse' ? repo + '\n.git\nrefs/heads/main\n' : a[0] === 'for-each-ref' ? 'main\t\t\n' : ''); };
      const a = await lane(1);
      check('sidebar lane: with the page on 1 of 2 gh slots a 5 s sidebar lookup finishes in time with its PR answer', a.res && a.res.live.state === 'ok' && a.res.live.prPending !== true && a.at <= 6000);
      const b = await lane(2);
      check('sidebar lane: guard that the test can fail (page on both slots, the sidebar waits 6 s and its 5 s call then runs, still inside the deadline because it counts from the start)', b.res && b.res.live.state === 'ok');
      // Deadline counted from the start of its command: a sidebar call queued behind a 12 s job is not timed out while it waits.
      const L = new Limiter(1, 1); const blocker = L.wrap(slow(12000), 'ui'); blocker('gh', ['pr', 'list'], { cwd: '/', timeout: 20000 });
      const side = new GitLiveService(realExecSafe, L.wrap(slow(5000), 'ui'), new PrCache()); let res;
      side.load(repo, 'git', true).then((x) => { res = x; });
      await until(() => res, 100, 40000);
      check('sidebar deadline: waiting for a slot does not use up the 10 s card deadline', res && res.live.state === 'ok');
    }
  } finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* scratch only */ } }

  if (failures.length) { console.error('check_prs FAILED (' + failures.length + ')'); failures.forEach((f) => console.error('  - ' + f)); process.exit(1); }
  console.log('check_prs OK: check roll-up, fork skip, older gh, streaming, 8 s kill, deadline, retry, caches, 60 repos under the gh cap, abort, lookups off');
  process.exit(0);
}
main().catch((e) => { console.error('check_prs crashed: ' + ((e && e.stack) || e)); process.exit(1); });
