import { encodeRec } from './blob';
import { buildBloom } from './bloom';
import { agentMeta, FileStat } from './files';
import { MSG_CAP, parseFile, SEP, SUB_CAP } from './parse';
import { Chat } from './types';

/** Parse one chat file into its in-memory entry (rec still unset) and its encoded record body. */
export async function buildChat(f: FileStat, before: number): Promise<{ chat: Chat; body: Buffer }> {
  const p = await parseFile(f.file, f.mtime, f.parent ? SUB_CAP : MSG_CAP, before);
  const meta = f.parent ? await agentMeta(f.file) : {};
  const body = encodeRec(p);
  const bloom = buildBloom((p.texts.join(SEP) + SEP + p.cmds.join(SEP)).toLowerCase());
  const c: Chat = {
    id: f.id, dir: f.dir, mtime: f.mtime, size: f.size, title: p.title, last: p.last, first: p.first,
    count: p.count, files: p.files, rec: '', len: body.length, bloom,
  };
  if (f.parent) { c.parent = f.parent; c.agentType = meta.type; c.desc = meta.desc; } // a subagent never carries its own cost: the parent total already holds it
  else { if (p.cost) { c.cost = p.cost; } if (p.use) { c.use = p.use; } } // context usage is the parent's own, never a subagent's
  if (p.git) { c.git = p.git; }
  if (p.cwd) { c.cwd = p.cwd; }
  return { chat: c, body };
}
