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
