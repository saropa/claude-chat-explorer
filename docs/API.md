# Saropa Chat Explorer API

Other extensions can read data from Saropa Chat Explorer. The API is read-only and local: nothing leaves the machine.

## Getting the API

The extension id is `saropa.claude-chat-explorer` (publisher `saropa`, name `claude-chat-explorer` in `package.json`). `activate()` returns the API, so it is the `exports` of the extension:

```ts
import * as vscode from 'vscode';

const ext = vscode.extensions.getExtension<ChatExplorerApi>('saropa.claude-chat-explorer');
const api = ext ? await ext.activate() : undefined; // activate() returns exports; it is safe to call when already active
```

`ext` is undefined when Chat Explorer is not installed; handle that and carry on without it.

## Version

`api.apiVersion` is a number, currently `1`. It changes only when an existing method changes shape or meaning. New methods are additive and do not bump it, so test for a method before calling it (`typeof api.tokensForChat === 'function'`) when you support older installs.

## Types

```ts
interface ChatLink { id: string; title: string; edited: boolean; last: number; branch?: string; }
interface ChatsForFile { indexing: boolean; total: number; edited: number; items: ChatLink[]; }
interface TokenTotals { input: number; output: number; cacheRead: number; cacheWrite: number; replies: number; compactions: number; }
interface ChatBase {
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
interface ChatInfo extends ChatBase { pinned: boolean; archived: boolean; tags: string[]; state?: string; }
interface WorkItem { kind: 'branch' | 'pr'; key: string; chatIds: string[]; tokens: TokenTotals; }
interface Account { email: string; name: string; org: string; plan: string; }
interface Tokens { io: number; cache: number; } // io = input + output, cache = cache read + write
interface AccountUsage { account: Account | null; usage: { h5: Tokens; d7: Tokens } }
interface ChatExplorerApi {
  apiVersion: number;
  chatsForFile(file: string): Promise<ChatsForFile>;
  tokensForChat(id: string): Promise<TokenTotals | undefined>;
  tokensForWork(key: string): Promise<TokenTotals | undefined>;
  listChats(): Promise<ChatInfo[]>;
  getChat(id: string): Promise<ChatInfo | undefined>;
  listWork(): Promise<WorkItem[]>;
  getAccountUsage(): Promise<AccountUsage | undefined>;
}
```

`last` is a Unix time in milliseconds. `id` is the Claude Code session id.

## Methods

### `chatsForFile(file: string): Promise<ChatsForFile>`

The chats that read or edited the file. `file` is an absolute path.

- `items` lists the chats (id, title, whether it edited the file, last used, branch); `total` and `edited` count them.
- `indexing: true` means the first index build is still running: the answer is empty and not final. Ask again later.
- Caching: cached 30 seconds per file path, and dropped when the index changes. Never cached while `indexing` is true.
- Errors: rejects only if the index worker fails.

### `tokensForChat(id: string): Promise<TokenTotals | undefined>`

Cumulative tokens of one chat, from the start of its transcript to now.

- `id` is the session id of a top-level chat (a `ChatLink.id`). The total includes the chat's subagents.
- Each billed assistant reply counts once: streamed rows of one message share an id and count once, using the last row's figures.
- A `/compact` never lowers the totals. `compactions` reports how many happened.
- Returns `undefined` when the id is not an indexed top-level chat. A known chat with no billed reply returns zeros.
- Tokens only, no price. `input`, `output`, `cacheRead` and `cacheWrite` are kept separate. `replies` is the number of billed replies counted.
- Caching: none beyond the index; the totals are stored with each indexed chat and refresh when the transcript changes.
- Errors: the call waits for the index to finish loading (up to 60 s). It rejects if the index worker fails or the wait times out. It returns `undefined` only for an unknown id, never because indexing is still running.

### `tokensForWork(key: string): Promise<TokenTotals | undefined>`

The sum of `tokensForChat` over every chat of one work item.

- `key` is a branch name (`feat/login`) or a pull request number. `"#123"` is always a pull request; a bare `"123"` is a pull request unless a chat recorded a branch with that name.
- A chat belongs to a branch when its transcript rows record that branch or its tool calls touched it, and to a pull request when it opened that pull request. A chat that belongs by both counts once.
- Returns `undefined` when no chat belongs to the key.
- `compactions` is the sum over the chats.
- Caching and errors: as `tokensForChat`.
- Matching uses the recorded branch and git calls of each chat, so the total can differ from the row total on the Open Work page, which uses a richer matcher.

### `listChats(): Promise<ChatInfo[]>`

Every indexed top-level chat (subagents are counted in `subagents` and in `tokens`, not listed), in index order. Not sorted: sort by `last` yourself.

- `ChatInfo` carries what the sidebar and Open Work show: `id`, `title`, `project` (display name), `folder` (working folder, `''` when unknown), `folders` (every distinct one), `first`/`last` (ms), `messages`, `size` (bytes), `subagents`, `model` (short name of the last request's model) and `models` (cost models, costliest first).
- `context` (absent when no request was seen): `tokens` of the last main-thread request, `max` seen, `pending` (figure lags one turn), `compactions`, `window` (context window size), `percent` (0 to 100) and `approx` (window inferred).
- `tokens` is the same `TokenTotals` as `tokensForChat`. `cost` (absent when none recorded) is the last cost-state row: `usd` as Claude Code recorded it, lines added and removed.
- `branches` (every branch the chat's rows or git calls named), `prs`, `commits`, `files` (read or edited), `created` (worktrees and branches its tool calls made).
- Host state: `pinned` (the star in the sidebar), `archived`, `tags`, and `state`, the live dot name (for example `"waiting"`; absent when the chat is idle).
- Internal fields (cache paths, record files, the search prefilter) are not included. Read-only: nothing here changes a chat.
- Errors: waits for the index (up to 60 s); rejects if the index worker fails or the wait times out. Returns `[]` only when nothing is indexed.

### `getChat(id: string): Promise<ChatInfo | undefined>`

One `ChatInfo` by session id. `undefined` when the id is not an indexed top-level chat. Same waiting and errors as `listChats`.

### `listWork(): Promise<WorkItem[]>`

Every branch and pull request any chat knows. `key` is the branch name, or `"#123"` for a pull request; `chatIds` are the chats that belong to it and `tokens` their summed `TokenTotals`. Matching is the same simple match as `tokensForWork` (so totals equal `tokensForWork(key)`), not the richer matcher of the Open Work page. Same waiting and errors as `listChats`.

### `getAccountUsage(): Promise<AccountUsage | undefined>`

The Account & Usage section of the sidebar. Account email is included.

- `account` is the signed-in Claude Code account from `~/.claude.json` (`email`, `name`, `org`, `plan`), or `null` when not signed in.
- `usage.h5` and `usage.d7` are token sums over the rolling last 5 hours and 7 days from local transcripts: `io` is input plus output, `cache` is cache read plus write. Anthropic's limits are not known, so there is no percent of limit.
- Returns `undefined` if the worker returns nothing. Scans every transcript (about 7 s cold); waits up to 60 s and rejects on worker failure or timeout.

## Example

```ts
import * as vscode from 'vscode';

async function costOfBranch(branch: string): Promise<string> {
  const api = await vscode.extensions.getExtension<ChatExplorerApi>('saropa.claude-chat-explorer')?.activate();
  if (!api || api.apiVersion < 1 || typeof api.tokensForWork !== 'function') { return 'unavailable'; }
  try {
    const t = await api.tokensForWork(branch);
    return t ? `${t.input + t.output} in+out, ${t.cacheRead} cache read over ${t.replies} replies` : 'no chats';
  } catch {
    return 'unavailable'; // the index worker failed; try again later
  }
}
```

```ts
async function waitingChats(): Promise<string[]> {
  const api = await vscode.extensions.getExtension<ChatExplorerApi>('saropa.claude-chat-explorer')?.activate();
  if (!api || typeof api.listChats !== 'function') { return []; }
  try {
    return (await api.listChats()).filter((c) => c.state === 'waiting' && !c.archived).map((c) => `${c.title} (${c.tokens.input + c.tokens.output} tokens)`);
  } catch {
    return []; // index worker failed or timed out
  }
}
```
