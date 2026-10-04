# Claude Chat Search

Activity-bar panel that searches the full text of Claude Code chats.

- Install: `code --install-extension claude-chat-search-0.0.1.vsix`
- Reads `~/.claude/projects/*/*.jsonl`.
- Scope: current workspace folders, or all projects (checkbox).
- All words must match; results ranked by hits and recency (top 50).
- Click a result to resume it in the Claude Code chat panel.
