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
