# Saropa Chat Search

Activity-bar panel that searches the full text of Claude Code chats.

- Install: `code --install-extension claude-chat-search-0.2.2.vsix`
- Reads `~/.claude/projects/*/*.jsonl` into an in-memory index built in the background; the status bar and a panel banner show progress, and search covers what is indexed so far.
- The index is cached in the extension's global storage and refreshed incrementally (file watcher plus a stat before each search). Each message is indexed up to 20,000 characters. Above a 200 MB cache, only the last 90 days of message text are kept.
- Scope: current workspace folders, or all projects (checkbox). When: any time, last 1/2/4/8 hours, or today.
- Filters like the built-in Search: Match Case (Alt+C), Match Whole Word (Alt+W), Use Regular Expression (Alt+R).
- Tokens: `file:<text>`, `edited:<text>`, `cmd:<text>`, `tag:<name>`; quote values with spaces (`cmd:"regen l10n"`). Tokens AND with plain words and match case-insensitively.
- Sort by score, time (grouped by day), title or length. Up to 500 results; pinned chats always list first.
- Score: 1,000 per title match plus 5,000 when every word is in the title, weighted by last-active time; body hits add up to 900, newer messages weigh more.
- Chevron on a row expands matching messages in place, with stats, matched files and commands, and related chats that touched the same files. Star pins a chat; tags are added in the expanded view and clicked to filter.
- With an empty query the panel shows pinned chats and recent searches.
- Titles follow Claude Code: custom title, then AI title, then last prompt, then summary, then first message.
- Click a result (or press Enter on it) to resume it in the Claude Code chat panel. Requires the Claude Code extension.
- Errors are logged to the "Saropa Chat Search" output channel.
