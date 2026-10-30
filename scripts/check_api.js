// Fails the build when the public API list methods break: chat fields, host state merge, work items, account passthrough, 60 s soft timeout. Drives out/api.js and out/apiChats.js.
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const { makeApi, API_VERSION } = require(path.join(OUT, 'api.js'));
const { allChats, allWork, chatBase } = require(path.join(OUT, 'apiChats.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

(async () => {
  const a = { id: 'a', dir: 'd', title: 'Alpha', first: 1, last: 9, count: 4, size: 100, files: [{ path: '/x.ts', edited: true }], cwd: '/w', seen: ['feat/x'],
    tok: [10, 1, 2, 3, 2], use: { tokens: 5000, model: 'claude-opus-4-8', max: 6000, at: 1, pending: false, comp: 2 }, cost: { usd: 1.5, add: 3, rem: 1, models: ['opus'] },
    git: { branches: ['feat/x', 'main'], prs: [[42, 'r']], commits: [['abc', 'feat/x']] }, made: [['w', '/wt'], ['b', 'feat/y']] };
  const b = { id: 'b', dir: 'd', title: 'Beta', first: 1, last: 2, count: 1, size: 1, files: [], tok: [5, 5, 5, 5, 1], git: { branches: [], prs: [[42, 'r']], commits: [] } };
  const sub = { id: 's', parent: 'a', tok: [1, 1, 1, 1, 1], files: [] };
  const ix = { tops: () => [a, b], subsOf: (p) => (p === a ? [sub] : []), find: () => undefined };
  const info = chatBase(ix, a);
  check('base fields', info.id === 'a' && info.title === 'Alpha' && info.folder === '/w' && info.last === 9 && info.messages === 4 && info.subagents === 1);
  check('context fields', info.context && info.context.tokens === 5000 && info.context.max === 6000 && info.context.pending === false && info.context.compactions === 2);
  check('tokens include subagents', info.tokens.input === 11 && info.tokens.compactions === 2);
  check('git and files', info.prs[0].number === 42 && info.commits[0].sha === 'abc' && info.branches.includes('main') && info.files[0].edited === true);
  check('created worktree and branch', info.created.length === 2 && info.created[0].kind === 'worktree' && info.created[1].name === 'feat/y');
  check('no internal fields', !('dir' in info) && !('rec' in info) && !('bloom' in info));
  check('chat without usage has no context', chatBase(ix, b).context === undefined);
  check('allChats lists tops only', allChats(ix).length === 2);
  const work = allWork(ix);
  const pr = work.find((w) => w.key === '#42'), br = work.find((w) => w.key === 'feat/x');
  check('work pr groups both chats', pr && pr.kind === 'pr' && pr.chatIds.length === 2 && pr.tokens.input === 16);
  check('work branch', br && br.kind === 'branch' && br.chatIds.length === 1 && br.tokens.input === 11);

  const calls = [];
  const client = { request: async (m, bg, soft, t) => { calls.push([m.t, soft, t]); return m.t === 'apiChats' ? [chatBase(ix, a), chatBase(ix, b)] : m.t === 'apiChat' ? (m.id === 'a' ? chatBase(ix, a) : undefined) : m.t === 'apiWork' ? work : m.t === 'acct' ? { account: { email: 'e@x' }, usage: {} } : undefined; } };
  const host = { pins: () => ['a'], archived: () => ['b'], tags: () => ({ a: ['t1'] }), dots: () => ({ a: 'waiting' }) };
  const api = makeApi({ get: async () => ({ indexing: false, total: 0, edited: 0, items: [] }) }, client, host);
  check('API_VERSION stays 1', API_VERSION === 1 && api.apiVersion === 1);
  const list = await api.listChats();
  check('listChats merges host state', list.length === 2 && list[0].pinned && !list[0].archived && list[0].tags[0] === 't1' && list[0].state === 'waiting' && list[1].archived && !list[1].pinned && list[1].state === undefined && list[1].tags.length === 0);
  check('getChat known and unknown', (await api.getChat('a')).pinned === true && (await api.getChat('zz')) === undefined);
  check('listWork passes through', (await api.listWork()).length === work.length);
  check('getAccountUsage includes email', (await api.getAccountUsage()).account.email === 'e@x');
  check('all calls soft with 60 s timeout', calls.length === 5 && calls.every((c) => c[1] === true && c[2] === 60000));
  const empty = makeApi({}, { request: async () => undefined }, host);
  check('empty worker replies', (await empty.listChats()).length === 0 && (await empty.listWork()).length === 0 && (await empty.getAccountUsage()) === undefined);

  if (failures.length) { console.error('check_api failed:\n' + failures.map((x) => ' - ' + x).join('\n')); process.exit(1); }
  console.log('check_api ok');
})();
