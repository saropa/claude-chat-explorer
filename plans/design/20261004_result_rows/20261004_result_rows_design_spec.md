# Result rows and tooltips redesign (Saropa Chat Search)

Source read: committed HEAD ecf8507. Prototype: `20261004_result_rows_prototype.html` (`?s=a..f|t1..t5&w=330&t=light`). The approved expanded card stays, minus its "Matching messages" block (moved, see Ownership).

## Core rule
- One chat = one compact row. It shows only the LATEST match: the newest matching message by timestamp, across the chat and all its subagents.
- All other matches sit behind a "+N more" expander under the snippet. No nested subagent rows (`subRow`, `subsHtml`, `.msub` go).
- One match: no expander. No snippet (tag-only query): no line 3; the active tag chip shows why it matched.

## Anatomy at 330 px
| Line | Content |
|---|---|
| 1 | dot, title (ellipsis), status pill, hover icons [tag slot][archive][pin], chevron LAST (always visible, never shifts) |
| 2 | [25 hits] [53 mins] plus a subagent pill [↳ general-purpose] when the latest match came from a subagent. Count pill [212] shows over 520 px only during a search |
| 3 | latest-match snippet, 2-line clamp, highlight inside the first 24 characters (LEAD 16 + ellipsis) |
| 4 | "› +3 more" quiet pill button (only when more matches exist) |
- The subagent pill sits on line 2: before the snippet it would push the highlight past 24 characters. Pill: purple 1 px border (`charts-purple` 55%), transparent fill, glyph ↳ + agent type. Under 260 px glyph only.

## Time pill decision
- During a search the time pill shows the LATEST MATCH time. The owner hunts recent matches; a "1 min" pill on a chat whose match is 2 days old misleads.
- Day groups and the Time sort key on the same value during a search (`snipAt`, fallback `last`). No search: unchanged (last active).
- Chat last active moves to the pill tooltip and to a "Last active" cell in the card stats (search only). The right-aligned "6h" stays removed.

## Single-source table
| Fact | Only visible place |
|---|---|
| Hit count (occurrences) | hits pill |
| Matching message count | hits pill tooltip; expander shows N = count − 1 (hidden ones) |
| Latest match time | time pill |
| Latest match source | subagent pill (subagent) or snippet tooltip (You or Claude) |
| Other matches | the "+N more" list (no longer in the card) |
| Each other match's time and source | its list item |
| Duplicate text | one list item with "×3"; duplicates of the latest read "Same text as the latest match" |

## Controls: two, with separate jobs
- Chevron (line 1): details card, unchanged. Both may be open: head, meta, snippet, expander, list, card. The snippet stays visible when the card opens.
- "+N more" (line 4): matches list. Cheap, no card. Considered one control: rejected, because seeing matches would pay for Git, related and stats.

## Expanded matches list
- Newest first, the latest match excluded. Item: [You | Claude | ↳ type] [subagent description, ellipsis] [×N] [time pill], then a 2-line snippet.
- At 520 px and under, the subagent pill is glyph only, so the description gets the width.
- Duplicates: key = snippet without leading "…", whitespace collapsed, first 96 chars. Grouped at the newest member. Tooltip lists every member's source and time.
- Page of 20 (`EXPAND_PAGE`), link "Show 12 more". Click an item: resumes the chat. Left guide 1 px `widget-border`.

## Data per row
| Field | Status | Source |
|---|---|---|
| hits, last, msgs, title, snippet, ranges, self, subTotal, subs | existing | `Result` |
| `snipAt` latest-match timestamp | NEW | `Rec.ts[b.msg]` in `scanBody` (already loaded) |
| `snipSub`, `snipDesc` (agent type, description) | NEW | the subagent `Chat` whose hit is newest |
| `snipRole` (user or assistant) | NEW | `Rec.roles[b.msg]` |
| `mc` matching message count, own + all subagents | NEW | distinct message count in `scanBody` |
| `ExpandItem.desc` subagent description | NEW | `Chat.desc` in `expandChat` |
| expand request `lite: true` (skip related, Git, files) | NEW | `worker.expand` |
| duplicate key | none | computed in the webview |
- No index format bump. Every new value is computed at search time from records the search already reads. `store.ts`, `record.ts` and `index.ts` stay untouched.
- `toResult` picks own or subagent hit by `at`, not "own first". `subs` stays in the batch; the row no longer renders it.

## Performance
- The row renders from batch fields only. It never reads record text.
- First "+N more" sends `expand` with `offset 0, lite: true`, shows "Loading…", caches in `ex[id]`. A later card open sends the full expand and keeps cached items.

## Keyboard and screen reader
- Row `tabindex=0`; Enter resumes (unchanged). ArrowRight opens matches, ArrowLeft closes. Up and Down still step rows and headers.
- Tab order in a row: archive, pin, chevron, expander, list "Show more".
- Expander: `<button aria-expanded aria-controls="ml-<id>">`, label "Show 3 more matching messages" / "Hide…". Open text "Show less".
- List: `<ul aria-label="Other matches in <title>">`, items `<li>`. Escape inside the list closes it and focuses the expander.

## Width tiers
| Width | Rules |
|---|---|
| under 260 | archived rows, cap notice unchanged everywhere; no status pill; subagent pill glyph only; snippet 1 line; list items 1-line snippet, no description |
| 260 to 520 | as above anatomy; list subagent pill glyph only |
| over 520 | count pill returns; list shows agent type |
| over 900 | head and pills in column 1; snippet, expander and list in column 2 (`.sx` wrapper) |
- Theme variables only (light and dark from VS Code). Spacing 2, 4, 8 px; type in em of `--vscode-font-size`: snippet 0.92em/1.4, expander 0.85em, list snippet 0.9em, pills 11 px (existing).

## Tooltips: audit (committed source)
| Element | Text today | Length |
|---|---|---|
| Whole row (`rowHtml` tip) | title, project, hits, date, `statsText` | 150 to 260, LONG |
| Subagent row | type, description, "Resumes the parent chat", date | 90 to 140, LONG (row removed) |
| File chip | "Edited: " + full path | up to 250, LONG |
| Dot unread | "Unread, open elsewhere: finished while you were away (approximate)" | 66, LONG |
| Related row | title + date | 60 to 120, LONG |
| Archive Import | "Import the archived chats list…" | 67 |
| Status pill, git icon, time pill, Copy ID | short facts | 20 to 55 |
| Hits pill | "12 matching messages" | wrong: value counts occurrences |
| Header toggles, filters | "Match Case (Alt+C)" etc. | under 50, stay native |

## Tooltips: design (new `src/webviewTip.ts`)
- One `#tip` element, `role="tooltip"`, `pointer-events:none`. Delegated `mouseover`, `mouseout`, `focusin`, `focusout`, `keydown`, `scroll`, `pointerdown` on `document`. No per-row listeners.
- `data-tip="k:<kind>"` builds content at show time from the row's result data; `data-tip="<text>"` for static labels. Nothing is built when unused.
- Show after 400 ms hover; at once on `:focus-visible` or within 300 ms of the last hide. Hide on Escape, mouse leave, blur, scroll, pointer down. Never takes focus.
- Width: min(280 px, 90% of panel). Below the target, 6 px gap; flips above when it would cross the bottom; shifts left or right to stay 4 px inside.
- Layout: bold first line, `dl` label/value rows, muted notes, optional quoted snippet with `<mark>`. Text capped at 600 chars + "…" + note.
- Colors: `editorHoverWidget-background`, `-foreground`, `-border`, `widget-shadow`. Essential facts never live only in a tooltip; it adds exact dates, full text, breakdowns.
- `aria-describedby="tip"` on the target while shown; `aria-label` stays the short name. Kinds: dot, status, title (full title + stats + project + date), hits, time, snippet (source, exact time, full snippet), subagent pill, list item, duplicate group, file chip, related row.

## Code to change
- `types.ts`, `match.ts` (`Hit.at`, `Hit.mc`, `Hit.role`), `search.ts` (`toResult`, `itemOf`, `expandChat` lite), `worker.ts`, `extension.ts` (pass `lite`).
- `webviewRender.ts`: `rowHtml` (chevron last, `.sx`, expander, no row title), new `mlHtml`/`miHtml`, `groupsHtml`/`ordered` key on `snipAt` in a search; drop `subRow`, `subsHtml`, `subPill` title; `fileChip`, `chips`, `dotHtml` to `data-tip`.
- `webviewLayout.ts`: `metaHtml`, `timePill`, tiers. `webviewExpand.ts`: drop `msgsHtml` from `exHtml`; `relHtml`, `xbtn`, `msgHtml` to `data-tip`; "Last active" stat.
- `webviewGit.ts` (`pillHtml`, `gitIcon`, `gitPill`), `webviewArchive.ts` (pill tip): `title=` to `data-tip`.
- `webviewJs.ts`: `mx` toggle, `more` paging, ArrowRight/Left, `expanded` merge for `lite`. `webview.ts`: add `#tip`, include `TIP_CSS`, `TIP_JS`.
- CSS: remove `.sr`, `.msub`, `.mm`, `.mmh`, `.r.open .rh>.s` hide; add `.sx`, `.mx`, `.ml`, `.mi`, `.mih`, `.mib`, `.sa`, `.x`, `#tip`.

## Rationale
The list was hard to scan because every chat printed every source, and the same path repeated four times. One latest match per chat makes the list a list of chats again, ordered by when the match happened. The rest is one quiet click away, grouped so repeated text shows once. The subagent pill moves to the pill line, so the highlight keeps its fixed place in the snippet. A custom tooltip gives long facts room and structure instead of a cut-off line.
