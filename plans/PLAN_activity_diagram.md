# Plan: Activity diagram

## Summary

An "Activity" view in the Saropa Chat Explorer sidebar, under the session list. It is an SVG network diagram: a center circle "Claude" (Codicon `lightbulb`, thinking) and eight nodes evenly spaced around it, each a Codicon and a short name. A dim line joins each node to the center. When a new message arrives in the current chat, the line of its group flashes bright, then fades back to dim over about 4 seconds. Thinking flashes the center. With `prefers-reduced-motion` there is no animation, only a 600 ms bright state. It scales to the sidebar width.

## Owner decisions

1. Build now.
2. Flash then fade (not cumulative).
3. Its own collapsible panel (a second webview view in the existing sidebar container, next to `claudeChatExplorer.view`).

## Group mapping (chat log JSONL in ~/.claude/projects)

| Node | Codicon | Lights up on |
| --- | --- | --- |
| Chat | `comment-discussion` | assistant `text` block; the AskUserQuestion tool |
| Memory | `book` | a Read of a file under a `/memory/` folder of `~/.claude`, or a file named CLAUDE.md; an attachment entry of type `nested_memory` |
| Files | `files` | Read, Edit, Write, Grep, Glob, NotebookEdit (except the memory reads above) |
| Terminal | `terminal` | Bash |
| Web | `globe` | WebSearch, WebFetch |
| Agents | `hubot` | Agent, SendMessage, ListAgents |
| Connect | `plug` | any `mcp__*` tool, Skill, ToolSearch |
| Control | `settings-gear` | everything else (Monitor, TaskStop, ExitPlanMode, EnterWorktree, ScheduleWakeup, Workflow, unknown tools) |
| Center | `lightbulb` | assistant `thinking` block |

Tool results and other entries do not flash. Only new messages flash: opening or switching chats does not replay old ones.

## How it works

- `src/activityMap.ts`: pure mapping of a log line to groups.
- `src/activityFeed.ts`: reads the new bytes of the current chat's log (same incremental tail approach and file lookup as `BgTracker`). The first read of a chat only records its end.
- `src/activity.ts`: the view provider. No new file watcher: it reads when the existing watching reports a change (the index watcher via the hub events `changed` and `indexed`, the live-state `dots` event) or the tab moves. Current chat is `Provider.currentId()` (`src/currentChat.ts`).
- `src/activityHtml.ts`: the page; `src/activityIcons.ts`: Codicon paths copied from `@vscode/codicons` 0.0.45 (CC BY 4.0).
- Test: `scripts/check_activity.js`, part of `vscode:prepublish`.

Latency follows the existing watcher (file change, 1 s debounce, then the refresh), so a flash lands a second or two after the message is written.
