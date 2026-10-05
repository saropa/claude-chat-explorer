import { opts } from './msgOpts';
import { compile } from './query';

type Req = { request: (m: any, bg?: boolean, soft?: boolean) => Promise<any> };

/** Answer an expand request from the panel: ask the worker and post the reply (lite skips Git, files and related chats); every failure posts 'expandFailed' so the card shows Retry. */
export async function runExpand(client: Req, id: string, m: any, ctx: object, post: (x: unknown) => void, logErr: (where: string, e: unknown) => void): Promise<void> {
  const o = opts(m), query = String(m.query ?? '');
  const offset = Math.max(0, Number(m.offset) || 0), lite = m.lite === true;
  const fail = (reason: string): void => post({ type: 'expandFailed', id, lite, reason });
  try { compile(query, o); } catch { fail('The search pattern is not valid'); return; } // the search shows the regex error itself
  try {
    // Soft background request: a stall rejects this card only and never restarts the worker or kills a running search.
    const ex = await client.request({ t: 'expand', chat: id, query, o, offset, lite, ...ctx }, true, true);
    if (ex) { post({ type: 'expanded', id, offset, lite, ...ex }); } else { fail('This chat is not indexed yet'); }
  } catch (e) {
    logErr('expand', e);
    fail('Could not load details');
  }
}
