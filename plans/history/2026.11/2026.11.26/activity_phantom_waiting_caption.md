# Activity caption: phantom "Waiting for you" and unclickable followed chat

The Activity panel showed "Waiting for you" when no session was waiting, and the caption could not be clicked. Every normal turn end (`stop_reason: "end_turn"`) set a live caption, `'Waiting for you'`, that stayed after the session dot moved to idle or unread. A live caption disables the click button, and the string bypassed translation.

## Finish Report (2026-11-26)

### Defect
- `src/activityMap.ts` set `caption = 'Waiting for you'` on every `end_turn`. The page stored it as `liveText`, which outlived the dot's real state. `drawGo` in `src/activityHtml.ts` hides the click button whenever `liveText` is set.
- The idle caption, built from the session dot in `src/activityIdle.ts`, was correct, but its click opened only the busiest other working chat. Clicking the caption for the followed chat itself did nothing.

### Changes
- **de70ee0:** `end_turn` now emits only the `wait` outline event and no caption. "Waiting for you" comes only from the dot-driven idle caption, which goes through `IDLE_STRINGS` and `vscode.l10n.t`.
- **6fc3234:** the idle caption can target the followed chat. The page gets the label `IDLE_STRINGS.focusSelf` and the click text "Opening <title>…". The existing `actFocusOther` message is reused.
- **4d84708** (review fixes):
  - `clickKind(followed, dot, others)` in `src/activityIdle.ts` decides between self and the busiest other chat. Self wins when the followed chat is waiting or no other chat works. The label and the host both use it, keyed on whether a chat is followed, not on whether it has a title. Untitled chats use `IDLE_STRINGS.untitled`.
  - The page sends the chosen `kind` with `actFocusOther`. The host resolves it with the pure `focusTarget(kind, cur, dots, recency)` and does not re-decide from fresh dots. An empty result shows the `noneWorking` note. A missing `kind` (older page) counts as `other`.
  - A `wait` on the core (`g === 'think'`, end of turn) clears pending tool calls and their busy classes. A tool call with no result can no longer leave a stale "Running: …" caption that hides the idle caption and its button. A `wait` on Chat (AskUserQuestion) still keeps in-flight calls.
  - Stale comments that described the old other-chats-only rule were updated in `src/activityHtml.ts` and `src/activity.ts`.
  - The checks build their expected strings from `IDLE_STRINGS`.
- **Follow-up commit:** 4d84708 had swept unrelated keepWarm checks into `scripts/checks/check_activity.js` and `scripts/checks/check_activity_page.js`. Their source files (`src/smPrefs.ts` and the keepWarm parts of `src/webviewSm.ts`) were not committed, so the checks crashed on a clean checkout. Those check lines were removed from the committed scripts.

### Verification
- Run in a clean worktree of the final commit, with `node_modules` linked from the repo:
  - `npm run compile` (tsc): clean.
  - `node scripts/checks/check_activity_page.js`: exits 0.
  - `node scripts/checks/check_activity.js`: exits 1 on 4 chat-colour checks (clash and cap). The same 4 fail at 4d84708~1, before this work.
- Not run in a live VS Code window.

### Known limits
- The diagram's `wait` outline on the core still stays until the next user text line, whatever the dot says.
