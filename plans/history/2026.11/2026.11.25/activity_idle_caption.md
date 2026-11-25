# Activity idle caption and all-chats default

The Activity diagram followed only the focused chat (single-chat mode was the default), so when that chat was waiting for the user nothing flashed and the section looked hung, while other chats were visibly running in the session list. Nothing on screen named the followed chat or said it was idle.

## Changes

- **Idle caption** (`src/activityIdle.ts`, new): pure, vscode-free `idleText`, `othersWorking`, `isWorking`. Caption reads `<title> — <state>` plus `· N other chat(s) working`. States: running = working, waiting = waiting for you, background = background tasks running, other = idle. A chat whose dot carries `background` in `also` (behind waiting/unread) counts as working and its text gains `· background tasks running`. Titles cut at 60 code points (emoji-safe). Strings live in `IDLE_STRINGS` with `{0}` placeholders and whole-string singular/plural; the host passes `vscode.l10n.t` as translator.
- **Host** (`src/activity.ts`): `registerActivity` takes `idleInfo(id)` and returns `idle()`. `sendIdle` posts `{type:'idle', text}` only on change (`idleSig`). Sent at each `poke`; `idle()` (called from the watcher's `onChange` via `Provider.idleHook`) sends only while the section is visible and open, and skips while a chat switch is pending (`currentId() !== shownId`) so `poke()` owns reset-then-idle ordering.
- **Page** (`src/activityHtml.ts`): keeps `idleText` and `liveText`; `caption('')` falls back to the idle text, so live captions win. `wait` events now clear the live caption so "waiting for you" is not hidden behind the last message's caption. `reset` clears both. The browser view never receives `idle`, so its caption is unchanged.
- **Default** (`package.json`): `saropaChats.activity.allChats` defaults to `true`.
- **Checks** (`scripts/checks/check_activity.js`): idle wording singular/plural and no-title forms, `also` background handling, emoji truncation, translator coverage, `othersWorking` with `also`, manifest default `true`.

## Known limits

- When the followed chat has no open Claude tab, the caption has no title: the only synchronous title source is `watcher.tabInfo`; session titles come from the async worker index.
- No DOM-level test drives the page's `wait`/`idle` handlers; page behavior is covered by string presence and the panel script smoke run only.

## Verification

`npm run compile`; `node scripts/checks/check_activity.js`, `check_webview.js`, `check_browser.js` — all OK.

## Hardening and click-to-focus

### Hardening

- **Malformed dots** (`src/activityIdle.ts`): a private `statesOf` reads a dot defensively (non-object dot, non-string `s`, missing or non-array `also`, non-string entries). `isWorking`, `othersWorking` (also with a missing map) and the caption's state wording all go through it, so such a dot reads as idle and never throws.
- **Switch-skip ordering** (`IdleGate` in `src/activityIdle.ts`): the reset-before-idle rule moved out of `registerActivity` into a pure class. `poke(cur, msg, keepPills)` returns `reset` then `idle` on a chat switch; `idle(cur, msg)` returns nothing (and does not build the message) while `cur` differs from the shown chat; `forget()` replaces the old `shownId = ''; idleSig = ''`. `src/activity.ts` sends what the gate returns. Exercising `registerActivity` itself would need a stubbed `vscode` module, which no check in the repo has; the gate is tested instead.
- **Title fallback** (`TitleCache` in `src/activityIdle.ts`, wired in `src/extension.ts`): when the followed chat has no tab title, the title comes from the existing worker request `apiChat` (soft request; its reply carries `title`), so no new request type was added. One lookup per id, cached; a lookup in flight is not repeated; a miss or failure is retried at most every 30 s. An arriving title calls `activity.idle()`, which re-sends the caption. The tab title still wins when present.
- **allChats default**: a comment at `ALL_KEY` and `allOn` in `src/activity.ts` and the CHANGELOG entry state that the `true` default applies only where no value is set, so an explicit `false` in user, workspace or folder settings is kept.

### Click-to-focus

- The idle message is now `{type:'idle', text, go, looking}` (`idleMsg`). `go` (button label, `IDLE_STRINGS.focusOther`) and `looking` (click-time text) are non-empty only when `others > 0`, i.e. when the "N other chats working" hint is in the text. All strings are in `IDLE_STRINGS` and pass through the host translator (`vscode.l10n.t`).
- Page (`src/activityHtml.ts`): `paint()` draws the throttled caption and makes `#cap` a button (`role="button"`, `tabindex="0"`, `title`/`aria-label` = `go`, class `go`) only while it shows the idle text with `go` set and a host is reachable; otherwise those attributes are removed. Click and Enter/Space listeners are attached with `addEventListener` (no inline handlers). A click shows `looking` at once and posts `{type:'actFocusOther'}`. A `note` message shows a host outcome like a live caption (class `bad` for errors) and falls back to the idle text after 4 s. `reset` clears the button state. CSS uses `--vscode-textLink-foreground`, `--vscode-focusBorder` and `--vscode-errorForeground`.
- Host reach: the shared script holds `const toHost = null;`; only `activitySection` swaps in `vs.postMessage` (guarded by `typeof vs`), so the standalone page and the browser view cannot become clickable, and the browser view never receives `idle`. The function is named `capNote` because the browser page shell already declares `const note`.
- Host (`src/activity.ts`, `src/extension.ts`): `Provider.onMessage` routes `actFocusOther` to `activity.focusOther()`. It collects the other working chats from the dots, reads each one's transcript mtime (`BgTracker.fileOf` + `fs.promises.stat`) and picks with the pure `pickBusiest`: running before background (in `s` or `also`), then most recent mtime, then id. It posts `Opening <title>…` and calls `provider.resume(id)`; no working chat gives `No other chat is working now`; a throw from resume is logged and shown as `Could not open <title>`.

### Checks

- `scripts/checks/check_activity_page.js` (new, registered in `vscode:prepublish` after `check_activity.js`): runs the real page script in the `webview_harness.js` stub DOM with its fake clock (each step advances 600 ms past the 500 ms throttle; `document.querySelector` returns one stub per selector so `wait` reaches its group). Standalone page: idle text without live caption, live caption wins, idle update under a live caption, `end` with and without pending calls, `wait` drops a stale live caption, `reset` clears both, missing `text`. Section page: button state with the hint, label, listeners present, click posts once and shows the click text, no post from the outcome text or a live caption, Enter/Space, other keys, error note, plain text without `go`, `reset` drops the button state.
- `scripts/checks/check_activity.js`: malformed-dot cases, `pickBusiest` ranking and exclusions, `idleMsg` fields and translator, no first-person strings, `IdleGate` ordering, `TitleCache` (single lookup, cache, miss retry after `retryMs`, failure not cached, empty id), page wiring and theme-token strings. The async `TitleCache` block is awaited before the final verdict.
- A mutation run against a copy of `out/` (wait no longer clearing the caption; `IdleGate.idle` no longer skipping) made both checks fail.

### Known limits

- `registerActivity` and `focusOther` are not run under test (no `vscode` stub); the click round trip host-side (`actFocusOther` to `resume`) is unverified in a running VS Code.
- `openChat` catches its own failures and shows a toast, so the `Could not open` caption appears only if `resume` throws; for the usual failure the caption shows `Opening <title>…` and returns to the idle text after 4 s.
- `apiChat` builds the whole chat summary (tokens, files) to return one title; it runs at most once per untitled chat per 30 s.

### Verification

`npm run compile`; `node scripts/checks/check_activity.js`, `check_activity_page.js`, `check_webview.js`, `check_browser.js` — all OK.
