# Saropa Chat Search

Activity-bar panel that searches the full text of Claude Code chats.

- Install: `code --install-extension claude-chat-search-0.1.0.vsix`
- Reads `~/.claude/projects/*/*.jsonl` into an in-memory index built in the background.
- The index is cached in the extension's global storage and refreshed incrementally (file watcher plus a stat before each search).
- Scope: current workspace folders, or all projects (checkbox).
- Filters like the built-in Search: Match Case (Alt+C), Match Whole Word (Alt+W), Use Regular Expression (Alt+R).
- Tokens: `file:<text>`, `edited:<text>`, `cmd:<text>`, `tag:<name>`; quote values with spaces (`cmd:"regen l10n"`). Tokens AND with plain words.
- Chevron on a row expands matching messages in place; star pins a chat; tags are added in the expanded view.
- Titles follow Claude Code: custom title, then AI title, then last prompt, then summary, then first message.
- Click a result to resume it in the Claude Code chat panel.
