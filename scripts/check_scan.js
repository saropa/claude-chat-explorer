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

const { fakeGit, collect, mkWorld: mkWorldIn } = require('./fake_world');
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
  const t0 = Date.now();
  const u = ui('git', ['ui0'], { cwd: '/', timeout: 1000 });
  await sleep(5);
  check('limiter: a sidebar command starts at once while 3 page commands run (the 4th slot is the sidebar)', lim.load.running === 4 && log.order.includes('ui0'));
  await u;
  check('limiter: the sidebar command did not wait for the page queue', Date.now() - t0 < 80);
  await Promise.all(tasks);
  check('limiter: never more than 4 running', log.max <= 4);
  // Sidebar first, and it waits for at most one running command.
  const order = [];
  const slow = (cmd, args) => new Promise((res) => { order.push('start ' + args[0]); setTimeout(() => res(OKRES('')), 40); });
  const l2 = new Limiter(4, 3);
  const bg2 = l2.wrap(slow, 'bg'), ui2 = l2.wrap(slow, 'ui');
  const all = [bg2('git', ['b0'], { cwd: '/', timeout: 1 }), bg2('git', ['b1'], { cwd: '/', timeout: 1 }), bg2('git', ['b2'], { cwd: '/', timeout: 1 }), ui2('git', ['u0'], { cwd: '/', timeout: 1 })];
  all.push(bg2('git', ['b3'], { cwd: '/', timeout: 1 }), bg2('git', ['b4'], { cwd: '/', timeout: 1 }));
  await sleep(5);
  const tA = Date.now();
  const late = ui2('git', ['u1'], { cwd: '/', timeout: 1 }); // all 4 slots busy: it waits for one running command only
  all.push(late);
  await late;
  const waited = Date.now() - tA;
  await Promise.all(all);
  check('limiter: a sidebar command waits for at most one running command (' + waited + ' ms)', waited < 40 + 45);
  check('limiter: the sidebar command starts before queued page commands', order.indexOf('start u1') < order.indexOf('start b3') && order.indexOf('start u1') < order.indexOf('start b4'));
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
  const mk = (g, extra) => new WorkScan(Object.assign({ exec: g.exec, limiter: new Limiter(4, 3), deadlineMs: 200, gitMs: 150, workspace: () => [] }, extra || {}));
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
    check('scan: worktree list ran once per repository (3 repositories)', g.calls.filter((x) => x.a.startsWith('worktree list')).length === 3);
    check('scan: never more than 3 commands at once for the page', g.max <= 3);
    check('scan: only allowed read-only git commands ran', g.calls.every((x) => x.cmd === 'git' && /^(rev-parse|status|worktree list|for-each-ref|rev-list)/.test(x.a)));
    const repo = c.of('repo').filter((r) => r.state === 'ok' && r.key === ok.facts.rk).pop();
    check('scan: repository layer lists linked worktrees with locked and prunable parsed', repo && repo.worktrees.length === 4 && repo.worktrees.some((w) => w.locked && w.lockReason === 'reason here') && repo.worktrees.some((w) => w.prunable && w.missing));
    check('scan: standalone worktrees (no chat folder) are listed with no folder key and with their own git facts', repo.worktrees.filter((w) => !w.main && w.fks.length === 0).length === 3 && repo.worktrees.find((w) => w.branch === 'feat').facts.ok === true);
    check('scan: a merged branch is marked, a detached worktree is judged by its commit', repo.worktrees.find((w) => w.branch === 'feat').merged === true && repo.worktrees.find((w) => w.detached).merged === true && repo.worktrees[0].merged === null);
    check('scan: the main checkout joins its repository (folder key listed)', repo.worktrees[0].fks.indexOf(ok.key) >= 0 && repo.defLocal === 'main');
    // Cache: a second scan makes no commands and reports the age; force bypasses it.
    const before = g.calls.length, c2 = collect();
    await scan.start(2, cwds.map((cwd) => ({ cwd, last: 1 })), false, c2.post);
    check('scan: the second scan is served from the cache (no commands)', g.calls.length === before && c2.of('folder').every((m) => m.state !== 'queued') && c2.of('folder').some((m) => m.age !== undefined));
    await scan.start(3, cwds.map((cwd) => ({ cwd, last: 1 })), true, collect().post);
    check('scan: force bypasses the cache', g.calls.length > before);
  }
  // Folder deadline: a folder whose git never answers ends as timeout within deadline + 50 ms of its first command.
  {
    const g = fakeGit(world), scan = mk(g), c = collect();
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
    const g = fakeGit(world), lim = new Limiter(4, 3), scan = new WorkScan({ exec: g.exec, limiter: lim, deadlineMs: 100, gitMs: 150, workspace: () => [] }), c = collect();
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
    await sleep(30);
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
    check('repo layer: 12 worktrees are read with at most 2 status calls at once (saw ' + t.max + ')', t.max >= 1 && t.max <= 2 && typeof out !== 'string' && out.worktrees.filter((w) => w.facts && w.facts.ok).length === 12);
    check('repo layer: the worktree list is asked with --porcelain -z', t.wl.length === 1 && t.wl[0] === 'worktree list --porcelain -z');
  }
  // A timeout mid-way: the finished worktrees keep their facts, the rest stay unread (no canceled error is stored), nothing new starts after the abort.
  {
    const g = fakeGit(world, { delay: 60 }), ac = new AbortController(), { ctx } = mkCtx(g, ac.signal);
    const partial = [];
    setTimeout(() => ac.abort(), 330);
    const out = await readRepo(ctx, repo.common, main, (r) => partial.push(r));
    const done = out.worktrees.filter((w) => w.facts && w.facts.ok).length, errs = out.worktrees.filter((w) => w.facts && !w.facts.ok).length, unread = out.worktrees.filter((w) => !w.main && !w.facts).length;
    check('repo layer: after a timeout the finished worktrees keep their facts (' + done + ' done, ' + unread + ' unread, ' + errs + ' errors)', done >= 2 && done < 12 && unread >= 1 && errs === 0);
    check('repo layer: the worktree rows are offered before any status runs', partial.length >= 1 && partial[0].worktrees.length === 13);
  }
  // Through the scan: a short deadline ends the repository as timeout, and the posted repository still carries the finished worktrees.
  {
    const g = fakeGit(world, { delay: 40 }), scan = new WorkScan({ exec: g.exec, limiter: new Limiter(4, 3), deadlineMs: 300, gitMs: 200, workspace: () => [] }), c = collect();
    await scan.start(1, [{ cwd: main, last: 1 }], false, c.post);
    const fin = c.of('repo').filter((m) => m.state !== 'running' && m.state !== 'queued').pop();
    const withFacts = fin ? fin.worktrees.filter((w) => w.facts && w.facts.ok).length : -1;
    check('scan: a timed-out repository still renders its finished worktrees (' + (fin && fin.state) + ', ' + withFacts + ' with facts)', fin && fin.state === 'timeout' && withFacts >= 1 && withFacts < 12);
  }
  // queued, then running when the repository lane starts; each repository waits its turn on the chain.
  {
    const w3 = mkWorld(3), g = fakeGit(w3, { delay: 30 }), scan = new WorkScan({ exec: g.exec, limiter: new Limiter(4, 3), deadlineMs: 400, gitMs: 200, workspace: () => [] }), c = collect();
    await scan.start(1, w3.repos.map((r, i) => ({ cwd: r.top, last: 10 - i })), false, c.post);
    const by = new Map();
    c.msgs.filter((x) => x.m.type === 'repo').forEach((x) => { by.set(x.m.key, (by.get(x.m.key) || []).concat({ s: x.m.state, at: x.at })); });
    const keys = [...by.keys()];
    check('scan: a repository is posted queued first, then running (' + keys.map((k) => by.get(k).map((v) => v.s).join('>')).join(' | ') + ')', keys.length === 3 && keys.every((k) => by.get(k)[0].s === 'queued' && by.get(k).some((v) => v.s === 'running') && by.get(k).findIndex((v) => v.s === 'running') > 0));
    const lastKey = keys[2], prevOk = by.get(keys[1]).find((v) => v.s === 'ok');
    check('scan: a repository waiting on the chain is not running before the repository ahead of it ended', prevOk && by.get(lastKey).find((v) => v.s === 'running').at >= prevOk.at);
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

(async () => {
  try {
    await limiterTests();
    await scanTests();
    await repoLayerTests();
    pureTests();
    await prTests();
  } catch (e) { bad('check_scan crashed: ' + ((e && e.stack) || e)); }
  try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* scratch only */ }
  if (failures.length) {
    console.error('check_scan FAILED (' + failures.length + ')');
    [...new Set(failures)].slice(0, 30).forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('check_scan OK: limiter lanes, deadlines, streaming, caches, abort, shared PR cache, remove text, page model rules');
  process.exit(0);
})();
