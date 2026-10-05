# Open Work view: design

Repo: `claude-chat-search` (Saropa Chat Explorer), main at 0.21.0.
Status: design, not built. Two owner questions are at the end (section 8).

Tags used below:
- **[V]** = verified by reading the code (file:line).
- **[I]** = inferred, not checked in code.

---

## 0. What existed before (recovered from git)

The 0.14.0 to 0.16.0 builds had a second activity-bar icon with two trees. 0.17.0 (commit `2168851`) removed both. [V]

**Work in Progress tree** (files `wipUi.ts`, `wipNodes.ts`, `wipModel.ts`, `wipCollect.ts`, `wipSummary.ts`, `wipTree.ts` at `882aeee`):

| Part | What it did |
|---|---|
| Scope | Chats active in the last `workInProgressDays` (default 7, 1-60) plus live chats, minus archived. Worker request `wipChats`, capped at 2000 chats, 5 PR numbers each. |
| Collector | `collect()`: distinct folders (max 60, newest first) -> `probe` each -> `status` once per distinct worktree top -> `worktree list` once per repository -> `gh pr list` once per repository (5 min cache). Pool of 4. git 5 s, gh 15 s. |
| Pending rule | Uncommitted files, or commits ahead, or an open PR on the branch, or a linked PR, or a live session. |
| Group by chat (default) | Row: title, `branch · state` (running / waiting / unread / age), colored dot. Children: Folder (`repo/worktree`, "main checkout" or "worktree"), "N files not checked in" (first 20 files, "... N more"), "N commits not pushed" / "behind N", `PR #n title (draft, review requested)`, "linked PR #n", "Open chat". |
| Group by worktree | Row per worktree: `repo/folder`, `branch · N files · N ahead`. Children: files, commits, PR, then the chats that used it. Tail: "Branches without a worktree" per repo (ahead or upstream gone). |
| Toolbar | Refresh, Copy Summary (one plain-text line per row), Group by Chat, Group by Worktree, Show Clean Chats. |
| Badge | Count of pending chats on the view icon. |
| Notes | "Git not found...", "Open PRs unavailable: <reason>", "N more not scanned", "Could not scan. Retry." |
| Welcome | "Nothing in progress. Chats with uncommitted files, unpushed commits, open PRs or a running session appear here." |
| Refresh | On show when never scanned or older than 60 s; a change while hidden waits for the next show; 10 s after a chat stops running; never on a timer while hidden. |

**Git Activity tree** (`gitTree.ts`): repos -> open PRs, branches -> commits, each linked to the chat that made them. Not needed for close-out.

What survives today [V]:
- `wipGit.ts` (read-only `git` allowlist at :10, `probe`, `statusOf`, `repoOf`, `trackOf`, `unpushedOf`), `wipPrs.ts` (`PrCache`, 5 min, fields `number,title,headRefName,isDraft,reviewDecision,url` at :6), `wipExec.ts` (`realExec` with hard timeout and kill, `pool`), `wipParse.ts` (`parseRefs` for ahead/gone branches at :63 is still there but unused).
- `gitLive.ts` (per-card part loads, 10 s deadline, one load per folder+part).
- `cardCounts.ts` (cheap counts, 30 s cache).
- `wipChats.ts` now only has `chatCwd`. `wipCollect.ts` and the `wipChats` worker request are gone.

---

## 1. Purpose

**Who:** a developer running several chats across repos and worktrees.

**Job:** one screen that answers "what is still open, and what do I do to close it?"

**Unit:** one card per chat. A chat is "closed" when every line below is clear.

| Close-out item | Clear when | Source |
|---|---|---|
| Chat needs you | Not waiting, not unread | dots [V `liveState.ts:64`] |
| Chat still running | Not running | dots |
| Uncommitted files | 0 in the chat's worktree | `statusOf` |
| Unpushed commits | 0 ahead, or no upstream with nothing to push | `trackOf` / `unpushedOf` |
| Branch upstream gone | Not gone (gone = remote branch deleted, local left over) | `trackOf` |
| Open PR | No open PR on the branch | `PrCache` |
| Leftover worktree | No linked worktree that is clean, pushed, merged and unused | `repoOf` + new merged check |
| Finished chat not archived | Archived, or still has work | store + facts |

**Ranked attention bands** (top to bottom; inside a band, newest first):

1. **Needs you** — waiting for input, or unread.
2. **To finish** — idle chat with uncommitted files, unpushed commits, or a PR with changes requested or approved (ready to merge).
3. **Waiting on others** — PR in review or draft; chat running.
4. **Ready to tidy** — clean and pushed, but: leftover worktree, upstream gone, or chat idle 3+ days and not archived.
5. **Clean** — nothing open. Hidden unless "Show clean" is on.

"Mark done" hides a card until its facts change (section 3).

---

## 2. Surface

**Decision: a WebviewPanel in the editor area, named "Open Work".**

| Option | Verdict |
|---|---|
| Editor WebviewPanel | **Chosen.** Room for a wide layout and several columns. Opened on demand, so zero cost when closed. Owner asked for this. |
| Section inside the sidebar | Rejected. Sidebar is 300 px; the 0.17.0 removal was because it duplicated the chat list. |
| Tree view | Rejected. No pills, no per-row buttons, no live counts. Same thing removed in 0.17.0. |

**Opening it:**
- Command `saropaChatExplorer.openWork` ("Saropa Chat Explorer: Open Work").
- Icon button `$(checklist)` in the sidebar view title (`view/title`, next to Clear History [V `package.json:121`]).
- One panel only: a second call reveals the existing one.
- No serializer in v1: the tab is not restored after a window reload. [decided]

**Layout (width-driven, not device):**
- **≥ 760 px:** summary bar, then band headers, then one row per chat with columns: dot+title, folder/branch, Files, Ahead, PR, Worktree, Age, actions. Row click expands in place.
- **< 760 px:** same rows stacked as cards (title line, then a pill line). No horizontal scroll.

**Top bar:** totals counted per folder, not per chat (no double counting): `3 need you · 5 to finish · 2 waiting · 4 to tidy`. Each is a filter toggle.

**Grouping:** By attention (default) | By chat (flat, newest) | By repository (repo -> worktree -> chats). One dropdown, reusing the sidebar sort popover (`webviewSort.ts` SORT_JS owns open/close [V :35]).

**Filters:** band toggles, "This workspace only" (default on, matches the sidebar scope), "Show clean", text filter on title/branch/repo.

**Empty states:**
- No chats in scope: "No chats in the last 14 days."
- All clean: "Nothing open. Every chat in the last 14 days is committed, pushed and closed." plus "Show clean".
- Git missing: "Git was not found on this computer. Only chat state is shown."
- gh off/failed: one muted line "Pull requests unavailable: <reason>" (reuses `ghReason` [V `wipPrs.ts:37`]).
- "N more folders not scanned. Scan more" when the folder cap is hit.

**Keyboard:** rows are a list with roving focus. Up/Down move, Enter opens the chat, Space or Right expands, Left collapses, Escape closes a popover first. Every action button has `aria-label` and a tooltip. Live region announces "Scan finished: N items open".

**Theming:** reuse the sidebar's `CSS` tokens (all `--vscode-*`, font family and size from VS Code [V `webviewCss.ts:2-3`]). Page background `--vscode-editor-background` (the sidebar uses the side bar color). Code and paths use the editor font.

**Performance for 200+ chats:**
- Chat list comes from the worker in one soft request (cheap, index only).
- Git work is per distinct folder, never per chat. Folders sorted by newest chat, cap 60 per scan, "Scan more" adds 60.
- Status runs once per distinct worktree top. Worktree list and merged check once per repository. gh once per repository.
- Concurrency 4 git processes total (`pool` [V `wipExec.ts:39`]), shared by this panel and the sidebar counts through one limiter [new].
- git 5 s and gh 8 s per call; 10 s deadline per folder (`withDeadline` [V `gitLive.ts:34`]). A timed-out folder shows "timed out · Retry" on its rows only.
- Results stream: each folder's facts post as they arrive; rows fill in place. Rows show "…" until then.
- Render cap 100 rows per band with "Show N more". No virtual list in v1. DOM diff via the existing `patch()` [V `webviewRender.ts:74`].
- Caches: folder facts 60 s, PR lookups 5 min (one shared `PrCache` for sidebar and panel [new; today `GitLiveService` owns a private one, `gitLive.ts:57`]).

---

## 3. Row content and actions

**Collapsed row:** dot (running/waiting/unread/idle) · title · `repo/worktree` · branch · pills: `4 files` `↑2` `PR #81 approved` `worktree` · age · action buttons on hover/focus.

**Expanded row:**
- Files: status letter + name, first 20, "+N more". Click opens the file.
- Unpushed commits: short id + subject, first 20.
- PR: `#81 title · open · approved`. Click opens it in the browser.
- Worktree: path, "main checkout" or "linked worktree", "clean · merged · not used by an open chat" when removable.
- Other chats in the same folder: links.
- Next step line, plain words: "Commit 4 files, then push 2 commits."

**Actions:**

| Action | Kind | Rule |
|---|---|---|
| Open chat | Safe | Existing resume path (`provider.resume`, marks read [V `extension.ts:105`]). |
| Open file | Safe | Resolved host-side by index from the last load, never from a path the page sends (same as `openGitFile` [V `extension.ts:239`]). |
| Open PR | Safe | URL held host-side, https only (`safeUrl` [V `wipPrs.ts:19`]). |
| Copy hand-over note | Safe | Existing `copyHandover` [V `extension.ts:201`]. |
| Archive chat | Reversible | Existing `setArchived`. Undo toast. |
| Mark done | Reversible | Hides the row until its fingerprint changes. Fingerprint = branch, file count, ahead, PR number + review state, chat last-message time, dot state. Stored in extension global state. "Show done" brings them back. |
| Copy summary | Safe | Plain text of what is shown (the old Copy Summary). |
| Refresh / Retry | Safe | Forced refresh skips the PR cache. Retry is per folder. |
| Copy push command | Safe | Copies `git -C <path> push` to the clipboard. Nothing runs. |
| Remove worktree | **Destructive** | Owner question 1. |
| Push | **Not offered** | Pushing publishes code. The extension never runs it. |
| Commit, delete branch, merge PR | **Not offered** | Out of scope. |

**Safety rules (any write that is ever added):**
1. The read-only `git()` allowlist [V `wipGit.ts:10-15`] stays unchanged. A write lives in its own module with its own one-command allowlist.
2. The page sends only a row key. The host re-reads git state right before acting and refuses if anything changed.
3. A modal confirm names the exact path and branch. No "don't ask again".
4. Remove worktree only when: linked (not main), status clean, 0 ahead, branch merged into the default branch or upstream gone, no open PR, no open chat in that folder, folder is not a VS Code workspace folder. Never `--force`.
5. Result is a toast with the exact outcome; failures show git's reason in short words.

---

## 4. Data sources

| Field | Source | New work |
|---|---|---|
| Chats in scope (id, title, last, cwd, PR numbers) | Worker index | Restore `wipChats()` from `882aeee` as worker request `openWork` (soft). Scope: last 14 days or open, not archived, `Chat.cwd` or folder match [V `wipChats.ts:6`]. |
| Dot (running, waiting, unread, idle) | `LiveWatcher.dots` [V `liveWatcher.ts:19`] | Panel subscribes to the same `onChange`. |
| Open tabs | `readTabs` via the watcher [V `extension.ts:321`] | None. |
| Folder probe, branch, detached, no commits | `probe` [V `wipGit.ts:34`] | None. |
| Files, counts | `statusOf` + `parseStatus` | None. |
| Ahead, behind, upstream gone | `status --branch` header (same call, `parseHeader` [V `wipParse.ts:13`]) | None: one status call gives both. |
| Unpushed commit list | `unpushedOf` | On expand only. |
| Worktrees | `repoOf` | None. |
| Merged into default branch | — | New: `rev-parse --abbrev-ref origin/HEAD` then `for-each-ref --merged=<default> refs/heads` (both already allowed commands). Once per repo. |
| Branches without a worktree | `parseRefs` [V `wipParse.ts:63`] | Wire it back (it is unused now). By-repository grouping only. |
| Open PR + review | `PrCache` | Share one instance. |
| Archived | Store | None. |
| Done fingerprints | — | New store key. |

**Collector:** restore `collect()` from `882aeee:src/wipCollect.ts` as `workCollect.ts`, changed to: post per folder as it finishes, per-folder deadline, `prs` gated by `lookupPullRequests`, shared limiter, abort on panel close.

**Dedupe:** key folder facts by worktree top; key repo facts by git common dir. Several chats in one worktree share one fact object. Several worktrees of one repo share one `worktree list`, one merged check and one gh call.

**Message protocol** (all page messages validated; ids through `isSessionId` [V `extension.ts:183`]):

Page -> host: `ready`, `refresh{force}`, `scanMore`, `retry{folderKey}`, `prefs{group,filters}`, `expand{id}`, `open{id}`, `openFile{id,i}`, `openPr{id,n}`, `handover{id}`, `archive{id,on}`, `done{id,on}`, `copySummary`, `copyPush{id}`.

Host -> page: `init{prefs,days}`, `chats{rows,more}`, `facts{folderKey,data,rq}`, `repo{repoKey,data,rq}`, `dots{map}`, `scan{state,done,total}`, `notes{gitMissing,prNote,notScanned}`, `detail{id,commits}`.

Every reply carries the scan number `rq`; the page drops stale ones (pattern from `cntSet` [V `webviewGit.ts:42`]).

**Refresh and staleness:**
- On open: scan.
- On becoming visible: scan when older than 60 s.
- A chat stops running: rescan that chat's folder 10 s later (old `onDots` rule).
- Manual Refresh button.
- No timer while hidden. No file watchers on repositories.

---

## 5. Risks learned in this project, and the guards

| Risk | What happened | Guard to add |
|---|---|---|
| Stale helper name kills the whole page | 0.18.2: a renamed helper left cards on "Loading..." and froze the panel (CHANGELOG.md:44) | Turn `scripts/check_webview.js` into a harness that takes any page. Add an Open Work scenario: init, chats, facts for each band, failed and timed-out folder, gh error, expand, every action message, empty states, narrow and wide width. Any throw or `console.error` fails the build. Wire into `vscode:prepublish` [V `package.json:232`]. |
| 3 s worker stall restart | `TIMEOUT_MS` 3000; a non-soft request that stalls restarts the worker and kills a running search [V `client.ts:4`, :152-160] | Every panel request to the worker is soft (`request(m, true, true)`). Worker `openWork` is O(chats), capped at 2000. Unit check that the module only calls `request` with `soft=true`. |
| Unreproducible "Loading..." hang | 0.18.1: git calls with no hard limit | Every git/gh call through `realExec` (kill on timeout). Per-folder 10 s deadline. A row never shows "…" past the deadline; check asserts the page turns "…" into "timed out · Retry" on a timeout message. |
| Popover clipping | 0.20.0 fixed popovers leaving the panel | Reuse the shared popover code; harness places each popover at 400, 760 and 1400 px and asserts it stays inside. |
| Font and theme drift | 0.20.0 removed hard-coded fonts; build scans for fixed fonts | Extend the fixed-font scan to the new page's CSS. No hex colors: scan for `#[0-9a-f]{3,6}` outside `var()` fallbacks. |
| Agent name leaks into UI | Extension must stay agent-neutral | Build check: no specific agent product name in the new page's visible strings. [Existing UI already says "Claude panel" at `editorView.ts:79` [V]; outside this work.] |
| Git write by accident | — | Unit check: `git()` allowlist unchanged; the panel module imports no write path. |
| extension.ts too large | 346 lines [V] | All panel code in new modules; `extension.ts` gains one `registerOpenWork(...)` call. |

---

## 6. Build slices

Each slice ships alone. After each: `npm run vscode:prepublish` passes (includes the harness), install the VSIX, run the listed check.

| # | Slice | Contents | Files | Risk | Verify |
|---|---|---|---|---|---|
| 1 | **Panel with chat state** | Command, sidebar title button, WebviewPanel, worker `openWork` (soft), dots, bands from chat state only (Needs you, Running, Idle), Open chat, Archive, Copy hand-over, empty states, harness refactor + scenario. | new `openWork.ts`, `openWorkHtml.ts`, `openWorkJs.ts`, `openWorkCss.ts`, worker `wipChats` restore, `package.json`, `scripts/check_webview.js` | Harness refactor | Opens in editor; 200-chat profile loads under 1 s; no worker restart in Diagnostics. |
| 2 | **Folder facts** | Restored collector, per-folder streaming, files, ahead/behind/gone, open PR + review, shared `PrCache` and limiter, cap 60 + Scan more, Retry, Refresh, Open file, Open PR, all five bands. | `workCollect.ts`, `gitLive.ts` (inject cache), `cardCounts.ts` (limiter) | git load on large setups | 10+ repos and worktrees: rows fill progressively; a hung git shows Retry by 10 s; sidebar card counts still work. |
| 3 | **Grouping, filters, done** | By attention / chat / repository, band toggles, text filter, Show clean, Mark done with fingerprint, Copy summary, branches without a worktree, narrow layout, keyboard. | page JS/CSS, store key | Fingerprint too eager or too lax | Mark done hides; a new commit brings it back; keyboard-only pass; 400 px layout. |
| 4 | **Worktree tidy (read-only)** | Default-branch merged check, "removable" marker, Copy push command, Copy remove command. | `workCollect.ts`, page | Default branch unknown (no `origin/HEAD`) | Marker only on clean, merged, unused linked worktrees; unknown default shows no marker. |
| 5 | **Remove worktree** (only if Q1 = yes) | Write module with one-command allowlist, host re-check, modal confirm, toast. | new `workWrite.ts` | Data loss | Refuses on any dirty, ahead, open-PR, open-chat or workspace folder; never `--force`. |

Order: 1 -> 2 -> 3 -> 4 -> 5. Slice 5 waits on Q1.

---

## 7. Mockups

Main view, wide:

```
 Open Work                                    [By attention v] [Filter...] [Show clean] [Refresh]
 3 need you · 5 to finish · 2 waiting · 4 to tidy           scanned 18 folders · 12 s ago
 ───────────────────────────────────────────────────────────────────────────────────────────
 NEEDS YOU (3)
 ● Fix login redirect     contacts/wt-login   fix/login    4 files  ↑2   PR #81 changes   2m  ▸
 ● Pro page copy          web.app             feat/pro     -        -    -                5m  ▸
 ● Drift index bump       contacts            main         1 file   -    -                1h  ▸
 TO FINISH (5)
 ○ Shared names 2B        contacts/wt-names   feat/names   -        ↑3   PR #92 approved  3h  ▸
 ○ Release notes          claude-chat-search  main         2 files  -    -                5h  ▸
   ...
 WAITING ON OTHERS (2)
 ● Tablet layout          contacts/wt-tablet  feat/tablet  …        …    …            running ▸
 READY TO TIDY (4)
 ○ Old map fix            contacts/wt-map     fix/map      clean · merged · worktree left  3d  ▸
 ───────────────────────────────────────────────────────────────────────────────────────────
 Pull requests unavailable for 1 repo: not signed in to gh.      8 more folders not scanned. Scan more
```

One expanded row:

```
 ▾ ● Fix login redirect    contacts/wt-login · fix/login · waiting for you               2m
     Next: answer the chat, then commit 4 files and push 2 commits.
     Files (4)      M auth.dart   M router.dart   ? login_test.dart   M CHANGELOG.md
     Unpushed (2)   a1b2c3d Guard redirect loop
                    e4f5a6b Add login test
     Pull request   #81 Fix login redirect · open · changes requested            [Open PR]
     Worktree       ../contacts-wt-login · linked worktree · in use by this chat
     Same folder    "Login spike" (idle, 1d)
     [Open chat] [Copy hand-over] [Copy push command] [Mark done] [Archive]
```

---

## 8. Owner questions

**1. Should Open Work be able to delete a leftover worktree folder?**
A worktree is an extra checkout folder of a repository. When its branch is merged, the folder is left behind and must be removed by hand. The view can spot the safe ones (clean, pushed, merged, no open chat).
- **Yes:** a "Remove worktree" button appears on those rows only. It asks first, names the folder, re-checks git, and never forces. It is the first time the extension changes anything in a repository.
- **No:** the row shows "Ready to remove" and a button that copies the remove command; the developer runs it.
- **Recommendation: No for now.** Copying the command closes the work with zero risk of deleting files; the button can follow once the marker has proven correct.

**2. Should pull requests show their check results (passing / failing)?**
Today the PR lookup asks GitHub for number, title, branch, draft and review decision. Check results need one more field, which makes each repository's lookup slower (exact cost not measured).
- **Yes:** the PR pill also reads "checks failing" or "checks passing", and a failing PR moves to "To finish".
- **No:** the pill shows review state only (approved, changes requested, review requested, draft).
- **Recommendation: No in v1.** Review state is already fetched at no extra cost; add checks later behind the existing pull-request setting if wanted.

Decided without asking (design choices): name "Open Work"; editor panel; 14-day scope with setting `saropaChatExplorer.openWorkDays` (1-90); bands as in section 1; no push, commit or merge from the view; no serializer in v1.
