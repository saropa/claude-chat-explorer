# Saropa Chat Explorer: Search and Resume Claude Code Chat History in VS Code

Saropa Chat Explorer lets you search your Claude Code chat history from the VS Code sidebar and resume the session you find.

## What it does

- Full-text search of Claude Code sessions: find an old Claude Code chat by any word or phrase in it.
- Searches subagent transcripts too. A chat's row shows its newest match, even when a subagent wrote it.
- Click a result to resume that Claude Code session. Resuming needs the Claude Code extension.
- Shows which Claude session edited this file, from the Explorer, editor or tab menu.
- Shows the work in progress of your recent chats: files not checked in, unpushed commits, worktrees and open pull requests, grouped by chat.
- Runs in the background and reads local files. The extension itself makes no network requests. The optional pull request lookup runs the local `gh` command, which contacts GitHub with your own sign-in (setting `saropaChatExplorer.lookupPullRequests`, on by default).

## Features

| Feature | What you get |
|---|---|
| Full-text search | Searches the Claude Code chats of the open workspace from one activity-bar panel. Tick All projects to search every project. |
| Exact phrase by default | The whole query is one exact phrase. "my family" must appear together in one message. |
| Match options | Match any order (Alt+O), Match Case (Alt+C), Whole Word (Alt+W), regular expression (Alt+R). |
| Quoted phrases | With Match any order on, `"quoted phrases"` stay exact. |
| Last N messages | `last:<n>` or the "messages to search" dropdown (last 10, 25, 50, 100) searches only the final N messages of each chat. |
| When filter | "chats active during": any time, last hour, 2, 4 or 8 hours, today, this week or this month. Local time: today starts at midnight, this week at 00:00 on Monday, this month at 00:00 on the 1st. |
| Search details | The `...` button under the search box (tooltip "Toggle search details") shows or hides the details: chats active during, messages to search, sort results by, and search scope (the All projects and Subagents checkboxes). They start hidden, the choice is remembered per workspace, and a count on the button shows how many of them differ from the defaults; its tooltip lists them. |
| Result limit | Like VS Code Search, the panel lists at most 500 chats (setting `saropaChatExplorer.maxResults`, 50 to 2000) and says so: "Showing the top 500 of 1,284 chats (21,904 matches)" with a warning to narrow the search. Every match is still counted. A chat shows "9,999+" above 9,999 hits, and totals stop at "1,000,000+". All sessions and Archived show the same notice. |
| Sort | Set under "sort results by" in the search details. Score, time (grouped by day), title, length, cost or context (fullest first; chats with no usage data last). Pinned chats list first. |
| Status filter | The Status button next to Export. Include or exclude Normal, Active, Empty, Tiny, Huge, Nearly full (context 80 percent or more), Abandoned and Pinned chats. Active means running, waiting for you or unread, as Claude Code defines it. |
| Subagent search | The Subagents checkbox (under "search scope") is on by default. Subagent matches count toward the chat. When the newest match is a subagent's, the row shows a purple pill with its agent type. |
| Ranking | Title matches rank first. Recent matches score higher. |
| Instant results | A background index keeps results fast. Results show while indexing is still running. |
| Search history | Up and Down in the search box step through your last 20 searches with their toggles. |
| Expand in place | The chevron opens the row as a card that shows the whole title wrapped, with an action bar (Resume, Pin, Archive, Mark read, Copy ID), matched files and commands, labeled stats, tags, Git and related chats. |
| Result rows | One row per chat. It shows only the newest match (across the chat and its subagents) as a snippet of at most two lines. With a search, the time pill, the day groups and the Time sort use the time of that match; the chat's last active time moves to the pill tooltip and a Last active stat in the card. |
| More matches | A quiet +N more under the snippet opens the other matches in place, newest first, 20 at a time with Show more. They load only when you open the list. Identical texts collapse into one item with a count such as x3. Click an item to resume the chat. Right Arrow opens the list, Left Arrow or Escape closes it. |
| Tooltips | One themed tooltip replaces the browser tooltips in the results and the card. It wraps, stays inside the panel, shows the full chat title as its bold first line and label/value rows, and caps text at 600 characters. It opens after a short hover or on keyboard focus, and Escape, scrolling or moving away closes it. |
| Row pills | Each row shows two small pills under its title: the message count and the time since it was last active (now, 3 mins, 6 hrs, 2 days, 3 wks, 4 mos, 2 yrs). A search adds a hits pill, which counts occurrences, and the time pill then shows the newest match. Hover a pill for the full wording. A Huge, Empty, Tiny or Abandoned chip sits after the pills, and a pinned chat shows a small star before them. |
| Highlights | Snippets start just before the first match, so the match is always visible. |
| Pin and tag | Star a chat to pin it. The pin, archive and tag icons appear over the end of the title when you hover the row or tab into it, so they take no room at rest. Click the tag icon on a row (it also shows when the card is open), type a name and press Enter. Escape cancels. A chat with no tags shows no tag row. Click a tag to filter. |
| Search tokens | `file:`, `edited:`, `cmd:`, `tag:`, `sha:`, `pr:` and `branch:`. See Search syntax. |
| Git section | The expanded row lists the chat's PRs and commits as pills. Click one to search for it. |
| Work in Progress view | A second view in the Git activity-bar container lists what is pending, grouped by chat. A chat row shows its title, the branch and its state (running, waiting, unread or time since last active), with a state-colored icon. Its children show the folder (worktree, main checkout or folder missing), the files not checked in (with the first 20 files and status letters), the commits not pushed or behind, the open or linked PR, and an Open chat action. Only chats with something pending are listed: files not checked in, commits not pushed, an open or linked PR or a running session. The view badge counts them. |
| Work in Progress menu | The view title has Refresh, Copy Summary (plain text, one line per chat or worktree), Group by Chat, Group by Worktree and Show Clean Chats (lists every chat in scope; off by default). Group by Worktree lists worktrees with their files, commits, PR and chats, plus a "Branches without a worktree" group for branches ahead of their upstream or whose upstream is gone. The grouping is remembered. |
| Work in Progress refresh | Scans when the view first shows, on Refresh, when the view shows again after more than 60 seconds, and 10 seconds after a running chat finishes. It never scans on a timer while hidden. At most 60 folders per scan (most recently active first); the view says how many were not scanned. A folder that is missing or not a git folder says so. |
| Git Activity tree | A second activity-bar icon lists repositories, PRs, branches and commits for the same scope. Click to resume. |
| Cost info | Dollars, lines added and removed, and models used, such as `$1.23 · +120/-30 lines · opus, sonnet`. |
| Status dot and pill | A dot shows Claude Code's own chat state (see Status dot). A chip on the pill line shows Huge, Empty, Tiny or Abandoned. The dot already says Active, so there is no Active chip. |
| Context pill | A pill on the pill line shows how full a chat's context window is, only from 60 percent: amber at 60 to 79, orange at 80 to 89, red at 90 and above ("82% full"). Hover it for tokens used of the window, the model, the compaction count and notes. The open card always shows a Context stat, such as "82% (164k of 200k, opus-4-6)". Chats with no usage data show nothing. The figure approximates Claude Code's own and lags one turn: it comes from the last reply, so a reply still being written is not counted. |
| Context warnings | A live chat (running, waiting or idle with a live Claude process) that reaches 80 or 90 percent gets one notification with Open chat and Dismiss buttons. Each chat warns once per level, again after a compaction or after the chat falls 10 points below the level. At most one notification per 30 second check and 3 in 10 minutes. Old idle chats never warn, and an approximate figure (window size inferred from an unknown model) warns only from 90 percent. Turn it off with the setting `saropaChatExplorer.contextWarnings`. Show Diagnostics lists how many live chats are at 80 percent or more. |
| Open window marker | The dot's ring shows whether a live chat is open in this VS Code window (solid ring) or in another window (dashed ring). See Status dot. |
| Archive | Archive chats to move them into a collapsed Archived section. Import Claude Code's archived list once. See Archived chats. |
| Copy ID | The Copy ID button in the expanded row copies the chat's session id. |
| Day groups | Time-sorted results are grouped by day. |
| Related chats | The expanded row lists up to 5 other chats that touched the same files, each with its shared file count and last active time. |
| Export | The Export button copies or saves one line per matching line, with or without context. It is disabled until a search has results; clicking it then says to run a search first. |
| Chats that touched this file | The Explorer, editor and tab menus and the status bar count open the panel and search `file:<path>`. Each row shows an edited or read pill. |
| Copy hand-over note | The expanded row's Copy hand-over note button copies the chat title, session id, folder, branch, last active time, context percent and, for file searches, the file and whether it was edited or read. |
| Responsive layout | The panel fits any width, from a narrow sidebar to a wide editor tab. |

## Install

Command line:

```
code --install-extension claude-chat-explorer-0.14.3.vsix
```

Extensions panel:

1. Open the Extensions view.
2. Open the `...` menu and choose "Install from VSIX...".
3. Pick the `.vsix` file.

## Quick start

1. Click the Saropa Chat Explorer icon in the activity bar.
2. Wait for the first index to finish. Search works on what is indexed so far.
3. Type a word or phrase. Results appear after you stop typing. Enter searches at once.
4. Narrow the results with the toggles and the search details (`...`) button (sort, scope, time and message limits).
5. Click a result to resume that session, or click its chevron to read the matching messages.
6. Tick All projects (in the search details) to search chats from every project, not only this workspace.

## Search syntax

| Token | Example | Finds |
|---|---|---|
| plain text | `my family` | The exact phrase in one message. |
| `"..."` | `"regen l10n"` | An exact phrase (with Match any order on). |
| `last:<n>` | `deploy last:20` | Matches in the final 20 messages. |
| `file:<text>` | `file:search.ts` | Chats that touched a file path. |
| `edited:<text>` | `edited:search.ts` | Chats that edited a file path. |
| `cmd:<text>` | `cmd:"npm run"` | Chats where Claude ran a matching command. |
| `tag:<name>` | `tag:billing` | Chats you tagged. |
| `sha:<prefix>` | `sha:a1b2c3d` | Chats with a commit that starts with it (4 to 40 hex characters). |
| `pr:<number>` | `pr:#123` | Chats linked to that PR. `pr:123` works too. |
| `branch:<text>` | `branch:main` | Chats with a branch name containing the text. |

- Tokens combine with plain words and with each other.
- Tokens ignore case. A search needs at least 2 characters.
- Quote values that contain spaces.

## Status dot

An 8 px dot sits left of each chat title. It uses the same states and colors as Claude Code.

| Dot | Meaning |
|---|---|
| Green | Running: Claude is working in that chat. |
| Blue | Waiting for you: Claude needs a permission or an answer. |
| Orange | Unread: the chat finished while you were away. This is approximate. |
| Grey, faded | Idle. |
| Hollow ring | The chat has a live Claude Code process (a terminal, tab or window) but is not running or waiting. The ring takes the color of its state. |

- Running and waiting chats keep a solid dot.
- Open window marker: a live chat open in this window has a solid ring; one open in another window has a dashed ring. Running and waiting chats keep their solid dot and get the ring as a thin outer ring. The tooltip says "Open in this window" or "Open in another window".
- The marker compares each live Claude process's parent process id with this window's extension host. One `ps` call per poll reads the parent ids. On Windows, or if `ps` fails, no marker shows and the ring stays as before. A chat started in a terminal counts as another window.
- Show Diagnostics lists this extension host's process id, the live session count, how many are in this window and in other windows, and the parent ids found.
- Live state comes from Claude Code's session files, checked every 30 seconds and when the panel becomes visible. Without those files every chat shows idle.
- Unread is our guess: a chat you saw running or waiting that then went idle or closed. Resuming the chat from the panel or the Git Activity tree clears it. So does "Mark as Read" in the row's right-click menu.
- Hover a dot for its name. The Git Activity tree uses the same dots (with the window text in its tooltip).
- The Active status (the filter; the dot shows it on the row) means running, waiting for you or unread.

## Archived chats

- The archive icon on a row (or "Archive Chat" in its right-click menu) moves the chat out of results, All sessions, Pinned and the Git Activity tree. A pinned chat stays pinned.
- The Archived section sits at the bottom of the results. It starts collapsed with a count. Its rows are built only when you expand it. With a query, the count is the number of archived matches.
- The archive icon on an archived row (or "Unarchive Chat") moves it back.
- The archive list is shared by all your workspaces. The expanded state is remembered per workspace.
- Export leaves out archived chats.
- To bring in the chats you archived in Claude Code, run "Saropa Chat Explorer: Import Archived Chats from Claude Code" from the Command Palette, or press Import in the Archived header. It runs only when you ask, reads the list once and shows how many chats it added.
- Import needs the `sqlite3` command-line tool on your PATH. If it is missing, or Claude Code has stored no list, you get a message and nothing changes.

## Keyboard shortcuts

These work with the cursor in the search box.

| Key | Action |
|---|---|
| Alt+C | Toggle Match Case |
| Alt+W | Toggle Match Whole Word |
| Alt+R | Toggle regular expression |
| Alt+O | Toggle Match any order (off while regular expression is on) |
| Up / Down | Previous or next search in history |
| Down (when not browsing history) | Move to the first result |
| Enter | Search now |
| Escape | Restore what you typed before browsing history |

## Privacy

- Reads chat files from `~/.claude/projects` on your machine.
- Reads Claude Code's live session files in `~/.claude/sessions` (process id, session id and status) to color the dots. It never writes there.
- The Work in Progress view runs these local read-only commands with no shell, 4 at a time, 5 second limit each, in the working folder of chats active in the last `saropaChatExplorer.workInProgressDays` days (default 7, 1 to 60) or running now: `git rev-parse --show-toplevel --git-common-dir --abbrev-ref HEAD`, `git status --porcelain=v1 --branch -z`, `git worktree list --porcelain` and `git for-each-ref --format=<fields> refs/heads`. It never runs fetch, pull, checkout, reset, clean, stash, commit, push or anything that writes. Git is told not to take optional locks and never to prompt.
- While `saropaChatExplorer.lookupPullRequests` is on (the default), the view runs `gh pr list --state open --limit 100 --json number,title,headRefName,isDraft,reviewDecision` once per repository (no shell, 15 second limit, answers kept 5 minutes; Refresh skips the kept answer). The `gh` command contacts GitHub using your own existing `gh` sign-in. The extension adds no network code of its own and shows no links. Turn the setting off and `gh` is never started. If `gh` is missing, signed out or offline, the view shows one muted line "Open PRs unavailable".
- The search cache now also stores each chat's working folder path (the last `cwd` recorded in the chat file).
- Runs the local `ps -A -o pid=,ppid=` command (no shell, 3 second limit, once per 30 second poll) to read each Claude process's parent process id for the open window marker. The output is parsed in memory and not stored. No network is used.
- Import Archived Chats reads Claude Code's archived-chat list from its VS Code storage, only when you press Import. It works read-only on a temporary copy, using the local `sqlite3` tool, and deletes the copy afterwards.
- Writes a search cache to the extension's global storage folder in VS Code. Message text is stored there in record files, up to 20,000 characters per message (8,000 for subagents). File paths and the first 300 characters of each command are stored too. Tool results are skipped.
- Pins, tags, archived chats, unread marks, history and options are saved by VS Code in its own storage.
- The source contains no network, HTTP or telemetry calls of its own. The only programs it starts are `ps` (the open window marker), `sqlite3` (during Import), `git` (Work in Progress, read-only) and `gh` (open PR lookup, on by default; contacts GitHub through your own `gh` sign-in).
- Resuming a chat hands the session id to the Claude Code extension through a VS Code command, or a VS Code link if the command fails. Export writes only where you choose.
- Errors go to the "Saropa Chat Explorer" output channel.

## Performance

- Indexing and search run in a worker thread, so the editor does not freeze.
- Index data is cached on disk and refreshed incrementally, so later starts are faster than the first.
- Recently read chat records are cached in memory, up to 64 MB. Results are capped at 500 rows by default (see Result limit). Export is capped at 50,000 lines or 20 MB.
- A pattern that stalls for 3 seconds is stopped with "Search timed out: simplify the pattern".
- `node scripts/bench.js` (after `npm run compile`) prints build, load and query timings for your machine. Timings depend on your machine and the size of your chat folder.

## FAQ

**How do I search my Claude Code chat history in VS Code?**
Open the Saropa Chat Explorer icon in the activity bar and type a word or phrase. Results list every matching chat.

**How do I resume an old Claude Code session?**
Click a result or press Enter on it. The session opens in the Claude Code panel. This needs the Claude Code extension.

**Can I search subagent conversations?**
Yes. Keep the Subagents checkbox on. Subagent matches nest under their parent chat with a Subagent pill.

**How do I find which Claude session edited a file?**
Right-click the file in the Explorer, the editor or its tab and choose "Saropa: Related Chats". The panel opens and searches `file:<path>`. Each chat has an edited or read pill, and with Score sort edited chats come first. Open a chat's details and press Copy hand-over note to pass a bug to it. Or search `edited:<file name>`.

**Where does it store its cache?**
In the extension's global storage folder in VS Code, in folders named `records-v<number>`. Old folders are removed automatically once they are 7 days untouched.

**Does it work with multiple VS Code windows?**
Yes. Windows share one cache with one file per chat, so they do not overwrite each other.

**Why does the first start take longer?**
The first start builds the index of all your chats. Later starts read the cache. A new version may rebuild it once.

**Can I turn off the status bar count?**
Yes. Set `saropaChatExplorer.showFileSessionsStatusBar` to false.

## Requirements

- VS Code 1.90.0 or newer.
- The Claude Code extension, to resume chats.
- `git`, for the Work in Progress view. Optional `gh` (signed in), for open pull requests.

## Contributing

Issues and pull requests are welcome on the GitHub repository.

## License

MIT.

## Publishing

Step by step, including how to create the access tokens: see PUBLISHING.md.

- Needs accounts on the VS Code Marketplace (publisher `saropa`) and Open VSX, plus the `gh` CLI logged in.
- Tokens are read from the environment, never printed: `VSCE_PAT` (Marketplace) and `OVSX_PAT` (Open VSX).
- Dry run (default; builds and packages, publishes nothing): `python3 scripts/publish.py`
- Publish, tag and release: `python3 scripts/publish.py --publish` (skip with `--skip-marketplace`, `--skip-openvsx`, `--skip-tag`, `--skip-release`).
- Checks: clean tree on main in sync with origin, package.json version equals the top CHANGELOG heading, tag not taken, manifest check, compile, store metadata, and the .vsix contents (no plans, scripts or src).

Security: see SECURITY.md.
