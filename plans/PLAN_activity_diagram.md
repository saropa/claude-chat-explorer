# Plan: Activity diagram

## Summary

An "Activity" view in the Saropa Chat Explorer sidebar, under the session list. It is an SVG network diagram: a center circle "Claude" (Codicon `lightbulb`, thinking) and eight nodes evenly spaced around it, each a Codicon and a short name. A dim line joins each node to the center. When a new message arrives in the current chat, the line of its group flashes bright, then fades back to dim over about 4 seconds. Thinking flashes the center. With `prefers-reduced-motion` there is no animation, only a 600 ms bright state. It scales to the sidebar width.

## Owner decisions

1. Build now.
2. Flash then fade (not cumulative).
3. Its own collapsible panel (a second webview view in the existing sidebar container, next to `claudeChatExplorer.view`).
4. The check rate is user-configurable (`saropaChatExplorer.activity.refreshMs`, default 250 ms, faster than the old 1 second; minimum 100, maximum 2000), applied live without a reload.
5. No work while the panel is collapsed or hidden: the interval stops completely and restarts when it is visible again.
6. Each check reads only the bytes appended since the last offset (stat of the one current log file, capped at 4 MB).

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
- `src/activity.ts`: the view provider. No file watcher and no use of the shared index events: while the view is visible, one interval (setting `activity.refreshMs`) calls the feed check, and a tab move also triggers one. An in-flight guard and a pending flag keep checks from overlapping. When the view is hidden or disposed the interval is cleared; when it is shown again the feed first marks the end of the log, so messages that arrived meanwhile do not flash. Current chat is `Provider.currentId()` (`src/currentChat.ts`).
- `src/activityHtml.ts`: the page; `src/activityIcons.ts`: Codicon paths copied from `@vscode/codicons` 0.0.45 (CC BY 4.0).
- Test: `scripts/check_activity.js`, part of `vscode:prepublish`.

Latency is at most one interval (250 ms by default) after the message is written.

## Visual polish

- Layout is symmetric around the core (view box centered on it); lines run from node edge to core edge instead of through the circles; ring radius 72, node radius 17, 16 px Codicons, 11 px labels in the theme font.
- Nodes and the core have a faint filled circle and one consistent 1 px stroke, all from the current theme foreground color.
- The flash is an ease-out glow (drop-shadow) over 4 seconds; the line, circle, icon and label all start in the link color and settle back together. Reduced motion holds the same bright state for 600 ms without animating.
- High contrast: full-opacity outlines, labels and icons, stronger lines. Colors are only `--vscode-*` variables.
- The view box is about 290 units wide and scales to the panel (maximum 360 px), so labels stay small but legible at 200 px and never clip or overlap.
