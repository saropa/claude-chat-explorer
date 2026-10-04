/** Worker thread entry: owns the index and runs every search, so the extension host never blocks. */
import { parentPort } from 'worker_threads';
import { ExportOpts, exportIndex } from './export';
import { ChatIndex } from './index';
import { compile } from './query';
import { gitSummary } from './gitSummary';
import { expandChat, searchIndex } from './search';
import { projectOf, statFields } from './stats';
import { Abort, Compiled, Ctx, Result } from './types';

const BATCH_MS = 50;
const PROGRESS_MS = 100;
const port = parentPort!;
let ix: ChatIndex | undefined;
let loaded: Promise<void> = Promise.resolve();
let busy = false; // an index pass is running; searches use what is indexed so far
const live = new Map<number, Abort>();

const post = (m: unknown): void => port.postMessage(m);
const log = (where: string, e: unknown): void => post({ t: 'log', msg: `${where}: ${e instanceof Error ? e.stack ?? e.message : String(e)}` });
const ctxOf = (m: any): Ctx => ({ pins: new Set<string>(m.pins ?? []), tags: m.tags ?? {} });

/** Run one index pass, reporting progress, then announce completion. */
async function refresh(): Promise<void> {
  if (!ix || busy) { return; }
  busy = true;
  try {
    let lastPost = 0;
    await ix.refresh((done, total, subs) => {
      if (done < total && Date.now() - lastPost < PROGRESS_MS) { return; }
      lastPost = Date.now();
      post({ t: 'progress', done, total, subs, first: ix!.building });
    });
  } finally { busy = false; post({ t: 'indexed' }); }
}

async function init(m: any): Promise<void> {
  ix = new ChatIndex(m.dir, m.root || undefined);
  ix.onError = log;
  ix.onChange = () => post({ t: 'changed' });
  loaded = ix.load(); // never rejects: the load catches its own errors and falls back to memory
  await loaded;
  post({ t: 'loaded', chats: ix.size });
  await refresh().catch((e) => log('initial index', e));
  ix.watch();
}

/** Run one cancelable job (search or export): wait for the index, compile, announce 'started', post 'done' with the outcome. */
async function job(m: any, run: (c: Compiled, sig: Abort) => Promise<object>): Promise<void> {
  const sig: Abort = { aborted: false };
  live.set(m.id, sig);
  try {
    await loaded;
    if (!ix) { throw new Error('index not ready'); }
    if (ix.stale && !busy) { await refresh(); }
    const c = compile(m.query, m.o);
    post({ t: 'started', id: m.id });
    const out = await run(c, sig);
    if (!sig.aborted) { post({ t: 'done', id: m.id, ...out }); }
  } catch (e) { post({ t: 'error', id: m.id, message: (e as Error).message }); }
  finally { live.delete(m.id); }
}

/** Stream results: the first match at once, then batches every 50 ms. */
function search(m: any): Promise<void> {
  return job(m, async (c, sig) => {
    let pending: Result[] = [], last = 0, sent = false;
    const flush = (done: number, total: number) => { post({ t: 'batch', id: m.id, results: pending, done, total }); pending = []; last = Date.now(); };
    const results = await searchIndex(ix!, c, m.o, m.folders ?? [], ctxOf(m), sig, (r, done, total) => {
      if (r) { pending.push(r); }
      if ((pending.length && !sent) || Date.now() - last >= BATCH_MS) { sent = sent || pending.length > 0; flush(done, total); }
    });
    return { results };
  });
}

/** Export every matching line (no result cap); ticks keep the host's stall timer alive. */
function exportLines(m: any): Promise<void> {
  const x: ExportOpts = { context: !!m.x?.context, unique: !!m.x?.unique, statuses: m.x?.statuses ?? [] };
  return job(m, async (c, sig) => {
    let last = 0;
    const tick = (done: number, total: number) => {
      if (Date.now() - last < BATCH_MS) { return; }
      last = Date.now();
      post({ t: 'tick', id: m.id, done, total });
    };
    return exportIndex(ix!, c, m.o, m.folders ?? [], ctxOf(m), sig, x, tick);
  });
}

/** Expanded view of one chat; null when the chat is not indexed. */
async function expand(m: any): Promise<unknown> {
  await loaded;
  const chat = ix?.find(m.chat);
  if (!ix || !chat) { return null; }
  const offset = Math.max(0, Number(m.offset) || 0);
  const ex = expandChat(ix, chat, compile(m.query, m.o), m.o, ctxOf(m), offset);
  if (offset === 0) { ex.related = ix.related(chat); } // lazy: only on first expand
  return ex;
}

/** Rows for pinned chats, newest first. */
function pinned(ids: string[], subs: boolean): Result[] {
  const want = new Set(ids);
  return (ix?.tops() ?? []).filter((c) => want.has(c.id)).sort((a, b) => b.last - a.last)
    .map((c) => ({ file: ix!.fileOf(c), id: c.id, title: c.title, hits: 0, last: c.last, snippet: '', ranges: [], score: 0,
      project: projectOf(c), ...statFields(c, subs ? ix!.subsOf(c) : []) }));
}

/** Yield to the event loop; while a search or export runs, wait for it to end first. */
async function idle(): Promise<void> {
  do { await new Promise((res) => setTimeout(res, live.size ? 50 : 0)); } while (live.size);
}

/** Git Activity tree data for the chats in scope. */
async function gitTree(m: any): Promise<unknown> {
  await loaded;
  return ix ? gitSummary(ix, !!m.all, Array.isArray(m.folders) ? m.folders : [], idle) : { repos: [], branches: [] };
}

async function request(m: any): Promise<unknown> {
  if (m.t === 'gitSummary') { return gitTree(m); }
  if (m.t === 'expand') { return expand(m); }
  if (m.t === 'pinned') { return pinned(m.ids ?? [], m.subs !== false); }
  if (m.t === 'stats') { return { chats: ix?.size ?? 0, heap: process.memoryUsage().heapUsed, rss: process.memoryUsage().rss, buf: process.memoryUsage().arrayBuffers }; }
  if (m.t === 'dispose') { await ix?.dispose(); return true; }
  return undefined;
}

process.on('exit', () => ix?.shutdown());

port.on('message', (m: any) => {
  if (m.t === 'init') { void init(m); }
  else if (m.t === 'search') { void search(m); }
  else if (m.t === 'export') { void exportLines(m); }
  else if (m.t === 'cancel') { const s = live.get(m.id); if (s) { s.aborted = true; } }
  else {
    request(m).then((value) => post({ t: 'reply', req: m.req, value }),
      (e) => post({ t: 'reply', req: m.req, error: (e as Error).message }));
  }
});
