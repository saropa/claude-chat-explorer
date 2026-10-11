# Issue Guide

How to file, investigate, and close bugs and feature requests in Saropa Chat Explorer (`claude-chat-explorer`, a TypeScript VS Code extension).

- One issue = one file under `bugs/`. Do not file only in chat or a downstream tracker.
- Feature requests are in scope. Use the proposal template.
- This guide holds process only. Never log a concrete bug or proposal here.

---

## File Naming

Lowercase with underscores. Check existing files first.

| Type | Pattern | Example |
|------|---------|---------|
| Scan / chat parsing | `scan_description.md` | `scan_skips_renamed_folder.md` |
| Search / results | `search_description.md` | `search_sort_ignores_status.md` |
| Open Work page | `openwork_description.md` | `openwork_row_missing_pr.md` |
| Pull requests / `gh` / git | `git_description.md` | `git_gh_not_signed_in_wrong_text.md` |
| Webview / UI | `view_description.md` | `view_escape_collapses_row.md` |
| File sessions / status bar | `filesessions_description.md` | `filesessions_count_stale.md` |
| Context warnings | `context_description.md` | `context_percent_wrong_model.md` |
| Export | `export_description.md` | `export_drops_tool_output.md` |
| Manifest / packaging | `pkg_description.md` | `pkg_command_missing_from_palette.md` |
| Documentation | `docs_description.md` | `docs_wrong_settings_key.md` |
| Feature proposal | `proposal_description.md` | `proposal_search_by_branch.md` |
| UX proposal | `proposal_ux_description.md` | `proposal_ux_row_inline_actions.md` |
| Setting proposal | `proposal_config_description.md` | `proposal_config_scan_depth.md` |
| Tooling / infra proposal | `proposal_infra_description.md` | `proposal_infra_vsix_size_check.md` |

---

## Confirm Attribution Before Filing

Confirm the issue is in this extension. It may be in VS Code, another extension, `gh`/git, or the user's chat data. Without grep evidence the fix agent wastes a round-trip or ships a fix in the wrong repo.

**Positive (required).** For every command, setting, or symbol in the report, paste:

```bash
grep -rn "claudeChatExplorer.<name>\|saropaChatExplorer.<name>" src/ package.json
```

- Expected: a handler in `src/` and a declaration in `package.json`.
- Zero matches: not ours. Do not file here.

**Negative (when a sibling Saropa extension may overlap).** Grep the sibling repo and paste the zero-match result. A match means file it there.

**Command attribution (git / `gh` bugs).** Confirm the failure is in how we invoke the tool (args, cwd, allow-list, timeout, cache), not in the tool or the repo state. Paste the exact command line and failure.

**Chat data attribution (scan / parse bugs).** Confirm the failure is in our reading of the file, not in a corrupt or unexpected Claude Code file. Paste the minimal record that triggers it, with private text removed.

**Host attribution (webview / status bar / quick pick).** Note the VS Code version. State whether it persists with other extensions disabled.

---

## Bug Report Template

````markdown
# BUG: Short, Specific Title

**Status: Open**

<!-- Open → Investigating → Fix Ready → Closed -->

Created: YYYY-MM-DD
Area: Scan / Search / Open Work / Git / View / File Sessions / Context / Export / Packaging / Docs
File(s): `src/...` (line ~NNN)
Severity: Critical / High / Medium / Low
Extension version: x.y.z

---

## Summary

What happens. What should happen.

---

## Attribution Evidence

```bash
grep -rn "claudeChatExplorer.<name>" src/ package.json
```

**Handler:** `src/<file>.ts:NN`
**Manifest declaration:** `package.json` (`contributes.commands` / `configuration`)
**Command line (git / gh bugs):** `<command>` (cwd: `...`)
**VS Code version / OS:** `...`

---

## Reproducer

Smallest steps that trigger it. The most important section.

1. ...
2. Observe: ...

**Frequency:** Always / Specific data only / Intermittent / Platform-specific

---

## Expected vs Actual

| | Behavior |
|---|---|
| **Expected** | ... |
| **Actual** | ... |

---

## Flow Context

Name the functions on the path and mark the failure.

```
<command or message handler> (src/extension.ts)
  └─ scan / search (src/scan.ts)
      └─ render (src/webview.ts)   ← failure here
```

---

## Root Cause

Fill in during investigation. Name the branch or condition that is wrong, with file and line.

---

## Suggested Fix

File, line, and the change.

---

## Changes Made

Fill in when the fix is written.

**Before:**
```ts
old
```

**After:**
```ts
new
```

---

## Verification

- [ ] `npm run compile` clean
- [ ] Check scripts pass (see Fix Requirements)
- [ ] Original steps reproduced in the Extension Development Host and now correct

---

## Commits

- `abcdef0` fix: description

---

## Environment

- Extension version:
- VS Code version:
- OS:
````

---

## Feature Request Template

````markdown
# PROPOSAL: Short, Specific Title

**Status: Open**

<!-- Open → Accepted → In Progress → Closed (or Declined, with rationale in Decision) -->

Created: YYYY-MM-DD
Type: New command / UX improvement / Configuration / Tooling
Related area: Scan / Search / Open Work / Git / View / File Sessions / Context / Export

---

## Summary

What it does. Why it matters.

---

## Motivation

Concrete workflow examples. Link VS Code API docs if relevant.

---

## Behavior

**Current:** what happens today, or "not available".
**Proposed:** what happens after it ships. For a setting: key, type, default, scope.

---

## Edge Cases

1. **Case** — expected behavior / needs decision

---

## Alternatives Considered

Other approaches. Why this one.

---

## Decision

Fill in when accepted or declined.

---

## Implementation Notes

Fill in when work begins: files, existing utilities, related commands.

---

## Commits

- `abcdef0` feat: description
````

Evaluation criteria for proposals:

- Solves a real workflow pain.
- Does not overlap an existing command (check `package.json` contributes and `plans/`).
- The VS Code API supports the interaction.
- Matches existing surfaces.

---

## Good Report Rules

- **Title:** specific. "Open Work row hides PR when fork owner differs" beats "PRs broken". Slug and title agree.
- **Reproducer:** minimal. Include the setting values, repo layout, or chat record the bug depends on. Name OS and shell for platform bugs.
- **Flow:** trace handler → data layer → render. Name where behavior diverges.
- **Root cause:** state the mechanism, with file and line in `src/`.

---

## Investigation Focus by Area

| Area | Check |
|------|-------|
| Scan / parse | Does the scan read every chat folder? Are partial, huge, or malformed records skipped without dropping the rest? Are "not fully scanned" states reported, never shown as "all clear"? |
| Search | Are query, sort, status filter, and `maxResults` applied in the right order? Is the result count correct? |
| Open Work | Does a row land in the right group? Do unknown facts leave a row where it is? Is state kept across refresh? |
| Git / `gh` | Is the command on the read-only allow-list? Is the cwd right? Is the timeout, slot limit, and cache (e.g. 60 s auth, 5 min not-GitHub) respected? Are Windows `& \| < > ( )` in paths refused rather than run? Is "unknown" shown with the reason instead of "no PR"? |
| Webview | Does a posted message reach the host handler and round-trip back? Is the CSP/nonce valid? Do Escape and keys act on the top-most layer only? Are expand, sort, and filter state kept on refresh? |
| File sessions | Does the status bar count match the sessions list? Does `showFileSessionsStatusBar` gate it? |
| Context warnings | Is the percent computed against the right context window? Does `contextWarnings` gate it? |
| Export | Is every message type exported? Is private text handled as documented? |
| Packaging | Is the command declared in `package.json` and registered in `src/extension.ts`? Does `when` match the `contextValue` set in code? Is the file in the VSIX? Does `scripts/check_manifest.js` pass? |
| Docs | Does the documented key or command id match `package.json`? Does the text match current code? |

---

## Investigation Checklist

- [ ] Positive attribution grep pasted. Zero matches = do not file here.
- [ ] Command or chat-data attribution done (git / `gh` / scan bugs).
- [ ] Host attribution done (UI bugs).
- [ ] Minimal reproducer written.
- [ ] Handler found in `src/` and flow traced.
- [ ] `package.json` matches code (ids, `when`, `contextValue`, setting keys).
- [ ] Checked on Windows and POSIX when paths, quoting, or shells are involved.
- [ ] `npm run compile` clean.

---

## Common Pitfalls

| Pitfall | Correct pattern |
|---------|-----------------|
| Filing without the positive grep | Grep first. Zero matches = not ours. |
| Blaming the extension for a `gh`/git or repo-state failure | Confirm our command line is right. If so, it is not our bug. |
| Showing a result when part of the scan was unread | Require the whole scan to finish. Otherwise say "some parts were not read". |
| Treating unknown facts as known (e.g. unloaded checks, failed PR lookup) | Unknown never moves a row. Show "unknown" plus the reason. |
| Command id / setting key drift | `package.json` is the source of truth. Match ids exactly. |
| `contextValue` / `when` mismatch | Align the `viewItem` regex with the `contextValue` in code. |
| Unquoted or shell-built command strings | Pass args as arrays. Refuse unsafe characters. |
| Webview state lost on refresh | Re-apply expand, sort, filter, and search state after render. |
| Silent action with no feedback | Show a message or a visible view change. |
| Uncached repeated `gh`/git calls | Cache results (including negative ones) and respect slot limits. |

---

## Fix Requirements

A bug closes only when all of these hold.

**Code**
- [ ] Fix addresses the root cause, not the symptom.
- [ ] A comment says what was wrong and why the new code is correct.
- [ ] American English throughout.

**Verification**
- [ ] `npm run compile` has no errors.
- [ ] The check scripts pass: `node scripts/check_manifest.js`, `check_webview.js`, `check_openwork.js`, `check_scan.js`, `check_prs.js`, `check_prs_e2e.js`, `check_guards.js`. (`vscode:prepublish` runs all of them.)
- [ ] Original steps reproduced in the Extension Development Host and now correct.
- [ ] A check script covers the case when the area has one.

**Documentation**
- [ ] `CHANGELOG.md` updated under `## Unreleased` as `- Fixed: ...` for any user-visible change.
- [ ] Issue file updated with root cause, changes, and commit hashes.
- [ ] Status set to `Closed`.

---

## Lifecycle

**Bugs:** `Open` → `Investigating` (root cause being filled in) → `Fix Ready` (written, verified, awaiting commit) → `Closed` (merged and verified).

**Proposals:** `Open` → `Accepted` → `In Progress` → `Closed`. `Open` → `Declined` is allowed, with rationale in Decision.

### Moving to history

On close or decline, move the file to `plans/done/`, named with the close date:

```
bugs/scan_skips_renamed_folder.md
  → plans/done/YYYYMMDD_scan_skips_renamed_folder_done.md
```

Grep and repoint any `bugs/<file>.md` reference (CHANGELOG, plans, other issues) in the same commit.

---

## Severity

| Severity | Meaning | Example |
|----------|---------|---------|
| Critical | Data loss or crash that blocks normal use | Activation throws; scan corrupts state |
| High | Core feature broken on a common path | Search returns nothing; Open Work shows "All clear" with unread parts |
| Medium | Broken in a specific case | Fork PR hidden; Windows path refused wrongly |
| Low | Cosmetic or rare | Label casing; tooltip typo |

---

## Linking

- Commits: `fix: description (area_description)` or `feat: description (proposal_description)`.
- Plans and changelog: `[issue](bugs/scan_skips_renamed_folder.md)`.
- Related history: `Related: plans/done/YYYYMMDD_filename_done.md`.
