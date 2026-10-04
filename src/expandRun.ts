import { TIMEOUT_MSG, WorkerClient } from './client';
import { opts } from './msgOpts';
import { compile } from './query';

/** Answer an expand request from the panel: ask the worker and post the reply (lite skips Git, files and related chats). */
export async function runExpand(client: WorkerClient, id: string, m: any, ctx: object, post: (x: unknown) => void, logErr: (where: string, e: unknown) => void): Promise<void> {
  const o = opts(m), query = String(m.query ?? '');
  try { compile(query, o); } catch { return; } // invalid regex: search shows the error
  const offset = Math.max(0, Number(m.offset) || 0), lite = m.lite === true;
  try {
    const ex = await client.request({ t: 'expand', chat: id, query, o, offset, lite, ...ctx });
    if (ex) { post({ type: 'expanded', id, offset, lite, ...ex }); }
  } catch (e) {
    logErr('expand', e);
    if ((e as Error).message === TIMEOUT_MSG) { post({ type: 'error', message: TIMEOUT_MSG }); }
  }
}
