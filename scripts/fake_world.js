// Shared fakes for the build checks: a fake git runner over a fake repository layout, and a message collector.
const fs = require('fs');
const path = require('path');

const OKRES = (stdout) => ({ code: 0, stdout, stderr: '', timedOut: false, aborted: false });
const ABORTED = { code: null, stdout: '', stderr: '', timedOut: false, aborted: true };

/** A fake runner: answers git by repository layout, tracks running commands, kills them on abort like the real runner. */
function fakeGit(world, o) {
  o = o || {};
  const f = { calls: [], running: 0, max: 0, killed: 0, hang: new Set(), delay: o.delay === undefined ? 20 : o.delay, starts: [] };
  f.exec = (cmd, args, opt) => new Promise((resolve) => {
    const a = args.slice(2).join(' ');
    f.calls.push({ cmd, a, cwd: opt.cwd, at: Date.now() });
    if (opt.signal && opt.signal.aborted) { resolve(ABORTED); return; }
    f.running++; f.max = Math.max(f.max, f.running);
    let fin = false;
    const end = (r) => { if (fin) { return; } fin = true; f.running--; resolve(r); };
    if (f.hang.has(opt.cwd)) { return; } // never answers, ignores the abort: the deadline must still end the folder
    const t = setTimeout(() => end(f.answer(cmd, a, opt.cwd)), f.delay);
    if (opt.signal) { opt.signal.addEventListener('abort', () => { if (!fin) { clearTimeout(t); f.killed++; end(ABORTED); } }, { once: true }); }
  });
  f.answer = (cmd, a, cwd) => {
    if (cmd !== 'git') { return { code: 1, stdout: '', stderr: 'no gh', timedOut: false, aborted: false }; }
    const r = world.byCwd(cwd);
    if (a.startsWith('rev-parse --show-toplevel')) { return r ? OKRES(r.top + '\n' + r.common + '\nrefs/heads/' + r.branch + '\n') : { code: 128, stdout: '', stderr: 'fatal: not a git repository', timedOut: false, aborted: false }; }
    if (a.startsWith('status')) { return OKRES(r.status); }
    if (a.startsWith('worktree list')) { return OKRES(r.repo.worktree); }
    if (a.startsWith('rev-parse --abbrev-ref origin/HEAD')) { return OKRES('origin/main\n'); }
    if (a.startsWith('for-each-ref')) { return OKRES(r.repo.merged); }
    if (a.startsWith('rev-list --count')) { return OKRES('0\n'); }
    if (a.startsWith('rev-list --max-count')) { return OKRES('commit abc\nabc1234\tfirst commit\ncommit def\ndef5678\tsecond\n'); }
    return { code: 1, stdout: '', stderr: 'unexpected ' + a, timedOut: false, aborted: false };
  };
  return f;
}

/** Repositories on disk: main checkout, optional linked worktrees. */
function mkWorld(base0, n) {
  const base = fs.realpathSync(base0); // the scan resolves links, so the fake layout must already be link-free
  const repos = [];
  const byTop = new Map();
  for (let i = 0; i < n; i++) {
    const main = path.join(base, 'repo' + i);
    fs.mkdirSync(path.join(main, '.git'), { recursive: true });
    const wtA = path.join(base, 'repo' + i + '-wt-a'), wtB = path.join(base, 'repo' + i + '-wt-b');
    fs.mkdirSync(wtA, { recursive: true }); fs.mkdirSync(wtB, { recursive: true });
    const worktree = 'worktree ' + main + '\nHEAD aaaaaaa1\nbranch refs/heads/main\n\n'
      + 'worktree ' + wtA + '\nHEAD bbbbbbb2\nbranch refs/heads/feat\n\n'
      + 'worktree ' + wtB + '\nHEAD ccccccc3\ndetached\nlocked reason here\n\n'
      + 'worktree ' + path.join(base, 'gone-wt') + '\nHEAD ddddddd4\nbranch refs/heads/old\nprunable gitdir file points to non-existent location\n';
    const repo = { common: path.join(main, '.git'), worktree, merged: 'feat\nold\n', main };
    const e = { repo, top: main, common: repo.common, branch: 'main', status: '## main...origin/main [ahead 1]\0 M a.txt\0?? b.txt\0' };
    repos.push(e); byTop.set(main, e);
    byTop.set(wtA, { repo, top: wtA, common: repo.common, branch: 'feat', status: '## feat...origin/feat\0' });
    byTop.set(wtB, { repo, top: wtB, common: repo.common, branch: 'HEAD', status: '## HEAD (no branch)\0' });
  }
  return { repos, byCwd: (cwd) => byTop.get(cwd) };
}

function collect() {
  const msgs = [];
  const finals = new Map();
  return { msgs, finals, post: (m) => { msgs.push({ m, at: Date.now() }); if (m.type === 'folder' && ['ok', 'none', 'error', 'timeout'].includes(m.state)) { finals.set(m.key, (finals.get(m.key) || []).concat(m)); } },
    of: (t) => msgs.filter((x) => x.m.type === t).map((x) => x.m) };
}

module.exports = { OKRES, ABORTED, fakeGit, mkWorld, collect };
