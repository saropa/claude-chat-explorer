/** Maps one chat log line to the Activity diagram groups it lights up. */
export type Group = 'chat' | 'memory' | 'files' | 'terminal' | 'web' | 'agents' | 'connect' | 'control';
/** A group, or 'think' for the center circle. */
export type Flash = Group | 'think';

const FILES = new Set(['Read', 'Edit', 'Write', 'Grep', 'Glob', 'NotebookEdit']);
const AGENTS = new Set(['Agent', 'SendMessage', 'ListAgents']);

const isMemoryPath = (p: unknown): boolean => {
  if (typeof p !== 'string') { return false; }
  const s = p.replace(/\\/g, '/');
  return s.split('/').pop() === 'CLAUDE.md' || (s.includes('/.claude/') && s.includes('/memory/'));
};

/** Group of one tool call by tool name (a Read of a memory or instruction file counts as Memory). */
export function toolGroup(name: string, input?: { file_path?: unknown; path?: unknown }): Group {
  if (name === 'Read' && (isMemoryPath(input?.file_path) || isMemoryPath(input?.path))) { return 'memory'; }
  if (FILES.has(name)) { return 'files'; }
  if (name === 'Bash') { return 'terminal'; }
  if (name === 'WebSearch' || name === 'WebFetch') { return 'web'; }
  if (AGENTS.has(name)) { return 'agents'; }
  if (name === 'AskUserQuestion') { return 'chat'; }
  if (name.startsWith('mcp__') || name === 'Skill' || name === 'ToolSearch') { return 'connect'; }
  return 'control';
}

/** What the webview is told about a log line. `err` flashes in the error color; `busy` and `end` bracket a tool call; `wait` holds the "Claude is waiting for you" state on the core or the Chat node; `wake` clears it. */
export type ActivityEvent =
  | { t: 'flash'; g: Flash; err?: true }
  | { t: 'caption'; text: string }
  | { t: 'busy'; id: string; g: Group }
  | { t: 'end'; id: string; g: Group }
  | { t: 'wait'; g: 'think' | 'chat' }
  | { t: 'wake' };

const CAPTION_MAX = 80, PENDING_MAX = 200;
const clip = (s: string): string => { const t = Array.from(s.replace(/\s+/g, ' ').trim()); return t.length > CAPTION_MAX ? t.slice(0, CAPTION_MAX - 1).join('') + '…' : t.join(''); };
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const base = (p: unknown): string => str(p).replace(/\\/g, '/').split('/').pop() ?? '';
const host = (u: unknown): string => { try { return new URL(str(u)).host; } catch { return ''; } };

/** The program name of a command (leading VAR=value words skipped, path dropped), or a generic phrase when it is not a plain name: nothing else of a command is shown. */
const commandLine = (cmd: unknown): string => {
  const w = base(str(cmd).trim().split(/\s+/).find((x) => !x.includes('=')));
  return /^[\w.-]+$/.test(w) ? 'Running: ' + w : 'Running a command';
};

/** One plain-words line for a tool call: a description, a file name, a query or a host, never a full command or prompt. Empty when there is nothing to say. */
export function captionOf(name: string, input: any): string {
  const i = input ?? {};
  let t = '';
  if (name === 'Bash') { t = str(i.description) ? 'Running: ' + str(i.description) : commandLine(i.command); }
  else if (name === 'Read' || name === 'Edit' || name === 'Write' || name === 'NotebookEdit') { const f = base(i.file_path ?? i.notebook_path); t = f && (name === 'Read' ? 'Reading ' : name === 'Write' ? 'Writing ' : 'Editing ') + f; }
  else if (name === 'Grep' || name === 'Glob') { t = 'Searching files'; }
  else if (name === 'WebSearch') { t = str(i.query) && 'Searching the web: ' + str(i.query); }
  else if (name === 'WebFetch') { t = host(i.url) && 'Fetching ' + host(i.url); }
  else if (name === 'Agent') { t = str(i.description) && 'Agent: ' + str(i.description); }
  else if (name === 'Skill') { t = str(i.skill) && 'Skill: ' + str(i.skill); }
  else if (name === 'AskUserQuestion') { t = 'Waiting for your answer'; }
  return clip(t);
}

/** Events for one JSONL line. `pending` maps the id of each call in flight to its group; a result finds its group there, and the map is the caller's to clear on a chat switch. */
export function eventsOf(line: string, pending: Map<string, Group>): ActivityEvent[] {
  let e: any;
  try { e = JSON.parse(line); } catch { return []; }
  if (e?.type === 'attachment') { return e.attachment?.type === 'nested_memory' ? [{ t: 'flash', g: 'memory' }] : []; }
  if (e?.type === 'system') { return e.subtype === 'api_error' && (e.retryAttempt ?? 1) === 1 ? [{ t: 'flash', g: 'think', err: true }] : []; } // one flash per run of retries
  const content = e?.message?.content, out: ActivityEvent[] = [];
  if (e?.type === 'user') {
    if (e.isMeta !== true && (typeof content === 'string' || (Array.isArray(content) && content.some((b: any) => b?.type === 'text')))) { out.push({ t: 'wake' }); }
    for (const b of Array.isArray(content) ? content : []) {
      const g = b?.type === 'tool_result' && typeof b.tool_use_id === 'string' ? pending.get(b.tool_use_id) : undefined;
      if (!g) { continue; }
      pending.delete(b.tool_use_id);
      out.push({ t: 'end', id: b.tool_use_id, g });
      if (b.is_error === true) { out.push({ t: 'flash', g, err: true }); }
    }
    if (e.permissionDecision?.decision === 'reject') { out.push({ t: 'flash', g: 'think', err: true }); }
    return out;
  }
  if (e?.type !== 'assistant' || !Array.isArray(content)) { return []; }
  let caption: string | undefined; // '' clears the old text
  for (const b of content) {
    if (b?.type === 'text') { out.push({ t: 'flash', g: 'chat' }); }
    else if (b?.type === 'thinking') {
      out.push({ t: 'flash', g: 'think' });
      const s = Math.round(Number(e.thinkingDurationMs) / 1000);
      caption = s >= 1 ? `Thought for ${s} s` : 'Thinking';
    } else if (b?.type === 'tool_use' && typeof b.name === 'string') {
      const g = toolGroup(b.name, b.input);
      out.push({ t: 'flash', g });
      caption = captionOf(b.name, b.input);
      if (typeof b.id === 'string') {
        if (pending.size >= PENDING_MAX) { pending.delete(pending.keys().next().value as string); }
        pending.set(b.id, g);
        out.push(b.name === 'AskUserQuestion' ? { t: 'wait', g: 'chat' } : { t: 'busy', id: b.id, g });
      }
    }
  }
  const lastType = content[content.length - 1]?.type; // end_turn is copied onto every block line of a message: only its final text line waits
  if (e.message.stop_reason === 'end_turn' && lastType !== 'thinking' && lastType !== 'tool_use') { out.push({ t: 'wait', g: 'think' }); caption = 'Waiting for you'; }
  if (caption !== undefined) { out.push({ t: 'caption', text: caption }); }
  return out;
}
