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

/** Flashes for one JSONL line; tool results, user lines and anything unreadable give none. */
export function flashesOf(line: string): Flash[] {
  let e: any;
  try { e = JSON.parse(line); } catch { return []; }
  if (e?.type === 'attachment') { return e.attachment?.type === 'nested_memory' ? ['memory'] : []; }
  if (e?.type !== 'assistant' || !Array.isArray(e.message?.content)) { return []; }
  const out: Flash[] = [];
  for (const b of e.message.content) {
    if (b?.type === 'text') { out.push('chat'); }
    else if (b?.type === 'thinking') { out.push('think'); }
    else if (b?.type === 'tool_use' && typeof b.name === 'string') { out.push(toolGroup(b.name, b.input)); }
  }
  return out;
}
