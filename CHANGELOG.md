# Changelog

Release notes for Saropa Chat Explorer, newest first. Dates are the git dates of each release.

## Unreleased
- Added: every worktree and branch in Project status now shows the Claude chats that relate to it, and the Chats cell is never blank. Certain links come first: the chat ran in the worktree folder (cwd), its rows record the branch (git-branch-field), a tool call created the worktree or branch (git worktree add, git checkout -b, git switch -c, git branch, EnterWorktree), or one of its subagents did any of these or owns an agent-<id> worktree (subagent). Only when nothing is certain, probable links are used: the branch or worktree name in the chat text, files touched under the worktree, or a chat active when the branch was made. A row nothing links to shows "created <date> by <author>, no matching chat found" and the nearest chat by time, labelled "nearest by time (probable)". Each chat sub-row carries a small reason badge and a tooltip with the reason and confidence; probable ones are muted. The branch creation time is read from the branch reflog file (no new git command), and the chat index records each chat's folders, branches and created worktrees, so the first start after the update re-reads the chat files once.
- Fixed: Project status now shows the chats that belong to each worktree, branch and pull request as indented sub-rows, open by default. A chat attaches to its worktree by folder, or by its branch when the folder is spelled differently; to its branch row by branch; to the pull request row of that branch; chats on main sit under the main worktree and the main branch. Anything else is listed under "Chats without a branch", which is open whenever it has chats. Each row shows its chat count as a link that opens or closes the list (remembered per workspace) and "N hidden" for chats the Show idle toggle or a state chip hides.
- Fixed: worktrees, branches and pull requests are no longer dropped silently when idle is hidden. Only a state chip that is off removes rows; the header counts then read "3 of 5 branches", a note says how many are hidden, and Show all brings them back.
- Fixed: the chat sub-row no longer widens the table columns, so the header and the cells line up in the worktrees table.

## 0.28.0
- Changed: the Open Work page is now Project status for the one repository of the first workspace folder. The body is three tables (worktrees, branches, pull requests) with a colored health badge on each row: dirty, unpushed, behind, remote gone, failing checks, needs review, and a clear "safe to remove" for merged clean branches and worktrees. Chats sit inside the worktree or branch row they belong to (count and expander, with title, age, context %, state and the usual icon actions); chats outside git or with no matching branch are under "Chats without a branch". The attention chips (need you, to finish, waiting, to tidy) count branches, worktrees, pull requests and chats together and filter the rows. With no git repository in the workspace folder the page says "Open a git repository folder". The command is now titled "Saropa Chat Explorer: Project Status" (command id unchanged).
- Added: every git worktree of the repository is listed, including idle ones, with the full path as a tooltip.
- Added: every section header expands and collapses. The state is remembered per workspace.
- Removed: the "This workspace only" toggle, the "Group chats by" menu, the repository sort and the separate "Branches without a worktree" section. Only the workspace repository is read and shown.
- Changed: tighter layout. Action icons sit beside the title on wide windows; narrow windows use a grid.
- Fixed: idle worktrees disappeared when the idle filter was on.

## 0.27.0
- Changed: Info (search tips), Sort and Status filter icons moved from the search row to the view title bar, next to Open Work. Each opens a quick pick (the current sort and the number of hidden statuses show in its placeholder). The search box now uses the full row width.
- Removed: the in-panel tips, sort and filter popovers, and the "changed" dots on the sort and filter buttons.

## 0.26.0
- Added: a GitHub status indicator in the Open Work top bar: lookup off, gh missing, not signed in, rate limited, failed, or OK with repo count and lookup age. The tooltip gives the next step. `gh auth status` joins the read-only allow-list (cached 60 seconds). SECURITY.
- Added: a branch with an open pull request but no chat or worktree gets its own row, with PR, checks and PR buttons.
- Added: the branch name opens its pull request, or the branch on github.com (github.com remotes only, built by the host).
- Changed: all action buttons are icon buttons with tooltips. State badges, PR status and context percent are colored. Context shows only the percent.
- Changed: the PR cell says "unknown" plus the reason when a repository's lookup failed. "no PR" now means the lookup worked and found none.
- Fixed: Open Work header columns overlapped and cells truncated to one or two characters. The wide layout now starts at 1080px (1360px with PR lookups on) and the action column is 260px.

## 0.25.1
- Fixed: pull request review state was never recognized on the Open Work page. GitHub's words (APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED) reached the page unconverted, so approved and changes-requested pull requests never landed in "To finish" and the summary showed raw codes. They now show as "approved", "changes requested" and "review requested". The 0.24.0 note below that said approved pull requests moved to "To finish" was not true until this release.
- Fixed: "All clear" and "Scan finished: 0 items open" appeared when parts of the scan had not been read. They now need the whole scan to have finished: no "more folders not scanned", no repository timed out or failed, every chat folder read, and the pull request lookup answered (a repository that is simply not on GitHub does not block it). Otherwise the page says "Scan finished, but some parts were not read".
- Fixed: an approved pull request whose checks are unknown (still loading or failed to load) no longer moves a row to "To finish". Unknown facts never move a row.
- Fixed: on Windows the copied remove and delete commands could run extra commands in cmd.exe. A path or branch name with `& | < > ( )` now gets no command ("Remove manually"). Windows buttons and messages say "PowerShell command". macOS and Linux are unchanged.
- Fixed: a repository that is not on GitHub was reported as "not signed in to gh". It now says "not a GitHub repository", and that answer is remembered for 5 minutes so gh is not started again on every scan.
- Fixed: the sidebar card could time out behind the Open Work page's gh calls. The page now uses at most 1 of the 2 gh slots, and the card's 10 second limit counts only the time its own commands run, not the wait for a slot.
- Fixed: in a fork workflow (origin is your fork, the pull request goes to the parent) your own pull request was hidden from Open Work. Pull requests are now matched by the owner of the origin remote, and only other people's are skipped. Your own pull request also wins over someone else's fork pull request with the same branch name, even if that one has a higher number.
- Fixed: Escape closed the sort or shortcuts menu and also collapsed the row behind it, and j and k moved focus while the shortcuts list was open. Escape now closes the menu first and the keys wait.
- Fixed: the "merged" branch list was cut at 500 names alphabetically. It now reads up to 5000 and says "too many branches" beyond that, and branch names are read so a tag with the same name cannot change them.
- Fixed: one pull request with an unusable number no longer fails the whole repository; that pull request is skipped.
- Fixed: the copied summary now removes bidirectional text control characters, AWS-style keys and long base64-like strings.
- Changed: the `gh pr list` allow-list requires the exact argument list (no `-R`, `--web`, `-q` or extra fields), and the git allow-list gains exactly one shape, `git remote get-url origin`. SECURITY.md lists every command shape, the 8 second limit and that copy commands are never run.
- Changed: the shipped worker no longer has a test hook for slow loads; the build check injects the delay itself. The build now also runs an end-to-end check that sends real recorded gh output through the pull request layer into the page, plus checks for each fix above. A stray .DS_Store was removed from the repository.

## Before 0.25.1

- Search the full text of your chats from the sidebar. Results stream in live, title matches rank first, and results come from a background index that never freezes the editor.
- Search words narrow results: file:, edited:, cmd:, tag:, sha:, pr:, branch:, last: and from:. A Search tips menu lists each one with an example.
- Exact phrase by default, with toggles for match case, whole word, any order and regular expressions. Search history works like VS Code Search with Up and Down.
- Filter by time, by how many recent messages to search, by who wrote the message, and by status. Sort by score, time, length, cost or context.
- Open in editor shows every match in a read-only tab, with context lines and real line numbers.
- Search finds subagent chats and nests their matches under the parent chat.
- Each chat is one row with a status dot (running, waiting, unread, open), a time, and a context-full pill. Open a row for stats, tags, git facts and related chats that touched the same files.
- Pin, archive, tag and mark chats read. Import your Claude Code archive on request. Copy a hand-over note or session id.
- Git section on each chat card: branch, uncommitted files, unpushed commits, worktrees and the open pull request. A read-only `gh` and `git` allow-list is documented in SECURITY.md.
- Right-click a file for the chats that touched it. A status bar count shows chats for the active file.
- Warnings appear when a live chat nears a full context window.
- Open Work page lists chats, worktrees and pull requests per repository, grouped in bands (Needs you, To finish, Waiting on others, Ready to tidy, Idle), with PR and check status.
- Open Work page has filters, sort, keyboard shortcuts, Mark done, Copy summary and Copy remove or delete commands. It never changes your repositories.
- Show Diagnostics reports the version, index state and Claude Code detection.
