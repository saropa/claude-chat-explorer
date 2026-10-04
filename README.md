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
| Full-text search | Searches every chat under your Claude projects folder, one panel in the activity bar. |
| Exact phrase by default | The whole query is one exact phrase. "my family" must appear together in one message. |
| Match options | Match any order (Alt+O), Match Case (Alt+C), Whole Word (Alt+W), regular expression (Alt+R). |
| Quoted phrases | With Match any order on, `"quoted phrases"` stay exact. |
| Last N messages | `last:<n>` or the Messages dropdown searches only the final N messages of each chat. |
| When filter | Any time, last 1, 2, 4 or 8 hours, or today. |
| Sort | Score, time (grouped by day), title, length or cost. Pinned chats list first. |
| Status filter | Include or exclude Normal, Active, Empty, Tiny, Huge, Abandoned and Pinned chats. |
| Subagent search | The Subagents checkbox is on by default. Matches nest under the parent chat with a Subagent pill. |
| Ranking | Title matches rank first. Recent matches score higher. |
| Instant results | A background index keeps results fast. Results show while indexing is still running. |
| Search history | Up and Down in the search box step through earlier searches with their toggles. |
| Expand in place | The chevron shows every matching message in the row, with stats, files and commands. |
| Highlights | Snippets start just before the first match, so the match is always visible. |
| Pin and tag | Star a chat to pin it. Add tags in the expanded row and click a tag to filter. |
| Search tokens | `file:`, `edited:`, `cmd:`, `tag:`, `sha:`, `pr:` and `branch:`. See Search syntax. |
| Git section | The expanded row lists the chat's PRs and commits. Click one to search for it. |
| Git Activity tree | A second activity-bar icon lists repositories, PRs, branches and commits. Click to resume. |
| Cost info | Dollars, lines added and removed, and models used, such as `$1.23 · +120/-30 lines · opus, sonnet`. |
| Status dot and pill | A dot shows recent activity. A pill shows Active, Huge, Empty, Tiny or Abandoned. |
| Day groups | Time-sorted results are grouped by day. |
| Related chats | The expanded row lists other chats that touched the same files. |
| Export | Copy or save one line per matching line, with or without context. |
| Chats that touched this file | Commands, Explorer and editor menus, a status bar count, and a copyable hand-over note. |
| Responsive layout | The panel fits any width, from a narrow sidebar to a wide editor tab. |

## Install

Command line:

```
code --install-extension claude-chat-search-0.8.1.vsix
```

Extensions panel:

1. Open the Extensions view.
2. Open the `...` menu and choose "Install from VSIX...".
3. Pick the `.vsix` file.

## Quick start

1. Click the Saropa Chat Search icon in the activity bar.
2. Wait for the first index to finish. Search works on what is indexed so far.
3. Type a word or phrase. Results appear after you stop typing. Enter searches at once.
4. Narrow the results with When, Sort, Messages and the toggles.
5. Click a result to resume that session, or click its chevron to read the matching messages.

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
| `sha:<prefix>` | `sha:a1b2c3d` | Chats with a commit (4 to 40 hex characters). |
| `pr:<number>` | `pr:#123` | Chats that mention that PR. |
| `branch:<text>` | `branch:main` | Chats with a matching branch name. |

- Tokens combine with plain words and with each other.
- Tokens ignore case. A search needs at least 2 characters.
- Quote values that contain spaces.

## Keyboard shortcuts

These work with the cursor in the search box.

| Key | Action |
|---|---|
| Alt+C | Toggle Match Case |
| Alt+W | Toggle Match Whole Word |
| Alt+R | Toggle regular expression |
| Alt+O | Toggle Match any order |
| Up / Down | Previous or next search in history |
| Down (no history step left) | Move to the first result |
| Enter | Search now |
| Escape | Restore what you typed before browsing history |

## Privacy

- Reads chat files from `~/.claude/projects` on your machine.
- Writes a search cache to the extension's global storage folder in VS Code. Message text is stored there in record files, up to 20,000 characters per message (8,000 for subagents). Tool results are skipped.
- Pins, tags, history and options are saved by VS Code in its own storage.
- The source contains no network, HTTP or telemetry calls. Nothing leaves your machine.
- Resuming a chat hands the session id to the Claude Code extension through a VS Code link. Export writes only where you choose.
- Errors go to the "Saropa Chat Search" output channel.

## Performance

- Indexing and search run in a worker thread, so the editor does not freeze.
- Index data is cached on disk and refreshed incrementally, so later starts are faster than the first.
- Chat files are kept in memory up to 64 MB. Results are capped at 500 rows. Export is capped at 50,000 lines or 20 MB.
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
In the extension's global storage folder in VS Code, in folders named `records-v<number>`. Old folders are cleaned up automatically.

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
