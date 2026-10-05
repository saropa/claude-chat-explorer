# Open Work view: final design

Repo: `claude-chat-search` (Saropa Chat Explorer), main at 0.21.1 (`0eec284`).
Status: design, reviewed, ready for slice 1. Supersedes `plans/design/20261005_project_view_design.md`.

Tags: **[V]** = verified in code at file:line. **[M]** = measured on this machine, 2026-10-05.

Owner decisions folded in:
1. **Worktrees: no delete.** A row says "Ready to remove" and a button copies the remove command. The extension makes no git writes. The git allow-list (`wipGit.ts:10`) stays unchanged.
2. **PR rows show check results** (passing / failing / pending). A failing check moves the chat to "To finish". The PR layer is a separate, streamed, cancelable layer that never blocks the page. `lookupPullRequests=false` turns off the PR layer and checks entirely: zero gh calls.

---

## 1. Measurements

All runs on this Mac, gh 2.83.2, signed in. Medians of 5-7 runs. Scripts: `scratchpad/measure_gh*.js`, `scratchpad/scale.js`.

### 1.1 Real scale

| Fact | Value [M] |
|---|---|
| Chats active in the last 14 days | 131 |
| Distinct working folders of those chats | 3 |
| Distinct repositories | 3 |
| `git status` per folder | contacts 293 ms, web 63 ms, log-capture 43 ms |
| Linked worktrees in contacts | 2, and no chat uses either as its folder |
| Open PRs: contacts / chat-search | 0 / 2 (dependabot, no checks) |

### 1.2 Check results: three ways

| Query | Repo | Without checks | With checks | Payload |
|---|---|---|---|---|
| `gh pr list --json <6 fields>` vs `+statusCheckRollup` | contacts, open (0 PRs) | 405 ms | 404 ms | 3 B / 3 B |
| same | chat-search, open (2 PRs) | 522 ms | 491 ms | 462 B / 508 B |
| same | contacts, 100 merged PRs, 0 checks | 1430 ms | 2247 ms (+57%) | 22 KB / 25 KB |
| same | cli/cli, 75 open PRs, 1041 checks | 3680 ms | **8100 ms** (max 8332) | 16 KB / **317 KB** |
| same | microsoft/vscode, 100 open PRs | 5312 ms | **HTTP 504 after 11.2 s, 5 of 5 runs** | — |
| `gh pr view <n> --json statusCheckRollup` | cli/cli, per PR | — | 496-561 ms | 2-9 KB |
| same, PR with no checks | chat-search | — | 420-490 ms, exit 0, `[]` | 80 B |
| `gh pr checks <n> --json bucket` | cli/cli, per PR | — | 837-1046 ms | <1 KB |
| same, PR with no checks | chat-search | — | 1692-2506 ms, **exit 1** ("no checks reported") | — |
| `gh api graphql` (rollup state only, 100 PRs) | cli/cli | — | 1728 ms | 10 KB |
| adding `headRefOid` to the list fields | cli/cli | 3204 ms | 3685 ms | within run-to-run noise (2.5-4.6 s) |

### 1.3 Conclusion

- **Adding `statusCheckRollup` to `gh pr list` is rejected.** Cost grows with the number of open PRs and checks, not with what the user needs. On a busy repo it passes the 8 s gh timeout (`gitLive.ts:8`) half the time. On a very busy repo GitHub fails it outright.
- **`gh pr checks` is rejected.** It is 2x slower than `pr view`, and it exits 1 for "no checks" and 8 for "pending", so exit codes need special cases.
- **`gh api graphql` is rejected.** It is the cheapest per PR, but `gh api` can send any request, including writes. It cannot sit in a read-only allow-list.
- **Chosen: two steps.**
  1. The existing `gh pr list` once per repository, plus two cheap fields: `headRefOid` and `isCrossRepository`.
  2. `gh pr view <n> --json statusCheckRollup,headRefOid` **only for PRs whose branch a chat in scope is on**. Typical count: 0-5 per repository. Cost: about 0.5 s each.
- On this machine today that is **0 extra gh calls**: contacts has no open PRs, and no chat is on a chat-search PR branch.
- The gh allow-list (`wipGit.ts:11`, `:23`) gains exactly one read-only shape: `pr view <digits> --json statusCheckRollup,headRefOid`. The git allow-list is unchanged.
- No "check on demand" fallback is needed. The per-PR step already runs only for rows that need it.

---

## 2. Must-fix findings from the review (ranked)

Each one is fixed inside the slice named. None needs an owner answer.

| # | Finding | Evidence | Fix | Slice |
|---|---|---|---|---|
| 1 | Check results in the list query time out or fail on busy repos. | Section 1.2: 8.1 s vs 8 s timeout; vscode 504. | Two-step PR layer (section 1.3). | 3 |
| 2 | **Leftover worktrees would never show.** The design ties them to a chat card. Chats here all run in the main checkout; subagent worktrees are never a chat's folder. | [M] 131 chats, 3 folders, all main checkouts; contacts has 2 linked worktrees no chat uses. | Worktree rows that stand alone, keyed by worktree path, from `worktree list` of every repository in scope (section 5.3). | 4 |
| 3 | The shared PR cache cancels other callers. The first caller's abort signal runs the shared gh call. Closing the panel would silently cancel a sidebar card's PR lookup (its "canceled" note is hidden). | `wipPrs.ts:65` passes the caller's ctx; `gitLive.ts:80` passes its own signal; `gitLive.ts:130` hides "canceled". | The cache owns the controller of each shared call. A caller that leaves stops waiting. The call is killed only when no caller is left, or at its own timeout. | 3 |
| 4 | One shared git limiter would starve the sidebar. A panel scan fills all slots. Sidebar sections then time out on queue time, because their 10 s deadline is wall-clock. Card counts bypass any limiter today. | `gitLive.ts:69` (deadline includes waiting); `cardCounts.ts:77-86` (no pool); `wipExec.ts:39` (`pool` is per call, not global). | Global limiter with two lanes. Interactive (sidebar) may use all 4 slots and goes first. Background (panel) uses at most 3. `realExec` callers get it through `Ctx.exec`. | 2 |
| 5 | A per-folder deadline counted from enqueue would time out late folders falsely once many folders are queued. | Old collector queued 60 folders behind a pool of 4. | Folder deadline (10 s) starts when the folder's first command gets a slot. The page watchdog starts when the host posts `running` for that folder. | 2 |
| 6 | The old collector cannot stream. It runs all probes, then all statuses, then all repos, then all PRs. | `882aeee:src/wipCollect.ts` (`folderFacts`, `repoFacts`, `prFacts`, `collect`). | New per-folder pipeline (`workScan.ts`). Each folder posts as soon as it ends. The PR layer for a repository starts as soon as one of its folders has a branch. | 2 |
| 7 | **The sidebar popover script cannot be reused as-is.** It binds sidebar element ids and globals at load. In a new page that throws at load: the 0.18.2 failure class. | `webviewSort.ts:37` (`$('srb')`), `:42-43` (`advSync`, `sessOn`, `askSess`, `rerender`), `:44` (fixed id list). | Extract a dependency-free `POP_JS` (place, toggle, close on Escape / outside click / scroll), taking ids as arguments. The sidebar switches to it in the same slice. | 1 |
| 8 | No way for a second page to listen to dots, index changes or archive changes. | `liveWatcher.ts:13` single `onChange`; `extension.ts:325`; `extension.ts:337` chains `onIndex` by hand; `extension.ts:320` `changed` only refreshes the sidebar. | A small fan-out (`hub.ts`: `on(evt, fn)` returns a disposable) for `dots`, `indexed`, `changed`, `archived`. PR cache and limiter move out of `Provider` (`extension.ts:47-51`) into `activate()` so both pages share them. `extension.ts` gains about 10 lines, not 1. | 1 |
| 9 | The page harness cannot test a timeout. `setTimeout` is a no-op, and the sidebar ids and page are hard-coded. | `check_webview.js:56`, `:41`, `:10`. | Split into `scripts/webview_harness.js` (vm, stub DOM, **fake clock** with `advance(ms)`, page from any module) and per-page scenario files. | 1 |
| 10 | A soft worker request rejects after 6 s while the worker keeps working. During the first index build the panel's list request can hit that. | `client.ts:158-160` (soft: reject only, `TIMEOUT_MS * 2`); `worker.ts:97` style `await loaded`. | Worker `openWork` answers at once with what is indexed plus `indexing: true` (same as `fileSessions`, `worker.ts:129`). The page shows "Index still building: list may be incomplete" and asks again on `indexed`. A rejected request shows "Could not load chats · Retry", never a spinner. | 1 |
| 11 | A fork PR with the same branch name as a chat's branch would be shown as that chat's PR and move it to the wrong band. | `wipPrs.ts:31` maps by `headRefName` only. [M] 38 of 75 open cli/cli PRs come from forks. | Add `isCrossRepository` to the list fields; skip those PRs. | 3 |
| 12 | Locked and prunable worktrees are not parsed. A copied remove command would fail on a locked one. A missing folder needs a different command. | `wipParse.ts:46-58` reads only `worktree`, `branch`, `detached`. | Parse `locked` and `prunable`. Locked: "Locked · not removable", no button. Folder missing: copy `git -C <main> worktree prune`. | 4 |
| 13 | A detached worktree has no branch, so a branch merged check cannot judge it. | [M] `contacts-wt-merge-offline-static` is detached. | Merged check by commit: `rev-list --count <default>..<sha>` equals 0 (allowed command). | 4 |
| 14 | "This workspace only" by folder name drops chats that ran in a sibling worktree folder (`../contacts-wt-x`). | `wipChats.ts:6` matches the encoded workspace folder. | Slice 1: path rule (as today). Slice 2: scope by repository: a chat is in scope when its folder's git common dir equals that of a workspace folder. | 2 |
| 15 | Band moves while checks stream in would make rows jump under the cursor. | Design gap. | Section 6.4. | 3 |
| 16 | Mark done would un-hide a row when checks go from pending to passing. | Design gap. | Fingerprint holds the check result only as failing / not failing (section 7). | 4 |

Not defects, recorded so nobody expects otherwise:
- Running and waiting dots exist only for chats started in the editor extension. Terminal and SDK sessions get no dot (`liveState.ts:34`). They band from git and PR facts only.
- Unread is kept only while a chat is open (live or a tab) (`liveState.ts:60`).
- Dots are polled every 30 s (`liveWatcher.ts:5`). The panel calls `poke()` when it becomes visible.
- `check_webview.js` is already in `vscode:prepublish` (`package.json:231`).

---

## 3. Purpose and units

One screen that answers: what is still open, and what do I do to close it?

Two kinds of rows:
- **Chat row**: one per chat in scope (last 14 days, or open; not archived).
- **Worktree row**: one per linked worktree that no chat row already shows. These are where leftover subagent worktrees appear.

A chat is closed when every item below is clear:

| Close-out item | Clear when | Source |
|---|---|---|
| Chat needs you | Not waiting, not unread | dots (`liveState.ts:64`) |
| Chat running | Not running | dots |
| Uncommitted files | 0 in the chat's worktree | `statusOf` (`wipGit.ts:55`) |
| Unpushed commits | 0 ahead | status `--branch` header (`wipParse.ts:13`) |
| Upstream gone | Not gone | status header |
| Open PR | No open PR on the branch | PR layer |
| Failing checks | PR checks not failing | PR layer, step 2 |
| Leftover worktree | No clean, merged, unused linked worktree | repo facts |
| Finished chat not archived | Archived, or still has work | store |

---

## 4. Surface

- WebviewPanel in the editor, title "Open Work". Command `saropaChatExplorer.openWork`. Button `$(checklist)` in the sidebar `view/title` (`package.json:120`).
- One panel. A second call reveals it.
- `retainContextWhenHidden: true` (same as the sidebar, `extension.ts:333`). The host still keeps the full model and replays it on `ready`, so a webview reload loses nothing.
- No serializer: the tab is not restored after a window reload.
- CSP and nonce exactly as the sidebar (`webview.ts:25`). `localResourceRoots: []`.
- Setting `saropaChatExplorer.openWorkDays`, default 14, range 1-90.

Layout is width-driven:
- **≥ 760 px**: header, band headers, one row per item in columns: dot+title, folder/branch, Files, Ahead, PR, Checks, Worktree, Age, actions.
- **< 760 px**: same rows stacked: title line, then a pill line. No horizontal scroll.

Header (top to bottom):
1. Title, grouping dropdown, filter box, Show clean, Refresh.
2. Band totals as filter toggles: `3 need you · 5 to finish · 2 waiting · 4 to tidy`.
3. **Progress line** (section 6.3): bar plus text, e.g. "Reading git: 8 of 23 folders · Checking pull requests: 12 of 40 repositories". Hidden when idle; then "Updated 12 s ago".

Theming:
- Reuse the sidebar `CSS` tokens (`webviewCss.ts:2-3`); fonts only from `--vscode-font-family` / `--vscode-editor-font-family` and their sizes.
- Page background `--vscode-editor-background`.
- Check colors: `--vscode-testing-iconPassed`, `--vscode-testing-iconFailed`, `--vscode-testing-iconQueued`. Always with a text label; never color alone.
- Dot colors: the contributed `--vscode-saropaChatExplorer-dot*` variables.
- No hex colors in the page CSS. `rgba()` only as a `var()` fallback.

Empty states and notes:

| Case | Text |
|---|---|
| No chats in scope | "No chats in the last 14 days." |
| All clean | "Nothing open. Every chat in the last 14 days is committed, pushed and closed." + Show clean |
| Index building | "Index still building: list may be incomplete." |
| Chat list failed | "Could not load chats. Retry" |
| Git missing | "Git was not found on this computer. Only chat state is shown." |
| PR lookups off | "Pull requests are off (setting Look Up Pull Requests)." |
| gh failed | "Pull requests unavailable for N repositories: <reason>" (reasons from `ghReason`, `wipPrs.ts:37`) |
| Folder cap hit | "N more folders not scanned. Scan more" |

---

## 5. Data and layers

### 5.1 The four layers

| Layer | What | Where | When it posts |
|---|---|---|---|
| 0 Chats | id, title, last, cwd, linked PR numbers, archived | worker `openWork` (soft) | once, at scan start; rows render at once |
| 0 Dots | running / waiting / unread / idle | `LiveWatcher` via hub | on every change |
| 1 Git | per folder: top, common dir, branch, detached, ahead, behind, gone, upstream, file counts, first 20 files | host `workScan.ts` | per folder, as each ends |
| 2 Repo | per repository: worktrees (with locked / prunable / missing), default branch, merged branches | host | per repository |
| 3 PR | per repository: open PRs by branch (not forks), then checks for matched PRs only | host `workPrs.ts` | per repository, then per PR |

### 5.2 Git commands (all already allowed, `wipGit.ts:10`)

| Need | Command | Count |
|---|---|---|
| Folder probe | `rev-parse --show-toplevel --git-common-dir --symbolic-full-name HEAD` | 1 per folder |
| Files, ahead, behind, gone | `status --porcelain=v1 --branch -z --untracked-files=normal` | 1 per worktree top |
| Worktrees | `worktree list --porcelain` | 1 per repository |
| Default branch | `rev-parse --abbrev-ref origin/HEAD` | 1 per repository; failure = "default branch unknown", no removal marker |
| Merged branches | `for-each-ref --merged=<default> --format=%(refname:short) refs/heads` | 1 per repository |
| Detached worktree merged | `rev-list --count <default>..<sha>` | 1 per detached linked worktree |
| Unpushed commit list | `rev-list --max-count=20 --format=%h%x09%s @{u}..HEAD` | on expand only |

### 5.3 Worktree rows and the remove command

A linked worktree is **Ready to remove** when all hold:
- linked, not the main checkout; not locked;
- status clean (0 files);
- 0 ahead, or upstream gone;
- branch merged into the default branch (or, detached, its commit is in the default branch), or upstream gone;
- no open PR on its branch;
- no open chat (live or a tab) whose folder is that worktree;
- not a VS Code workspace folder.

The button copies, with the path quoted for the user's shell:
- `git -C <main checkout> worktree remove <path>`
- plus `git -C <main checkout> branch -d <branch>` when the branch is merged into the default branch.
- Folder already missing: `git -C <main checkout> worktree prune` instead.

Quoting: POSIX single quotes (`'` inside becomes `'\''`) on macOS and Linux; double quotes on Windows.

Nothing runs. Both commands refuse on their own if the state is unsafe: `worktree remove` refuses a dirty worktree without `--force`, and `branch -d` refuses an unmerged branch. The copied command never contains `--force` or `-D`.

Toast after copy: "Copied the remove command for <folder>. Run it in a terminal."

### 5.4 PR layer and check states

Step 1, per repository: `gh pr list --state open --limit 100 --json number,title,headRefName,isDraft,reviewDecision,url,headRefOid,isCrossRepository`. Run in the main checkout. Fork PRs are skipped.

Step 2, per PR whose `headRefName` is the branch of a chat or worktree row in scope: `gh pr view <n> --json statusCheckRollup,headRefOid`.

Check state from `statusCheckRollup` (items are `CheckRun` with `status`/`conclusion`, or `StatusContext` with `state`):

| State | Rule |
|---|---|
| failing | any CheckRun `COMPLETED` with conclusion `FAILURE`, `TIMED_OUT`, `CANCELLED`, `ACTION_REQUIRED` or `STARTUP_FAILURE`; or any StatusContext `FAILURE` / `ERROR` |
| pending | not failing, and any CheckRun not `COMPLETED`, or StatusContext `PENDING` / `EXPECTED` |
| passing | not empty, and none of the above |
| none | empty list: no pill |

Pill text: "checks failing (2 of 9)", "checks pending", "checks passing". Tooltip lists up to 5 failing check names.

---

## 6. Progressive loading protocol

### 6.1 Messages

Page to host (every message validated; chat ids through `isSessionId`, `extension.ts:183`; folder, repo and worktree keys are opaque host-issued ids such as `f3`, `r1`, `w7` and are looked up in the host's own map, never used as paths):

| Message | Meaning |
|---|---|
| `ready` | page script is listening; host replays the full model |
| `refresh {force}` | new scan; `force` skips every cache |
| `retry {key}` | rerun one folder (`f*`) or one repository's PR layer (`r*`) |
| `scanMore` | scan the next 60 folders |
| `prefs {group, filters}` | saved in global state |
| `expand {id}` | host sends `detail` (unpushed commits) |
| `open {id}` / `handover {id}` / `archive {id,on}` / `done {id,on}` | chat actions |
| `openFile {key,i}` / `openPr {repo,n}` | resolved host-side from the last result (as `extension.ts:241-253`) |
| `copySummary` / `copyPush {key}` / `copyRemove {key}` | host builds the text from its model and writes the clipboard |

Host to page (every scan-scoped message carries `scan`, the scan number; the page drops any message whose `scan` is not current):

| Message | Payload |
|---|---|
| `init` | `v` (protocol version), prefs, days, `prsOn`, `gitOk` |
| `chats` | `scan`, rows, `more`, `indexing` |
| `dots` | map |
| `folder` | `scan`, `key`, `state` (`queued` / `running` / `ok` / `none` / `error` / `timeout`), `facts?`, `reason?`, `age?` (seconds, when from cache) |
| `repo` | `scan`, `key`, worktrees, default branch, merged list, `state` |
| `prs` | `scan`, `repo`, `state` (`queued` / `checking` / `ok` / `unavailable`), `byBranch?`, `reason?` |
| `checks` | `scan`, `repo`, `n`, `state` (`checking` / `passing` / `failing` / `pending` / `none` / `unavailable`), counts, failing names |
| `progress` | `scan`, `git {done,total}`, `prs {done,total}`; at most one per 100 ms |
| `end` | `scan`, list of keys that never reached a final state (the page marks them timed out) |
| `notes` | gitMissing, prNote, notScanned |
| `detail` | id, commits |

### 6.2 Order and concurrency

1. `refresh`: abort the previous scan (its processes are killed by `realExec`, `wipExec.ts:22`). New scan number.
2. Post cached facts at once, each with its `age`. Rows fill before any process starts.
3. Worker `openWork` (soft). Post `chats`. Rows render from chat state.
4. Distinct folders, newest chat first, cap 60. Each folder: `queued` → `running` → final. Probe, then status once per worktree top. Post `folder` when it ends.
5. A repository's layer 2 starts when its first folder ends. Its PR layer starts at the same moment (no wait for the other folders).
6. PR step 2 starts per matched PR when step 1 for that repository ends.
7. When every folder, repository and PR has a final state: post `end`, announce in the live region.

| Limit | Value |
|---|---|
| git processes, global | 4; panel at most 3; sidebar goes first |
| gh processes, global | 2 |
| gh list per repository | 1 at a time, shared with the sidebar |
| git call timeout | 5 s (`gitLive.ts:8`) |
| folder deadline | 10 s from its first command start |
| gh call timeout | 8 s (`gitLive.ts:8`) |
| PR layer per repository | 20 s from step 1 start |
| page watchdog | host deadline + 5 s from the `running` message |

### 6.3 Progress and spinners

Header progress line:
- `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=<total>`, `aria-valuenow=<done>`, `aria-valuetext` = the visible text.
- Text: "Reading git: 8 of 23 folders", then "Checking pull requests: 12 of 40 repositories". Both show while both run.
- PR part absent when `prsOn` is false.
- Disappears at `end`; then "Updated 12 s ago" (ticks once per 10 s, not a re-render of rows).

Per-row cell states:

| Cell | States shown |
|---|---|
| Files / Ahead | `…` queued, spinner "reading git", value, "timed out · Retry", "error · Retry", "—" not a git folder |
| PR | spinner "checking", `#81 approved`, "no PR", "unavailable" (tooltip reason), hidden when off |
| Checks | spinner "checking", "checks failing (2 of 9)", "checks pending", "checks passing", nothing when no checks or no PR |
| Row | `aria-busy="true"` while any cell is queued or loading |

Spinners: CSS rotation; `prefers-reduced-motion` shows a static `…` instead. Each spinner has `role="img"` and an `aria-label` ("Checking pull request").

A cell can never stay on a spinner: the host always posts a final state (try/finally per folder and per repository), the page watchdog turns a late cell into "timed out · Retry", and `end` lists any key the host gave up on.

### 6.4 Band changes while data streams

- Row placement updates at most once per 250 ms (one `patch()` per frame, `webviewRender.ts:74`).
- The focused row keeps focus across a move (`patch` refocus by key).
- A row under the mouse does not move until the mouse leaves it or 2 s pass.
- The live region speaks only at `end`: "Scan finished: N items open."

### 6.5 Staleness and caches

| Cache | Life | Key | Not kept |
|---|---|---|---|
| Folder facts | 60 s | worktree top | failures, timeouts |
| Repo facts | 60 s | git common dir | failures |
| PR list | 5 min (`wipPrs.ts:5`) | git common dir | failures except "gh not installed" |
| Checks | 5 min | repository + PR number + head commit | failures |

- Caches live in the host, shared by the sidebar and the panel, memory only.
- A push to a PR changes its head commit, so its checks are looked up again at the next scan.
- `refresh {force}` bypasses every cache.
- Scan triggers: panel opens; panel becomes visible and the last scan is older than 60 s; a chat stops running (that folder only, 10 s later); Refresh. No timer while hidden. No file watchers on repositories.

### 6.6 Cancellation

- Panel closed: abort the scan controller; queued work is dropped; running git and gh processes are killed.
- A shared PR list call is killed only when no other caller (sidebar card) still waits for it (finding 3).
- Window reload: the extension host stops; every process has its own hard timeout (`wipExec.ts:24`).

---

## 7. Bands

Order top to bottom; newest first inside a band. First matching rule wins.

| Band | Chat row rule |
|---|---|
| 1 Needs you | waiting, or unread |
| 2 To finish | checks failing (even while running: the row keeps its running dot); or not running and (files > 0, or ahead > 0, or PR changes requested, or PR approved with checks passing or none) |
| 3 Waiting on others | running; or PR in review, draft, or checks pending |
| 4 Ready to tidy | clean and pushed, and (upstream gone, or idle 3+ days and not archived) |
| 5 Clean | nothing open; hidden unless Show clean |

Worktree rows: "Ready to remove" go to band 4. A worktree with files or commits not pushed goes to band 2. A locked one goes to band 5 with "Locked".

Unknown facts (loading, timed out, lookups off) never move a row up or down: it is placed from the facts it has.

Mark done fingerprint: branch, file count, ahead, PR number, review state, checks failing yes/no, last message time, dot state. Stored in global state, new key `saropaChatExplorer.openWorkDone`, capped at 500 entries.

---

## 8. Rows and actions

Collapsed row: dot · title · `repo/worktree` · branch · pills (`4 files`, `↑2`, `PR #81 approved`, `checks failing`, `worktree`) · age · actions.

Expanded row: Next step line in plain words; files (first 20, click opens); unpushed commits (first 20); PR with review and checks; worktree path and state; other chats in the same folder.

| Action | Kind | Rule |
|---|---|---|
| Open chat | safe | `provider.resume` (`extension.ts:105`) |
| Open file | safe | host-side index (`extension.ts:241`) |
| Open PR | safe | https-only URL held host-side (`wipPrs.ts:19`) |
| Copy hand-over note | safe | `copyHandover` (`handoverRun.ts`) with the panel's own `state` callback |
| Archive | reversible | `setArchived`; undo in the toast |
| Mark done | reversible | fingerprint; Show done brings rows back |
| Copy summary | safe | host builds plain text of what is shown |
| Copy push command | safe | `git -C <path> push`, quoted |
| Copy remove command | safe | section 5.3 |
| Refresh / Retry | safe | Retry is per folder or per repository |
| Remove worktree, push, commit, merge, delete branch | not offered | the extension never writes to a repository |

Keyboard and screen readers:
- The list is `role="list"`; each row is `role="listitem"` with one row button (`aria-expanded`) as its roving focus stop.
- Up/Down move between rows. Enter opens the chat. Space or Right expands. Left collapses. Home/End jump. Tab moves into the row's actions.
- Escape closes a popover first, then collapses the row.
- Every action button has `aria-label` and a tooltip with the same words.
- Band headers are `role="heading" aria-level="2"` with the count.
- High contrast: borders from `--vscode-contrastBorder`.

---

## 9. Code layout

| File | Role |
|---|---|
| `src/hub.ts` | event fan-out: `dots`, `indexed`, `changed`, `archived` |
| `src/execLimit.ts` | global two-lane limiter wrapping `Exec` (git 4, gh 2) |
| `src/workChats.ts` | worker side: chats in scope (restored `wipChats` from `882aeee`, plus `indexing`) |
| `src/workScan.ts` | per-folder pipeline, deadlines, posting, abort |
| `src/workRepo.ts` | worktrees, default branch, merged check, remove command text |
| `src/workPrs.ts` | PR layer: list step, view step, check state, check cache |
| `src/workModel.ts` | pure: bands, fingerprint, summary text, next-step text |
| `src/openWork.ts` | panel host: command, messages, model, replay |
| `src/openWorkHtml.ts`, `openWorkJs.ts`, `openWorkCss.ts` | page |
| `src/webviewPop.ts` | dependency-free popover script and CSS, used by both pages |

`openWork*.ts` and `work*.ts` never import `./client`. They get `softRequest(m)`, which is `client.request(m, true, true)`.

---

## 10. Slices

After each slice: `npm run vscode:prepublish` passes (it runs every check below), the VSIX installs, and the listed manual check passes.

### Slice 1: page with chat state

Contents: command and sidebar button; panel with replay on `ready`; worker `openWork` (soft, `indexing`); dots; bands 1, 3 (running) and "idle"; Open chat, Archive, Copy hand-over; empty states; header without progress; keyboard; narrow and wide layout; hub; popover extraction.

Files: `hub.ts`, `workChats.ts`, `workModel.ts` (chat-state rules only), `openWork.ts`, `openWorkHtml.ts`, `openWorkJs.ts`, `openWorkCss.ts`, `webviewPop.ts`, `webviewSort.ts` (uses `webviewPop`), `worker.ts` (+ `openWork`), `extension.ts` (hub, register), `package.json` (command, menu, `openWorkDays`), `scripts/webview_harness.js`, `scripts/check_webview.js` (now uses the harness), `scripts/check_openwork.js`, `scripts/check_guards.js`.

Checks added:
- `check_openwork.js` runs the Open Work page in node vm through the harness: `init`, `chats` (0, 3, 250 rows), `indexing`, chat list failure, `dots`, archive and done messages, every action button posts the right message, keyboard walk, widths 400 / 760 / 1400. Any throw, `window.onerror` or `console.error` fails.
- Popover placement at 400, 760 and 1400 px stays inside the viewport, for both pages.
- Sidebar scenario still passes on the extracted popover code.
- Font scan (`check_webview.js` font checks) and a no-hex-color scan run on the Open Work CSS.
- `check_guards.js`: every `*.ts` under `src/` that starts with `openWork` or `work` has no `import` of `./client`, and every `.request(` call anywhere in those files has `soft` true. The `git()` allow-list text (`wipGit.ts:10`) matches a stored copy.
- Agent-neutral strings: no agent product name in the page's visible text.

Manual check: opens in an editor tab; 131 real chats render under 1 s; Show Diagnostics shows no worker restart.

### Slice 2: streamed git state and counts

Contents: `workScan.ts` per-folder pipeline; two-lane limiter used by the panel, `GitLiveService` and `CardCounts`; folder deadline from first command start; Files / Ahead / upstream gone; bands 2 and 4 from git; progress line (git part); Retry per folder; Scan more; Refresh; Open file; scope by repository; caches for folder and repo facts.

Files: `execLimit.ts`, `workScan.ts`, `workModel.ts`, `gitLive.ts` and `cardCounts.ts` (take the limiter through `Ctx.exec`), `openWork*.ts`, `extension.ts` (create limiter in `activate`), `scripts/check_openwork.js`, `scripts/check_scan.js`.

Checks added:
- `check_scan.js` (node, on `out/`) drives `workScan` with a fake `Exec`:
  - a folder whose git never answers ends as `timeout` within deadline + 50 ms (deadline injected as 200 ms);
  - 60 folders behind a 4-slot limiter: none times out from waiting (fake git answers in 20 ms);
  - abort kills every running fake process and posts nothing after;
  - every folder posts exactly one final state;
  - an interactive request waits for at most one running background command.
- `check_openwork.js`: `folder` messages for each band; a stale `scan` is dropped; **a folder left on `running` ends as "timed out · Retry" after the fake clock passes the watchdog**; the same through `end` listing the key; Retry posts `retry {key}`; progress text and `aria-valuenow` follow `progress` messages.

Manual check: three real repositories fill in progressively; a folder made to hang (fake slow git on PATH) shows Retry by 15 s; sidebar card counts still fill while a scan runs.

### Slice 3: PR layer with checks and progress

Contents: `workPrs.ts` (list step with `headRefOid` and `isCrossRepository`, fork skip, view step for matched PRs, check state, check cache); PR cache shared with the sidebar and owning its abort controller; gh limiter (2); PR and Checks columns with spinners; bands with review and check rules; progress line PR part; `lookupPullRequests=false` turns the layer off; band-move smoothing (section 6.4).

Files: `workPrs.ts`, `wipPrs.ts` (fields, fork skip, cache abort ownership), `wipGit.ts` (gh allow-list: add `pr view <digits> --json statusCheckRollup,headRefOid` only), `workModel.ts`, `openWork*.ts`, `scripts/check_prs.js`, `scripts/check_openwork.js`, `scripts/check_guards.js`.

Checks added:
- `check_prs.js`: check-state mapping for every CheckRun conclusion and StatusContext state; empty list is none; fork PRs skipped; a caller leaving does not kill a shared list call another caller waits on; a failed lookup is not cached; same head commit within 5 min is served from cache; a new head commit is looked up; with `prsOn` false, a fake gh records zero calls.
- `check_guards.js`: the gh allow-list accepts exactly `pr list ...` and `pr view <digits> --json statusCheckRollup,headRefOid`; it rejects `pr checks`, `api`, `pr merge`, `pr view` with any other field.
- `check_openwork.js`: `prs` and `checks` messages in every state; a failing check moves the row to To finish; pending moves it to Waiting; a PR row left on `checking` turns into "timed out · Retry" after the watchdog; no PR column and no PR progress when `prsOn` is false.

Manual check: on chat-search and contacts, PR cells settle in under 2 s; with the setting off, no `gh` process appears (`ps` while scanning).

### Slice 4: grouping, filters, mark done, remove command, summary

Contents: By attention / By chat / By repository; band toggles; text filter; Show clean; Show done; Mark done with fingerprint; Copy summary; worktree rows; Ready to remove with Copy remove command; locked and prunable parsing; detached merged check; Copy push command; branches without a worktree (`parseRefs`, `wipParse.ts:63`) under By repository.

Files: `workRepo.ts`, `wipParse.ts` (`locked`, `prunable`), `workModel.ts`, `openWork*.ts`, `store.ts` (done key), `scripts/check_openwork.js`, `scripts/check_scan.js`.

Checks added:
- `check_scan.js`: the Ready to remove rule against each failing condition (dirty, ahead, unmerged, open PR, open chat, workspace folder, locked, main checkout, default branch unknown); remove command text with spaces and quotes in the path, POSIX and Windows; `branch -d` present only when merged; never `--force` or `-D`; missing folder gives `worktree prune`.
- `check_openwork.js`: each grouping; filters; Mark done hides and a changed fingerprint brings it back; pending to passing does not; Copy remove posts `copyRemove {key}`; worktree rows render in band 4.

Manual check: the two linked worktrees in contacts show as rows; the copied command, pasted into a terminal, removes a test worktree made for the check.

---

## 11. Risks carried from earlier releases

| Earlier failure | Guard in this design |
|---|---|
| 0.18.2 stale helper left cards on "Loading..." | Own page script, no shared globals (finding 7); harness on every message type; per-row render in try/catch that logs (and so fails the harness). |
| 3 s worker restart killed a search | Only soft requests (`check_guards.js`); worker `openWork` answers at once with `indexing`. |
| 0.18.1 unreproducible "Loading..." hang | Every process through `realExec` with a hard timeout; per-folder and per-repository deadlines; page watchdog; `end` lists unfinished keys; fake-clock test. |
| 0.20.0 popovers clipped | Shared `webviewPop.ts`; placement checked at 3 widths on both pages. |
| 0.20.0 font and theme drift | Font scan and no-hex scan on the new CSS. |
| Git write by accident | git allow-list unchanged and checked against a stored copy; no write module exists. |

---

## 12. Owner questions

None. Both earlier questions are decided and folded in. Every other choice above is a design choice that does not change what ships against those decisions.
