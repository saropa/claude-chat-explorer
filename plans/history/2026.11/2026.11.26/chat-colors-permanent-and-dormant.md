# Chat colors: permanent assignment and dormant hiding

A chat's color could change for good. When it clashed with another live chat, the new color overwrote the saved one, and the 500-entry cap evicted entries by when they were first assigned, so a chat in regular use could lose its color. Every chat with a color also kept its color marker in the session list after it went idle, which added visual noise.

## Finish Report (2026-11-26)

### Permanent colors (`src/chatColors.ts`)
- A chat's first assigned color is saved and never overwritten.
- Clashes:
  - The chat with the oldest saved entry keeps the color.
  - The other claimants show a temporary color for that `resolve()` call only.
  - Temporary picks skip the saved indexes of all established live chats, so a clash cannot push a third chat off its own color.
- The result does not depend on the order of `liveIds`. Established chats are placed by saved-map order and new chats by id, so the Activity pane and the browser view show the same colors.
- A new chat ranks palette entries by: live holders, then reserved, then how many saved chats (dormant included) own the color, then lowest index. Over time this keeps permanent duplicates few.
- Recency:
  - Live chats are re-inserted as newest on every resolve.
  - Writes happen when an assignment or eviction changes the map. Otherwise they happen at most once per `RECENCY_PERSIST_MS` (10 minutes).
  - Eviction beyond `STORE_MAX` removes only the oldest non-live entries.
- The internal map is now a `Map`.
- The persisted format is still `Record<string, number>`.
- The constructor gains an optional `now` clock, defaulting to `Date.now`.

### Dormant hiding (`src/colorDormant.ts`, `src/webviewRender.ts`, `src/webviewJs.ts`, `src/extension.ts`, `package.json`)
- New setting `saropaChats.colorDormantMinutes`: default 3, minimum 0. 0 turns hiding off.
- The code default lives in `COLOR_DORMANT_DEFAULT_MIN`. `check_options.js` asserts that the `package.json` default matches it.
- The host posts `{type:'ccdorm', ms}` on restore and whenever the setting changes.
- Dormant rule (`ccDormant`):
  - `r.last` (the newest message time) is older than the threshold, and
  - the chat is not busy. A chat is busy when its `dots` state is `running`, or when `background` appears in `s` or `also`.
- Only the `cc cc<N>` classes are skipped. The saved color map is untouched, so the same color comes back when the chat is active again.
- A 10-second `ccTick` re-renders only when the set of dormant colored rows changes. `ccSig` is refreshed after every render, so the list never renders twice.

### Checks
- `check_activity.js` covers:
  - no overwrite on a clash
  - reserved colors
  - order independence
  - new chats avoiding colors owned by dormant chats
  - throttled recency writes (injected clock)
  - eviction of non-live entries only
- `check_webview.js` covers fresh, dormant, reactivated, threshold 0, and busy overrides (`running`, `background`).
- `check_options.js` checks the setting's bounds and default.

### Results
- `npm run compile`: clean.
- `check_activity`, `check_bg`, `check_options`, `check_manifest`: pass.
- `check_webview`: 1 failure, in the existing neutral-wording assertion (the "Claude" text in the Session Manager menu). The new dormant assertions pass.

### Limits
- Without a busy dot, dormancy is judged from `r.last`, the time of the last message. A long tool call that writes no message, on a chat with no busy dot, can hide the marker until the next message arrives.
- If more than `STORE_MAX` chats are live at once, the map can grow past the cap.

## Hardening (2026-11-26)
- Busy states:
  - `BUSY_DOT_STATES` and `DOT_STATE` in `src/liveState.ts` are the single definition of which dot states count as busy.
  - They are injected into the session-list page as `CC_BUSY`.
  - `check_dots.js` fails when a busy state is no longer a state the host can emit.
- Multi-window merge:
  - `ColorBook` takes an optional `load` and merges the stored map in `adopt()`. Entries only this window knows go in as the oldest, and stored entries keep their stored order.
  - For an id already in the store, the stored index wins.
  - A write happens only when the final map differs from the stored one, so two windows at the 500 cap settle without writing on every refresh.
  - When two windows assign the same new chat at the same moment, the last persisted write wins, so that chat can change color once.
- Out-of-date snapshots: `ccLast()` uses the newest `last` for a chat across session rows, archived rows, pinned rows and search results, so an out-of-date pinned or search row no longer hides an active chat's marker.
- Incident: during this work a scripted edit truncated `CHANGELOG.md` to 0 bytes. The file was restored from HEAD and the hardening entry was added again.
- Results:
  - compile: clean.
  - `check_bg`, `check_dots`: pass.
  - `check_activity`: every color check passes. It also fails 3 checks on the Session Manager menu and Generate Title wiring, which this work does not touch.
