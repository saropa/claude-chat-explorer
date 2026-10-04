# Saropa Chat Search: Search and Resume Claude Code Chat History in VS Code

Saropa Chat Search lets you search your Claude Code chat history from the VS Code sidebar and resume the session you find.

## What it does

- Full-text search of Claude Code sessions: find an old Claude Code chat by any word or phrase in it.
- Searches subagent transcripts too, nested under the chat that started them.
- Click a result to resume that Claude Code session. Resuming needs the Claude Code extension.
- Shows which Claude session edited this file, from the Explorer, editor or tab menu.
- Runs in the background and reads only local files. Nothing is sent over the network.

## Features

| Feature | What you get |
|---|---|
| Full-text search | Searches the Claude Code chats of the open workspace from one activity-bar panel. Tick All projects to search every project. |
| Exact phrase by default | The whole query is one exact phrase. "my family" must appear together in one message. |
| Match options | Match any order (Alt+O), Match Case (Alt+C), Whole Word (Alt+W), regular expression (Alt+R). |
| Quoted phrases | With Match any order on, `"quoted phrases"` stay exact. |
| Last N messages | `last:<n>` or the "messages to search" dropdown (last 10, 25, 50, 100) searches only the final N messages of each chat. |
| When filter | "chats active during": any time, last hour, 2, 4 or 8 hours, today, this week or this month. Local time: today starts at midnight, this week at 00:00 on Monday, this month at 00:00 on the 1st. |
| Search details | The `...` button under the search box (tooltip "Toggle search details") shows or hides the When and Messages rows. They start hidden, the choice is remembered per workspace, and a count on the button shows how many of them are set. |
| Result limit | Like VS Code Search, the panel lists at most 500 chats (setting `saropaChatSearch.maxResults`, 50 to 2000) and says so: "Showing the top 500 of 1,284 chats (21,904 matches)" with a warning to narrow the search. Every match is still counted. A chat shows "9,999+" above 9,999 hits, and totals stop at "1,000,000+". All sessions and Archived show the same notice. |
| Sort | Score, time (grouped by day), title, length or cost. Pinned chats list first. |
| Status filter | Include or exclude Normal, Active, Empty, Tiny, Huge, Abandoned and Pinned chats. Active means running, waiting for you or unread, as Claude Code defines it. |
| Subagent search | The Subagents checkbox is on by default. Matches nest under the parent chat with a Subagent pill. |
| Ranking | Title matches rank first. Recent matches score higher. |
| Instant results | A background index keeps results fast. Results show while indexing is still running. |
| Search history | Up and Down in the search box step through your last 20 searches with their toggles. |
| Expand in place | The chevron shows the matching messages in the row, 20 at a time, with stats, files and commands. |
| Highlights | Snippets start just before the first match, so the match is always visible. |
| Pin and tag | Star a chat to pin it. Add tags in the expanded row and click a tag to filter. |
| Search tokens | `file:`, `edited:`, `cmd:`, `tag:`, `sha:`, `pr:` and `branch:`. See Search syntax. |
| Git section | The expanded row lists the chat's PRs and commits. Click one to search for it. |
| Git Activity tree | A second activity-bar icon lists repositories, PRs, branches and commits for the same scope. Click to resume. |
| Cost info | Dollars, lines added and removed, and models used, such as `$1.23 · +120/-30 lines · opus, sonnet`. |
| Status dot and pill | A dot shows Claude Code's own chat state (see Status dot). A pill shows Active, Huge, Empty, Tiny or Abandoned. |
| Archive | Archive chats to move them into a collapsed Archived section. Import Claude Code's archived list once. See Archived chats. |
| Day groups | Time-sorted results are grouped by day. |
| Related chats | The expanded row lists up to 5 other chats that touched the same files. |
| Export | Copy or save one line per matching line, with or without context. |
| Chats that touched this file | Commands, Explorer and editor menus, a status bar count, and a copyable hand-over note. |
| Responsive layout | The panel fits any width, from a narrow sidebar to a wide editor tab. |

## Install

Command line:

```
code --install-extension claude-chat-search-0.9.0.vsix
```

Extensions panel:

1. Open the Extensions view.
2. Open the `...` menu and choose "Install from VSIX...".
3. Pick the `.vsix` file.

## Quick start

1. Click the Saropa Chat Search icon in the activity bar.
2. Wait for the first index to finish. Search works on what is indexed so far.
3. Type a word or phrase. Results appear after you stop typing. Enter searches at once.
4. Narrow the results with Sort, the toggles and the search details (`...`) button.
5. Click a result to resume that session, or click its chevron to read the matching messages.
6. Tick All projects to search chats from every project, not only this workspace.

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
- Live state comes from Claude Code's session files, checked every 30 seconds and when the panel becomes visible. Without those files every chat shows idle.
- Unread is our guess: a chat you saw running or waiting that then went idle or closed. Resuming the chat from the panel or the Git Activity tree clears it. So does "Mark as Read" in the row's right-click menu.
- Hover a dot for its name. The Git Activity tree uses the same dots.
- The Active status (pill and filter) means running, waiting for you or unread.

## Archived chats

- The archive icon on a row (or "Archive Chat" in its right-click menu) moves the chat out of results, All sessions, Pinned and the Git Activity tree. A pinned chat stays pinned.
- The Archived section sits at the bottom of the results. It starts collapsed with a count. Its rows are built only when you expand it. With a query, the count is the number of archived matches.
- The archive icon on an archived row (or "Unarchive Chat") moves it back.
- The archive list is shared by all your workspaces. The expanded state is remembered per workspace.
- Export leaves out archived chats.
- To bring in the chats you archived in Claude Code, run "Saropa Chat Search: Import Archived Chats from Claude Code" from the Command Palette, or press Import in the Archived header. It runs only when you ask, reads the list once and shows how many chats it added.
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
- Import Archived Chats reads Claude Code's archived-chat list from its VS Code storage, only when you press Import. It works read-only on a temporary copy, using the local `sqlite3` tool, and deletes the copy afterwards.
- Writes a search cache to the extension's global storage folder in VS Code. Message text is stored there in record files, up to 20,000 characters per message (8,000 for subagents). File paths and the first 300 characters of each command are stored too. Tool results are skipped.
- Pins, tags, archived chats, unread marks, history and options are saved by VS Code in its own storage.
- The source contains no network, HTTP or telemetry calls. Nothing leaves your machine. The only program it starts is `sqlite3`, during Import.
- Resuming a chat hands the session id to the Claude Code extension through a VS Code command, or a VS Code link if the command fails. Export writes only where you choose.
- Errors go to the "Saropa Chat Search" output channel.

## Performance

- Indexing and search run in a worker thread, so the editor does not freeze.
- Index data is cached on disk and refreshed incrementally, so later starts are faster than the first.
- Recently read chat records are cached in memory, up to 64 MB. Results are capped at 500 rows by default (see Result limit). Export is capped at 50,000 lines or 20 MB.
- A pattern that stalls for 3 seconds is stopped with "Search timed out: simplify the pattern".
- `node scripts/bench.js` (after `npm run compile`) prints build, load and query timings for your machine. Timings depend on your machine and the size of your chat folder.

## FAQ

**How do I search my Claude Code chat history in VS Code?**
Open the Saropa Chat Search icon in the activity bar and type a word or phrase. Results list every matching chat.

**How do I resume an old Claude Code session?**
Click a result or press Enter on it. The session opens in the Claude Code panel. This needs the Claude Code extension.

**Can I search subagent conversations?**
Yes. Keep the Subagents checkbox on. Subagent matches nest under their parent chat with a Subagent pill.

**How do I find which Claude session edited a file?**
Right-click the file in the Explorer, the editor or its tab and choose "Show Chats That Touched This File". Or search `edited:<file name>`.

**Where does it store its cache?**
In the extension's global storage folder in VS Code, in folders named `records-v<number>`. Old folders are removed automatically once they are 7 days untouched.

**Does it work with multiple VS Code windows?**
Yes. Windows share one cache with one file per chat, so they do not overwrite each other.

**Why does the first start take longer?**
The first start builds the index of all your chats. Later starts read the cache. A new version may rebuild it once.

**Can I turn off the status bar count?**
Yes. Set `saropaChatSearch.showFileSessionsStatusBar` to false.

## Requirements

- VS Code 1.90.0 or newer.
- The Claude Code extension, to resume chats.

## Contributing

Issues and pull requests are welcome on the GitHub repository.

## License

MIT.

## Publishing

- Needs accounts on the VS Code Marketplace (publisher `saropa`) and Open VSX, plus the `gh` CLI logged in.
- Tokens are read from the environment, never printed: `VSCE_PAT` (Marketplace) and `OVSX_PAT` (Open VSX).
- Dry run (default; builds and packages, publishes nothing): `python3 scripts/publish.py`
- Publish, tag and release: `python3 scripts/publish.py --publish` (skip with `--skip-marketplace`, `--skip-openvsx`, `--skip-tag`, `--skip-release`).
- Checks: clean tree on main in sync with origin, package.json version equals the top CHANGELOG heading, tag not taken, manifest check, compile, store metadata, and the .vsix contents (no plans, scripts or src).
