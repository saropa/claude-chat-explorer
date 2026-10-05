// Source-level guards for the Open Work page. Fails the build when:
//  - an openWork*/work* source imports ./client or makes a worker request that is not soft;
//  - the read-only git and gh allow-list text changed, or it now accepts a write;
//  - an agent name appears in the page sources;
//  - the popover/tooltip module reads sidebar ids or globals.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const errors = [];
const bad = (m) => errors.push(m);
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// 1. Open Work sources never import the worker client, and every .request( they make is soft.
const own = fs.readdirSync(SRC).filter((f) => /^(openWork|work)[A-Za-z]*\.ts$/.test(f));
for (const must of ['openWork.ts', 'workChats.ts', 'workScan.ts', 'workRepo.ts', 'openWorkGitJs.ts']) { if (!own.includes(must)) { bad('guard cannot see ' + must); } }
if (!own.includes('openWork.ts')) { bad('guard cannot see the Open Work sources: ' + own.join(',')); }
for (const f of own) {
  const t = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1'); // comments are not code
  if (/from\s+['"]\.\/client['"]|require\(['"]\.\/client['"]\)/.test(t)) { bad(f + ' imports ./client; it must get a soft request function instead'); }
  if (/^work/.test(f) && /from\s+['"]vscode['"]/.test(t)) { bad(f + ' imports vscode; the scan modules stay plain node so the build check can drive them'); }
  if (/child_process|execFile|spawn\(/.test(t)) { bad(f + ' starts processes itself; commands go only through the allow-listed git() and gh() helpers'); }
  for (const m of t.matchAll(/\.request\(([^;]*)\)/g)) { if (!/,\s*true\s*,\s*true\s*$/.test(m[1])) { bad(f + ': a worker request that is not soft: .request(' + m[1].slice(0, 60) + ')'); } }
}
const ext = read('extension.ts');
if (!/new GitLiveService\(uiExec\)/.test(ext) || !/this\.gitLive, uiExec\)/.test(ext) || !/limiter\.wrap\(realExec, 'ui'\)/.test(ext)) { bad('the sidebar git work must run through the sidebar lane of the shared limiter'); }
const wire = /softRequest:\s*\(m\)\s*=>\s*client!\.request\(([^;]*?)\),\s*pins:/.exec(ext);
if (!wire || !/,\s*true\s*,\s*true\s*$/.test(wire[1])) { bad('extension.ts must wire the Open Work softRequest as client.request(m, true, true)'); }
if ((read('openWork.ts').match(/softRequest\(/g) || []).length < 1 || /this\.d\.request\(/.test(read('openWork.ts'))) { bad('openWork.ts must ask the worker only through softRequest'); }

// 2. The read-only git and gh allow-list is exactly what it was before the Open Work page.
const ALLOW = [
  "const GIT_OK = new Set(['rev-parse', 'symbolic-ref', 'status', 'worktree', 'for-each-ref', 'rev-list']);",
  "const GH_OK = ['pr', 'list'];",
  "if (!GIT_OK.has(args[0]) || (args[0] === 'worktree' && args[1] !== 'list')) { throw new Error('git command not allowed: ' + args[0]); }",
  "if (args[0] !== GH_OK[0] || args[1] !== GH_OK[1]) { throw new Error('gh command not allowed: ' + args[0]); }",
];
const wip = read('wipGit.ts');
for (const line of ALLOW) { if (!wip.includes(line)) { bad('git/gh allow-list changed: missing ' + line.slice(0, 70)); } }
(async () => {
  const g = require(path.join(OUT, 'wipGit.js'));
  const calls = [];
  const c = { exec: async (cmd, args) => { calls.push(cmd + ' ' + args.join(' ')); return { code: 0, stdout: '', stderr: '' }; }, gitMs: 100, ghMs: 100, flags: { gitMissing: false } };
  const tryGit = async (args) => { try { await g.git(c, '/x', args); return true; } catch (e) { return false; } };
  const tryGh = (args) => { try { g.gh(c, '/x', args); return true; } catch (e) { return false; } };
  for (const a of [['status'], ['rev-parse', 'HEAD'], ['symbolic-ref', 'HEAD'], ['worktree', 'list'], ['for-each-ref'], ['rev-list', 'HEAD']]) { if (!(await tryGit(a))) { bad('git must allow ' + a.join(' ')); } }
  for (const a of [['push'], ['commit'], ['checkout', 'x'], ['reset', '--hard'], ['clean', '-f'], ['stash'], ['fetch'], ['merge', 'x'], ['branch', '-D', 'x'], ['config', 'a', 'b'], ['worktree', 'remove', 'x'], ['worktree', 'add', 'x'], ['worktree'], ['restore', 'x']]) { if (await tryGit(a)) { bad('git must reject ' + a.join(' ')); } }
  if (!tryGh(['pr', 'list', '--json', 'number'])) { bad('gh must allow pr list'); }
  for (const a of [['pr', 'merge', '1'], ['pr', 'create'], ['pr', 'view', '1'], ['pr', 'checks', '1'], ['api', 'x'], ['repo', 'delete'], ['pr']]) { if (tryGh(a)) { bad('gh must reject ' + a.join(' ')); } }

  // 3. No agent name in the page sources or in what the host shows. The one allowed mention is the command id.
  for (const f of ['openWorkHtml.ts', 'openWorkJs.ts', 'openWorkGitJs.ts', 'openWorkCss.ts', 'workModel.ts', 'workChats.ts', 'workScan.ts', 'workRepo.ts', 'webviewPop.ts', 'execLimit.ts']) { if (/claude/i.test(read(f))) { bad(f + ' names an agent product'); } }
  const host = read('openWork.ts').split('\n').filter((l) => /claude/i.test(l) && !/OPEN_WORK_CMD = 'claudeChatExplorer\.openWork'/.test(l));
  if (host.length) { bad('openWork.ts names an agent product: ' + host[0].trim()); }

  // 4. The popover/tooltip module reads no sidebar id or global at load.
  const pop = require(path.join(OUT, 'webviewPop.js'));
  for (const [name, code] of [['POP_JS', pop.POP_JS], ['TIP_ENGINE_JS', pop.TIP_ENGINE_JS]]) {
    if (/\$\(|\bres\b|\bq\b\.|'(srb|sfb|tpb|srm|sfm|tpm|res|q)'|\bsort\b|\badvSync\b|\bsessOn\b|\baskSess\b|\brerender\b/.test(code)) { bad(name + ' reads a sidebar id or global'); }
    const trap = new Proxy({}, { get: (_t, k) => { throw new Error('read ' + String(k) + ' at load'); }, set: () => { throw new Error('write at load'); } });
    try { require('vm').runInNewContext(code, { document: trap, window: trap, console: trap, acquireVsCodeApi: () => { throw new Error('vscode api at load'); } }); } catch (e) { bad(name + ' touches the page at load: ' + e.message); }
  }

  if (errors.length) { console.error('check_guards FAILED (' + errors.length + ')'); errors.forEach((e) => console.error('  - ' + e)); process.exit(1); }
  console.log('check_guards OK: soft requests only, allow-list unchanged, neutral wording, standalone popover module');
})();
