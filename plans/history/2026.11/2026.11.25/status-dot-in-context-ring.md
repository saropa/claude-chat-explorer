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
