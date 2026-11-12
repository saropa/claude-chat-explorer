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
- Test: `scripts/checks/check_activity.js`, part of `vscode:prepublish`.

Latency is at most one interval (250 ms by default) after the message is written.

## Visual polish

- Layout is symmetric around the core (view box 200 x 200 centered on it); lines run from node edge to core edge instead of through the circles; ring radius 68, node radius 15, 16 unit Codicons, 11 unit labels in the theme font. Every label sits directly above (top half) or below its node, so label length never drives the width. The panel is at least 184 px wide at the 200 px minimum, so the scale stays at 0.92 or more: labels at least 10 px, icons at least 14 px.
- Nodes and the core have a faint filled circle and one consistent 1 px stroke, all from the current theme foreground color.
- The flash is an ease-out glow (drop-shadow) over 4 seconds; the line, circle, icon and label all start in the link color and settle back together. Reduced motion holds the same bright state for 600 ms without animating.
- High contrast: full-opacity outlines, labels and icons, stronger lines. Colors are only `--vscode-*` variables.
- The diagram scales to the panel up to 300 px wide and never clips or overlaps.

## Owner requests, round 2 (built)

1. "Make the text smaller, it is awkwardly large." Labels and the core label are 8 units (was 11); label offset from the node is NR + 6.
2. "Too much vertical space between the lightbulb and Claude." Core icon 14 units at C-6 (x 100, y 94), label at C+8 (x 100, y 108); icon and label read as one centered unit.
3. "Show connections between nodes... Do not draw over the center line; wrap around it." 28 hidden connector arcs along the ring (radius 68, shorter way, clockwise for opposite nodes), drawn under the nodes (each node has an opaque backing circle). A move from one group to another within 10 s flashes the pair's connector with the spoke styling; reduced motion holds it 600 ms.
4. "During long thinking pauses the center should stay highlighted a bit longer..." A thinking flash with nothing lit holds the center bright until the next group flash or 10 s, then fades as usual.
5. "Make the node and Claude circles a little more beautiful with a delicate highlight from the top left." Radial gradient sheen (currentColor only) centered top left; flat outline kept in high contrast. Note: in light themes currentColor is dark, so the sheen reads as a soft tint, not a white highlight.

## Ideas from plans/notes/IDEAS_TO_WOW_USERS_WITH_ACTIVITY_PANEL.md (built, owner chose 1 to 4)

The feed now returns events (`ActivityEvent` in `src/activityMap.ts`, built by `eventsOf`) instead of bare groups; the extension posts `{type:'events', events}` and `{type:'reset'}` to the webview. `flashesOf` is kept as the plain-flash view of `eventsOf`. The feed keeps a map of calls in flight (tool call id to group), cleared by `mark()` and by every position reset (chat switch, new log).

1. Waiting for you: assistant `stop_reason: "end_turn"` gives a `wait` event on the core: one 1.8 s ripple ring (none with reduced motion), then a thin link-color outline (no fill, no glow, so calmer than a flash) until the next flash or user text line (`wake`). An AskUserQuestion call gives `wait` on the Chat node, cleared by its result. High contrast: 2 px solid outline.
2. Live caption: `captionOf` builds one line (Bash description, else first word of the command; file basename; WebSearch query; WebFetch host; Agent description; Skill name; "Thought for N s"; "Waiting for you"), clipped to 80 characters with an ellipsis. The webview sets it with `textContent` (escaped), at most every 500 ms, in a `#cap` line with `aria-live="polite"` and a fixed 1.4em height so the diagram never moves.
3. Error flash: a `tool_result` with `is_error: true` flashes its group (found through the pending map) with the error color (`--vscode-errorForeground`) and a dashed outline; `system` `api_error` and a user line with `permissionDecision.decision: "reject"` flash the core the same way. Results of calls made before the panel marked the log have no entry and show nothing.
4. Busy node: `busy` from the call, `end` from its result; the node shows a faint breathing ring (3 s, one animation per busy node). Reduced motion: static ring; high contrast: full-opacity ring. Pending set cleared on reset (chat switch, panel shown), and each entry after 10 minutes. Background calls that return at once are busy only for that moment.

Review fixes: the Bash caption fallback skips `VAR=value` words and shows only a plain program name (else "Running a command"); only a final text line of an `end_turn` message waits (the stop reason is copied onto every block line); `isMeta` user lines do not wake; the caption clears on wake, when the last pending call ends, and when a tool has no caption; the core hold also drops the error outline; an `api_error` flashes only for `retryAttempt` 1 or absent; the error color is `--vscode-editorError-foreground`, else `--vscode-errorForeground`; captions are clipped by code point; `flashesOf` is removed (the check uses `eventsOf`).


Fix: flashes looked faint or missing (owner report, dark theme). Cause: the white sheen circle sat above the lit node and washed out the lit color (dark .22, light .9 at the top stop), the lit fill was only .22, and the fade curve (.2,.6,.3,1) spent most of the lit look in the first second. Fix: sheen .07/.02 dark and .3/.1 light, hidden while `.hot` or `.hold`; lit fill .4; fade curve (.4,.5,.7,1); the Claude label has no halo and the outer halo is 70% opaque. Checked with headless Chrome screenshots (think, chat, terminal sequences, dark and light); the message handler threw no errors. The check asserts the sheen rules.

Measured on the owner's real chat (last 400 log lines of this project's session, 142 min, 12 user turns, run through `eventsOf` with real timestamps): flashes per minute chat .09, agents .08, think .15, terminal .06, files .01 (35 non-think flashes in all); 22 tool calls; 12 waits. Group changes (non-think to a different non-think): 23. The old rule (within 10 s) fired the connector 15 times (65%); 30 s would fire 16, 60 s 17. Gaps between non-think flashes: median 5.5 s, 90th percentile 95 s (10 of 34 over 10 s; the long ones are the pause between a reply and the next turn, plus one in-turn terminal to agents gap of 26 s). Time visibly lit (any node, line or connector, 4 s fade): 1.8% of the 142 min, 44% of the active time (stretches with gaps of 60 s or less, 5.9 min). Cause of missing connectors, in plain words: the connector fired only if the previous group flashed under 10 s earlier, so a long tool run (26 s agent wait, many in this chat) lost it; but mostly the chat has very few group changes (about one every 6 min), so there is little to light. Fix: the connector fires for any group change within a turn; the chain restarts at the next message from the user (wake) and on a chat switch, so a reply never links to the previous turn's last tool. Replay: 15 of 15 in-turn changes fire. Screenshots (headless Chrome, dark, chat then agents 60 ms apart): the connector arc is clearly lit when it fires (no styling fault); it takes the long arc round the ring for chat to agents, as designed. Owner request: resting outer labels dimmed from .75 to .6 fill opacity; the Claude label keeps .75 and the lit state stays 1.

Built: the Agents node chats with other nodes (owner decision). The feed also tails the chat's sub-agent logs, found at `<project folder>/<chat id>/subagents/agent-*.jsonl` (same line format as the chat log, lines marked `isSidechain`). Only logs written in the last 3 minutes, at most 8, each read with the same 4 MB chunk limit; a log seen for the first time is only marked (nothing replays), unless it was born after the first look (its first lines are new). `subEventsOf` maps a sub-agent line to `{ t: 'sub', g }`: a tool call gives its group, thinking and text give `agents`; no captions, busy rings or waiting states. The webview `sub(g)` lights Agents, then connector agents-to-g and the node g; `last` and the waiting state are untouched; g = agents (nested) lights Agents only. Check: a sub-agent Bash line gives an agents-to-terminal event, first sight replays nothing, no double read. Screenshot (headless Chrome, dark): scratchpad `sub_agents_terminal.png`, Agents, Terminal and the connector between them lit. Not done: a log idle for over 3 minutes that wakes up is marked at its current end on first sight, so its first lines then are not shown.
