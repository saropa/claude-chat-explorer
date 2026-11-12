# Ideas to wow users with the Activity panel

**Status: owner decision 2026-11-12: build ideas 1 (waiting for you), 2 (live caption), 3 (error flash) and 4 (busy node while a tool runs). The other ideas are not scheduled.**

**Owner decision 2026-11-12: "the agent node should be chatting with other nodes."** While a sub-agent started from the current chat runs, its own tool calls show as connector flashes from the Agents node to the node of each tool it uses (Agents to Terminal, Agents to Files, and so on). Queued after the connector-visibility fix.

**Owner request 2026-11-12: a "..." menu on the Activity panel** with "Refresh time" (Slow, Medium, Fast) and "Fade-out time" (Slow, Medium, Fast). Values chosen as defaults (Medium = today's behavior): refresh Slow 1000 ms, Medium 250 ms, Fast 100 ms; fade Slow 8 s, Medium 4 s, Fast 2 s. The choice is saved in settings. Queued after the Agents-node work, since both change the same files.

Context: the Activity panel (`src/activityHtml.ts`, `src/activityMap.ts`, `src/activityFeed.ts`, `src/activity.ts`, plan `plans/PLAN_activity_diagram.md`) flashes one of eight nodes, or the core, for each new assistant block in the current chat log. Treated as already done: connector arcs between nodes, a longer core glow in thinking pauses, smaller text, a top-left sheen on circles.

## What the log carries (checked on the 40 most recent logs in `~/.claude/projects`, 2026-11-12)

Today the panel reads only assistant `text` / `thinking` / `tool_use` block types and tool names, plus `nested_memory` attachments. The same lines also carry:

| Data | Where | Seen |
| --- | --- | --- |
| Time of each line | `timestamp` on every message line | all |
| Tool call id, and the result that answers it | `tool_use.id` in the assistant line; `tool_result.tool_use_id` in the next user line | 5,295 results |
| Tool failed | `tool_result.is_error: true` | 183 of 5,295 |
| Bash plain-words purpose | `input.description` (and `command`) | 3,064 of 3,170 Bash calls |
| Agent purpose and model | `input.description`, `input.model`, `input.run_in_background` | 915 of 915 |
| File touched | `input.file_path` (Read, Edit, Write) | all |
| Lines changed by an edit | `toolUseResult.structuredPatch` on the result line | Edit and Write results |
| Thinking length | `thinkingDurationMs` on the line | 3,485 lines |
| Turn finished, Claude waiting for the user | assistant `message.stop_reason: "end_turn"` | 2,668 |
| Permission denied | `permissionDecision.decision: "reject"` | 29 |
| Context compacted | `system` line, `subtype: "compact_boundary"` | 39 |
| API error | `system` line, `subtype: "api_error"` | 32 |
| Running cost and lines added/removed | `cost-state` line (`totalCostUSD`, `totalLinesAdded`, `totalLinesRemoved`) | 135, recent versions only |

All of it is in the bytes the feed already reads; no new file reads are needed except for idea 9.

## Ideas, ranked by wow per effort

### 1. "Waiting for you" state (small)
- **Sees:** when a turn ends, one soft ripple runs out from the core across the ring, then the core keeps a quiet outline in the link color until the next message. An AskUserQuestion call does the same on the Chat node.
- **Why it delights:** the panel answers the one question people glance at a sidebar for: "is Claude done?" It turns a decoration into a tool.
- **Data:** `stop_reason: "end_turn"` on the assistant line; AskUserQuestion `tool_use` without its result yet. Confirmed.
- **Risks:** none for performance. Reduced motion: no ripple, outline only. The held outline must be clearly calmer than a flash so it does not read as activity.

### 2. Live caption line (small)
- **Sees:** one line of text under the diagram naming the latest action in plain words: "Running: Run the unit tests", "Editing activityHtml.ts", "Searching the web: codicons license", "Agent: Opus review of diff", "Thought for 6 s". Truncated with an ellipsis to the panel width.
- **Why it delights:** the flashes say *what kind*, the caption says *what*. It makes the diagram legible to first-time users and gives screen-reader users the activity too (`aria-live="polite"`, throttled).
- **Data:** Bash `input.description` (falls back to the first word of `command`), `file_path` basename, WebSearch `query`, WebFetch `url` host, Agent `description`, Skill `skill`, `thinkingDurationMs`. Confirmed.
- **Risks:** shows commands and file names on screen (screen sharing): show basenames and descriptions, never full commands or prompts. Text must be escaped. Throttle updates (for example at most 2 per second) so it does not flicker.

### 3. Error flash (small)
- **Sees:** a failed tool call flashes its node in the theme error color instead of the link color; an API error or a denied permission flashes the core the same way.
- **Why it delights:** the panel now tells good news from bad at a glance; a red Terminal blink says "the test failed" before the user reads the chat.
- **Data:** `tool_result.is_error` plus `tool_use_id` mapped back to the tool's group (the feed must remember id to group for calls in flight); `system` `api_error`; `permissionDecision.decision: "reject"`. Confirmed.
- **Risks:** colour alone does not carry meaning: add a shape cue (a short dashed outline or a small badge) for colour-blind and high-contrast users. Theme variable `--vscode-errorForeground` only.

### 4. Busy node while a tool runs (medium)
- **Sees:** from the call until its result, the node keeps a slow, faint breathing ring; a long Bash run or a web fetch visibly "works". The flash on the result ends it.
- **Why it delights:** shows duration, not just events. Users see Claude waiting on the terminal for 40 s and know why the chat is quiet.
- **Data:** `tool_use.id` to `tool_result.tool_use_id`. Confirmed. Background Bash and background agents return a result at once, so they do not stay busy (correct, but worth knowing).
- **Risks:** a pending set must be cleared on chat switch, on `mark()`, and after a safety timeout, or a node can stay busy forever. Reduced motion: a static ring, no breathing. One CSS animation per busy node is cheap.

### 5. Edit tally on Files (small)
- **Sees:** a small "+42 -7" under the Files label for this chat since the panel opened, ticking up on each edit.
- **Why it delights:** a tangible sense of output; satisfying to watch rise.
- **Data:** `toolUseResult.structuredPatch` line counts on Edit/Write results (all versions), or `cost-state` totals (recent versions only). Confirmed.
- **Risks:** it is cumulative, which sits beside owner decision 2 ("flash then fade, not cumulative") for the flashes; the owner would need to say a counter is acceptable. Adds text in a small space; keep it at the label size or smaller.

### 6. Pulse that travels the spoke (small to medium)
- **Sees:** on a tool call a bright dot runs from the core out to the node; on its result it runs back. Requests go out, answers come in.
- **Why it delights:** motion with meaning; the diagram reads as a conversation between Claude and its tools.
- **Data:** `tool_use` (out) and `tool_result` (back). Confirmed; results are currently ignored by `flashesOf` and would need to be mapped.
- **Risks:** doubles the motion in a busy chat; must stay subtle. Reduced motion: no dot, existing hold only. Overlaps with the connector arcs work; check they do not compete.

### 7. Agent moons (medium)
- **Sees:** each running agent is a small dot orbiting near the Agents node; hover shows its description and model; the dot fades when the agent finishes.
- **Why it delights:** fleets of agents become visible; directly fits how this owner works.
- **Data:** Agent `input.description`, `input.model`, `run_in_background`; the result's `agentId`. Finish of a background agent is in its own log, which `BgTracker` already tracks. Confirmed.
- **Risks:** many agents crowd the node (cap the dots, show "+N"). Orbit is motion: reduced motion places dots static. Cross-file tracking adds work per check.

### 8. Compaction and idle moments (small)
- **Sees:** on a context compaction the ring briefly draws inward toward the core (memory being condensed). After a few minutes with no activity the diagram dims to a resting state; the next message wakes it.
- **Why it delights:** small character moments that reward people who keep the panel open.
- **Data:** `system` `compact_boundary` (confirmed, rare); idle is the time since the last flash (no log data needed).
- **Risks:** low value per use; dimming must not look like "broken". Reduced motion: dim without transition.

### 9. Time-lapse replay (large)
- **Sees:** a play button replays the whole selected chat's activity at speed (for example one minute of chat per second), with the caption line and a thin progress bar.
- **Why it delights:** the strongest demo moment; shows the shape of a long session in 20 seconds. Good for screenshots and the marketplace page.
- **Data:** `timestamp` on every line. Confirmed. Needs a full read of the log, not the 4 MB tail the feed reads.
- **Risks:** large logs (read once on request, never on a timer); new UI (button, progress). Reduced motion: show a static per-group summary instead of playing.

### 10. Cost and token meter (medium, low recommendation)
- **Sees:** a thin ring around the core filling with tokens or cost this session.
- **Data:** `message.usage` on every assistant line; `cost-state.totalCostUSD` on recent versions. Confirmed.
- **Risks:** cost figures mislead subscription users; partial data on older versions; a money number in a decorative panel invites worry. Listed for completeness.

## Not recommended
- Sound: distracting, against sidebar norms.
- Colour per group: breaks the "theme colours only" rule and fights high-contrast themes.
- Particle or physics effects: cost and motion out of proportion to a sidebar.

## Top 3 recommendation (for owner decision)

1. **Waiting for you state (idea 1).** Smallest change with the biggest practical gain: the panel becomes the place to glance to know Claude is done. One field, no new state beyond "last event".
2. **Live caption line (idea 2).** Makes every flash understandable in words, and it is the accessibility win: screen-reader users get the activity too. All inputs are already in the lines read.
3. **Error flash (idea 3).** Adds good-versus-bad meaning to the existing flash with one new colour and a small id-to-group map; that same map is the base for ideas 4 and 6 later.

Each of the three respects reduced motion (static state instead of animation), uses theme variables only, and adds no extra file reads.
