# BUG: README screenshot shows the old name and old layout

**Status: Closed**

<!-- Open → Investigating → Fix Ready → Closed -->

Created: 2026-11-20
Area: Docs
File(s): `README.md` (line 7), `images/sidebar_session_manager_and_activity_panel.png`
Severity: Low
Extension version: 0.47.0

---

## Summary

The README screenshot still shows "Saropa Chat Explorer" in two headers (container title and view header) after the rename to "Saropa Chats". It also shows the old layout: "Session Manager" as a collapsible section inside the Saropa pane, with no "New session" or "Clean up" buttons. Needs a new screenshot.

Also wanted: a GIF of the Activity panel animating (nodes lighting up as Claude works), in addition to the still image. A still cannot show the live behavior the README describes.

---

## Attribution Evidence

```bash
grep -rn "sidebar_session_manager_and_activity_panel" README.md
```

**Reference:** `README.md:7` (image URL points at `https://github.com/saropa/claude-chat-explorer/raw/main/images/...`)
**Manifest declaration:** not applicable (docs only)

---

## Reproducer

1. Open `images/sidebar_session_manager_and_activity_panel.png`.
2. Observe: headers read "Saropa Chat Explorer"; layout predates the separate Session Manager pane and the New session / Clean up buttons.

**Frequency:** Always

---

## Expected vs Actual

| | Behavior |
|---|---|
| **Expected** | Screenshot shows "Saropa Chats" and the current layout. README also embeds a GIF of the Activity panel animating. |
| **Actual** | Screenshot shows "Saropa Chat Explorer" and the old layout. No GIF. |

---

## Flow Context

```
README.md:7 (image link)
  └─ images/sidebar_session_manager_and_activity_panel.png   ← outdated
```

---

## Root Cause

The rename (display name to "Saropa Chats") changed text only. Binary images are not covered by a text replace.

---

## Suggested Fix

1. Reload the Extension Development Host with the renamed build and retake the sidebar screenshot (Session Manager pane with New session / Clean up buttons, Activity pane below).
2. Record a short GIF of the Activity panel while a session runs: nodes flash and fade (Chat, Files, Terminal, Agents, Web, and so on) and the "Running: ..." line updates. Save to `images/activity_panel.gif`; keep it small enough for the VSIX and README.
3. Embed both in `README.md` and add a CHANGELOG line.

---

## Changes Made

- Step 2 done: `images/activity_panel.gif` (887 KB) embedded in `README.md` below the still; CHANGELOG line added.
- Steps 1 and 3 done: `images/sidebar_session_manager_and_activity_panel.png` replaced with a new capture (Saropa Chats header, Session Manager pane with New session / Clean up, Activity pane). Same filename, so `README.md:7` is unchanged. CHANGELOG line added.

---

## Verification

- [x] Screenshot shows "Saropa Chats" in every header
- [x] GIF shows the Activity panel animating
- [x] README renders both images on GitHub (both raw URLs return 200; PNG is the new 112,705-byte capture)

---

## Environment

- Extension version: 0.47.0
- VS Code version: unverified
- OS: Windows 11
