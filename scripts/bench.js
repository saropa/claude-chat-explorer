// Benchmark: run after `npm run compile`. Usage: node scripts/bench.js [--root <projects folder>]
const { Worker } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkerClient, TIMEOUT_MS } = require('../out/client.js');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ''; };
const root = arg('--root');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bench-'));
const now = () => performance.now();
const ms = (n) => (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ms';

function spawn() {
  const w = new Worker(path.join(__dirname, '..', 'out', 'worker.js'));
  const waiters = [];
  w.on('message', (m) => { for (const x of waiters.slice()) { x(m); } });
  w.on('error', (e) => console.error('worker error', e));
  w.waiters = waiters;
  w.wait = (pred) => new Promise((res) => { const f = (m) => { if (pred(m)) { waiters.splice(waiters.indexOf(f), 1); res(m); } }; waiters.push(f); });
  return w;
}

async function search(w, query, o) {
  const id = Math.floor(Math.random() * 1e9);
  const t0 = now();
  let first = null, results = 0;
  const done = w.wait((m) => {
    if (m.id !== id) { return false; }
    if (first === null && ((m.t === 'batch' && m.results.length) || m.t === 'done')) { first = now() - t0; }
    if (m.t === 'done') { results = m.results.length; }
    return m.t === 'done' || m.t === 'error';
  });
  w.postMessage({ t: 'search', id, query, o: { all: true, cs: false, ww: false, re: o.re, when: 'any', subs: o.subs }, folders: [], pins: [], tags: {} });
  await done;
  return { first: first ?? 0, total: now() - t0, results };
}

async function stats(w) {
  const req = Math.floor(Math.random() * 1e9);
  const r = w.wait((m) => m.t === 'reply' && m.req === req);
  w.postMessage({ t: 'stats', req });
  return (await r).value;
}

const dirSize = (d) => fs.readdirSync(d).reduce((a, f) => a + fs.statSync(path.join(d, f)).size, 0);

async function runBuild() {
  const w = spawn();
  const t0 = now();
  const idx = w.wait((m) => m.t === 'indexed');
  w.postMessage({ t: 'init', dir: tmp, root });
  await idx;
  const cold = now() - t0;
  const st = await stats(w);
  return { w, cold, st };
}

async function runWarm() {
  const w = spawn();
  const t0 = now();
  const loaded = w.wait((m) => m.t === 'loaded');
  const idx = w.wait((m) => m.t === 'indexed');
  w.postMessage({ t: 'init', dir: tmp, root });
  const l = await loaded;
  const load = now() - t0;
  await idx;
  const st = await stats(w);
  return { w, load, chats: l.chats, st };
}

async function catastrophic() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cat-'));
  const proj = path.join(dir, 'projects', '-x');
  fs.mkdirSync(proj, { recursive: true });
  const row = { type: 'user', timestamp: new Date().toISOString(), message: { content: 'a'.repeat(60) + '!' } };
  fs.writeFileSync(path.join(proj, 'cat-session.jsonl'), JSON.stringify(row) + '\n');
  const c = new WorkerClient(path.join(dir, 'cache'), path.join(dir, 'projects'));
  c.start();
  await new Promise((r) => { c.onEvent = (m) => { if (m.t === 'indexed') { r(); } }; });
  let maxLag = 0, last = performance.now();
  const timer = setInterval(() => { const n = performance.now(); maxLag = Math.max(maxLag, n - last - 10); last = n; }, 10);
  const t0 = now();
  const why = await new Promise((r) => c.search({ query: '(a+)+$', o: { all: true, cs: false, ww: false, re: true, when: 'any', subs: true }, folders: [], pins: [], tags: {} }, () => {}, r));
  const took = now() - t0;
  await new Promise((r) => setTimeout(r, 200));
  clearInterval(timer);
  c.restart();
  await c.dispose();
  return { why, took, maxLag };
}

(async () => {
  console.log('projects root:', root || '~/.claude/projects (default)');
  const b = await runBuild();
  const cache = dirSize(tmp);
  console.log(`cold build: ${ms(b.cold)}   heap after build: ${(b.st.heap / 1048576).toFixed(1)} MB + buffers ${(b.st.buf / 1048576).toFixed(1)} MB (process rss ${(b.st.rss / 1048576).toFixed(0)} MB)   chat files: ${b.st.chats}`);
  console.log(`cache on disk: ${(cache / 1048576).toFixed(1)} MB`);
  await b.w.terminate();
  const wm = await runWarm();
  console.log(`warm load (cache read): ${ms(wm.load)}   heap after warm start: ${(wm.st.heap / 1048576).toFixed(1)} MB + buffers ${(wm.st.buf / 1048576).toFixed(1)} MB (process rss ${(wm.st.rss / 1048576).toFixed(0)} MB)`);
  const queries = [['common word', 'the', false], ['typical word', 'function', false], ['rare word', 'zxqvjk' + 'plugh', false], ['regex', 'error\\s+\\d+', true]];
  await search(wm.w, 'function', { re: false, subs: true }); // warm the OS page cache and JIT
  console.log('query'.padEnd(14), 'subs'.padEnd(5), 'first'.padEnd(10), 'total'.padEnd(10), 'results');
  for (const [name, q, re] of queries) {
    for (const subs of [true, false]) {
      const r = await search(wm.w, q, { re, subs });
      console.log(name.padEnd(14), (subs ? 'on' : 'off').padEnd(5), ms(r.first).padEnd(10), ms(r.total).padEnd(10), r.results);
    }
  }
  await wm.w.terminate();
  const c = await catastrophic();
  console.log(`catastrophic (a+)+$: ended by '${c.why}' after ${ms(c.took)} (limit ${TIMEOUT_MS} ms); host max event-loop lag ${ms(c.maxLag)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
