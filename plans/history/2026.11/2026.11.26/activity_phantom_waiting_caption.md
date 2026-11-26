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
- Superseded by the follow-up below: the core outline is now driven by the dot.

## Follow-up: hardening and dot-driven core outline (2026-11-26)

### Hardening (f629e31, a92e15c)
- `currentId` can return a last-active chat whose tab or process is gone. `idleInfoOf` sets `followed` only when the id has a dot, using the shared `hasDot(dots, id)` in `src/activityIdle.ts`. `focusTarget` uses the same helper, so the label and the click cannot disagree.
- A self click whose dot has gone shows `IDLE_STRINGS.notOpen` ("{0} is no longer open"). It uses the last title the caption showed (`lastShown` in `src/activity.ts`, 841ac4f).
- `actFocusOther` with a missing, null or unknown `kind` resolves as `other`.
- Clearing pending calls at end of turn is safe. Sub-agent lines yield only `sub` events, never `busy`, and another chat's `wait` is dropped by `tagEvents`.

### Core outline meaning (a92e15c, 841ac4f)
- The dot is `waiting` only for a permission prompt or a question. A normal `end_turn` moves it to idle or unread. f629e31 first cleared the outline whenever `waiting:false` arrived. The outline then dropped at every normal turn end, or stuck when the end-of-turn `wait` event arrived after the idle message in the same poll or after a chat switch.
- Ruling: the core outline means a real wait only, and only the dot drives it.
- Each idle message carries `waiting` (true or false; undefined for a chat with no dot) and `kind`. Once the page sees either field it sets `hostDrivesCore`. From then on, `setCore(on)` alone owns the core's `wait`/`rip` classes, with one ripple on false→true.
- With `hostDrivesCore` set:
  - A `wait` event with `g:'think'` no longer draws the core outline. It still settles the caption and drops pending calls.
  - `flash()` and `wake` no longer clear the core (841ac4f). Before that fix, a tool flash in the same poll as `waiting:true` erased the outline for the whole permission wait, because the deduplicated idle message never re-sent it.
- `ripT` cancels the ripple timer, so a quick true/false/true toggle cannot cut the second ripple short.
- An older host that sends neither field keeps the event-driven outline.
- The AskUserQuestion Chat-node outline is unchanged.
- The page-check harness stub `querySelectorAll` returned nothing, so `.wait` checks could not fail. `withGroups` now returns the stub elements that carry the class.

### Verification
- At 841ac4f a clean worktree does not compile. The parent commit 1c14671 left stray text in `src/chatColors.ts` and type errors in `src/liveState.ts`, outside this work.
- With `src/chatColors.ts` overlaid from 5cc4c69:
  - `check_activity_page.js` exits 0, including every new page check.
  - `check_activity.js` fails only chat-colour checks.
- New page checks were not mutation-tested. Whether each one fails without its fix is unverified, except the `.wait` stub fix, which was observed failing first.
- Not run in a live VS Code window.

### Not built
- Badge pulse when a chat enters waiting. `updateBadge` sets only a count, so a pulse needs new animation code.
