# Auto session titles in the extension (retire the local hook)

## Goal
Replace `~/.claude/hooks/session_title_emoji.py` (UserPromptSubmit hook) with an extension feature. Emoji comes from user-configurable keyword rules. No blocking work on the editing path.

## Current hook (findings)
- Runs on every prompt submit (30 s timeout). Skips: titled sessions, `/` commands, prompts under 5 words, automated prompts, sessions with a mark file in `~/.claude/session_title_marks/` (pruned after 14 days).
- Titles once per session. Runs `claude -p --model haiku` on the first 1,500 chars of one prompt; returns `{emoji, title}` (3-7 words). Blocks the first prompt up to 25 s.
- Fallback: 27 keyword areas (word-boundary match counts, highest wins, default 💬) plus the first 6 words as title.
- Output: `hookSpecificOutput.sessionTitle`.

## Existing extension pieces
- `src/regenTitles.ts`, `src/regenTitlesRun.ts`: command `saropaChatExplorer.regenTitles`. Reads first 3 prompts, calls Haiku, appends `custom-title` + `agent-name` lines. Skips sessions modified within 5 min.
- `src/parse.ts`: title precedence customTitle > aiTitle > lastPrompt > summary.
- `provider.watcher`: detects session file changes.

## Owner decisions (confirmed)
1. Haiku title: optional, off by default. Default title = cleaned first sentence; keywords pick the emoji.
2. Timing: re-evaluate after the first 3 prompts (rewrites the title once).
3. Config: `saropaChatExplorer.emojiRules` in settings.json, list of `{emoji, keywords}`; user entries merge over the 27 defaults, with a flag to replace them.

## Performance constraints
- Driven by the watcher, debounced; never on the prompt path.
- Read only the head of the session file (first ~4 KB / first 3 user prompts).
- Once per session; record done state so it is not repeated.
- No process spawn unless the Haiku setting is on, and then in the background.

## Open (verify before building)
- Whether Claude Code re-reads an appended `custom-title` for a live session, or only on next load.
- Where "done" state is kept (replaces the marks directory).

## Retirement steps
1. Ship the feature; verify on live sessions.
2. Remove the hook entry from `~/.claude/settings.json`.
3. Delete `hooks/session_title_emoji.py` and `session_title_marks/`.
