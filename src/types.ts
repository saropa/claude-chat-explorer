/** Shared types for the index, search, worker and UI layers. */

export interface FileRef { path: string; edited: boolean; }

/** Cost facts of a chat: the last cost-state row (totals are cumulative). models are short family names, costliest first. */
export interface Cost { usd: number; add: number; rem: number; models: string[]; }
/** Git facts of a chat: commits [sha, branch], branches touched, PRs [number, repository]. */
export interface Git { commits: Array<[string, string]>; branches: string[]; prs: Array<[number, string]>; }

/** Context facts of a chat: tokens of the last main-thread request, its model, the most tokens seen, its time, whether the figure lags one turn, and the compaction count. */
export interface Usage { tokens: number; model: string; max: number; at: number; pending: boolean; comp: number; }
/** Context usage as shown: percent (0 to 100), tokens, window size, short model id, compactions, lag flag, and approx when the window was inferred. */
export interface CtxInfo { pct: number; tokens: number; window: number; model: string; comp: number; pend: boolean; approx: boolean; }

/** In-memory metadata of one indexed chat file. Message text lives in its record file. */
export interface Chat {
  id: string; // session id, or agent id for a subagent
  dir: string; // project folder name
  parent?: string; // parent session id (subagents only)
  agentType?: string; desc?: string; // subagents only, from agent-<id>.meta.json
  mtime: number; size: number; title: string; last: number; first: number; count: number;
  files: FileRef[];
  rec: string; len: number; // record file name, and body length in bytes
  cost?: Cost; git?: Git; use?: Usage;
  cwd?: string; // working folder of the chat: the last cwd recorded in its rows
  bloom: Uint8Array; // trigram prefilter over lowercased text and commands
}

/** One decoded store record: messages packed into one string, separated by SEP. */
export interface Rec {
  text: string; ts: number[]; ends: number[]; roles: number[]; cmds: string[];
  cmdAt: number[]; // message index each command belongs to (the next kept message when its row has no text)
  lines: Uint32Array; // 1-based JSONL line of each message, for a later export feature
}

export interface Options { all: boolean; cs: boolean; ww: boolean; re: boolean; any?: boolean; when: string; subs: boolean; last: number; }
export interface Abort { aborted: boolean; }

export type TokenKind = 'file' | 'edited' | 'cmd' | 'tag' | 'sha' | 'pr' | 'branch';
export interface Token { kind: TokenKind; value: string; }
/** grams: trigram hashes every matching chat must contain (bloom prefilter); empty means no prefilter. last: only the final N messages match (0 = all). */
export interface Compiled { terms: RegExp[]; tokens: Token[]; grams: number[]; last: number; }

/** A matching subagent, nested under its parent result. */
export interface SubResult {
  id: string; file: string; // agent id and subagent .jsonl path
  type: string; desc: string; hits: number; last: number;
  snippet: string; ranges: Array<[number, number]>; score: number;
  msgs: number; first: number; edited: number; size: number;
  descShown?: string; descRanges?: Array<[number, number]>; // desc with the match kept in view
}

export interface Result {
  file: string; // source .jsonl path
  id: string; title: string; hits: number; last: number; project: string;
  snippet: string; ranges: Array<[number, number]>; score: number;
  msgs: number; first: number; edited: number; size: number;
  cost?: number; add?: number; rem?: number; models?: string[]; prs?: number; commits?: number; ctx?: CtxInfo; // cost info, git counts and context usage
  titleShown?: string; titleRanges?: Array<[number, number]>; // title with the match kept in view
  self?: boolean; // false when only subagents matched
  snipAt?: number; snipSub?: string; snipDesc?: string; snipRole?: string; mc?: number; // newest match: time, subagent type and description, role; mc = matching messages (own and subagents)
  subs?: SubResult[]; subTotal?: number;
}

/** A chat that shares files with another chat. */
export interface Related { id: string; title: string; shared: number; last: number; score: number; }

/** Pins and tags, read at search time. */
/** dots: dot state name of chats that are not idle (Active status). archived: ids export leaves out. */
export interface Ctx { pins: Set<string>; tags: { [id: string]: string[] }; dots?: { [id: string]: string }; archived?: Set<string>; }

export interface ExpandItem { role: string; ts: number; snippet: string; ranges: Array<[number, number]>; sub?: string; desc?: string; }
export interface Expanded {
  items: ExpandItem[]; total: number;
  files: Array<{ path: string; edited: boolean }>; commands: string[]; related: Related[];
  git: { prs: Array<{ number: number; repository: string }>; commits: Array<{ sha: string; branch: string }>; moreCommits: number };
}
