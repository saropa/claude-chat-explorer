/** Public API returned from activate(); other Saropa extensions read it with extension.exports. */
import { FileSessionsReply } from './fileSessions';
import { FileSessionsService, Requester } from './fileSessionsService';
import { TokenTotals } from './tokens';
import { ACCT_TIMEOUT_MS } from './client';
import type { Account, Totals } from './accountUsage';

export type { TokenTotals };
export type AccountUsage = { account: Account | null; usage: Totals };

export const API_VERSION = 1;

export interface ChatLink { id: string; title: string; edited: boolean; last: number; branch?: string; }
export interface ChatsForFile { indexing: boolean; total: number; edited: number; items: ChatLink[]; }

/** Chat facts from the index (no host state). Times are Unix ms. */
export interface ChatBase {
  id: string; title: string; project: string; folder: string; folders: string[];
  first: number; last: number; messages: number; size: number; subagents: number;
  model: string; models: string[];
  context?: { tokens: number; max: number; pending: boolean; compactions: number; window: number; percent: number; approx: boolean };
  tokens: TokenTotals;
  cost?: { usd: number; linesAdded: number; linesRemoved: number };
  branches: string[];
  prs: Array<{ number: number; repository: string }>;
  commits: Array<{ sha: string; branch: string }>;
  files: Array<{ path: string; edited: boolean }>;
  created: Array<{ kind: 'worktree' | 'branch'; name: string }>;
}
/** A chat with the host state the sidebar shows. state is the live dot name (for example "waiting"); absent when idle. pinned is the star in the UI. */
export interface ChatInfo extends ChatBase { pinned: boolean; archived: boolean; tags: string[]; state?: string; }
/** A branch (key is its name) or a pull request (key is "#123"), with its chats and their summed tokens. */
export interface WorkItem { kind: 'branch' | 'pr'; key: string; chatIds: string[]; tokens: TokenTotals; }
/** Host state merged into the chats. */
export interface ApiHost { pins(): string[]; archived(): string[]; tags(): { [id: string]: string[] }; dots(): { [id: string]: string }; }

export interface ChatExplorerApi {
  apiVersion: number;
  /** Chats that read or edited the file (absolute path); cached for 30 seconds per file. Rejects only if the index worker fails. */
  chatsForFile(file: string): Promise<ChatsForFile>;
  /** Cumulative tokens of one chat (session id), subagents included, never reset by /compact. undefined when the chat is not indexed. Waits for the index (up to 60 s); rejects if the worker fails or the wait times out. */
  tokensForChat(id: string): Promise<TokenTotals | undefined>;
  /** Sum over the chats of one work item: key is a branch name or a pull request number ("123" or "#123"). undefined when no chat belongs to it. Waits for the index (up to 60 s); rejects if the worker fails or the wait times out. */
  tokensForWork(key: string): Promise<TokenTotals | undefined>;
  /** Every indexed top-level chat with all fields the sidebar and Open Work show. Waits for the index (up to 60 s); rejects if the worker fails or the wait times out. */
  listChats(): Promise<ChatInfo[]>;
  /** One chat by session id; undefined when not indexed. Same waiting and errors as listChats. */
  getChat(id: string): Promise<ChatInfo | undefined>;
  /** Every branch and pull request any chat knows, with chat ids and summed tokens. Same waiting and errors as listChats. */
  listWork(): Promise<WorkItem[]>;
  /** Account (email, name, organization, plan; null when not signed in) and token totals of the last 5 hours and 7 days. undefined when the worker returns nothing. Waits up to 60 s; rejects on failure or timeout. */
  getAccountUsage(): Promise<AccountUsage | undefined>;
}

const slim = (r: FileSessionsReply): ChatsForFile => ({ indexing: r.indexing, total: r.total, edited: r.edited,
  items: r.items.map((s) => ({ id: s.id, title: s.title, edited: s.edited, last: s.last, branch: s.branch })) });

export function makeApi(svc: FileSessionsService, client: Requester, host: ApiHost): ChatExplorerApi {
  const ask = (m: { [k: string]: unknown }) => client.request(m, true, true, ACCT_TIMEOUT_MS);
  const merge = (b: ChatBase): ChatInfo => {
    const pins = new Set(host.pins()), arch = new Set(host.archived()), tags = host.tags(), dots = host.dots();
    return { ...b, pinned: pins.has(b.id), archived: arch.has(b.id), tags: tags[b.id] ?? [], ...(dots[b.id] ? { state: dots[b.id] } : {}) };
  };
  return {
    apiVersion: API_VERSION,
    chatsForFile: async (file) => slim(await svc.get(file)),
    tokensForChat: async (id) => (await client.request({ t: 'tokChat', id: String(id) }, true, true, ACCT_TIMEOUT_MS)) ?? undefined,
    tokensForWork: async (key) => (await client.request({ t: 'tokWork', key: String(key) }, true, true, ACCT_TIMEOUT_MS)) ?? undefined,
    listChats: async () => ((await ask({ t: 'apiChats' })) as ChatBase[] ?? []).map(merge),
    getChat: async (id) => { const b = await ask({ t: 'apiChat', id: String(id) }); return b ? merge(b) : undefined; },
    listWork: async () => (await ask({ t: 'apiWork' })) ?? [],
    getAccountUsage: async () => (await ask({ t: 'acct' })) ?? undefined,
  };
}
