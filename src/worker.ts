/** Worker thread entry: owns the index and runs every search, so the extension host never blocks. */
import { parentPort } from 'worker_threads';
import { editorIndex } from './editorSearch';
import { ExportOpts, exportIndex } from './export';
import { ChatIndex } from './index';
import { compile } from './query';
import { fileSessionsOf, FileSessionsReply } from './fileSessions';
import { handoverData } from './handover';
import { chatCwd } from './wipChats';
import { clampMax, Tally, totalsOf } from './limits';
import { expandChat, searchIndex } from './search';
import { ctxReply } from './contextWarn';
import { rowOf, sessionRows } from './sessions';
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
const ctxOf = (m: any): Ctx => ({ pins: new Set<string>(m.pins ?? []), tags: m.tags ?? {}, dots: m.dots ?? {}, archived: m.archived ? new Set<string>(m.archived) : undefined });

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
    const max = clampMax(m.max);
    const flush = (done: number, total: number, t: Tally) => { post({ t: 'batch', id: m.id, results: pending, done, total, ...totalsOf(t, max) }); pending = []; last = Date.now(); };
    return searchIndex(ix!, c, m.o, m.folders ?? [], ctxOf(m), sig, (r, done, total, tally) => {
      if (r) { pending.push(r); }
      if ((pending.length && !sent) || Date.now() - last >= BATCH_MS) { sent = sent || pending.length > 0; flush(done, total, tally); }
    }, max);
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

/** Every matching line with context for the results editor; ticks keep the host's stall timer alive. */
function editorLines(m: any): Promise<void> {
  const x = { statuses: m.x?.statuses ?? [], sort: String(m.x?.sort ?? 'score'), max: clampMax(m.max) };
  return job(m, async (c, sig) => {
    let last = 0;
    const tick = (done: number, total: number) => {
      if (Date.now() - last < BATCH_MS) { return; }
      last = Date.now();
      post({ t: 'tick', id: m.id, done, total });
    };
    return editorIndex(ix!, c, m.o, m.folders ?? [], ctxOf(m), sig, x, tick);
  });
}

/** Expanded view of one chat; null when the chat is not indexed. */
async function expand(m: any): Promise<unknown> {
  await loaded;
  const chat = ix?.find(m.chat);
  if (!ix || !chat) { return null; }
  const offset = Math.max(0, Number(m.offset) || 0);
  const lite = m.lite === true;
  const ex = expandChat(ix, chat, compile(m.query, m.o), m.o, ctxOf(m), offset, lite);
  return ex;
}

/** Related chats of one chat, computed only when the card's Related chats section is opened; null when the chat is not indexed. */
async function related(m: any): Promise<unknown> {
  await loaded;
  const chat = ix?.find(m.chat);
  return ix && chat ? ix.related(chat) : null;
}

/** Rows for pinned chats, newest first. */
function pinned(ids: string[], subs: boolean): Result[] {
  const want = new Set(ids);
  return (ix?.tops() ?? []).filter((c) => want.has(c.id)).sort((a, b) => b.last - a.last).map((c) => rowOf(ix!, c, subs));
}

/** Chats in scope as rows (index metadata only), for the empty query and the no-match list. */
async function sessions(m: any): Promise<unknown> {
  await loaded;
  if (!ix) { return { rows: [], total: 0, arch: [], archTotal: 0 }; }
  return sessionRows(ix, m.o, Array.isArray(m.folders) ? m.folders : [], String(m.sort ?? 'time'), new Set<string>(m.pins ?? []), new Set<string>(m.archived ?? []), clampMax(m.max));
}

/** Chats that touched one file; while the first index build runs it answers empty with indexing set. */
async function fileSessions(m: any): Promise<FileSessionsReply> {
  await loaded;
  if (!ix || ix.building) { return { indexing: true, total: 0, edited: 0, items: [] }; }
  const roots = Array.isArray(m.roots) ? m.roots.filter((r: unknown) => typeof r === 'string') : [];
  return fileSessionsOf(ix, String(m.file ?? ''), roots, new Set<string>(m.pins ?? []), Date.now(), m.dots ?? {});
}

/** Facts for one chat's hand-over note; null when the chat is not indexed. */
async function handover(m: any): Promise<unknown> {
  await loaded;
  const chat = ix?.find(String(m.chat ?? ''));
  return ix && chat ? handoverData(ix, chat, String(m.query ?? '')) : null;
}

/** Working folder of one chat, for the Git section of its card. */
async function cwdOf(m: any): Promise<string> {
  await loaded;
  const folders: string[] = Array.isArray(m.folders) ? m.folders.filter((x: unknown) => typeof x === 'string') : [];
  return ix ? chatCwd(ix, String(m.chat ?? ''), folders) : '';
}

async function request(m: any): Promise<unknown> {
  if (m.t === 'chatCwd') { return cwdOf(m); }
  if (m.t === 'expand') { return expand(m); }
  if (m.t === 'related') { return related(m); }
  if (m.t === 'sessions') { return sessions(m); }
  if (m.t === 'fileSessions') { return fileSessions(m); }
  if (m.t === 'handover') { return handover(m); }
  if (m.t === 'ctx') { await loaded; return ctxReply((id) => ix?.find(id), Array.isArray(m.ids) ? m.ids.filter((x: unknown) => typeof x === 'string') : []); }
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
  else if (m.t === 'editor') { void editorLines(m); }
  else if (m.t === 'cancel') { const s = live.get(m.id); if (s) { s.aborted = true; } }
  else {
    request(m).then((value) => post({ t: 'reply', req: m.req, value }),
      (e) => post({ t: 'reply', req: m.req, error: (e as Error).message }));
  }
});
