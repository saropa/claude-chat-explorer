# Status dot inside the context ring

Chat rows showed the status dot at the left edge and the context ring in the middle of the right-hand meta group, so rings did not line up across rows and the ring fill carried no status. The dot now sits centered inside a fixed-width ring slot at the right end of every row, and the ring segment takes the dot's color while the dot is live.

## Changes

- `src/webviewCtx.ts`: `slotHtml(r)` renders a 16px `.rs` slot holding `ringHtml` then `dotHtml`, copying the dot's state classes (state, `m2`/`m3`, `cN-state`). Always rendered (dot-only or empty) so the column stays aligned. `.rs.<state> .rg .rf` tints the segment with `--k-<state>`; specificity beats `.rg.rw`/`.rg.re`, so live state wins over warn/error and idle keeps blue/amber/red. Ring SVG 13px to 16px, dot 6px inside it.
- `src/webviewLayout.ts`: `rcHtml` puts the slot last; open rows render only the slot. `.mt`/`.chips` indent 24px to 10px.
- `src/webviewRender.ts`: left dot and `.dot.none` placeholder removed from `hdHtml`.
- `src/dotCss.ts`: `.rs` color-slot rules, `ringAlt2`/`ringAlt3` keyframes mirroring the dot's multi-state cycle, `.noanim`/reduced-motion off switches for the ring. `.dot` and `.rs` rules are emitted separately because `check_dots` matches the `.dot` rules as exact text (a combined selector failed 3 assertions and blocked `vscode:prepublish`). A waiting dot inside the ring uses `dotBounceSm` (1px) since the ring hole leaves under 2px of clearance.
- `src/webviewCss.ts`: `--k-*` colors defined on `.dot,.rs`. Hover/focus hides `.rc>:not(.rs)` instead of all of `.rc`, so the dot and its tooltip stay reachable; `--rw` (22px) shifts `.ia` and the expand chevron left of the slot.
- `src/webviewExpandCss.ts`: `.r.open .hd .dot{margin-top:10px}` (left-dot leftover that pushed the slot dot onto the stroke) replaced by `.r.open .hd .rc{margin-top:6px}`; `.ex` left padding 23px to 9px to match the title edge.

## Verification

- `npm run compile`: clean.
- `check_dots`, `check_webview`, `check_activity`, `check_ring`: OK.
- `check_ring` extended: slot state classes and ring-before-dot order, multi-state classes, empty slot for undecorated rows, live-state tint rules, hover rule excludes the slot.
- `check_guards` fails on the package.json (0.49.0) vs CHANGELOG (1.0.0) version mismatch, pending the version bump.
- Visual rendering in the webview not verified.

## Finish Report addendum

### Part 1: hardening (commit 8679cce)

- Slot geometry has one source. `src/webviewCss.ts` defines `:root{--rs:16px;--rg:6px}`; `--rw` became `calc(var(--rs) + var(--rg))`. `src/webviewCtx.ts` sizes `.rs` and `.rg svg` with `--rs`; `src/webviewLayout.ts` sets `.rc{gap:var(--rg)}`. The hover actions (`.ia`) and chevron offsets follow any change to either value.
- Width tiers reviewed: `T.compact` only hides `.gi/.pj/.cp`, `T.xwide` re-grids `.rh` (not `.hd`), and the expand-card tiers have no `.rc`/`.rs` rules, so none depend on the old literals.
- Open rows: `.r.open .hd .rc{margin-top:calc((1lh + 2 * var(--tpy) - var(--rs)) / 2)}` replaces the fixed 6px. `--tpy:4px` is set on `.r.open .hd` and also drives the title padding, so the slot centers on the first title line at any editor font size.
- `check_ring` added to `vscode:prepublish` after `check_dots`; it now asserts the single `--rs`/`--rg` definitions, a derived `--rw` (no literal), `--rs` on the slot and ring svg, `--rg` on `.rc`, the `1lh` open-row offset, and its own presence in the prepublish chain.
- Leftover sweep: no `.hd .dot` / `.hd>.dot` rules remain in the sidebar CSS (openWork files excluded).

### Part 2: context popover (commit in this change)

- The ring slot of a row with context data is a button (`role="button"`, `tabindex="0"`, `data-a="ctx"`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-label`). A slot without a ring stays inert. Enter/Space go through the existing role=button keydown handler.
- Click dispatch: `data-a="ctx"` in `onClick` (`src/webviewJs.ts`) calls `ctxOpen`; the shared `stopPropagation` and early return keep the row from opening or expanding.
- Popover `#ctxp` (`src/webview.ts`) reuses the `.pop` box (`POP_CSS`, now included in the sidebar) and `makePop([]).place` for placement. The tooltip content rules in `TIP_CSS` also match `.tipc`, so the popover reads like the Context tooltip.
- Content (`ctxPopHtml` in `src/webviewCtx.ts`): the `tipCtx(r)` heading, then a horizontal token bar (tokens of `ringMax`, svg rect width attribute, no inline style), then the rest of `tipCtx` (used/window, model, compactions, lag and approximate notes), then a Resume button. Bar and ring share `ringCls` and the `--rc` color steps.
- Closing: Escape (capture phase, focus returns to the slot), a second click on the slot, a press outside, focus leaving, or a scroll. The popover follows re-renders through `ctxSync` in `render()` and closes when its row disappears.
- Compact: no mechanism exists to run `/compact` or send input to a Claude session (only resume/open, hand-over copy and resume-command copy), so no compact action was added. Resume reuses the existing `openId` path.
- Checks: `check_ring` asserts the slot button attributes, an inert slot without a ring, the bar (warning step, proportional width, text), every part of `tipCtx` in the popover, Resume present and no compact action, and no inline style. `check_webview` drives a slot click in the real page script: the popover opens with the bar and details, the row is not opened or expanded, and Escape closes it.

### Verification

- `npm run compile`: clean. `check_dots`, `check_ring`, `check_webview`, `check_activity`: OK after each part.
- Visual rendering (slot hover wash, popover placement and width, bar colors, open-row alignment at different font sizes) not verified in a running webview.

## Review fixes

Six review findings on the context popover were fixed:

- Placement: `place()` in `src/webviewPop.ts` takes an optional `flip` argument. The context popover passes it and opens above the slot when it does not fit below and more room exists above; header menus do not pass it and still open downward.
- Tooltip: `makeTip` accepts a `skip(el)` veto, checked in `show()`. The sidebar vetoes any element inside the open popover's own slot, so the ring and dot tooltips no longer cover the popover.
- Scroll: a scroll re-places the popover while the slot is inside the viewport and the results area, and closes it only when the slot has left the view (`ctxVisible`).
- Live update: the popover is a `.cxd` details container plus a static `.cxa` action row. `ctxSync` rewrites only `.cxd`, so the Resume button keeps its node and focus.
- Pinned rows: `renderPinned` now uses `patch()` like the main list. `ctxClose(true)` records the id, and the next `ctxSync` focuses the slot again if the render replaced it.
- Empty data: `ctxOpen` opens the popover with "No context data for this chat." instead of returning silently; `ctxSync` shows the same message if the data disappears while open.

Checks: `check_ring` runs the real `POP_JS`, `CTX_JS` and `CTX_POP_JS` against a fake DOM and asserts flip placement, default downward placement for page menus, scroll behavior (visible and out of view), node identity of the Resume button across a live update, focus restore and the empty-data message. `check_webview` asserts the tooltip veto and the empty-data message in the real page script.

Not verified: rendering in a running webview (actual flip geometry, scroll anchoring, pinned-row patch behavior with a focused slot).

## Hardening

Seven low-confidence items from the popover work were hardened with code changes and check assertions:

- Placement: `ctxFollow()` in `src/webviewCtx.ts` is the single follow step for scroll, window resize and a `ResizeObserver` on `#res` (when the engine has one). It re-places the popover while the slot is visible and closes it otherwise; the old resize handler re-placed under an out-of-view slot and never closed for a removed row. `place()` in `src/webviewPop.ts` sets `maxWidth` to the measured viewport width (`clientWidth`) minus both 8px margins before measuring, then clamps `left` into the margins.
- Stale anchors: `ctxVisible()` takes no node; it resolves the slot by chat id on every call and treats a detached node (`isConnected === false`) as gone. `ctxSync` sets `aria-expanded="true"` on the resolved slot after every render.
- Focus return: `ctxSync` focuses the re-rendered slot only when the render dropped focus (`ctxFocusLost`: no active element, body, or a detached node). Any `focusin` clears the pending id, and the id is cleared on every sync, also when the row is gone. Previously a pending id was honored on whichever render came next and could take focus from wherever the user had moved. `ctxSlot` searches the whole document, so pinned and main-list rows behave alike.
- Wrapped titles: `.r.open .hd` is `align-items:flex-start` and `.rc` holds only the slot, so the offset is one line box from the top whatever the line count. `@supports not (height:1lh)` sets `--tlh:1.25` as the open title's line height and computes the same offset in `em`.
- High contrast: under `body.vscode-high-contrast` and `body.vscode-high-contrast-light` the ring track is opaque and 1 unit wide in `--vscode-contrastBorder` (the fill stays 2.5, so the segment differs by width), the bar track is replaced by an outlined box, and the popover border, slot hover and focus ring use `--vscode-contrastBorder` / `--vscode-contrastActiveBorder`. `@media (forced-colors:active)` uses `CanvasText` and `Highlight` system colors; no new hex values.
- Accessibility: the slot button's `aria-label` is the dot's status words plus the context percent (for example "Running. Context 50% full: show details"); its ring and dot drop `role="img"` for `aria-hidden="true"`. An inert slot keeps the dot's `role="img"` name. `#ctxp` uses `aria-labelledby="ctxh"` and `tabindex="-1"`; the details heading and the empty-data message carry `id="ctxh"`. Opening focuses the first button, or the dialog itself when it has none.
- Tooltip veto control: the sidebar tooltip config is a named `tipCfg`. `check_webview` shows the same in-slot element through `makeTip` with `tipCfg` minus `skip` and asserts the tip appears. Removing `skip` from `tipCfg` fails the veto assertion, and keeping `skip` in the control fails the control assertion; both were run.

Checks: `check_ring` adds horizontal clamp cases (wide panel, left edge, 200px sidebar), window and results-area resize follow and close, a slot node replaced between events, a detached node, the three focus-return cases (replaced slot, focus moved elsewhere, row gone then back), dialog self-focus, the slot accessible name and aria-hidden children, and source assertions for the `lh` fallback, HC and forced-colors rules and hex usage. `check_webview` adds the dialog naming, the slot name in the real page, the tooltip positive control and empty-popover self-focus.

Not verified: rendering in a running webview (popover position in a narrow sidebar, ResizeObserver timing, HC and forced-colors appearance, screen-reader output of the slot name and dialog).
