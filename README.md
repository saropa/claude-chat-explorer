# Saropa Chat Explorer: Search and Resume Claude Code Chat History in VS Code

Saropa Chat Explorer is a VS Code extension for full-text search of your Claude Code chat history. Find an old session by any word or phrase, see which chat edited a file, check the git state of a chat, and resume the session from the sidebar. It indexes `~/.claude/projects` locally in a worker thread, makes no network requests of its own, and has no runtime dependencies.

Keywords: Claude Code, AI agent, chat history, session search, transcript search, resume session, subagent, git worktree, pull request status, context window, VS Code extension.

## What it does

- Full-text search of agent sessions, including subagent transcripts.
- Click a result to resume that session. Resuming needs the agent extension.
- Shows which chat edited a file, from the Explorer, editor or tab menu.
- Shows the git state of a chat in its card: branch, open pull request, uncommitted files, unpushed commits and worktrees.
- Warns when a live chat nears a full context window.
- Project Status page: branches, worktrees, pull requests and chats of one repository, grouped by what to do next.
- Local only. The optional pull request lookup runs your own `gh` command (setting `saropaChatExplorer.lookupPullRequests`, on by default).

## Install

Marketplace: search for "Saropa Chat Explorer" in the Extensions view, or run:

```
code --install-extension saropa.claude-chat-explorer
```

From a `.vsix` file:

```
code --install-extension claude-chat-explorer-<version>.vsix
```

Or open the Extensions view, choose `...` then "Install from VSIX...", and pick the file.

## Quick start

1. Click the Saropa Chat Explorer icon in the activity bar.
2. Wait for the first index to finish. Search works on what is indexed so far.
3. Type a word or phrase. Results appear after you stop typing. Enter searches at once.
4. Narrow the results with the match toggles, the Sort and Status icons in the view title bar, and the search details (`...`) button.
5. Click a result to resume that session, or click its chevron to read the matching messages.
6. Tick External (search details) to search chats from every project, not only this workspace.

## Search

### Search syntax

| Token | Example | Finds |
|---|---|---|
| plain text | `my family` | The exact phrase in one message. |
| `"..."` | `"regen l10n"` | An exact phrase (with Match any order on). |
| `last:<n>` | `deploy last:20` | Matches in the final 20 messages. |
| `from:you` or `from:agent` | `deploy from:you` | Only your messages, or only the agent's (and subagents'). `from:both` is the default. |
| `file:<text>` | `file:search.ts` | Chats that touched a file path, including chats that only mention it in text or commands. |
| `edited:<text>` | `edited:search.ts` | Chats that edited a file path. |
| `cmd:<text>` | `cmd:"npm run"` | Chats where the agent ran a matching command. |
| `tag:<name>` | `tag:billing` | Chats you tagged. |
| `sha:<prefix>` | `sha:a1b2c3d` | Chats with a commit that starts with it (4 to 40 hex characters). |
| `pr:<number>` | `pr:#123` | Chats linked to that PR. `pr:123` works too. |
| `branch:<text>` | `branch:main` | Chats with a branch name containing the text, including branches a tool call of the chat or its subagents created. |

- Tokens combine with plain words and with each other.
- Tokens ignore case. A search needs at least 2 characters.
- Quote values that contain spaces.

### Match options and filters

| Option | What it does |
|---|---|
| Exact phrase (default) | The whole query is one exact phrase in one message. |
| Match any order (Alt+O) | Words match in any order. `"quoted phrases"` stay exact. |
| Match Case (Alt+C), Whole Word (Alt+W), regular expression (Alt+R) | As in VS Code Search. A pattern that stalls for 3 seconds stops with "Search timed out: simplify the pattern". |
| Messages from | Both, You or Agent. Same as `from:`. Subagent messages count as the agent. |
| Messages to search | Last 10, 25, 50 or 100 messages of each chat. Same as `last:<n>`. |
| Chats active during | Any time, last hour, 2, 4 or 8 hours, today, this week (rolling last 7 days), Work week (Mon-Sun, from Monday 00:00) or this month (from the 1st, 00:00). Local time. |
| Search scope | Subs (subagent chats, on by default), Archive (archived chats, off by default) and External (every project, off by default). |
| Sort | Score, Time (grouped by day), Title, Length, Cost or Context. Pinned chats list first. |
| Status filter | Mid-size, Active, Empty, Tiny, Huge, Nearly full, Abandoned, Pinned. Each has a count and a tooltip with its rule. Reset turns them all on. |

- The `...` button under the search box ("Toggle search details") shows or hides the time, message, sender and scope controls. A count on the button shows how many differ from the defaults. The choice is remembered per workspace.
- Sort, Status filter and Search Tips are icons in the view title bar. Each opens a quick pick.
- Up and Down in the search box step through your last 20 searches with their toggles.

### Ranking and results

- Title matches rank first. The whole score decays smoothly with age (never below 30%), so recent and live chats come first among comparable matches.
- One row per chat. It shows the newest match (across the chat and its subagents) as a snippet of at most two lines, starting just before the match.
- "+N more" under the snippet opens the other matches in place, newest first, 20 at a time. Identical texts collapse into one item with a count such as x3.
- With a search, the time pill and day groups use the time of the newest match. The chat's last active time is in the tooltip and the card.
- Like VS Code Search, the panel lists at most 500 chats (`saropaChatExplorer.maxResults`, 50 to 2000) and says so. Every match is still counted. A chat shows "9,999+" above 9,999 hits.
- Open in editor (the summary line under the search box, or "Saropa Chat Explorer: Open Results in Editor") opens all matches in a read-only "Search: query" tab: a header per chat (Cmd/Ctrl+click resumes it), matching lines with one line of context, real JSONL line numbers and highlighted matches.
- In All sessions (no search), chats that are open list above chats that are not, with a divider. Pinned chats stay in their own section.

## Chat rows and cards

### Status dot

An 8 px dot sits left of each chat title. It uses the same states as the agent's own panel.

| Dot | Meaning |
|---|---|
| Green | Running: the agent is working in that chat. |
| Blue | Waiting for you: the agent needs a permission or an answer. |
| Orange | Unread: the chat finished while you were away. This is approximate. |
| Purple | Waiting on background agents or shells (a launch with no finish notice yet in the transcript). |
| Grey, faded | Idle. |
| Hollow ring | A live agent process (terminal, tab or window) that is not running or waiting. |

- A chat with several states at once cycles through their colors. The tooltip lists all of them.
- Open window marker: a solid ring means the live chat is open in this window. A dashed ring means another window. On Windows, or when `ps` fails, no marker shows.
- Live state comes from `~/.claude/sessions`, checked every 30 seconds and when the panel becomes visible. Without those files every chat shows idle.
- Unread is a guess: a chat you saw running or waiting that then went idle or closed. Resuming the chat or "Mark as Read" clears it.
- `saropaChatExplorer.animateDots` (default on) animates the dots. Off, or with reduced motion, they stay still and show the most important state. Colors: `saropaChatExplorer.dotRunning`, `dotWaiting`, `dotUnread`, `dotBackground`, `dotIdle`.
- The chat open in this window is highlighted like the official sidebar. It follows the focused Claude tab.

### Context ring, pill and warnings

- Context ring: every row with token data shows a small ring that fills as the chat's context grows, against `saropaChatExplorer.contextRingTokens` (default 300000, minimum 10000). Warning color at 80 percent, error color at 100 percent or more. Hover for "136.8k of 300k tokens".
- Context pill: shown from 60 percent (amber 60 to 79, orange 80 to 89, red 90 and above). The card always shows a Context stat, such as "82% (164k of 200k, opus-4-6)". The figure approximates the agent's own and lags one turn.
- Warnings: a live chat that reaches 80 or 90 percent gets one notification with Open chat and Dismiss (the 90 percent one also offers Copy hand-over note). Each chat warns once per level, again after a compaction or after it falls 10 points below the level. At most 1 notification per 30 second check and 3 in 10 minutes. Turn off with `saropaChatExplorer.contextWarnings`.
- Status bar: "3 chats near full" appears only when chats are 80 percent full or more. Click it to filter to Nearly full. Hide with `saropaChatExplorer.showUsageStatusBar`.

### Expanded card

The chevron opens the row as a card with an action bar (Resume, Pin, Archive, Mark read, Copy ID, Copy hand-over note), matched files and commands, labeled stats (cost, lines added and removed, models), tags and five collapsed sections. Nothing for a section is fetched until you open it.

| Section | Shows |
|---|---|
| Git | Branch with commits ahead and behind, working folder, the open pull request for the branch (number, title, state; click opens it), and the PRs and commits the chat mentions (click to search). "Created by: created branch X at <time>", "Made here (N)" (every branch and worktree the chat or its subagents created, live or "created, now removed"), "Also used", and a collapsed "Mentions only (N)". |
| Uncommitted files | Changed files. Click opens the file. |
| Unpushed commits | Up to 20 commits (short id and subject). Click a commit id to search `sha:` for the chat that made it. |
| Worktrees | Worktrees of the chat's repository. The ones the chat created are marked; removed ones show "created, now removed". |
| Related chats | Up to 5 other chats that touched the same files. |

- The card reads the worktree the chat (or one of its subagents) created, else the worktree it ran in, else the one for the branch its rows record, else its last folder.
- One request per section and working folder runs at a time. A section that fails shows a Retry link.
- Copy hand-over note copies the title, session id, folder, branch, last active time, context percent, matched files and live git state. A part that cannot be read in 5 seconds is written as "not available".

### Organize

- Pin: star a chat or use Pin Chat / Unpin Chat in the row context menu. Pinned chats list first.
- Tag: click the tag icon on a row, type a name, press Enter. Click a tag to filter.
- Archive: moves a chat into a collapsed "Archived chats" section. A pinned chat stays pinned. Archived rows show a dimmer title and greyscale emoji. The archive list is shared by all workspaces.
- Import Archived Chats from the Agent: command "Saropa Chat Explorer: Import Archived Chats from the Agent". Runs only when you ask. Needs `sqlite3` on your PATH.
- Row context menu: Copy resume command (`cd <folder> && claude --resume <id>`, quoted for your shell), Export as Markdown, Mark as Read, Archive.

## Find the chat that edited a file

Right-click a file in the Explorer, the editor or its tab and choose "Saropa: Find Related Chats". The panel opens and searches `file:<path>`. Each row has an edited or read pill, and edited chats rank first. The status bar shows the count for the active file (`saropaChatExplorer.showFileSessionsStatusBar`).

## Project Status page

One page answers: what is still open in this repository, and what do I do to close it? Open it with "Saropa Chat Explorer: Project Status" or the checklist icon in the sidebar title bar. It covers the repository of the first workspace folder. With no git repository there, it says "Open a git repository folder".

**The Work table**
- One row per branch, with its worktree folder, creation time, pull request and chats folded in. Pull-request-only branches, remote-only branches and folders git does not list are rows of the same table.
- Each row: branch name, one verdict (Dirty, Unpushed, PR failing, PR open, Merged clean, No PR, Remote only, Not a registered worktree, Behind, Active chat, Needs you), one short reason ("26 files not committed, 11 behind main"), the full sentence in a tooltip.
- Groups: Needs you, Unfinished work, Waiting, Cleanup, Idle. Cleanup and Idle start closed. The number next to a group equals the rows in it.
- A headline in plain words ("3 branches: 1 needs you, 1 has unpushed work, 1 is safe to remove").

**Chats on each row**
- A chat is linked by its working folder, its recorded branch, a tool call that created the worktree or branch (`git worktree add`, `git checkout -b`, `git switch -c`, `git branch`, EnterWorktree), or a subagent that did one of these.
- The creator chat is listed first. Chats that only name the branch go under a closed "Mentions only (N)" toggle. Probable links are muted and say why.
- The Created cell shows when and by which chat. Its tooltip is the receipt: UTC and local time, command, tool_use id and transcript line.

**Actions** (one labeled action per row)
- Open chat, Open PR, Ask to finish, Ask to clean up, Copy remove command.
- "Ask <chat> to clean up" copies a plain-text prompt with receipts (branch, worktree path, PR, creation proof from the reflog, commits only on the branch, current state). It asks what each item is for and not to delete anything before confirmation. The Claude Code panel cannot be pre-filled, so you paste it.
- Copy remove command copies `git worktree remove` (and `git branch -d` when merged). Pin, Archive and Mark done are on the row.
- Copy summary: a short markdown summary of everything open.

**Header and filters**
- Filter box, Filters popover (Has open PR, Failing checks, Uncommitted, Unpushed), Sort, Refresh and a "⋯" menu (Summary, Shortcuts, GitHub status, Show done).
- GitHub status shows lookup off, `gh` missing, not signed in, rate limited, failed, or OK with repo count and age.
- `saropaChatExplorer.openWorkDays` (1 to 90, default 14) sets how many days of chats are listed. Open chats are always listed.
- Filter text, state filters and sort are remembered per workspace.
- Keyboard: j / Down and k / Up move rows, Home and End jump, Enter opens the chat, Space or Right expands, Left collapses, `/` focuses the filter, Esc clears or closes, `?` lists shortcuts.

**Safety**
- The extension never changes your repositories. It runs read-only git commands and read-only `gh pr` lookups. Every command it offers is copied for you to read and run yourself. None uses `--force` or `-D`.
- Paths and branch names in copied commands are quoted for your shell. If Windows cannot quote a name safely, no command is offered ("Remove manually").

## Usage and housekeeping commands

| Command | What it does |
|---|---|
| Saropa: Usage Summary | Cost per day (14), week (8), project and model, and your 10 priciest chats. Picking a chat resumes it. |
| Saropa: Show Nearly Full Chats | Filters the panel to chats at 80 percent context or more. |
| Saropa: Archive Empty and Tiny Chats | Archives chats with 0 to 3 messages after a modal count confirmation. Pinned and open chats are skipped. |
| Saropa: Copy Resume Command | Copies `cd <folder> && claude --resume <id>`. |
| Saropa: Export Chat as Markdown | Writes one chat to a `.md` file through a save dialog. |
| Saropa: Find Related Chats | Searches `file:<path>` for the chosen file. |
| Saropa Chat Explorer: Project Status | Opens the Project Status page. |
| Saropa Chat Explorer: Open Results in Editor | Opens all matches in a read-only editor tab. |
| Saropa Chat Explorer: Search Tips, Sort Results, Filter by Status | Same as the title bar icons. |
| Saropa Chat Explorer: Clear Search History | Clears the Up/Down history. |
| Saropa Chat Explorer: Import Archived Chats from the Agent | One-time import of the agent's archive list. |
| Saropa Chat Explorer: Show Diagnostics | Version, index state, agent detection, live session and window counts. |

## Settings

| Setting | Default | Effect |
|---|---|---|
| `saropaChatExplorer.maxResults` | 500 | Most chats listed (50 to 2000). |
| `saropaChatExplorer.contextRingTokens` | 300000 | Token count that fills the context ring (minimum 10000). |
| `saropaChatExplorer.contextWarnings` | true | Notify at 80 and 90 percent context. |
| `saropaChatExplorer.showUsageStatusBar` | true | Status bar item for nearly full chats. |
| `saropaChatExplorer.showFileSessionsStatusBar` | true | Status bar count of chats that touched the active file. |
| `saropaChatExplorer.openWorkDays` | 14 | Days of chats on Project Status (1 to 90). |
| `saropaChatExplorer.lookupPullRequests` | true | Run `gh` for open pull requests and checks. Off: `gh` never starts. |
| `saropaChatExplorer.animateDots` | true | Animate status dots. |

Dot colors are theme colors: `saropaChatExplorer.dotRunning`, `dotWaiting`, `dotUnread`, `dotBackground`, `dotIdle`.

## Keyboard shortcuts (search box)

| Key | Action |
|---|---|
| Alt+C | Toggle Match Case |
| Alt+W | Toggle Match Whole Word |
| Alt+R | Toggle regular expression |
| Alt+O | Toggle Match any order (off while regular expression is on) |
| Up / Down | Previous or next search in history |
| Down (not browsing history) | Move to the first result |
| Enter | Search now |
| Escape | Restore what you typed before browsing history |
| Right / Left Arrow (on a row) | Open or close the "+N more" list |

## How it works

For developers.

- The extension reads Claude Code JSONL transcripts in `~/.claude/projects` and builds a search index in a worker thread ([src/worker.ts](src/worker.ts), [src/build.ts](src/build.ts), [src/search.ts](src/search.ts)). The extension host never blocks on indexing or search.
- Index data is cached on disk, one record file per chat, and refreshed incrementally. Windows share the cache. Folders named `records-v<number>` in the extension's global storage are removed once they are 7 days untouched. Recently read records are kept in memory, up to 64 MB.
- Results stream in while indexing runs. Search scans open and unread chats first, then newest first.
- Live state comes from `~/.claude/sessions` ([src/liveState.ts](src/liveState.ts)). Open-window detection compares each agent process's parent process id with this extension host ([src/windowMarker.ts](src/windowMarker.ts)).
- Git and pull request state goes through a strict read-only allow-list of `git` and `gh` argument shapes ([src/wipExec.ts](src/wipExec.ts), [src/wipPrsArgs.ts](src/wipPrsArgs.ts)). Every shape is listed in [SECURITY.md](SECURITY.md).
- Chats are matched to branches, worktrees and pull requests by one matcher shared by the sidebar card and Project Status ([src/gitMatch.ts](src/gitMatch.ts), [src/workMatch.ts](src/workMatch.ts)).
- Webview UI is plain HTML, CSS and script strings ([src/webview*.ts](src), [src/openWork*.ts](src)). Colors come from CSS classes, since the webview security policy blocks inline styles.

## Development

```
npm install
npm run compile
node scripts/bench.js
npm run package
```

- `npm run compile` builds `src/` into `out/`.
- `node scripts/bench.js` prints build, load and query timings for your machine and chat folder.
- `npm run package` builds a `.vsix`. Its `vscode:prepublish` step runs the checks: `check_manifest.js`, `check_webview.js`, `check_openwork.js`, `check_scan.js`, `check_prs.js`, `check_prs_e2e.js`, `check_guards.js` and `check_dots.js` in `scripts/`.
- No runtime dependencies. Dev dependencies only.
- Press F5 in VS Code to start an Extension Development Host.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch flow and rules, and [PUBLISHING.md](PUBLISHING.md) for releases.

## Privacy

- Reads Claude Code transcripts from `~/.claude/projects` on your machine.
- Reads the agent's live session files in `~/.claude/sessions` (process id, session id and status) to color the dots. It never writes there.
- When you open a section of a chat card (not when you open the card), it runs local read-only commands with no shell, 5 second limit each, in that chat's working folder: `git rev-parse --show-toplevel --git-common-dir --abbrev-ref HEAD` (every section), then `git for-each-ref --format=<fields> refs/heads/<branch>` (Git), `git status --porcelain=v1 --branch -z` (Uncommitted files), `git rev-list --max-count=20 --format=<fields> @{u}..HEAD` (Unpushed commits) or `git worktree list --porcelain -z` and `git for-each-ref --format=<fields> refs/heads` (Worktrees). It never runs fetch, pull, checkout, reset, clean, stash, commit, push or anything that writes. Git is told not to take optional locks and never to prompt.
- While `saropaChatExplorer.lookupPullRequests` is on (the default), it runs `gh pr list --state open --limit 100 --json number,title,headRefName,isDraft,reviewDecision,url,headRefOid,isCrossRepository,headRepositoryOwner` once per repository, plus `git remote get-url origin` when the list holds a fork pull request, and `gh pr view <number> --json statusCheckRollup,headRefOid` for Project Status rows. No shell, 8 second limit, answers cached 5 minutes (2 for checks). `gh auth status` is cached 60 seconds. `gh` contacts GitHub with your own existing sign-in. The extension adds no network code of its own. Clicking a pull request opens the address `gh` returned (https only) in your browser. Turn the setting off and `gh` is never started.
- Runs `ps -A -o pid=,ppid=` (no shell, 3 second limit, once per 30 second poll) to read parent process ids for the open window marker. The output is parsed in memory and not stored.
- Reads which chats are open as tabs from VS Code's workspace storage (`state.vscdb`) with the local `sqlite3` tool, read-only, on a temporary copy that is deleted afterwards. Only session ids are kept.
- Import Archived Chats works the same way and runs only when you press Import.
- Writes a search cache to the extension's global storage folder. Message text is stored there, up to 20,000 characters per message (8,000 for subagents). The last `cwd` of each chat, file paths, the first 300 characters of each command, and the worktrees and branches each chat created are stored too. Tool results are skipped.
- Pins, tags, archived chats, unread marks, history and options are saved by VS Code in its own storage.
- The source contains no network, HTTP or telemetry calls of its own. The only programs it starts are `ps`, `sqlite3`, `git` and `gh`.
- Resuming a chat hands the session id to the agent extension through a VS Code command, or a VS Code link if the command fails.
- Errors go to the "Saropa Chat Explorer" output channel.

## FAQ

**How do I search my Claude Code chat history in VS Code?**
Open the Saropa Chat Explorer icon in the activity bar and type a word or phrase. Results list every matching chat.

**How do I resume an old Claude Code session?**
Click a result or press Enter on it. The session opens in the agent panel. This needs the agent extension. To resume in a terminal, use Copy resume command.

**Can I search subagent conversations?**
Yes. Keep the Subs checkbox on. Subagent matches count toward the parent chat. When the newest match is a subagent's, the row shows a purple pill with its agent type.

**How do I find which chat edited a file?**
Right-click the file and choose "Saropa: Find Related Chats", or search `edited:<file name>`.

**How do I find the chat that made a commit or opened a pull request?**
Search `sha:<prefix>` or `pr:<number>`. In a chat card, click a commit id in Unpushed commits.

**How do I find which chat created a branch or worktree?**
Open Project Status. The creator chat is listed first on each row. Or search `branch:<name>`.

**How do I know when a chat is about to hit its context limit?**
Watch the context ring and pill, or leave `saropaChatExplorer.contextWarnings` on. Copy hand-over note carries the state to a new chat.

**Does it send my chats anywhere?**
No. The extension has no network code. The only outside contact is the optional `gh` pull request lookup, which uses your own sign-in. Turn it off with `saropaChatExplorer.lookupPullRequests`.

**Does it change my repositories?**
No. It runs read-only git commands. Commands it offers are copied, never run.

**Does it work with multiple VS Code windows?**
Yes. Windows share one cache with one file per chat.

**Why does the first start take longer?**
The first start builds the index of all your chats. Later starts read the cache. A new version may rebuild it once.

**Where does it store its cache?**
In the extension's global storage folder, in folders named `records-v<number>`.

**Does it work on Windows?**
Yes. The open window marker is not available there, and copied commands use PowerShell quoting.

## Requirements

- VS Code 1.90.0 or newer.
- The agent extension, to resume chats.
- `git`, for the Git section of a chat card and Project Status. Optional `gh` (signed in), for pull requests and checks.
- Optional `sqlite3` on your PATH, for Import Archived Chats and tab detection.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Security: see [SECURITY.md](SECURITY.md). Release notes: [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).

---

Built by [Saropa](https://saropa.com). Questions? Ideas? [Open an issue](https://github.com/saropa/claude-chat-explorer/issues). Contact: dev@saropa.com.

Part of the Saropa Suite. See [ABOUT_SAROPA.md](ABOUT_SAROPA.md).

[GitHub](https://github.com/saropa/claude-chat-explorer) | [Issues](https://github.com/saropa/claude-chat-explorer/issues) | [Saropa](https://saropa.com)
