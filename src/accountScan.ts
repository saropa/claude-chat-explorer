/** Worker side of the Account & Usage section: reads ~/.claude.json and sums token usage from recent transcripts. Files are re-read only when they change. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { Account, accountOf, dedupe, Ev, eventOf, Totals, totals, WINDOWS } from './accountUsage';
import { listFiles, projectsRoot } from './files';

export interface AccountReply { account: Account | null; usage: Totals; }
const cache = new Map<string, { mtime: number; size: number; evs: Ev[] }>();

async function eventsOf(file: string): Promise<Ev[]> {
  const evs: Ev[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) { const e = eventOf(line); if (e) { evs.push(e); } }
  return evs;
}

let inFlight: Promise<AccountReply> | undefined;
/** One scan at a time: a request made while a scan runs shares its result. */
export function accountData(now: number, onError: (where: string, e: unknown) => void): Promise<AccountReply> {
  inFlight ??= scan(now, onError).finally(() => { inFlight = undefined; });
  return inFlight;
}

async function scan(now: number, onError: (where: string, e: unknown) => void): Promise<AccountReply> {
  let text = '';
  try { text = await fs.promises.readFile(path.join(os.homedir(), '.claude.json'), 'utf8'); } catch { /* not signed in */ }
  const files = (await listFiles(projectsRoot(), onError)).filter((f) => now - f.mtime < WINDOWS.d7);
  const live = new Set(files.map((f) => f.file));
  for (const k of cache.keys()) { if (!live.has(k)) { cache.delete(k); } }
  for (const f of files) {
    const c = cache.get(f.file);
    if (c && c.mtime === f.mtime && c.size === f.size) { continue; }
    try { cache.set(f.file, { mtime: f.mtime, size: f.size, evs: await eventsOf(f.file) }); } catch (e) { onError('usage ' + f.id, e); }
  }
  return { account: accountOf(text), usage: totals(dedupe([...cache.values()].flatMap((c) => c.evs)), now) };
}
