import * as fs from 'fs';
import * as readline from 'readline';
import { once } from 'events';
import { Chat } from './types';

const VERSION = 2;

/** True when a parsed cache line has every field the search layer reads. */
function isChat(o: any): o is Chat {
  return !!o && typeof o.file === 'string' && typeof o.id === 'string' && typeof o.title === 'string'
    && Array.isArray(o.messages) && Array.isArray(o.files) && Array.isArray(o.commands);
}

/** Write the cache as JSON lines (header, then one chat per line). Returns bytes written. */
export async function saveCache(file: string, chats: Iterable<Chat>, pruned: boolean): Promise<number> {
  const tmp = file + '.tmp';
  const ws = fs.createWriteStream(tmp, { encoding: 'utf8' });
  let failed: Error | undefined;
  ws.on('error', (e) => { failed = e; }); // without a listener a write error crashes the host
  const put = async (s: string) => {
    if (failed) { throw failed; }
    if (!ws.write(s)) { await once(ws, 'drain'); }
  };
  try {
    await put(JSON.stringify({ v: VERSION, pruned }) + '\n');
    for (const c of chats) { await put(JSON.stringify(c) + '\n'); }
    ws.end();
    await once(ws, 'finish');
    if (failed) { throw failed; }
  } catch (e) {
    ws.destroy();
    await fs.promises.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
  await fs.promises.rename(tmp, file);
  return ws.bytesWritten;
}

/** Read the cache; returns no chats when missing or from another version, and skips corrupt lines. */
export async function loadCache(file: string): Promise<{ chats: Chat[]; pruned: boolean }> {
  const chats: Chat[] = [];
  let pruned = false, first = true;
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) { continue; }
      let o: any;
      try { o = JSON.parse(line); } catch { o = undefined; }
      if (first) {
        first = false;
        if (!o || o.v !== VERSION) { return { chats: [], pruned: false }; }
        pruned = !!o.pruned;
      } else if (isChat(o)) { chats.push(o); }
    }
  } catch { return first ? { chats: [], pruned: false } : { chats, pruned }; }
  finally { rl.close(); input.destroy(); }
  return { chats, pruned };
}
