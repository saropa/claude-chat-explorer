# Activity: background tasks, all-chats mode, browser view

The Activity diagram showed no movement while Claude waited on a background shell or agent, because launching such a task appends nothing to the chat log until it finishes. The diagram also covered only the focused chat and could not be viewed outside VS Code.

## Changes

- **Background pills.** `BgTracker` (`src/bgAgents.ts`) records each open background task with its kind: `agentId` in the launch record means agent, `backgroundTaskId` means shell. `ActivityFeed.checkBg` emits `{ t: 'bg', shell, agent }` when either count changes. The page shows one glowing pill per running kind (icon only, count when several, tooltip names the kind). Glow is required so a long quiet stretch does not read as a locked-up diagram. Reduced motion holds a static state.
- **PowerShell.** `toolGroup` and `captionOf` treat `PowerShell` like `Bash`; it previously lit Control.
- **All-chats mode.** Setting `saropaChats.activity.allChats` (default off), toggled from the pane `...` menu, applies without reload. `AllChatsTracker` tails up to 8 live chats, focused first. Each chat gets one of 20 fixed colours (single palette module, persisted per chat id, no reuse among live chats while 20 or fewer). The colour is the glow of that chat's flashes and pills and a bar left of its session row. Palette derived from Trubetskoy's 20 colors and Kelly's 22; luminance-banded to at least 3.51:1 on `#1e1e1e` and 4.04:1 on white; minimum neighbour CIEDE2000 23.4.
- **Browser view.** Command "Open Activity in Browser" starts one loopback-only HTTP server (random port, secret token, exact Host check, GET only, 404 otherwise, strict CSP) that serves the same page with a project-title header and a chat legend, and streams events over Server-Sent Events. Polling runs only while a client is connected. The browser view always runs in all-chats mode.
- **Review fixes.** Remote windows: the `asExternalUri` authority is allowed as an extra exact Host (`allowHost`). `start()` shares one in-flight bind. `checkAll` no longer discards flash and pill events when focus moves during a check.

## Verification

`tsc`, `check_activity`, `check_webview`, `check_manifest`, `check_browser` pass. `check_browser` runs the real server with a fake tracker (bind address, token, Host, CSP, SSE delivery, late-join replay, polling stop, allowed forwarded host, concurrent start).

Not verified: operation in the live extension (colour bars, glow, browser launch), a real remote session, the `checkAll` focus-move path (no automated test), and chat-legend titles for live chats without an open tab.

## Follow-up hardening

- **Stale tasks.** `BgTracker` records each launch's `timestamp` and the log's modification time. A task with no finish notice stops counting when both its launch and the last write to its chat log are older than `BG_STALE_MS` (6 hours); a launch without a timestamp is aged by the silent log alone. A log written again revives the pill. Residual risk: a task that genuinely runs longer than 6 hours in a chat that writes nothing for 6 hours is dropped.
- **Format drift.** A line that looks like a launch (`toolUseResult` with `async_launched` or `backgroundTaskId`) but has no readable task id calls an `onDrift` callback once per tracker; the Activity registration writes one line to the output channel. The line content is not logged.
- **Verification added.** `scripts/checks/check_bg.js` with fixtures in `scripts/checks/fixtures/bg/`: shell and agent launches and finish notices, launch times, the stale limit in four combinations, the drift notice, the all-chats cap of 8 chats, no re-read of an unchanged log, and re-reading only the chat that grew. `check_activity.js` gained a check that up to 20 live chats never share a colour after a reload. Already covered before: colour stability across a reload, 20 distinct colours.
- **Not testable without the live extension.** The `openExternal` failure path with its Copy-address message (`activityBrowser.ts` imports `vscode`).
- **Pill timer.** The bg event carries `shellAt` and `agentAt` (earliest launch per kind, epoch ms); the page shows the elapsed time per pill and ticks once a second only while a pill is visible. The launch time is the log's clock and the page's clock is its own; they differ only in remote windows, where a skew shifts the number and a negative value shows 0s.
- **Reveal from the browser.** `POST /focus` (token in the path, exact Host, Origin equal to Host, `application/json`, body of at most 1 KiB, chat id among the ids the legend shows) calls the same `resume` action as the session list. Refusals are 404; a failing handler answers 500. Legend entries are buttons; pills are clickable with the mouse only. Not verified: that the VS Code window comes to the front when the tab is revealed from a browser.
