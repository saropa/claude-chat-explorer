# Saropa Chat Search

Activity-bar panel that searches the full text of Claude Code chats.

- Install: `code --install-extension claude-chat-search-0.0.2.vsix`
- Reads `~/.claude/projects/*/*.jsonl`.
- Scope: current workspace folders, or all projects (checkbox).
- Filters like the built-in Search: Match Case (Alt+C), Match Whole Word (Alt+W), Use Regular Expression (Alt+R).
- Regex off: all words must match. Regex on: the whole query is one regex.
- Titles follow Claude Code: custom title, then AI title, then last prompt, then summary, then first message.
- Results show relative last-active time; the last 20 searches are kept per workspace.
- Results survive switching sidebars and reloading the window.
- Click a result to resume it in the Claude Code chat panel.
