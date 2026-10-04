# Saropa Chat Search

Activity-bar panel that searches the full text of Claude Code chats.

- Install: `code --install-extension claude-chat-search-0.4.0.vsix`
- Indexes `~/.claude/projects/*/*.jsonl` and subagent chats (`<session>/subagents/agent-*.jsonl`) in a worker thread, so the editor never freezes. Memory holds only metadata and a per-chat trigram filter; message text sits in a compact store on disk and is read only for candidate chats. The status bar and a panel banner show progress (with the subagent file count), and search covers what is indexed so far.
- Include subagents (checkbox, on by default, saved with the options): subagent matches nest under their parent chat with a purple "Subagent" pill and agent type; a parent that matched only through a subagent is marked "matched in subagent". Clicking a nested row resumes the parent chat. Subagent hits add to the parent's hit count and score.
- Every search runs in the worker with a 3 second stall limit; a pattern that hangs (for example `(a+)+$`) shows "Search timed out: simplify the pattern" and the worker restarts.
- `node scripts/bench.js` (after `npm run compile`) prints build, load, memory, cache size and query timings.
- The index is cached in the extension's global storage and refreshed incrementally (file watcher plus a stat before each search). Each message is indexed up to 20,000 characters (8,000 for subagents); tool results are skipped. Above a 200 MB cache, only the last 90 days of message text are kept.
- Scope: current workspace folders, or all projects (checkbox). When: any time, last 1/2/4/8 hours, or today.
- Filters like the built-in Search: Match Case (Alt+C), Match Whole Word (Alt+W), Use Regular Expression (Alt+R).
- Tokens: `file:<text>`, `edited:<text>`, `cmd:<text>`, `tag:<name>`; quote values with spaces (`cmd:"regen l10n"`). Tokens AND with plain words and match case-insensitively.
- Status filter (funnel button): include or exclude Normal, Active (last hour), Empty (0 messages), Tiny (3 or fewer), Huge (300+ messages or over 10 MB), Abandoned (over 30 days) and Pinned chats. Counts show per status; the choice is saved per workspace.
- Sort by score, time (grouped by day), title or length. Up to 500 results; pinned chats always list first.
- Score: 1,000 per title match plus 5,000 when every word is in the title, weighted by last-active time; body hits add up to 900, newer messages weigh more.
- Chevron on a row expands matching messages in place, with stats, matched files and commands, and related chats that touched the same files. Star pins a chat; tags are added in the expanded view and clicked to filter.
- With an empty query the panel shows pinned chats and recent searches.
- Titles follow Claude Code: custom title, then AI title, then last prompt, then summary, then first message.
- Click a result (or press Enter on it) to resume it in the Claude Code chat panel. Requires the Claude Code extension.
- Errors are logged to the "Saropa Chat Search" output channel.
