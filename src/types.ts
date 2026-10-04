/** Shared types for the index, search, worker and UI layers. */

export interface FileRef { path: string; edited: boolean; }

/** In-memory metadata of one indexed chat file. Message text lives in its record file. */
export interface Chat {
  id: string; // session id, or agent id for a subagent
  dir: string; // project folder name
  parent?: string; // parent session id (subagents only)
  agentType?: string; desc?: string; // subagents only, from agent-<id>.meta.json
  mtime: number; size: number; title: string; last: number; first: number; count: number;
  files: FileRef[];
  rec: string; len: number; // record file name, and body length in bytes
  bloom: Uint8Array; // trigram prefilter over lowercased text and commands
}

/** One decoded store record: messages packed into one string, separated by SEP. */
export interface Rec {
  text: string; ts: number[]; ends: number[]; roles: number[]; cmds: string[];
  lines: Uint32Array; // 1-based JSONL line of each message, for a later export feature
}

export interface Options { all: boolean; cs: boolean; ww: boolean; re: boolean; when: string; subs: boolean; last: number; }
export interface Abort { aborted: boolean; }

export type TokenKind = 'file' | 'edited' | 'cmd' | 'tag';
export interface Token { kind: TokenKind; value: string; }
/** grams: trigram hashes every matching chat must contain (bloom prefilter); empty means no prefilter. last: only the final N messages match (0 = all). */
export interface Compiled { terms: RegExp[]; tokens: Token[]; grams: number[]; last: number; }

/** A matching subagent, nested under its parent result. */
export interface SubResult {
  id: string; file: string; // agent id and subagent .jsonl path
  type: string; desc: string; hits: number; last: number;
  snippet: string; ranges: Array<[number, number]>; score: number;
  msgs: number; first: number; edited: number; size: number;
}

export interface Result {
  file: string; // source .jsonl path
  id: string; title: string; hits: number; last: number; project: string;
  snippet: string; ranges: Array<[number, number]>; score: number;
  msgs: number; first: number; edited: number; size: number;
  self?: boolean; // false when only subagents matched
  subs?: SubResult[]; subTotal?: number;
}

/** A chat that shares files with another chat. */
export interface Related { id: string; title: string; shared: number; last: number; score: number; }

/** Pins and tags, read at search time. */
export interface Ctx { pins: Set<string>; tags: { [id: string]: string[] }; }

export interface ExpandItem { role: string; ts: number; snippet: string; ranges: Array<[number, number]>; sub?: string; }
export interface Expanded {
  items: ExpandItem[]; total: number;
  files: Array<{ path: string; edited: boolean }>; commands: string[]; related: Related[];
}
