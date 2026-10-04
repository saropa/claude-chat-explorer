/** Worker thread entry: owns the index and runs every search, so the extension host never blocks. */
import { parentPort } from 'worker_threads';
import { ChatIndex } from './index';
import { compile } from './query';
import { expandChat, searchIndex } from './search';
import { projectOf, statFields } from './stats';
import { Abort, Ctx, Result } from './types';

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
  loaded = ix.load().catch((e) => log('load cache', e));
  await loaded;
  post({ t: 'loaded', chats: ix.size });
  await refresh().catch((e) => log('initial index', e));
  ix.watch();
}

/** Stream results: the first match at once, then batches every 50 ms. */
async function search(m: any): Promise<void> {
  const sig: Abort = { aborted: false };
  live.set(m.id, sig);
  try {
    await loaded;
    if (!ix) { throw new Error('index not ready'); }
    if (ix.stale && !busy) { await refresh(); }
    const c = compile(m.query, m.o);
    post({ t: 'started', id: m.id });
    let pending: Result[] = [], last = 0, sent = false;
    const flush = (done: number, total: number) => { post({ t: 'batch', id: m.id, results: pending, done, total }); pending = []; last = Date.now(); };
    const results = await searchIndex(ix, c, m.o, m.folders ?? [], ctxOf(m), sig, (r, done, total) => {
      if (r) { pending.push(r); }
      if ((pending.length && !sent) || Date.now() - last >= BATCH_MS) { sent = sent || pending.length > 0; flush(done, total); }
    });
    if (!sig.aborted) { post({ t: 'done', id: m.id, results }); }
  } catch (e) { post({ t: 'error', id: m.id, message: (e as Error).message }); }
  finally { live.delete(m.id); }
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
function pinned(ids: string[]): Result[] {
  const want = new Set(ids);
  return (ix?.tops() ?? []).filter((c) => want.has(c.id)).sort((a, b) => b.last - a.last)
    .map((c) => ({ file: ix!.fileOf(c), id: c.id, title: c.title, hits: 0, last: c.last, snippet: '', ranges: [], score: 0,
      project: projectOf(c), ...statFields(c) }));
}

async function request(m: any): Promise<unknown> {
  if (m.t === 'expand') { return expand(m); }
  if (m.t === 'pinned') { return pinned(m.ids ?? []); }
  if (m.t === 'stats') { return { chats: ix?.size ?? 0, heap: process.memoryUsage().heapUsed, rss: process.memoryUsage().rss, buf: process.memoryUsage().arrayBuffers }; }
  if (m.t === 'dispose') { await ix?.dispose(); return true; }
  return undefined;
}

port.on('message', (m: any) => {
  if (m.t === 'init') { void init(m); }
  else if (m.t === 'search') { void search(m); }
  else if (m.t === 'cancel') { const s = live.get(m.id); if (s) { s.aborted = true; } }
  else {
    request(m).then((value) => post({ t: 'reply', req: m.req, value }),
      (e) => post({ t: 'reply', req: m.req, error: (e as Error).message }));
  }
});
