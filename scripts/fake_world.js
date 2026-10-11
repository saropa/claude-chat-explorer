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
    if (a.startsWith('remote get-url origin')) { return OKRES(world.remote !== undefined ? world.remote : 'git@github.com:acme/' + path.basename(r.repo.main) + '.git\n'); }
    if (a.startsWith('status')) { return OKRES(r.status); }
    if (a.startsWith('worktree list')) { return OKRES(r.repo.worktree); }
    if (a.startsWith('rev-parse --abbrev-ref origin/HEAD')) { return OKRES('origin/main\n'); }
    if (a.startsWith('for-each-ref') && a.includes('(ahead-behind:')) { return world.noAheadBehind ? { code: 128, stdout: '', stderr: 'fatal: unknown field name: ahead-behind', timedOut: false, aborted: false } : OKRES((r.repo.branches || '').split('\n').filter(Boolean).map((l) => l.split('\t')[0]).map((k) => k + '\t' + ((r.repo.diverge && r.repo.diverge[k]) || [0, 0]).join(' ')).join('\n') + '\n'); } // name TAB ahead behind
    if (a.startsWith('for-each-ref')) { return OKRES(a.includes('%09%(upstream:track)') ? r.repo.branches || '' : r.repo.merged); }
    if (a.startsWith('rev-list --count')) { return OKRES('0\n'); }
    if (a.startsWith('rev-list --left-right --count')) { const b = /refs\/heads\/(.+)$/.exec(a); const d = (r.repo.diverge && b && r.repo.diverge[b[1]]) || [0, 0]; return OKRES(d[1] + '\t' + d[0] + '\n'); } // behind TAB ahead of the default branch
    if (a.startsWith('rev-list --max-count')) { return OKRES('commit abc\nabc1234\tfirst commit\ncommit def\ndef5678\tsecond\n'); }
    return { code: 1, stdout: '', stderr: 'unexpected ' + a, timedOut: false, aborted: false };
  };
  return f;
}

/** Repositories on disk: main checkout, linked worktrees. Several repositories can exist on disk, but the scan reads a repository layer only for the workspace repository (the first workspace folder's): pass workspace: () => [repo.top] to the scan. */
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
    // branches: every local branch (name, upstream, track) as for-each-ref prints it; the leftovers are stale (gone), merged1 and it's-done (merged).
    const branches = 'main\torigin/main\t\nfeat\torigin/feat\t\nold\t\t\nstale\torigin/stale\t[gone]\nmerged1\t\t\nit\'s-done\t\t\nlive\torigin/live\t\nchatbr\torigin/chatbr\t[gone]\n-x\t\t\n';
    const repo = { common: path.join(main, '.git'), worktree, merged: 'feat\nold\nmerged1\nit\'s-done\n-x\n', main, branches };
    const e = { repo, top: main, common: repo.common, branch: 'main', status: '## main...origin/main [ahead 1]\0 M a.txt\0?? b.txt\0' };
    repos.push(e); byTop.set(main, e);
    byTop.set(wtA, { repo, top: wtA, common: repo.common, branch: 'feat', status: '## feat...origin/feat\0' });
    byTop.set(wtB, { repo, top: wtB, common: repo.common, branch: 'HEAD', status: '## HEAD (no branch)\0' });
  }
  return { repos, byCwd: (cwd) => byTop.get(cwd) };
}


/** A world modelled on a real Claude-agent repository (the owner's `contacts`): every worktree and branch was made by an agent, most inside subagent
 *  transcripts, and the chats ran in the main checkout. Returns a fake chat index (tops, subsOf, rec: what workMatch.relOf reads), the matcher input,
 *  the page rows and what each row must end with. Chat ids look like session ids; times are ms. */
function contactsWorld() {
  const { buildBloom } = require(path.join(process.env.CCS_OUT || path.join(__dirname, '..', 'out'), 'bloom.js'));
  const C = '/w/contacts', H = 3600e3, T0 = Date.UTC(2026, 9, 11, 0, 0, 0);
  const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const AG = 'a3845de94fd4edd51';
  const chats = [], subs = new Map(), texts = new Map();
  const chat = (n, o) => { const c = Object.assign({ id: id(n), dir: '-w-contacts', title: 'Chat ' + n, first: T0, last: T0 + H, mtime: T0, size: 1, count: 4, files: [], rec: 'rec' + n, len: 1, cwd: C, bloom: buildBloom('') }, o || {}); texts.set(c.rec, ''); chats.push(c); subs.set(c.id, []); return c; };
  const sub = (p, aid, o) => { const c = Object.assign({ id: aid, dir: p.dir, parent: p.id, title: 'sub', first: p.first, last: p.last, mtime: 1, size: 1, count: 2, files: [], rec: 'sub' + aid, len: 1, cwd: C, bloom: buildBloom(''), desc: 'Agent ' + aid.slice(0, 4) }, o || {}); texts.set(c.rec, ''); subs.get(p.id).push(c); return c; };
  const say = (c, t) => { texts.set(c.rec, t); c.bloom = buildBloom(t.toLowerCase()); };
  const c1 = chat(1, { title: 'Pro rollout', first: T0 + 1 * H, last: T0 + 9 * H });
  sub(c1, 'a1111111111111111', { made: [['w', '../contacts-wt-connection-icon'], ['b', 'feat/saropa-connection-cloud-icon-search']] });
  sub(c1, 'a2222222222222222', { made: [['b', 'backup/main-before-merge-20261010_2142']] });
  const c2 = chat(2, { title: 'Nudge once', cwds: [C, C + '-wt-nudge-once'], cwd: C + '-wt-nudge-once', seen: ['main', 'fix/login-reminder-dot-fires-once'], first: T0 + 2 * H, last: T0 + 6 * H });
  const c3 = chat(3, { title: 'Pro pill gaps', made: [['b', 'feat/pro-pill-gaps'], ['w', C + '-wt-pro-pill-gaps']], first: T0 + 3 * H, last: T0 + 7 * H });
  const c4 = chat(4, { title: 'Unused keys', first: T0 + 4 * H, last: T0 + 8 * H });
  sub(c4, 'a4444444444444444', { cwd: C + '-wt-unused-keys', seen: ['unused-arb-keys'] });
  const c5 = chat(5, { title: 'Agent parent', first: T0 + 5 * H, last: T0 + 6 * H });
  sub(c5, AG, { cwd: C + '/.claude/worktrees/agent-' + AG });
  const c6 = chat(6, { title: 'Mojibake talk', first: T0 + 10 * H, last: T0 + 11 * H });
  say(c6, 'Please look at branch bahai-mojibake and the broken strings. Also feat/pro-pill-gaps was discussed.');
  const c7 = chat(7, { title: 'Spike session', first: T0 + 100 * H, last: T0 + 104 * H });
  chat(8, { title: 'Other project', dir: '-w-elsewhere', cwd: '/w/elsewhere', first: T0 + 100 * H, last: T0 + 104 * H });
  // The owner's real case (worktree contacts-wt-langv2): the parent chat started a background subagent whose instructions said "use a sibling worktree ../contacts-wt-langv2"
  // and which ran `git worktree add ../contacts-wt-langv2 origin/main` (a relative path); another repository's chat only names the worktree; a chat holds just the owner's question.
  const LV = '22eb3898-19ee-4316-be07-d87a8384586d', LQ = 'Find the claude chat that created contacts-wt-langv2 and the branches langv2-final and langv2-spare-branch';
  const cLv = chat(9, { id: LV, title: 'Language rule design', first: T0 + 200 * H, last: T0 + 210 * H });
  sub(cLv, 'aeb797a22e217fd5e', { made: [['i', C + '-wt-langv2'], ['w', '../contacts-wt-langv2'], ['b', 'langv2-final'], ['b', 'langv2-spare-branch']] });
  const cMen = chat(10, { id: id(10), title: 'Explorer matcher', dir: '-w-explorer', cwd: '/w/claude-chat-explorer', first: T0 + 205 * H, last: T0 + 212 * H });
  say(cMen, 'The worktree contacts-wt-langv2 and its branches langv2-final and langv2-spare-branch belong to another repository; I only read about them.');
  const cQ = chat(11, { title: 'Who made it', first: T0 + 215 * H, last: T0 + 216 * H, roles: [0], ends: [LQ.length] });
  say(cQ, LQ);
  const sec = (ms) => Math.floor(ms / 1000);
  const wt = (k, name, branch, o) => Object.assign({ k, name, path: C + (name === 'contacts' ? '' : '-wt-' + name), real: '', branch, main: false, detached: false }, o || {});
  const wts = [
    { k: 'w1', name: 'contacts', path: C, real: C, branch: 'main', main: true, detached: false },
    wt('w2', 'connection-icon', 'feat/saropa-connection-cloud-icon-search'), wt('w3', 'nudge-once', 'fix/login-reminder-dot-fires-once'),
    wt('w4', 'pro-pill-gaps', 'feat/pro-pill-gaps'), wt('w5', 'unused-keys', 'unused-arb-keys'), wt('w7', 'langv2', 'langv2-final'),
    { k: 'w6', name: 'agent-' + AG, path: C + '/.claude/worktrees/agent-' + AG, real: C + '/.claude/worktrees/agent-' + AG, branch: 'worktree-agent-' + AG, main: false, detached: false },
  ];
  wts.forEach((w) => { w.real = w.path; if (w.name !== 'contacts' && !w.name.startsWith('agent-')) { w.name = 'contacts-wt-' + w.name; } });
  const brs = [
    { n: 'main', cr: 0, ts: sec(T0 + 12 * H) },
    ...wts.slice(1).map((w, i) => ({ n: w.branch, cr: sec(T0 + (2 + i) * H), ts: sec(T0 + (3 + i) * H) })),
    { n: 'backup/main-before-merge-20261010_2142', cr: sec(T0 + 5 * H), ts: sec(T0 + 4 * H) },
    { n: 'langv2-spare-branch', cr: sec(T0 + 200 * H), ts: sec(T0 + 201 * H) }, // a branch with no worktree, made by the subagent
    { n: 'bahai-mojibake', cr: sec(T0 + 300 * H), ts: sec(T0 + 301 * H) }, // only the name is in a chat
    { n: 'orphan-spike-branch', cr: sec(T0 + 101 * H), ts: sec(T0 + 102 * H) }, // only the time window
    { n: 'ancient-nothing-branch', cr: sec(T0 - 900 * H), ts: sec(T0 - 899 * H) }, // nothing: the nearest chat by time
    { n: 'no-time-branch', cr: 0, ts: 0 }, // nothing at all, not even a time
  ];
  const ix = { tops: () => chats.filter((c) => !c.parent), subsOf: (p) => subs.get(p.id) || [], rec: (c) => ({ text: texts.get(c.rec) || '', cmds: [], roles: c.roles || [], ends: c.ends || [] }) };
  const input = { ids: chats.map((c) => c.id), roots: [C], wts, brs, def: 'main' };
  return { ix, input, chats, id, C, T0, H, AG };
}

function collect() {
  const msgs = [];
  const finals = new Map();
  return { msgs, finals, post: (m) => { msgs.push({ m, at: Date.now() }); if (m.type === 'folder' && ['ok', 'none', 'error', 'timeout'].includes(m.state)) { finals.set(m.key, (finals.get(m.key) || []).concat(m)); } },
    of: (t) => msgs.filter((x) => x.m.type === t).map((x) => x.m) };
}

/** Chat working folders for one fake repository: the main checkout (branch main), the linked worktree (branch feat), the detached worktree, and a folder outside git (an unmatched chat). */
function chatFolders(repo0, base0) {
  const base = fs.realpathSync(base0);
  const out = path.join(base, 'not-in-git'); fs.mkdirSync(out, { recursive: true });
  return { main: repo0.top, feat: repo0.top + '-wt-a', detached: repo0.top + '-wt-b', outside: out };
}

module.exports = { chatFolders, OKRES, ABORTED, fakeGit, mkWorld, collect, contactsWorld };
