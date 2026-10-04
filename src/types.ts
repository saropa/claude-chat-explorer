/** Shared types for the index, search and UI layers. */

export interface Msg { ts: number; role: 'user' | 'assistant'; text: string; }
export interface FileRef { path: string; edited: boolean; }

/** One indexed chat (one .jsonl file). */
export interface Chat {
  id: string; dir: string; file: string; mtime: number; size: number;
  title: string; last: number;
  first?: number; count?: number; // first message time, total text messages (absent in old caches)
  messages: Msg[]; files: FileRef[]; commands: string[];
}

export interface Options { all: boolean; cs: boolean; ww: boolean; re: boolean; when: string; }
export interface Abort { aborted: boolean; }

export type TokenKind = 'file' | 'edited' | 'cmd' | 'tag';
export interface Token { kind: TokenKind; value: string; }
export interface Compiled { terms: RegExp[]; tokens: Token[]; }

export interface Result {
  id: string; title: string; hits: number; last: number; project: string;
  snippet: string; ranges: Array<[number, number]>; score: number;
  msgs: number; first: number; edited: number; size: number;
}

/** A chat that shares files with another chat. */
export interface Related { id: string; title: string; shared: number; last: number; score: number; }
export type OnFile = (r: Result | null, done: number, total: number) => void;

/** Pins and tags, read at search time. */
export interface Ctx { pins: Set<string>; tags: { [id: string]: string[] }; }

export interface ExpandItem { role: string; ts: number; snippet: string; ranges: Array<[number, number]>; }
export interface Expanded {
  items: ExpandItem[]; total: number;
  files: Array<{ path: string; edited: boolean }>; commands: string[]; related: Related[];
}
