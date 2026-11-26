# Plan: Hand-picked chat color

Status: Not started (design only).

## Goal
Let a user choose a chat's color by hand, so important chats keep a chosen, recognizable color instead of the automatic one.

## Behavior
- Right-click a chat row in the session list → **Set Color…** → pick from the 20 colors in `CHAT_PALETTE`, or **Automatic**.
- A hand-picked color is permanent. It is never evicted and is never replaced by automatic assignment.
- **Automatic** removes the pick, and the chat goes back to its saved automatic color.
- Clash handling:
  - A hand-picked chat always wins the clash for its own color.
  - Other live chats that hold that color show a temporary color, using the same rules as today.
  - If two chats are hand-picked with the same color and both are live, the more recently picked one wins.
- Dormant hiding (`saropaChats.colorDormantMinutes`) applies to hand-picked colors as well.

## Design
- Storage: a separate globalState map (for example `saropaChats.chatColorPicks`, chat id → palette index), kept apart from the automatic map so that eviction and the 500-entry cap never touch it.
- `ColorBook.resolve()`:
  - Place hand-picked live chats first, ahead of established automatic chats.
  - Reserve their colors before any temporary choice is made.
- Command: `saropaChats.setChatColor`, registered in `package.json` under `contributes.commands` and `menus.webview/context` with `webviewSection == chat`.
- Picker: a QuickPick with a colored swatch per entry. The labels must be translation-ready.
- After a pick, re-post `chatColors` right away so the row updates without waiting for the next refresh.
- Dependency: the multi-window merge-on-write logic in `ColorBook` must cover the picks map too.

## Checks
- `check_activity.js`:
  - A pick wins a clash.
  - A pick survives eviction.
  - **Automatic** restores the automatic color.
  - Results do not depend on the order of `liveIds` when picks are present.
- `check_manifest.js`: the command and the context-menu entry are declared.

## Open questions
- Should picks follow a chat across machines through Settings Sync (`setKeysForSync`)?
- Should a custom color be allowed beyond the palette? Recommendation: no. The palette has contrast guarantees on both themes.
