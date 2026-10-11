// Fails the build when the Open Work git scan breaks its promises. Drives out/workScan.js, out/execLimit.js, out/workRepo.js,
// out/wipPrs.js and out/workModel.js with a fake command runner (no real git): limiter lanes, deadlines, streaming, caches, abort,
// the shared pull request cache, the remove command text and the page model rules.
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { Limiter } = require(path.join(OUT, 'execLimit.js'));
const { WorkScan } = require(path.join(OUT, 'workScan.js'));
const repoMod = require(path.join(OUT, 'workRepo.js'));
const { parseWorktrees } = require(path.join(OUT, 'wipParse.js'));
const { PrCache } = require(path.join(OUT, 'wipPrs.js'));
const model = require(path.join(OUT, 'workModel.js'));
const failures = [];
const bad = (m) => failures.push(m);
const check = (what, cond) => { if (!cond) { bad(what); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = fs.realpathSync(fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-scan-'))); // link-free: the scan resolves links
const OKRES = (stdout) => ({ code: 0, stdout, stderr: '', timedOut: false, aborted: false });
const ABORTED = { code: null, stdout: '', stderr: '', timedOut: false, aborted: true };

const { fakeGit, collect, chatFolders, mkWorld: mkWorldIn, contactsWorld } = require('./fake_world');
const mkWorld = (n) => mkWorldIn(base, n);

async function limiterTests() {
  // Lanes: the page never takes more than 3 slots, the sidebar can take all 4, the sidebar goes first.
  const log = { running: 0, bgMax: 0, max: 0, order: [] };
  const exec = (cmd, args) => new Promise((res) => { log.running++; log.max = Math.max(log.max, log.running); log.order.push(args[0]); setTimeout(() => { log.running--; res(OKRES('')); }, 30); });
  const lim = new Limiter(4, 3);
  const bg = lim.wrap(exec, 'bg'), ui = lim.wrap(exec, 'ui');
  const tasks = [];
  for (let i = 0; i < 12; i++) { tasks.push(bg('git', ['bg' + i], { cwd: '/', timeout: 1000 })); }
  await sleep(5);
  check('limiter: the page lane runs at most 3 commands', lim.load.bgRunning === 3 && lim.load.running === 3);
  let pageDone = 0; tasks.forEach((t) => t.then(() => { pageDone++; }));
  const u = ui('git', ['ui0'], { cwd: '/', timeout: 1000 });
  await sleep(5);
  check('limiter: a sidebar command starts at once while 3 page commands run (the 4th slot is the sidebar)', lim.load.running === 4 && log.order.includes('ui0'));
  await u;
  check('limiter: the sidebar command did not wait for the page queue (' + pageDone + ' of 12 page commands done)', pageDone < 12);
  await Promise.all(tasks);
  check('limiter: never more than 4 running', log.max <= 4);
  // Sidebar first, and it waits for at most one running command.
  const order = [];
  let finished = 0;
  const slow = (cmd, args) => new Promise((res) => { order.push('start ' + args[0] + ' @' + finished); setTimeout(() => { finished++; res(OKRES('')); }, 40); });
  const l2 = new Limiter(4, 3);
  const bg2 = l2.wrap(slow, 'bg'), ui2 = l2.wrap(slow, 'ui');
  const all = [bg2('git', ['b0'], { cwd: '/', timeout: 1 }), bg2('git', ['b1'], { cwd: '/', timeout: 1 }), bg2('git', ['b2'], { cwd: '/', timeout: 1 }), ui2('git', ['u0'], { cwd: '/', timeout: 1 })];
  all.push(bg2('git', ['b3'], { cwd: '/', timeout: 1 }), bg2('git', ['b4'], { cwd: '/', timeout: 1 }));
  await sleep(5);
  const late = ui2('git', ['u1'], { cwd: '/', timeout: 1 }); // all 4 slots busy: it waits for one running command only
  all.push(late);
  await late;
  const waited = +(order.find((x) => x.startsWith('start u1')) || '@99').split('@')[1]; // commands finished before u1 started
  await Promise.all(all);
  check('limiter: a sidebar command waits for at most one running command (' + waited + ' finished before it started)', waited === 1);
  check('limiter: the sidebar command starts before queued page commands', order.findIndex((x) => x.startsWith('start u1')) < order.findIndex((x) => x.startsWith('start b3')) && order.findIndex((x) => x.startsWith('start u1')) < order.findIndex((x) => x.startsWith('start b4')));
  // Abort while queued: never starts. onStart runs when the command begins, not when queued.
  const l3 = new Limiter(1, 1);
  let started = 0, begun = 0;
  const gate = l3.wrap(slow, 'bg');
  const first = gate('git', ['hold'], { cwd: '/', timeout: 1 });
  const ac = new AbortController();
  const w3 = l3.wrap((c, a) => { started++; return Promise.resolve(OKRES('')); }, 'bg', () => { begun++; });
  const q = w3('git', ['x'], { cwd: '/', timeout: 1, signal: ac.signal });
  await sleep(5);
  check('limiter: onStart does not run while queued', begun === 0);
  ac.abort();
  const qr = await q;
  await first;
  check('limiter: a queued command that is aborted never starts and reports aborted', qr.aborted === true && started === 0 && begun === 0);
  const pre = new AbortController(); pre.abort();
  check('limiter: an already aborted signal never starts', (await w3('git', ['y'], { cwd: '/', timeout: 1, signal: pre.signal })).aborted === true && started === 0);
}

async function scanTests() {
  const world = mkWorld(3);
  const mk = (g, extra) => new WorkScan(Object.assign({ exec: g.exec, limiter: new Limiter(4, 3), deadlineMs: 400, gitMs: 150, workspace: () => [world.repos[0].top] }, extra || {}));
  // Streaming, one final state per folder, shared folder and repository work.
  {
    const g = fakeGit(world), scan = mk(g), c = collect();
    const cwds = [world.repos[0].top, world.repos[1].top, world.repos[2].top, path.join(base, 'not-a-folder')];
    const dup = scan.keyOf(cwds[0]);
    check('scan: a folder keeps one key', dup === scan.keyOf(cwds[0]) && /^f\d+$/.test(dup));
    const t0 = Date.now();
    await scan.start(1, cwds.map((cwd, i) => ({ cwd, last: 100 - i })), false, c.post);
    const times = c.msgs.filter((x) => x.m.type === 'folder' && x.m.state === 'ok').map((x) => x.at - t0);
    check('scan: every folder posts exactly one final state', [...c.finals.values()].every((v) => v.length === 1) && c.finals.size === 4);
    check('scan: results stream folder by folder (first before last)', times.length === 3 && times[0] < times[2]);
    check('scan: a missing folder ends as none with a reason, not a spinner', c.finals.get(scan.keyOf(cwds[3]))[0].state === 'none' && /no longer exists/.test(c.finals.get(scan.keyOf(cwds[3]))[0].reason));
    check('scan: end is posted once with no open keys', c.of('end').length === 1 && c.of('end')[0].open.length === 0 && c.msgs[c.msgs.length - 1].m.type === 'end');
    const ok = c.finals.get(scan.keyOf(cwds[0]))[0];
    check('scan: facts carry branch, ahead, files and the first files', ok.facts.branch === 'main' && ok.facts.ahead === 1 && ok.facts.fileTotal === 2 && ok.facts.files.length === 2 && ok.facts.files[0].p === 'a.txt');
    check('scan: worktree list ran once, for the workspace repository only (3 folders in 3 repositories)', g.calls.filter((x) => x.a.startsWith('worktree list')).length === 1);
    check('scan: never more than 3 commands at once for the page', g.max <= 3);
    check('scan: only allowed read-only git commands ran', g.calls.every((x) => x.cmd === 'git' && /^(rev-parse|status|worktree list|for-each-ref|rev-list|remote get-url origin)/.test(x.a)));
    const repo = c.of('repo').filter((r) => r.state === 'ok' && r.key === ok.facts.rk).pop();
    check('scan: repository layer lists linked worktrees with locked and prunable parsed', repo && repo.worktrees.length === 4 && repo.worktrees.some((w) => w.locked && w.lockReason === 'reason here') && repo.worktrees.some((w) => w.prunable && w.missing));
    check('scan: standalone worktrees (no chat folder) are listed with no folder key and with their own git facts', repo.worktrees.filter((w) => !w.main && w.fks.length === 0).length === 3 && repo.worktrees.find((w) => w.branch === 'feat').facts.ok === true);
    check('scan: a merged branch is marked, a detached worktree is judged by its commit', repo.worktrees.find((w) => w.branch === 'feat').merged === true && repo.worktrees.find((w) => w.detached).merged === true && repo.worktrees[0].merged === null);
    check('scan: the main checkout joins its repository (folder key listed)', repo.worktrees[0].fks.indexOf(ok.key) >= 0 && repo.defLocal === 'main');
    // Cache: a second scan makes no commands and reports the age; force bypasses it.
    const before = g.calls.length, c2 = collect();
    await scan.start(2, cwds.map((cwd) => ({ cwd, last: 1 })), false, c2.post);
    check('scan: the second scan is served from the cache (only the workspace folder is probed again)', g.calls.slice(before).every((x) => x.a.startsWith('rev-parse --show-toplevel') && x.cwd === world.repos[0].top) && c2.of('folder').every((m) => m.state !== 'queued') && c2.of('folder').some((m) => m.age !== undefined));
    await scan.start(3, cwds.map((cwd) => ({ cwd, last: 1 })), true, collect().post);
    check('scan: force bypasses the cache', g.calls.length > before);
  }
  // Folder deadline: a folder whose git never answers ends as timeout within deadline + 50 ms of its first command.
  {
    const g = fakeGit(world), scan = mk(g, { deadlineMs: 200 }), c = collect();
    g.hang.add(world.repos[1].top);
    await scan.start(1, [world.repos[0].top, world.repos[1].top].map((cwd) => ({ cwd, last: 1 })), false, c.post);
    const k = scan.keyOf(world.repos[1].top);
    const run = c.msgs.find((x) => x.m.key === k && x.m.state === 'running'), fin = c.msgs.find((x) => x.m.key === k && x.m.state === 'timeout');
    check('scan: a stuck folder ends as timeout', !!fin && c.finals.get(k).length === 1 && c.of('end')[0].open.length === 0);
    check('scan: the stuck folder ends within deadline + 50 ms of its first command (' + (fin && run ? fin.at - run.at : '?') + ' ms)', fin && run && fin.at - run.at <= 250);
    check('scan: a stuck folder does not hold up the others', c.finals.get(scan.keyOf(world.repos[0].top))[0].state === 'ok');
  }
  // Deadline starts at the first command: queued behind busy sidebar commands, the folder still gets its full time.
  {
    const g = fakeGit(world), lim = new Limiter(4, 3), scan = new WorkScan({ exec: g.exec, limiter: lim, deadlineMs: 100, gitMs: 150, workspace: () => [world.repos[0].top] }), c = collect();
    const hog = lim.wrap((cmd, args) => new Promise((r) => setTimeout(() => r(OKRES('')), 150)), 'ui');
    const hogs = [0, 1, 2, 3].map((i) => hog('git', ['hog'], { cwd: '/', timeout: 1000 }));
    await scan.start(1, [{ cwd: world.repos[0].top, last: 1 }], false, c.post);
    await Promise.all(hogs);
    const k = scan.keyOf(world.repos[0].top);
    check('scan: the folder deadline starts at its first command, not when queued', c.finals.get(k)[0].state === 'ok');
    const rn = c.msgs.find((x) => x.m.key === k && x.m.state === 'running');
    check('scan: running is posted only when the first command starts', rn && rn.at - c.msgs[0].at >= 100);
  }
  // 60 folders behind a 4-slot limiter: none times out from waiting.
  {
    const w60 = mkWorld(60), g = fakeGit(w60), scan = mk(g), c = collect();
    await scan.start(1, w60.repos.map((r, i) => ({ cwd: r.top, last: 100 - i })), false, c.post);
    const states = [...c.finals.values()].map((v) => v[0].state);
    check('scan: 60 folders, none times out from waiting (' + states.filter((s) => s !== 'ok').length + ' not ok)', states.length === 60 && states.every((s) => s === 'ok'));
    check('scan: progress counts to 60 of 60 and is throttled', c.of('progress').pop().git.done === 60 && c.of('progress').length < 40);
    check('scan: 60 folders with 20 ms git stayed within 3 running commands', g.max <= 3);
  }
  // Abort: running fake processes are killed, nothing is posted afterward.
  {
    const g = fakeGit(world, { delay: 60 }), scan = mk(g), c = collect();
    const p = scan.start(1, world.repos.map((r) => ({ cwd: r.top, last: 1 })), false, c.post);
    while (g.running < 1) { await sleep(1); } // cancel the moment a command is running, however slow the machine is
    const n = c.msgs.length;
    scan.cancel();
    await p;
    await sleep(120);
    check('scan: abort kills every running command', g.killed >= 1 && g.running === 0);
    check('scan: nothing is posted after abort', c.msgs.length === n && c.of('end').length === 0);
  }
  // Retry and chat-in-same-repository cases.
  {
    const g = fakeGit(world), scan = mk(g), c = collect();
    await scan.start(1, [{ cwd: world.repos[0].top, last: 1 }], false, c.post);
    const k = scan.keyOf(world.repos[0].top), n0 = g.calls.length;
    scan.retry(k);
    await sleep(150);
    check('scan: retry runs that folder again and posts a new final state', g.calls.length > n0 && c.finals.get(k).length === 2 && c.of('folder').some((m) => m.state === 'queued'));
    const f = scan.fileOf(k, 0), wtKey = c.of('repo').pop().worktrees[1].k;
    check('scan: an open-file click resolves from the last result and refuses an index out of range', f && f.file.p === 'a.txt' && f.top === world.repos[0].top && !scan.fileOf(k, 99) && !scan.fileOf('f999', 0) && !scan.fileOf(k, -1));
    const cm = await scan.commits(k);
    check('scan: expanding a row reads up to 20 unpushed commits through the sidebar lane', cm.commits && cm.commits.length === 2 && cm.commits[0].sha === 'abc1234');
    const rm = scan.removeText(wtKey, false);
    check('scan: the copy-remove text comes from the scan result for a merged worktree', rm && /worktree remove '.*-wt-a'/.test(rm.text) && /branch -d 'feat'/.test(rm.text) && !/--force| -D/.test(rm.text));
    check('scan: the main checkout and a locked worktree have no remove text', !scan.removeText(c.of('repo').pop().worktrees[0].k) && !scan.removeText(c.of('repo').pop().worktrees[2].k) && !scan.removeText('w999'));
  }
  // Branches without a worktree: read on demand, filtered, copy text from the last answer.
  {
    const r0 = world.repos[0], extra = path.join(base, 'repo0-chat');
    fs.mkdirSync(extra, { recursive: true });
    const w2 = { repos: world.repos, byCwd: (cwd) => (cwd === extra ? { repo: r0.repo, top: extra, common: r0.common, branch: 'chatbr', status: '## chatbr...origin/chatbr\0' } : world.byCwd(cwd)) };
    const g = fakeGit(w2), scan = mk(g), c = collect();
    await scan.start(1, [{ cwd: r0.top, last: 1 }, { cwd: extra, last: 1 }], false, c.post);
    const rk = c.of('repo').pop().key;
    const pre = g.calls.filter((x) => /upstream:track/.test(x.a)).length;
    check('branches: the repository layer reads the local branch names once per repository (' + pre + ' reads for ' + c.of('repo').filter((m) => m.state === 'ok').map((m) => m.key).filter((k, i, a) => a.indexOf(k) === i).length + ' repositories), the leftover list is not read until the page asks', pre === c.of('repo').filter((m) => m.state === 'ok').map((m) => m.key).filter((k, i, a) => a.indexOf(k) === i).length);
    {
      const wtm = c.of('repo').pop().worktrees;
      check('worktrees: every git worktree of the repository is posted with its branch (no chat needed): ' + wtm.map((w) => w.name + ':' + (w.branch || '')).join('|'), wtm.length === 4 && wtm.some((w) => w.branch === 'feat' && !w.main && w.fks.length === 0) && wtm.some((w) => w.main));
    }
    const r = await scan.branches(rk);
    const names = (r.list || []).map((b) => b.name);
    check('branches: every local branch with no worktree, no chat and not default, including unmerged ones (' + names.join('|') + ')', names.join('|') === "stale|merged1|it's-done|live");
    check('branches: an unmerged branch with a live remote is flagged neither merged nor gone', r.list[3].merged === false && r.list[3].gone === false);
    check('branches: merged and gone flags', r.list[0].gone === true && r.list[0].merged === false && r.list[1].merged === true && r.more === 0);
    check('branches: the read is one for-each-ref call', g.calls.filter((x) => /upstream:track/.test(x.a)).length === pre + 1 && g.calls.every((x) => x.cmd === 'git'));
    {
      const bl = await scan.branchLink(rk, 'feat'), bl2 = await scan.branchLink(rk, 'stale');
      check('branch link: a known branch becomes its github.com tree page, built by the host from the origin remote (' + bl.url + ')', bl.url === 'https://github.com/acme/repo0/tree/feat' && bl2.url === 'https://github.com/acme/repo0/tree/stale');
      check('branch link: a name the scan does not know, an odd key and a non-string give a reason, never a link', !!(await scan.branchLink(rk, 'nope')).reason && !(await scan.branchLink(rk, 'nope')).url && !!(await scan.branchLink('r999', 'feat')).reason && !!(await scan.branchLink('x', 'feat')).reason && !!(await scan.branchLink(rk, undefined)).reason);
      check('branch link: a chat folder branch is known too', (await scan.branchLink(rk, 'chatbr')).url === 'https://github.com/acme/repo0/tree/chatbr');
      const g2 = fakeGit({ ...w2, remote: 'https://gitlab.com/o/r.git\n' }), s2 = mk(g2), c2 = collect();
      await s2.start(1, [{ cwd: r0.top, last: 1 }], false, c2.post);
      const rk2 = c2.of('repo').pop().key;
      check('branch link: a remote that is not github.com gives a reason and no link', (await s2.branchLink(rk2, 'feat')).url === undefined && /not on github/i.test((await s2.branchLink(rk2, 'feat')).reason));
      const g3 = fakeGit({ ...w2, remote: '' }), s3 = mk(g3), c3 = collect();
      await s3.start(1, [{ cwd: r0.top, last: 1 }], false, c3.post);
      check('branch link: an empty remote gives a reason and no link', (await s3.branchLink(c3.of('repo').pop().key, 'feat')).url === undefined);
    }
    const t = scan.branchText(rk, 1, false);
    check('branches: the copy text is git -C <main> branch -d <name>, quoted, never --force or -D', t && t.text === "git -C '" + r0.repo.main + "' branch -d 'merged1'" && !/--force| -D/.test(t.text));
    const q = scan.branchText(rk, 2, false);
    check('branches: an apostrophe in the name is escaped for the shell', q && q.text === "git -C '" + r0.repo.main + "' branch -d 'it'\\''s-done'");
    check('branches: an index out of range, a negative or fractional one and an unknown repository give nothing', !scan.branchText(rk, 99, false) && !scan.branchText(rk, -1, false) && !scan.branchText('r999', 0, false) && !scan.branchText(rk, 1.5, false));
    check('branches: an unknown or malformed repository key answers with a reason', !!(await scan.branches('r999')).reason && !!(await scan.branches('x;rm')).reason);
    const w = scan.branchText(rk, 2, true);
    check('branches: Windows gets the same safe quoting (apostrophe doubled)', w && w.text === "git -C '" + r0.repo.main + "' branch -d 'it''s-done'");
    const R = { main: '/m', defLocal: 'main' };
    check('branches: no command for the default branch or an option-like name; none ever has --force or -D', repoMod.branchCommand(R, 'main', false) === '' && repoMod.branchCommand(R, '-D', false) === '' && repoMod.branchCommand(R, '', false) === '' && !/--force| -D/.test(repoMod.branchCommand(R, 'x', false)));
    check('branches: Windows with a dollar sign builds no command (manual)', repoMod.branchCommand({ main: 'C:\\r', defLocal: 'main' }, 'a$b', true) === 'manual' && repoMod.branchCommand({ main: 'C:\\r$x', defLocal: 'main' }, 'ok', true) === 'manual');
    const many = Array.from({ length: 70 }, (_, i) => 'b' + i + '\t\t[gone]').join('\n') + '\n';
    r0.repo.branches = many;
    const big = await scan.branches(rk);
    check('branches: at most 50 are listed, the rest are counted', big.list.length === 50 && big.more === 20);
    r0.repo.branches = '';
  }
  // Workspace scope by repository: a sibling worktree folder of a workspace repository counts as in the workspace.
  {
    const g = fakeGit(world), scan = mk(g, { workspace: () => [world.repos[0].top] }), c = collect();
    const sibling = path.join(base, 'repo0-wt-a');
    await scan.start(1, [{ cwd: sibling, last: 1 }, { cwd: world.repos[1].top, last: 1 }], false, c.post);
    await sleep(20);
    const inWs = (cwd) => c.of('folder').filter((m) => m.key === scan.keyOf(cwd) && m.facts).some((m) => m.facts.ws === true);
    check('scan: a chat in a sibling worktree folder is in "this workspace" (scoped by repository)', inWs(sibling));
    check('scan: a folder of another repository is not in the workspace', !inWs(world.repos[1].top));
  }
}

// Merged branch names: read with refname:lstrip=2 (a tag of the same name cannot shorten it), up to 5000, reported (never silently cut) beyond that.
async function mergedTests() {
  const wipGit = require(path.join(OUT, 'wipGit.js'));
  const seen = [];
  const mk = (n) => async (cmd, args) => { seen.push(args.join(' ')); return OKRES(Array.from({ length: n }, (_, i) => 'b' + String(i).padStart(5, '0')).join('\n')); };
  const c = (exec) => ({ exec, gitMs: 1, ghMs: 1, flags: { gitMissing: false } });
  const a = await wipGit.mergedOf(c(mk(4000)), '/x', 'origin/main');
  check('merged: the names are read with %(refname:lstrip=2)', seen.some((x) => /--format=%\(refname:lstrip=2\)/.test(x)) && !seen.some((x) => /refname:short/.test(x)));
  check('merged: 4000 names are all kept (the old cap of 500 cut them alphabetically)', Array.isArray(a) && a.length === 4000 && a[3999] === 'b03999');
  const b = await wipGit.mergedOf(c(mk(5001)), '/x', 'origin/main');
  check('merged: more than 5000 names are reported, not silently cut', b === 'too many branches');
  const o = await wipGit.mergedOf(c(async () => ({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', stdout: 'b1\n', stderr: '', timedOut: false, aborted: false })), '/x', 'origin/main');
  check('merged: an output overflow is reported', o === 'too many branches');
}
function pureTests() {
  const wt = parseWorktrees('worktree /a\nHEAD 1111111\nbranch refs/heads/main\n\nworktree /b\nHEAD 2222222\ndetached\nlocked\n\nworktree /c\nHEAD 3333333\nbranch refs/heads/x\nlocked why\nprunable gone\n');
  const wz = parseWorktrees('worktree /a\0HEAD 1111111\0branch refs/heads/main\0\0worktree /b\nc d\0HEAD 2222222\0branch refs/heads/x\0locked why\0\0worktree /e\0HEAD 3333333\0detached\0\0');
  check('parse -z: a path holding a newline parses whole, fields and blocks split on NUL', wz.length === 3 && wz[1].path === '/b\nc d' && wz[1].branch === 'x' && wz[1].locked && wz[1].lockReason === 'why' && wz[2].detached && wz[0].main && wz[0].path === '/a');
  check('parse -z: the plain porcelain text still parses', parseWorktrees('worktree /a\nHEAD 1\nbranch refs/heads/m\n\nworktree /b\nHEAD 2\ndetached\n').length === 2);
  check('parse: locked without a reason, locked with a reason, prunable, detached, head', wt[1].locked && !wt[1].lockReason && wt[1].detached && wt[2].locked && wt[2].lockReason === 'why' && wt[2].prunable && !wt[0].locked && wt[0].head === '1111111');
  const R = { main: '/home/me/my repo', defLocal: 'main' };
  const W = (o) => Object.assign({ path: "/home/me/it's wt", branch: 'feat', main: false, locked: false, missing: false, merged: true }, o);
  const posix = repoMod.removeCommand(R, W(), false);
  check('remove: POSIX quotes spaces and an apostrophe', posix === "git -C '/home/me/my repo' worktree remove '/home/me/it'\\''s wt'\ngit -C '/home/me/my repo' branch -d 'feat'");
  const win = repoMod.removeCommand({ main: 'C:\\my repo', defLocal: 'main' }, W({ path: 'C:\\my wt' }), true);
  check('remove: Windows uses PowerShell single quotes', win === "git -C 'C:\\my repo' worktree remove 'C:\\my wt'\ngit -C 'C:\\my repo' branch -d 'feat'");
  check('remove: Windows doubles an apostrophe inside single quotes', repoMod.removeCommand({ main: 'C:\\r', defLocal: 'main' }, W({ path: "C:\\it's" }), true) === "git -C 'C:\\r' worktree remove 'C:\\it''s'\ngit -C 'C:\\r' branch -d 'feat'");
  // Windows shells still act on $( ), $env:X, backtick, %VAR%, ! and ^ inside quotes, and a deleted " could retarget branch -d: no command is built for them.
  const RW = { main: 'C:\\r', defLocal: 'main' };
  for (const [what, o] of [['$( )', { path: 'C:\\a$(calc)' }], ['$env:X', { path: 'C:\\a$env:TEMP' }], ['backtick', { path: 'C:\\a`b' }], ['%VAR%', { path: 'C:\\%TEMP%\\x' }], ['double quote', { path: 'C:\\a"b' }], ['!', { path: 'C:\\a!b' }], ['^', { path: 'C:\\a^b' }], ['newline', { path: 'C:\\a\nb' }], ['smart quote', { path: 'C:\\a\u2019b' }], ['branch with $', { branch: 'f$(x)' }], ['branch with "', { branch: 'a"b' }]]) {
    const c = repoMod.removeCommand(RW, W(o), true);
    check('remove: Windows builds no command when ' + what + ' is in the path or branch (' + JSON.stringify(c) + ')', c === 'manual');
  }
  check('remove: Windows main folder with $ also builds no command', repoMod.removeCommand({ main: 'C:\\r$x', defLocal: 'main' }, W({ path: 'C:\\ok' }), true) === 'manual');
  // cmd.exe acts on & | < > ( ) even where PowerShell would not: no command is built for them.
  for (const ch of ['&', '|', '<', '>', '(', ')']) {
    check('remove: Windows builds no command for ' + ch + ' in the path', repoMod.removeCommand(RW, W({ path: 'C:\\a' + ch + 'b' }), true) === 'manual');
    check('remove: Windows builds no command for ' + ch + ' in the main folder', repoMod.removeCommand({ main: 'C:\\r' + ch + 'x', defLocal: 'main' }, W({ path: 'C:\\ok' }), true) === 'manual');
    check('branch: Windows builds no delete command for ' + ch + ' in the name', repoMod.branchCommand(RW, 'a' + ch + 'b', true) === 'manual');
    check('remove: POSIX is unchanged for ' + ch + ' (single quotes are literal there)', repoMod.removeCommand(R, W({ path: '/x' + ch + 'y' }), false).indexOf("worktree remove '/x" + ch + "y'") > 0);
  }
  check('remove: Windows prune ignores the worktree path (not in the command)', repoMod.removeCommand(RW, W({ missing: true, path: 'C:\\a$b' }), true) === "git -C 'C:\\r' worktree prune");
  check('remove: Windows with an unmerged unsafe branch builds worktree remove only (the branch is not in the command)', repoMod.removeCommand(RW, W({ merged: false, branch: 'a$b', path: 'C:\\ok' }), true) === "git -C 'C:\\r' worktree remove 'C:\\ok'");
  check('remove: POSIX stays single-quoted for $ and a double quote (single quotes are literal there)', /worktree remove '\/x\$\(y\)"z'/.test(repoMod.removeCommand(R, W({ path: '/x$(y)"z' }), false)));
  check('remove: branch -d only when merged', !/branch/.test(repoMod.removeCommand(R, W({ merged: false }), false)) && !/branch/.test(repoMod.removeCommand(R, W({ merged: null }), false)) && !/branch/.test(repoMod.removeCommand(R, W({ branch: 'main' }), false)));
  check('remove: a missing folder gives worktree prune', repoMod.removeCommand(R, W({ missing: true }), false) === "git -C '/home/me/my repo' worktree prune");
  check('remove: the main checkout and a locked worktree give nothing', repoMod.removeCommand(R, W({ main: true }), false) === '' && repoMod.removeCommand(R, W({ locked: true }), false) === '');
  check('remove: a branch that looks like an option is never passed to branch -d', !/branch -d/.test(repoMod.removeCommand(R, W({ branch: '-D' }), false)));
  for (const c of [posix, win]) { check('remove: no --force and no -D ever', !/--force|\s-D\b|\s-f\b/.test(c)); }

  // Ready to remove: every failing condition.
  const ok = { ok: true, files: 0, ahead: 0, gone: false };
  const w = { main: false, locked: false, ws: false, missing: false, merged: true };
  check('ready: clean, pushed, merged, unused linked worktree', model.wtReady(w, ok, false) === true);
  const no = (what, ww, g, open) => check('ready: not ready when ' + what, model.wtReady(ww, g, open) === false);
  no('dirty', w, { ok: true, files: 1, ahead: 0, gone: false }, false);
  no('ahead', w, { ok: true, files: 0, ahead: 2, gone: false }, false);
  no('unmerged and upstream present', { ...w, merged: false }, ok, false);
  no('merge unknown', { ...w, merged: null }, ok, false);
  no('an open chat uses it', w, ok, true);
  no('it is a workspace folder', { ...w, ws: true }, ok, false);
  no('locked', { ...w, locked: true }, ok, false);
  no('main checkout', { ...w, main: true }, ok, false);
  no('git facts unknown', w, undefined, false);
  check('ready: upstream gone counts as merged and pushed', model.wtReady({ ...w, merged: false }, { ok: true, files: 0, ahead: 3, gone: true }, false) === true);
  check('ready: a missing folder is ready to prune', model.wtReady({ ...w, missing: true }, undefined, false) === true);
  // Bands.
  const B = model.bandOf, NOW = 1e12, OLD = NOW - 5 * 86400000;
  check('band: files make To finish', B('idle', { ok: true, files: 2, ahead: 0 }, NOW, NOW) === 'finish');
  check('band: unpushed commits make To finish', B('idle', { ok: true, files: 0, ahead: 1 }, NOW, NOW) === 'finish');
  check('band: running wins over To finish', B('running', { ok: true, files: 2, ahead: 0 }, NOW, NOW) === 'waiting');
  check('band: waiting wins over everything', B('waiting', { ok: true, files: 2, ahead: 1 }, NOW, NOW) === 'needs');
  check('band: behind alone does not move a row', B('idle', { ok: true, files: 0, ahead: 0, behind: 5, up: true }, NOW, NOW) === 'idle');
  check('band: clean, pushed, idle 3+ days is Ready to tidy; recent is not', B('idle', { ok: true, files: 0, ahead: 0, up: true }, OLD, NOW) === 'tidy' && B('idle', { ok: true, files: 0, ahead: 0, up: true }, NOW - 1000, NOW) === 'idle');
  check('band: upstream gone or merged branch is Ready to tidy at once', B('idle', { ok: true, files: 0, ahead: 0, gone: true }, NOW, NOW) === 'tidy' && B('idle', { ok: true, files: 0, ahead: 0, merged: true, isDef: false }, NOW, NOW) === 'tidy');
  check('band: a merged default branch (main) is not tidy by itself', B('idle', { ok: true, files: 0, ahead: 0, merged: true, isDef: true }, NOW, NOW) === 'idle');
  check('band: unknown git never moves a row', B('idle', undefined, OLD, NOW) === 'idle' && B('idle', { ok: false }, OLD, NOW) === 'idle' && B('running', undefined, OLD, NOW) === 'waiting');
  check('band: worktree rows: dirty finish, ready tidy, locked and unknown idle', B('idle', { wt: true, ok: true, files: 1, ahead: 0 }) === 'finish' && B('idle', { wt: true, ok: true, files: 0, ahead: 0, ready: true }) === 'tidy' && B('idle', { wt: true, ok: true, files: 5, locked: true }) === 'idle' && B('idle', { wt: true, ok: false }) === 'idle');
  // Mark done.
  const fp = model.fingerprint('idle', 1000, { ok: true, branch: 'b', files: 2, ahead: 1 });
  check('done: hides while nothing changed', model.doneHidden(fp, 'idle', 1000, { ok: true, branch: 'b', files: 2, ahead: 1 }) === true);
  check('done: a new file, commit, branch, message or dot state brings the row back', [model.doneHidden(fp, 'idle', 1000, { ok: true, branch: 'b', files: 3, ahead: 1 }), model.doneHidden(fp, 'idle', 1000, { ok: true, branch: 'b', files: 2, ahead: 2 }), model.doneHidden(fp, 'idle', 1000, { ok: true, branch: 'c', files: 2, ahead: 1 }), model.doneHidden(fp, 'idle', 2000, { ok: true, branch: 'b', files: 2, ahead: 1 }), model.doneHidden(fp, 'running', 1000, { ok: true, branch: 'b', files: 2, ahead: 1 })].every((x) => x === false));
  check('done: git still loading keeps it hidden; marked before git was known compares chat state only', model.doneHidden(fp, 'idle', 1000, undefined) === true && model.doneHidden(model.fingerprint('idle', 1000, undefined), 'idle', 1000, { ok: true, branch: 'b', files: 9, ahead: 9 }) === true);
  check('done: a bad stored value never hides', model.doneHidden(undefined, 'idle', 1, undefined) === false && model.doneHidden('garbage', 'idle', 1, undefined) === false);
}

async function repoLayerTests() {
  const { readRepo } = repoMod;
  // 12 linked worktrees: the repository layer never has more than 2 status calls in flight, and its list command is the -z form.
  const main = path.join(base, 'big'); fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  let txt = 'worktree ' + main + '\nHEAD aaaaaaa1\nbranch refs/heads/main\n\n';
  const tops = new Map();
  for (let i = 0; i < 12; i++) { const d = path.join(base, 'big-wt' + i); fs.mkdirSync(d, { recursive: true }); txt += 'worktree ' + d + '\nHEAD bbbbbbb' + i + '\nbranch refs/heads/b' + i + '\n\n'; tops.set(d, { repo: null, top: d, common: path.join(main, '.git'), branch: 'b' + i, status: '## b' + i + '...origin/b' + i + '\0 M f.txt\0' }); }
  const repo = { common: path.join(main, '.git'), worktree: txt, merged: '', main };
  const ent = { repo, top: main, common: repo.common, branch: 'main', status: '## main\0' };
  const world = { byCwd: (cwd) => (cwd === main ? ent : tops.get(cwd) && Object.assign(tops.get(cwd), { repo })) };
  const mkCtx = (g, signal) => { const t = { cur: 0, max: 0, wl: [] }; const exec = (cmd, args, o) => { const a = args.slice(2); if (a[0] === 'status') { t.cur++; t.max = Math.max(t.max, t.cur); } if (a[0] === 'worktree') { t.wl.push(a.join(' ')); } return g.exec(cmd, args, o).finally(() => { if (a[0] === 'status') { t.cur--; } }); }; return { t, ctx: { exec, signal, gitMs: 500, ghMs: 500, flags: { gitMissing: false } } }; };
  {
    const g = fakeGit(world, { delay: 15 }), { t, ctx } = mkCtx(g);
    const out = await readRepo(ctx, repo.common, main);
    check('repo layer: 12 worktrees are read with at most 2 status calls at once (saw ' + t.max + ')', t.max >= 1 && t.max <= 2 && typeof out !== 'string' && out.worktrees.filter((w) => w.facts && w.facts.ok).length === 13); // 12 linked worktrees and the main checkout
    check('repo layer: the worktree list is asked with --porcelain -z', t.wl.length === 1 && t.wl[0] === 'worktree list --porcelain -z');
  }
  // A timeout mid-way: the finished worktrees keep their facts, the rest stay unread (no canceled error is stored), nothing new starts after the abort.
  {
    const g = fakeGit(world, { delay: 60 }), ac = new AbortController(), { ctx } = mkCtx(g, ac.signal);
    const partial = [];
    // Event-driven abort: when the 5th status starts, abort 30 ms later (statuses start in pairs, so about 4 finish and the rest stay unread).
    const inner = ctx.exec; let statuses = 0;
    ctx.exec = (cmd, args, o) => { if (args.slice(2)[0] === 'status' && ++statuses === 5) { setTimeout(() => ac.abort(), 30); } return inner(cmd, args, o); };
    const out = await readRepo(ctx, repo.common, main, (r) => partial.push(r));
    const done = out.worktrees.filter((w) => w.facts && w.facts.ok).length, errs = out.worktrees.filter((w) => w.facts && !w.facts.ok).length, unread = out.worktrees.filter((w) => !w.main && !w.facts).length;
    check('repo layer: after a timeout the finished worktrees keep their facts (' + done + ' done, ' + unread + ' unread, ' + errs + ' errors)', done >= 2 && done < 12 && unread >= 1 && errs === 0);
    check('repo layer: the worktree rows are offered before any status runs', partial.length >= 1 && partial[0].worktrees.length === 13);
  }
  // Through the scan: a short deadline ends the repository as timeout, and the posted repository still carries the finished worktrees.
  {
    // Event-driven: the first 4 statuses answer normally, every later one hangs until aborted, so the deadline (not timing luck) ends the repository.
    const g = fakeGit(world, { delay: 40 }); let statuses = 0;
    const exec = (cmd, args, o) => { if (args.slice(2)[0] === 'status' && ++statuses > 4) { return new Promise((res) => { if (o.signal) { if (o.signal.aborted) { res(ABORTED); } else { o.signal.addEventListener('abort', () => res(ABORTED), { once: true }); } } }); } return g.exec(cmd, args, o); };
    const scan = new WorkScan({ exec, limiter: new Limiter(4, 3), deadlineMs: 800, gitMs: 700, workspace: () => [main] }), c = collect();
    await scan.start(1, [{ cwd: main, last: 1 }], false, c.post);
    const fin = c.of('repo').filter((m) => m.state !== 'running' && m.state !== 'queued').pop();
    const withFacts = fin ? fin.worktrees.filter((w) => w.facts && w.facts.ok).length : -1;
    check('scan: a timed-out repository still renders its finished worktrees (' + (fin && fin.state) + ', ' + withFacts + ' with facts)', fin && fin.state === 'timeout' && withFacts >= 1 && withFacts < 12);
  }
  // queued, then running when the repository lane starts; only the workspace repository gets a layer, and a folder of another repository is posted outside the workspace.
  {
    const w3 = mkWorld(3), g = fakeGit(w3, { delay: 30 }), scan = new WorkScan({ exec: g.exec, limiter: new Limiter(4, 3), deadlineMs: 400, gitMs: 200, workspace: () => [w3.repos[0].top] }), c = collect();
    await scan.start(1, w3.repos.map((r, i) => ({ cwd: r.top, last: 10 - i })), false, c.post);
    const by = new Map();
    c.msgs.filter((x) => x.m.type === 'repo').forEach((x) => { by.set(x.m.key, (by.get(x.m.key) || []).concat({ s: x.m.state, at: x.at })); });
    const keys = [...by.keys()];
    check('scan: a repository is posted queued first, then running (' + keys.map((k) => by.get(k).map((v) => v.s).join('>')).join(' | ') + ')', keys.length === 1 && keys.every((k) => by.get(k)[0].s === 'queued' && by.get(k).some((v) => v.s === 'running') && by.get(k).findIndex((v) => v.s === 'running') > 0));
    check('scan: folders of the other repositories get ws false and no repository layer', c.of('folder').filter((m) => m.state === 'ok' && m.facts && m.facts.ws === false).length === 2);
  }
}

async function prTests() {
  const mkGh = () => {
    const s = { calls: 0, aborted: 0, resolve: null, signals: [] };
    s.exec = (cmd, args, o) => new Promise((res) => {
      s.calls++; s.signals.push(o.signal);
      const t = setTimeout(() => res(OKRES(JSON.stringify([{ number: 7, title: 't', headRefName: 'feat', isDraft: false, reviewDecision: '', url: 'https://x/7' }]))), 80);
      o.signal.addEventListener('abort', () => { s.aborted++; clearTimeout(t); res(ABORTED); }, { once: true });
    });
    return s;
  };
  const ctx = (g, ac) => ({ exec: g.exec, ghExec: g.exec, gitMs: 1000, ghMs: 1000, flags: { gitMissing: false }, signal: ac.signal });
  // A caller leaving does not cancel the call another caller waits on.
  {
    const g = mkGh(), cache = new PrCache(), a = new AbortController(), b = new AbortController();
    const pa = cache.get(ctx(g, a), 'k', '/x', false, Date.now()), pb = cache.get(ctx(g, b), 'k', '/x', false, Date.now());
    await sleep(10);
    a.abort();
    const ra = await pa, rb = await pb;
    check('pr cache: one gh call is shared by two callers', g.calls === 1);
    check('pr cache: the first caller leaving does not kill the shared call', g.aborted === 0 && rb.byBranch.get('feat') && rb.byBranch.get('feat').number === 7);
    check('pr cache: the caller that left gets canceled, not an answer', ra.error === 'canceled');
  }
  // The call is killed only when no caller is left.
  {
    const g = mkGh(), cache = new PrCache(), a = new AbortController(), b = new AbortController();
    const pa = cache.get(ctx(g, a), 'k', '/x', false, Date.now()), pb = cache.get(ctx(g, b), 'k', '/x', false, Date.now());
    await sleep(10); a.abort(); b.abort();
    await Promise.all([pa, pb]);
    check('pr cache: the call is killed when the last caller leaves', g.aborted === 1);
    const c = new AbortController();
    const r = await cache.get(ctx(g, c), 'k', '/x', false, Date.now());
    check('pr cache: a canceled lookup is not cached (the next caller asks again)', g.calls === 2 && !r.error);
    const again = await cache.get(ctx(g, new AbortController()), 'k', '/x', false, Date.now() + 1000);
    check('pr cache: a good answer is served from the cache for 5 minutes', g.calls === 2 && again.byBranch.size === 1);
    await cache.get(ctx(g, new AbortController()), 'k', '/x', true, Date.now());
    check('pr cache: force skips the cache', g.calls === 3);
  }
  // A caller that already aborted never starts a call.
  {
    const g = mkGh(), cache = new PrCache(), a = new AbortController(); a.abort();
    const r = await cache.get(ctx(g, a), 'z', '/x', false, Date.now());
    await sleep(20);
    check('pr cache: an aborted caller gets canceled and the unused call is killed', r.error === 'canceled' && g.aborted <= 1);
  }
}

// Project status: a repository with worktrees, an unmerged branch and a backup branch but no chat is read from the workspace folder alone.
async function projectStatusTests() {
  const world = mkWorld(1), e = world.repos[0];
  e.repo.branches = 'main\torigin/main\t\t1700000300\tAda Lovelace\nfeat\torigin/feat\t\t1700000200\tGrace Hopper\nold\t\t\t1700000100\tAda Lovelace\nbackup-2026\t\t\t1700000000\tLinus T\tTorvalds\n';
  e.repo.diverge = { feat: [2, 1], 'backup-2026': [5, 0], old: [0, 3] };
  const run = async (w) => { const g = fakeGit(w), scan = new WorkScan({ exec: g.exec, limiter: new Limiter(4, 3), deadlineMs: 600, gitMs: 300, workspace: () => [e.top] }), c = collect(); await scan.start(1, [{ cwd: e.top, last: 0 }], false, c.post); return { g, c, scan }; };
  const { g, c, scan } = await run(world);
  const repo = c.of('repo').filter((r) => r.state === 'ok').pop();
  check('status: a repo with worktrees and no chat is found from the workspace folder', !!repo && repo.worktrees.length === 4 && repo.ws === true);
  check('status: every local branch is listed with date, author, upstream and gone', repo && repo.branches.length === 4 && repo.branches[0].n === 'main' && repo.branches[0].au === 'Ada Lovelace' && repo.branches[0].ts === 1700000300 && repo.branches.find((b) => b.n === 'feat').up === true && repo.branches.find((b) => b.n === 'backup-2026').au === 'Linus T Torvalds' && repo.bmore === 0);
  check('status: ahead and behind the default branch come from one for-each-ref call', repo && repo.branches.find((b) => b.n === 'feat').a === 2 && repo.branches.find((b) => b.n === 'feat').b === 1 && repo.branches.find((b) => b.n === 'backup-2026').a === 5 && g.calls.filter((x) => /ahead-behind/.test(x.a)).length === 1 && !g.calls.some((x) => /rev-list --left-right/.test(x.a)));
  check('status: a worktree carries its branch distance, and the main checkout its changed-file count', repo && repo.worktrees.find((w) => w.branch === 'feat').da === 2 && repo.worktrees.find((w) => w.branch === 'feat').db === 1 && repo.worktrees[0].facts && repo.worktrees[0].facts.ok && repo.worktrees[0].facts.fileTotal === 2);
  check('status: the github link exists on the host only, the page gets a flag', repo.gh === true && scan.repoUrl(c.of('folder').find((f) => f.facts).facts.rk) === 'https://github.com/acme/repo0' && !JSON.stringify(c.msgs.map((x) => x.m)).includes('https://github.com'));
  check('status: only read-only git commands ran', g.calls.every((x) => x.cmd === 'git' && /^(rev-parse|status|worktree list|for-each-ref|rev-list|remote get-url origin)/.test(x.a)));
  // A git without ahead-behind: one rev-list per branch instead, same numbers.
  world.noAheadBehind = true;
  const r2 = await run(world), repo2 = r2.c.of('repo').filter((r) => r.state === 'ok').pop();
  check('status: older git falls back to one rev-list per branch with the same numbers', repo2 && repo2.branches.find((b) => b.n === 'feat').a === 2 && repo2.branches.find((b) => b.n === 'feat').b === 1 && r2.g.calls.some((x) => /rev-list --left-right --count origin\/main\.\.\.refs\/heads\/feat/.test(x.a)));
  world.noAheadBehind = false;
  // Not a GitHub remote: no link.
  world.remote = 'git@example.com:acme/x.git\n';
  const r3 = await run(world);
  check('status: a remote that is not github.com gives no repository link', r3.c.of('repo').filter((r) => r.state === 'ok').pop().gh === false && r3.scan.repoUrl(r3.c.of('folder').find((f) => f.facts).facts.rk) === undefined);
  world.remote = undefined;
  // Branch creation time: the first reflog line of the branch, read as a plain file (no git command).
  const logs = path.join(e.repo.common, 'logs', 'refs', 'heads');
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, 'feat'), '0000000000000000000000000000000000000000 aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1 Ada <a@x> 1700000150 +0100\tbranch: Created from origin/main\n' + 'aaaaaaa1 bbbbbbb2 Ada <a@x> 1700000160 +0100\tcommit: more\n');
  fs.writeFileSync(path.join(logs, 'old'), '0000000000000000000000000000000000000000 aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1 Ada <a@x> 1700000050 +0100\tbranch: Reset to x\n');
  const r4 = await run(world), repo4 = r4.c.of('repo').filter((r) => r.state === 'ok').pop();
  check('status: a branch with a Created line in its reflog carries the creation time (unix seconds)', repo4.branches.find((b) => b.n === 'feat').cr === 1700000150);
  check('status: a branch with no reflog, or a first line that is not a Created line, has creation time 0, and the read ran no extra git command', repo4.branches.find((b) => b.n === 'old').cr === 0 && repo4.branches.find((b) => b.n === 'main').cr === 0 && r4.g.calls.every((x) => !/reflog/.test(x.a)));
  const ri = r4.scan.relInput(repo4.key);
  check('status: relInput names the main folder, every worktree with key, folder and branch, and the branches with creation and tip times', !!ri && ri.roots[0] === e.repo.main && ri.wts.length === 4 && ri.wts.find((w) => w.branch === 'feat').k === repo4.worktrees.find((w) => w.branch === 'feat').k && ri.wts[0].main === true && ri.brs.find((b) => b.n === 'feat').cr === 1700000150 && ri.brs.find((b) => b.n === 'feat').ts === 1700000200 && ri.def === 'main' && !r4.scan.relInput('r999'));
  check('status: the matcher input stays on the host (nothing of it in a posted message but the creation time)', !JSON.stringify(r4.c.msgs.map((x) => x.m)).includes('"roots"') && !JSON.stringify(r4.c.msgs.map((x) => x.m)).includes('"real"'));
}

/** Which chats belong to which worktree or branch: the shell parser, the matcher on a world modelled on the owner's agent-made repository, the request check, and a real parse of a transcript. */
async function chatMatchTests() {
  const { madeOf, madeByTool } = require(path.join(OUT, 'workMade.js'));
  const { relOf, relInOf, MAX_HITS } = require(path.join(OUT, 'workMatch.js'));
  const { createdOf, createdOfLine } = require(path.join(OUT, 'workCreated.js'));
  const m = (c) => JSON.stringify(madeOf(c));
  check('made: git worktree add <path> -b <branch> <start> names the worktree and the branch', m('git fetch origin 2>&1 | tail -2; git worktree add ../contacts-wt-connection-icon -b feat/saropa-connection-cloud-icon-search origin/main 2>&1 | tail -2') === '[["b","feat/saropa-connection-cloud-icon-search"],["w","../contacts-wt-connection-icon"]]');
  check('made: git -C <path> branch <name> HEAD and quoted names', m('git -C /Users/me/contacts branch backup/main-before-merge-20261010_2142 HEAD') === '[["b","backup/main-before-merge-20261010_2142"]]' && m('git worktree add "/tmp/my wt" -B \'fix/x\'') === '[["b","fix/x"],["w","/tmp/my wt"]]');
  check('made: checkout -b, switch -c and --create, in a chain', m('cd x && git checkout -b feat/a && git switch -c feat/b; git switch --create feat/c main') === '[["b","feat/a"],["b","feat/b"],["b","feat/c"]]');
  check('made: nothing for delete, list, rename, plain checkout, a variable, a substitution or a non-git command', ['git branch -d old', 'git branch -D old', 'git branch --list', 'git branch -m a b', 'git branch', 'git checkout main', 'git switch main', 'git worktree list', 'git worktree remove ../x', 'git worktree add $WT -b $B', 'git branch $(date)', 'echo git branch nope', 'git branch -a'].every((c) => m(c) === '[]'));
  check('made: the EnterWorktree tool names a worktree, other tools and shapes name nothing', JSON.stringify(madeByTool('EnterWorktree', { name: 'fix-x' })) === '[["w","fix-x"]]' && madeByTool('Bash', { name: 'x' }).length === 0 && madeByTool('EnterWorktree', null).length === 0);
  // Reflog first line.
  check('created: only a Created line counts, with its seconds', createdOfLine('0000 1111 Ada <a@x> 1700000150 +0100\tbranch: Created from HEAD') === 1700000150 && createdOfLine('0000 1111 Ada <a@x> 1700000150 +0100\tbranch: Reset to x') === 0 && createdOfLine('') === 0);
  const cdir = path.join(base, 'created'); fs.mkdirSync(path.join(cdir, 'logs', 'refs', 'heads', 'feat'), { recursive: true });
  fs.writeFileSync(path.join(cdir, 'logs', 'refs', 'heads', 'feat', 'x'), '0 1 Ada <a@x> 1700000999 -0400\tbranch: Created from main\n');
  const got = await createdOf(cdir, ['feat/x', 'feat/missing', '../escape', '-d', 'feat//y']);
  check('created: a branch with a slash is read from its folder, a missing log gives nothing, an escaping or option-like name is never read', got.get('feat/x') === 1700000999 && got.size === 1);

  // The matcher on the contacts-like world.
  const W = contactsWorld(), out = relOf(W.ix, W.input), id = W.id;
  const ids = (l) => (l || []).map((h) => h.id).sort().join();
  const only = (l, n, why, conf) => l && l.length === 1 && l[0].id === id(n) && l[0].why === why && l[0].conf === conf;
  check('match: a worktree made by a subagent of a chat belongs to that chat (reason subagent, certain), and so does its branch', only(out.w.w2, 1, 'subagent', 'certain') && only(out.b['feat/saropa-connection-cloud-icon-search'], 1, 'subagent', 'certain') && /created/.test(out.w.w2[0].note));
  check('match: a chat that ran in the worktree folder is a cwd match, and its gitBranch field names the branch (both reasons kept)', out.w.w3.length === 1 && out.w.w3[0].why === 'cwd' && out.w.w3[0].more.join() === 'git-branch-field' && out.b['fix/login-reminder-dot-fires-once'][0].why === 'cwd');
  check('match: a chat that ran git worktree add and git checkout -b itself is created-by-tool-call, certain', out.w.w4[0].id === id(3) && out.w.w4[0].why === 'created-by-tool-call' && out.w.w4[0].conf === 'certain' && out.b['feat/pro-pill-gaps'][0].id === id(3) && out.b['feat/pro-pill-gaps'][0].why === 'created-by-tool-call');
  check('match: a subagent whose rows record the branch or ran in the worktree ties its parent chat (subagent)', only(out.w.w5, 4, 'subagent', 'certain') && only(out.b['unused-arb-keys'], 4, 'subagent', 'certain'));
  check('match: an agent-<id> worktree matches the subagent with that id, and so does its worktree-agent-<id> branch', only(out.w.w6, 5, 'subagent', 'certain') && /owns this worktree|ran in/.test(out.w.w6[0].note) && only(out.b['worktree-agent-' + W.AG], 5, 'subagent', 'certain'));
  check('match: a branch made by a subagent with no worktree is tied to the parent chat', only(out.b['backup/main-before-merge-20261010_2142'], 1, 'subagent', 'certain'));
  check('match: a chat that merely mentions a branch that has a creator is listed after it as mention only, never merged with the creator (the creator stays first)', out.b['feat/pro-pill-gaps'].length === 2 && out.b['feat/pro-pill-gaps'][0].conf === 'certain' && out.b['feat/pro-pill-gaps'][0].cr === true && out.b['feat/pro-pill-gaps'][1].id === id(6) && out.b['feat/pro-pill-gaps'][1].why === 'name-in-text' && out.b['feat/pro-pill-gaps'][1].conf === 'mention');
  // The owner's real case: the creator is the parent chat of a subagent that ran a relative `git worktree add`; the other chats only hold the name.
  const LV = '22eb3898-19ee-4316-be07-d87a8384586d';
  const lvw = out.w.w7, lvb = out.b['langv2-final'], lvs = out.b['langv2-spare-branch'];
  for (const [what, l] of [['worktree row', lvw], ['branch row with a worktree', lvb], ['branch row with no worktree', lvs]]) {
    check('langv2 ' + what + ': the parent chat of the subagent that created it is the one certain creator hit, first', l && l[0].id === LV && l[0].conf === 'certain' && l[0].cr === true && l[0].why === 'subagent' && l.filter((h) => h.conf !== 'mention').length === 1);
    check('langv2 ' + what + ': the other repository chat and the owner-question chat are mention only, after the creator, never probable', l && l.length === 3 && l.slice(1).map((h) => h.id).sort().join() === [id(10), id(11)].sort().join() && l.slice(1).every((h) => h.conf === 'mention' && h.why === 'name-in-text'));
  }
  check('langv2: a subagent told in its instructions to use the folder counts as creator even when the folder name is all it has', /created|told to create/.test(lvw[0].note));
  // Without a creator: the agent side of a chat of this repository naming the row is probable; the other repository and the owner question are still mention only.
  const W3 = contactsWorld(); W3.chats.find((c) => c.id === LV).made = undefined; W3.ix.subsOf(W3.chats.find((c) => c.id === LV))[0].made = undefined;
  const o3 = relOf(W3.ix, W3.input);
  check('langv2 with no creator: nothing is certain, the chat names are not probable (other repository, owner question) and stay mention only', o3.w.w7.every((h) => h.conf !== 'certain' && !(h.conf === 'probable' && h.why === 'name-in-text')) && o3.w.w7.filter((h) => h.conf === 'mention').length === 2);
  const W4 = contactsWorld(); W4.chats.find((c) => c.id === LV).made = undefined; W4.ix.subsOf(W4.chats.find((c) => c.id === LV))[0].made = undefined;
  const q = W4.chats.find((c) => c.id === id(11)); q.roles = []; q.ends = []; // an agent said the name in a chat of this repository
  const o4 = relOf(W4.ix, W4.input);
  check('langv2 with no creator: the best mention (an agent side of a chat of this repository) is probable, the other repository chat is still mention only', o4.w.w7.find((h) => h.id === id(11)).conf === 'probable' && o4.w.w7.find((h) => h.id === id(10)).conf === 'mention');
  check('match: with no certain chat the name in a chat is a probable name-in-text match', only(out.b['bahai-mojibake'], 6, 'name-in-text', 'probable'));
  check('match: with no name either, a chat active when the branch was made is a probable time-window match', only(out.b['orphan-spike-branch'], 7, 'time-window', 'probable') && out.b['orphan-spike-branch'][0].near === undefined);
  const far = out.b['ancient-nothing-branch'];
  check('match: a branch nothing links to gets the nearest chat by time, flagged with the gap and probable', far.length === 1 && far[0].why === 'time-window' && far[0].conf === 'probable' && typeof far[0].near === 'number' && far[0].near > 0 && far[0].id === id(1));
  check('match: a branch with no time and no link gets no chat (the page then shows the evidence line)', out.b['no-time-branch'].length === 0);
  check('match: chats of another project never match a row by time', Object.values(out.b).concat(Object.values(out.w)).every((l) => l.every((h) => h.id !== id(8))));
  check('match: the main worktree and the default branch list the chats that ran in the main folder (capped), every other worktree has its own chats', ids(out.w.w1) === [1, 2, 3, 4, 5, 6, 7, 11].map(id).concat([LV]).sort().join() && ids(out.b.main) === ids(out.w.w1) && out.w.w1.length <= MAX_HITS);
  const rows = Object.entries(out.w).concat(Object.entries(out.b));
  check('match: every worktree and every branch with a time ends with a chat (' + rows.filter(([, l]) => !l.length).map(([k]) => k).join(',') + ' has none)', rows.filter(([, l]) => !l.length).map(([k]) => k).join() === 'no-time-branch');
  check('match: every hit has a known reason, a conf and an id', rows.every(([, l]) => l.every((h) => ['cwd', 'git-branch-field', 'created-by-tool-call', 'subagent', 'name-in-text', 'files-touched', 'time-window'].includes(h.why) && (h.conf === 'certain' || h.conf === 'probable' || h.conf === 'mention') && /^[0-9a-f]{8}-/.test(h.id))));
  // files-touched: a chat that edited files under a worktree folder (nothing else links it).
  const W2 = contactsWorld(); const p = W2.chats[3]; p.files = [{ path: W2.C + '-wt-nudge-once/lib/x.dart', edited: true }]; W2.input.brs = W2.input.brs.concat([]);
  const none = W2.input.wts.find((w) => w.k === 'w3'); none.branch = 'nudge-unknown'; W2.chats[1].seen = ['main']; W2.chats[1].cwds = [W2.C]; W2.chats[1].cwd = W2.C;
  const o2 = relOf(W2.ix, W2.input);
  check('match: files touched under a worktree folder are a probable files-touched match when nothing is certain', only(o2.w.w3, 4, 'files-touched', 'probable'));
  // The request body is checked and capped.
  check('match: a request without worktrees or with the wrong shape is refused or cleaned', relInOf(null) === undefined && relInOf({ wts: [] }) === undefined && relInOf({ wts: [{ k: 'w1', name: 5, path: '/a', main: 'yes' }], ids: ['a', 3], brs: [{ n: 'b', cr: 'x', ts: 5 }, 7] }).wts[0].main === false && relInOf({ wts: [{ k: 'w1' }], ids: ['a', 3], brs: [{ n: 'b', cr: 'x', ts: 5 }, 7] }).ids.length === 1 && relInOf({ wts: [{ k: 'w1' }], brs: [{ n: 'b', cr: 'x', ts: 5 }, 7] }).brs.length === 1);
  const big = contactsWorld(); big.input.brs = Array.from({ length: 5000 }, (_, i) => ({ n: 'b' + i, cr: 0, ts: 0 }));
  check('match: a request is capped at 3000 branches', relInOf(big.input).brs.length === 3000);

  // A real parse: the transcript of a subagent that creates a worktree and a branch, rows with gitBranch and changing cwd.
  const { parseFile } = require(path.join(OUT, 'parse.js'));
  const row = (o) => JSON.stringify(Object.assign({ cwd: '/w/contacts', gitBranch: 'main', timestamp: '2026-10-11T01:00:00.000Z' }, o));
  const tool = (cmd, extra) => row({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't', name: 'Bash', input: { command: cmd } }] } }) + '\n' + row(Object.assign({ type: 'user', message: { role: 'user', content: 'go' } }, extra || {})) ;
  const f = path.join(base, 'parse.jsonl');
  fs.writeFileSync(f, [tool('git worktree add ../contacts-wt-x -b feat/x origin/main'), row({ type: 'assistant', cwd: '/w/contacts-wt-x', gitBranch: 'feat/x', message: { role: 'assistant', content: [{ type: 'text', text: 'in the worktree' }] } }), tool('git -C /w/contacts branch backup/y HEAD')].join('\n') + '\n');
  const pr = await parseFile(f, Date.now(), 20000, 0);
  check('parse: a transcript yields every distinct cwd, every gitBranch seen (most used first) and the worktrees and branches its tool calls made', JSON.stringify(pr.cwds) === '["/w/contacts","/w/contacts-wt-x"]' && pr.cwd === '/w/contacts' && pr.seen.includes('feat/x') && pr.seen.includes('main') && JSON.stringify(pr.made) === '[["b","feat/x"],["w","/w/contacts-wt-x"],["b","backup/y"]]');
  // Relative worktree paths resolve against the folder the tool call ran in: `../name`, `./name`, `-C <dir>`, `cd <dir> && git worktree add`, with and without -b, quoted or not.
  const { intendedOf } = require(path.join(OUT, 'workMade.js'));
  const mw = (cmd, cwd) => JSON.stringify(madeOf(cmd, cwd));
  check('made: a relative path resolves against the cwd (../name, ./name), with and without -b, quoted or not', mw('git worktree add ../contacts-wt-langv2 origin/main', '/d/src/contacts') === '[["w","/d/src/contacts-wt-langv2"]]' && mw("git worktree add -b feat/q './wt-q' origin/main", '/d/src/contacts') === '[["b","feat/q"],["w","/d/src/contacts/wt-q"]]' && mw('git worktree add "../my wt" -b q', '/d/src/contacts').includes('/d/src/my wt') && mw('git worktree add /abs/wt', '/d/x') === '[["w","/abs/wt"]]');
  check('made: git -C <dir> and cd <dir> && change the folder a relative path resolves against', mw('cd /d && git -C src/contacts worktree add ../contacts-wt-langv2 origin/main', '/elsewhere') === '[["w","/d/src/contacts-wt-langv2"]]' && mw('cd /d/src && git worktree add ../wt-a', '/elsewhere') === '[["w","/d/wt-a"]]' && mw('git -C /d/src/contacts worktree add -b b1 ../wt-b', '/elsewhere') === '[["b","b1"],["w","/d/src/wt-b"]]' && mw('git worktree add ../wt-c', '') === '[["w","../wt-c"]]');
  check('made: a subagent instruction that states the folder gives an intended worktree', JSON.stringify(intendedOf('Do not launch sub-agents. Use a sibling worktree ../contacts-wt-langv2 from origin/main (git fetch first).', '/d/src/contacts')) === '[["i","/d/src/contacts-wt-langv2"]]' && intendedOf('use a worktree for this', '/x').length === 0);
  // The real shape: a subagent file whose instruction and `cd && git -C ... worktree add ../name` create the worktree.
  const sd = path.join(base, 'proj', 'sess', 'subagents'); fs.mkdirSync(sd, { recursive: true });
  const sf = path.join(sd, 'agent-aeb797a22e217fd5e.jsonl');
  fs.writeFileSync(sf, [row({ type: 'user', cwd: '/d/src/contacts', message: { role: 'user', content: 'Do not launch sub-agents. Use a sibling worktree ../contacts-wt-langv2 from origin/main (git fetch first).' } }), tool('cd /d && git -C src/contacts worktree add ../contacts-wt-langv2 origin/main', null).replace(/"cwd":"\/w\/contacts"/g, '"cwd":"/d/src/contacts"')].join('\n') + '\n');
  const ps = await parseFile(sf, Date.now(), 20000, 0);
  check('parse: a subagent file yields the intended folder from its instruction and the created folder from its tool call (' + JSON.stringify(ps.made) + ')', ps.made.some((m) => m[0] === 'i' && m[1] === '/d/src/contacts-wt-langv2') && ps.made.some((m) => m[0] === 'w' && m[1] === '/d/src/contacts-wt-langv2'));
  const f2 = path.join(base, 'parse2.jsonl'); fs.writeFileSync(f2, row({ type: 'user', message: { role: 'user', content: 'hello' } }) + '\n');
  const p2 = await parseFile(f2, Date.now(), 20000, 0);
  check('parse: a plain chat adds no cwds list (one folder), no created list', p2.cwds === undefined && p2.made === undefined && p2.cwd === '/w/contacts');
}


// Live causes found on the real contacts repo: a record cache of an older format, saved page state of an older build, a name that only
// the transcript text carries (matched through the bloom filter of a really built record), remote-only branches and unregistered worktree folders.
async function liveCauseTests() {
  const cp = require('child_process');
  const { ChatIndex } = require(path.join(OUT, 'index.js'));
  const { FORMAT, DIR_PREFIX } = require(path.join(OUT, 'record.js'));
  const { relOf } = require(path.join(OUT, 'workMatch.js'));
  const state = require(path.join(OUT, 'workState.js'));
  const root = path.join(base, 'live');
  const store = path.join(root, 'store'), proj = path.join(root, 'projects', '-tmp-ctx-contacts');
  fs.mkdirSync(path.join(store, DIR_PREFIX + (FORMAT - 1)), { recursive: true });
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(store, DIR_PREFIX + (FORMAT - 1), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ccr'), 'CCR5 stale record of the older format');
  const line = (t, c) => JSON.stringify({ type: t, timestamp: new Date().toISOString(), cwd: '/tmp/ctx/contacts', gitBranch: 'main', message: { role: t, content: c } });
  const sid = (n) => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
  fs.writeFileSync(path.join(proj, sid(1) + '.jsonl'), line('user', 'please look at contacts-wt-connection-icon, the cloud icon is wrong') + '\n' + line('assistant', [{ type: 'text', text: 'checking' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls ../contacts-wt-connection-icon/lib' } }]) + '\n');
  fs.writeFileSync(path.join(proj, sid(2) + '.jsonl'), line('user', 'unrelated chat about nothing') + '\n' + line('assistant', [{ type: 'text', text: 'ok' }]) + '\n');
  const ix = new ChatIndex(store, path.join(root, 'projects'));
  await ix.load();
  check('live cause: records of an older format are not read (the cache folder is per format), so a stale cache loads as empty and is rebuilt', ix.size === 0 && path.basename(ix.recDir || path.join(store, DIR_PREFIX + FORMAT)) === DIR_PREFIX + FORMAT);
  await ix.refresh();
  check('live cause: the rebuild writes its records under the current format folder', ix.size === 2 && fs.readdirSync(path.join(store, DIR_PREFIX + FORMAT)).filter((n) => n.endsWith('.ccr')).length === 2);
  const input = { ids: [sid(1), sid(2)], roots: ['/tmp/ctx/contacts'], def: 'main', brs: [{ n: 'feat/saropa-connection-cloud-icon-search', cr: 0, ts: 0 }],
    wts: [{ k: 'w1', name: 'contacts', path: '/tmp/ctx/contacts', real: '/tmp/ctx/contacts', branch: 'main', main: true, detached: false },
      { k: 'w2', name: 'contacts-wt-connection-icon', path: '/tmp/ctx/contacts-wt-connection-icon', real: '/tmp/ctx/contacts-wt-connection-icon', branch: 'feat/saropa-connection-cloud-icon-search', main: false, detached: false },
      { k: 's1', name: 'contacts-wt-langv2', path: '/tmp/ctx/contacts-wt-langv2', real: '/tmp/ctx/contacts-wt-langv2', branch: '', main: false, detached: true }] };
  const out = relOf(ix, input);
  check('live cause: a chat that only names the worktree in its text (a really built record and bloom filter) attaches by name-in-text', out.w.w2.length === 1 && out.w.w2[0].id === sid(1) && out.w.w2[0].why === 'name-in-text' && out.w.w2[0].conf === 'probable');
  check('live cause: the branch row of that worktree names it too (the worktree name is a signal for its branch)', out.b['feat/saropa-connection-cloud-icon-search'].some((h) => h.id === sid(1) && h.why === 'name-in-text'));
  check('live cause: an unregistered worktree folder never ends empty: a chat by time or the evidence line', Array.isArray(out.w.s1));
  await ix.dispose();

  // Saved state of an older build once left every state chip off and hid every row.
  const old = { group: 'repo', hidden: ['finish', 'waiting', 'needs', 'tidy'], wsOnly: false };
  const bands = ['needs', 'finish', 'waiting', 'tidy', 'idle'];
  check('live cause: saved chip state of an older build (no version) is ignored: every chip starts on', state.prefsHidden(old, bands).length === 0 && state.prefsHidden({ v: state.STATE_VER, hidden: ['tidy', 'bogus'] }, bands).join() === 'tidy' && state.prefsHidden({ v: state.STATE_VER - 1, hidden: ['tidy'] }, bands).length === 0);
  const oldView = { q: 'langv2', f: { pr: true, fail: false, dirty: false, push: false }, sort: 'name', sec: { wt: false } };
  const dv = state.savedView(oldView);
  check('live cause: a saved view of an older build (filter text, flags, sort, collapsed sections) is ignored', dv.q === '' && !dv.f.pr && dv.sort === 'recent' && Object.keys(dv.sec).length === 0 && state.savedView({ ...oldView, v: state.STATE_VER }).q === 'langv2');

  // Remote-only branches that are not merged, and unregistered worktree folders, on a real repository.
  const { readRepo } = require(path.join(OUT, 'workRepo.js'));
  const { realExec } = require(path.join(OUT, 'wipExec.js'));
  const run = (cwd, ...a) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const home = fs.realpathSync(fs.mkdtempSync(path.join(base, 'rr-')));
  const repo = path.join(home, 'src', 'proj'), bare = path.join(home, 'remote.git');
  fs.mkdirSync(repo, { recursive: true });
  run(repo, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(repo, 'a'), '1'); run(repo, 'add', '.'); run(repo, 'commit', '-q', '-m', 'one');
  run(home, 'init', '-q', '--bare', bare); run(repo, 'remote', 'add', 'origin', bare); run(repo, 'push', '-q', 'origin', 'main');
  run(repo, 'branch', 'merged-remote'); run(repo, 'push', '-q', 'origin', 'merged-remote'); run(repo, 'branch', '-q', '-D', 'merged-remote');
  run(repo, 'checkout', '-q', '-b', 'docs/plan'); fs.writeFileSync(path.join(repo, 'b'), '2'); run(repo, 'add', '.'); run(repo, 'commit', '-q', '-m', 'two'); run(repo, 'push', '-q', 'origin', 'docs/plan');
  run(repo, 'checkout', '-q', 'main'); run(repo, 'branch', '-q', '-D', 'docs/plan'); run(repo, 'branch', 'localonly'); run(repo, 'push', '-q', 'origin', 'localonly'); run(repo, 'remote', 'set-head', 'origin', 'main');
  fs.mkdirSync(path.join(home, 'src', 'proj-wt-plain')); fs.mkdirSync(path.join(home, 'proj-wt-up-one')); fs.mkdirSync(path.join(home, 'src', 'proj-wt-gitfile')); fs.writeFileSync(path.join(home, 'src', 'proj-wt-gitfile', '.git'), 'gitdir: /nowhere'); fs.mkdirSync(path.join(home, 'src', 'other-wt-x'));
  run(repo, 'worktree', 'add', '-q', path.join(home, 'src', 'proj-wt-real'), '-b', 'real-branch');
  const c = { exec: realExec, gitMs: 20000, ghMs: 20000, flags: { gitMissing: false } };
  const r = await readRepo(c, path.join(repo, '.git'), repo);
  check('remote only: an origin branch with no local branch that is not merged is listed, a merged one and a local one are not (' + JSON.stringify(r.remotes) + ')', typeof r !== 'string' && r.remotes.map((x) => x.n).join() === 'docs/plan' && r.remotes[0].ts > 0);
  check('not a registered worktree: <repo>-wt-* folders next to the checkout or one level up that git does not list are found, registered and unrelated ones are not (' + JSON.stringify(r.stray) + ')', r.stray.map((x) => x.name).sort().join() === 'proj-wt-gitfile,proj-wt-plain,proj-wt-up-one' && r.stray.find((x) => x.name === 'proj-wt-gitfile').git === true && r.stray.find((x) => x.name === 'proj-wt-plain').git === false);
  const scan = new WorkScan({ exec: realExec, limiter: new Limiter(6, 3), workspace: () => [repo] });
  const msgs = [];
  await scan.start(1, [{ cwd: repo, last: 1 }], false, (m) => msgs.push(m));
  const rk = msgs.filter((m) => m.type === 'repo' && m.state === 'ok').pop();
  const ri = scan.relInput(rk.key);
  check('posted repository carries the remote-only branches and the unregistered folders (keyed s1..), and the matcher gets them as rows', rk.remotes.length === 1 && rk.stray.length === 3 && /^s\d$/.test(rk.stray[0].k) && ri.wts.filter((w) => /^s\d/.test(w.k)).length === 3 && ri.brs.some((b) => b.n === 'docs/plan'));
}

// Chat placement: a chat run in a worktree folder, on main, in a detached worktree or outside git; the repository message names each worktree's chat folders.
async function placementTests() {
  const world = mkWorld(1);
  const g = fakeGit(world, { delay: 1 });
  const scan = new WorkScan({ exec: g.exec, limiter: new Limiter(6, 3), workspace: () => [world.repos[0].top], gitMs: 1000 });
  const c = collect();
  const f = chatFolders(world.repos[0], base);
  const keys = { main: scan.keyOf(f.main), feat: scan.keyOf(f.feat), detached: scan.keyOf(f.detached), outside: scan.keyOf(f.outside) };
  await scan.start(1, Object.values(f).map((cwd, i) => ({ cwd, last: 10 - i })), false, c.post);
  const repo = c.of('repo').filter((r) => r.state === 'ok').pop();
  const wt = (name) => repo.worktrees.find((w) => w.branch === name);
  check('placement: a chat run in the main checkout is listed on the main worktree', repo.worktrees.find((w) => w.main).fks.join() === keys.main);
  check('placement: a chat run in a linked worktree folder is listed on that worktree', wt('feat').fks.join() === keys.feat && repo.worktrees.filter((w) => w.fks.indexOf(keys.feat) >= 0).length === 1);
  check('placement: a chat in a detached worktree is listed on it', repo.worktrees.find((w) => w.detached).fks.join() === keys.detached);
  check('placement: a chat outside git is on no worktree and its folder ends as none (it goes under Chats without a branch)', repo.worktrees.every((w) => w.fks.indexOf(keys.outside) < 0) && c.finals.get(keys.outside)[0].state === 'none');
  check('placement: the folder facts carry the repository key and the branch the page matches a chat to a branch row by', c.finals.get(keys.feat)[0].facts.branch === 'feat' && c.finals.get(keys.feat)[0].facts.rk === repo.key && c.finals.get(keys.main)[0].facts.branch === 'main');
}

(async () => {
  try {
    await placementTests();
    await liveCauseTests();
    await chatMatchTests();
    await projectStatusTests();
    await mergedTests();
    await limiterTests();
    await scanTests();
    await repoLayerTests();
    pureTests();
    await prTests();
  } catch (e) { bad('check_scan crashed: ' + ((e && e.stack) || e)); } finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* scratch only */ } }
  if (failures.length) {
    console.error('check_scan FAILED (' + failures.length + ')');
    [...new Set(failures)].slice(0, 30).forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('check_scan OK: limiter lanes, deadlines, streaming, caches, abort, shared PR cache, remove text, page model rules');
  process.exit(0);
})();
