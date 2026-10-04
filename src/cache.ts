import * as fs from 'fs';
import * as readline from 'readline';
import { once } from 'events';
import { Chat } from './types';

const VERSION = 1;

/** Write the cache as JSON lines (header, then one chat per line). Returns bytes written. */
export async function saveCache(file: string, chats: Iterable<Chat>, pruned: boolean): Promise<number> {
  const tmp = file + '.tmp';
  const ws = fs.createWriteStream(tmp, { encoding: 'utf8' });
  const put = async (s: string) => { if (!ws.write(s)) { await once(ws, 'drain'); } };
  await put(JSON.stringify({ v: VERSION, pruned }) + '\n');
  for (const c of chats) { await put(JSON.stringify(c) + '\n'); }
  ws.end();
  await once(ws, 'finish');
  const bytes = ws.bytesWritten;
  await fs.promises.rename(tmp, file);
  return bytes;
}

/** Read the cache; returns no chats when missing, unreadable or from another version. */
export async function loadCache(file: string): Promise<{ chats: Chat[]; pruned: boolean }> {
  const chats: Chat[] = [];
  let pruned = false, first = true;
  try {
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) { continue; }
      const o = JSON.parse(line);
      if (first) {
        first = false;
        if (o.v !== VERSION) { return { chats: [], pruned: false }; }
        pruned = !!o.pruned;
      } else { chats.push(o as Chat); }
    }
  } catch { return first ? { chats: [], pruned: false } : { chats, pruned }; }
  return { chats, pruned };
}
