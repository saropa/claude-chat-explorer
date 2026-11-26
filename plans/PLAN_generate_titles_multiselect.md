# Plan: Generate titles for selected sessions

Status: Not started (design only).

## Goal
Let a user name several chosen sessions in one action instead of right-clicking each row or running the bulk command over everything.

## Behavior
- Ctrl+click (Cmd+click on macOS) a session row to add it to or remove it from the selection. Shift+click selects the range from the last clicked row.
- A plain click keeps today's behavior: it opens or expands the row and clears the selection.
- Selected rows show a selected style using theme tokens (`--vscode-list-activeSelectionBackground`, `--vscode-list-activeSelectionForeground`; `--vscode-list-inactiveSelectionBackground` when the panel loses focus).
- Escape clears the selection. A new search or a filter change clears it too, because the rows it named may no longer be listed.
- Right-click a selected row, then **Generate Title**: it runs on every selected row. Right-click an unselected row: it runs on that row only, as today.
- One cancellable progress notification covers the whole run, showing "n of N". It ends with a summary: "Generated N titles, skipped M" with the reasons grouped (open in a chat tab, changed in the last 5 minutes, file not found).
- Cancel stops after the current session. The summary counts only the sessions handled before cancel.

## Design
- Selection state lives in the page script, as a Set of row ids. The page does not keep it across reloads.
- Accessibility:
  - The list gets `aria-multiselectable="true"`, and each row gets `aria-selected`.
  - Space toggles the focused row and Shift+Arrow extends the range, matching the existing row keyboard handling.
- Context menu: VS Code passes the row's `data-vscode-context` to the command. The page also posts the current selection (`{ type: 'selection', ids }`) on every change. The host keeps the latest copy, and `saropaChats.generateTitle` uses it when the right-clicked id is in it.
- `generateTitleFor(id)` stays the single-session worker. A new `generateTitlesFor(ids)` loops over it inside one `withProgress`, collects the results, and shows one summary message. All strings go through `vscode.l10n.t`.
- Limit: cap a run at 50 sessions, the same order of cost as one bulk run. Above the cap, show a confirm that states the count.

## Checks
- `check_activity_page.js` (page harness):
  - Ctrl+click toggles `aria-selected`.
  - Shift+click selects the range.
  - Escape and a new search clear the selection.
  - A plain click clears it and still opens the row.
- `check_activity.js` (host):
  - A selection of three runs three generations under one progress.
  - A right-click outside the selection runs one.
  - Skip reasons are grouped in the summary.

## Out of scope
- Multi-select for the other row commands (Archive, Pin, Mark as Read). The selection model allows it later; each command needs its own summary wording.
