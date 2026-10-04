# Expanded row redesign (Saropa Chat Search)

Presentation only. Every existing field and behavior stays. Prototype: `20261004_expanded_row_prototype.html` (`?s=a..g`, `&t=light`).

## Hierarchy and block order
- Primary: title, meta pills, Resume. Secondary: matching messages, stats, tags. Tertiary: matched files and commands, Git, related chats.
- Head: dot, title, status pill (Huge, Active...), chevron. Meta line: [project] [N hits] [count] [time]. Hover icons pin and archive stay on closed rows only.
- Expanded block order: 1 action bar, 2 matching messages (query only), 3 matched files, matched commands, 4 stats grid, 5 tags, 6 Git, 7 related chats.
- Over 900 px: two columns. Left (min 260 px, 1fr): stats, tags, Git. Right (2fr): messages, files, commands, related. Action bar spans both.

## Single-source table (each fact shown once)
| Fact | Only place | Not repeated in |
|---|---|---|
| Message count | count pill [94] | stats grid, head, tooltips text |
| Last active time | time pill [6 hrs] | head right side (`.hd>.tm` removed) |
| Hit count | hits pill [12 hits] | "Matching messages" header (no count), head `.hp` |
| Duration | stats "Active for 2d 2h" | anywhere else |
| Status | dot + status pill in head | expanded block |
| Pinned | action bar "Pinned" (open); head star (closed) | head star hidden when open |
| Tags | Tags block (open); head chips (closed) | head chips hidden when open |
| Git count and items | Git section (open); head git icon (closed) | head git icon hidden when open |
| Project folder | meta line `.pj` (All projects on) | head |
| Head snippet, "matched in subagent" | closed row only | hidden when open; messages show them |
| Subagent type | "Subagent · Explore" pill on each message | no separate "Subagent" role word |
| Related chat facts | its own dot, title, shared files, time pill | never the parent's facts |

## Meta pills
- Style: existing `.pill` look (badge background and foreground), 11 px, line-height 16 px, gap 4 px, tabular numbers.
- Hits pill uses `--vscode-editor-findMatchHighlightBackground` with foreground text.
- Time units: under 1 min "now"; minutes "1 min", "3 mins"; under 24 h "1 hr", "6 hrs"; under 7 d "1 day", "2 days"; under 30 d "1 wk", "3 wks"; under 365 d "1 mo", "4 mos"; else "1 yr", "2 yrs".
| Pill | Text | Tooltip | aria-label |
|---|---|---|---|
| Count | 94 | 94 messages | 94 messages |
| Time | 6 hrs | 6 hours ago + newline + Oct 4, 2026, 2:00 AM | active 6 hours ago |
| Hits | 12 hits | 12 matching messages | 12 matching messages |
- Pills are `role="img"`. Under 260 px only the time pill shows (and hits when a query runs).

## Spacing and type (em of `--vscode-font-size`)
- Scale: 2, 4, 8, 12 px. Blocks 12 px apart. Body inset: 23 px left (aligns with title text), 8 px right, 10 px bottom.
- Section headers (`.xh`): 0.85em, weight 600, `descriptionForeground`, sentence case, 12 px chevron hung in the gutter, plain count at weight 400.
- Stat label 0.82em `descriptionForeground`; value 1em `foreground`. Message role 0.85em weight 600. Snippet 1em `descriptionForeground`, line-height 1.4, clamp 3 lines.
- Lines: "+929" `charts-green`, "−155" `charts-red`, aria-label "929 lines added, 155 removed".

## Separation
- Open row is a card: 1 px `widget-border`, radius 4 px, margin 4 px sides, 6 px below, background `color-mix(foreground 4%, transparent)`.
- No left rule. No uppercase inside the card.

## Action bar (`role="toolbar"`, label "Chat actions")
- Resume: only filled button (`button-background`, `button-foreground`). Calls `openId`.
- Quiet buttons (transparent, `toolbar-hoverBackground` on hover): Pin or Pinned (`aria-pressed`), Archive or Unarchive, Mark read (only when the dot is unread). Copy ID sits right-aligned.
- 260 to 520 px: Mark read and Copy ID are icon-only. Under 260 px: all secondary icon-only, Copy ID hidden (stays in the right-click menu).

## Stats grid (`<dl class="xs">`)
- Cells: Active for, Files edited, Size, Cost, Lines; Models spans the row. Columns auto-fill at min 6.5em; two fixed columns in the over-900 left column.
- Hidden when zero or unknown: Active for (first = last), Files edited (0), Cost (0), Lines (both 0), Models (none). Size always shows.
- Under 260 px: one column, label left, value right.

## Tags
- Chips with "×" (existing `chip`, `cx`, `data-a=tag/untag`). Last item: dashed "+ Add tag" pill button.
- Click swaps it for an input (placeholder "Tag name", datalist `tl`, max 40). Enter adds and keeps the input open; Escape or blur with empty value restores the button and refocuses it. Hint "Enter to add · Esc to cancel" over 260 px.

## Matching messages
- Header "Matching messages" (collapsible, no count). Each item: role (You or Claude) or the Subagent pill, right-aligned time (same unit words, tooltip absolute), snippet with `<mark>`. 1 px divider between items.
- "Show N more" is a link-colored text button; loads the next 20.

## Git
- Header "Git" + count. PR pills and commit pills wrap on one flow (no line per pill). Commit pill: monospace sha + "on branch" at 75% opacity. "+N more" muted text.

## Related chats
- Header "Related chats" + plain count. Row: dot, title (ellipsis), "3 shared files" muted, time pill. Under 260 px the shared-files text hides; aria-label keeps it.
- aria-label: "Home tab today section layout, 3 shared files, active 6 hours ago. Resume". Empty: header without count, text "No other chat touched the same files".

## Width tiers
| Width | Rules |
|---|---|
| under 260 | time pill only; icon-only secondary actions, no Copy ID; stats one column; no shared-files text; body inset 9 px |
| 260 to 520 | all pills; Mark read and Copy ID icon-only; stats auto-fill (3 columns at 330) |
| over 520 | all labels shown; stats auto-fill, Models spans 2 |
| over 900 | two-column body as above |

## Truncation
- Titles: one line, ellipsis, full title in tooltip. Snippets: 3-line clamp. Pills never wrap. Chips and Git pills wrap as a flow; one pill truncates with ellipsis at full width. File chips truncate; full path in tooltip.

## Keyboard and screen reader
- Focus order: row, chevron (`aria-expanded`), action buttons, section headers, messages "Show more", tag chips and their ×, Add tag, Git pills, related rows.
- Expanded body: `role="region"`, `aria-label="Details: <title>"`. Section headers `role="button"` with `aria-expanded`. Up and Down keep stepping rows, headers and related rows (`step()`).
- Visible focus: 1 px `focusBorder` outline on every control.

## Code and CSS changes (committed source b30ec39)
- `src/webviewLayout.ts`: `metaHtml` builds pills; add `agoShort` and pill tooltips; drop `.hp` and the wide `.mt{display:none}` and `.hd>.tm` rules; tier rules above.
- `src/webviewRender.ts`: `rowHtml` (no `.tm`, open-row hides), `exHtml` (action bar, `dl.xs`, tags block, order), `msgHtml`, `relHtml`, `sec()` class `xh` inside `.ex`, `chips`.
- `src/webviewCss.ts`: replace `.ex`, `.stat`, `.tgs`, `.tin`, `.ex .sl`, `.mm`, `.who`, `.ex .cap`; add `.r.open`, `.xa`, `.xb`, `.xs`, `.xt`, `.xadd`, `.xin`, `.xh`, `.xc`, `.mp`, `.sh`.
- `src/webviewGit.ts`: `gitHtml` and `gitPill` emit one `.gps` flow; `.gr` removed; `.gp.cm` style.
- `src/webviewJs.ts`: `onClick` handles `resume`, `copyid`, `read`, `addtag`; `.tin` keydown handles Escape.
- `src/extension.ts`: new `copyId` message (clipboard write of the session id); `read` reuses the Mark as Read handler.
- `src/group.ts`: `statsText` unchanged (row tooltip); `durText` feeds "Active for".

## Rationale
The card boundary tells the eye where one chat ends. Resume is the single filled control, so the next step is obvious. Every number carries a label or a tooltip and appears once, so nothing has to be decoded or reconciled. Blocks follow the order of the question being asked: what matched, what it cost, how it is filed, where it went. Quiet sentence-case headers and muted labels keep values in the foreground color, so values are what the eye reads first.
