# Changelog

Release notes for Saropa Chat Explorer, newest first. Dates are the git dates of each release.

## Unreleased
- Fixed: the "Auto-title sessions" toggle can no longer fail. If VS Code refuses to write the setting, the choice is kept in the extension and applied at once, and a plain message offers Reload Window. The output channel logs the extension version and install path at start.
- Fixed: the "Auto-title sessions" toggle in the "..." menu now says when it fails (for example when the window must be reloaded to pick up the setting, with a Reload Window button) and confirms the new state. Each session it titles is logged in the output channel.

## 0.39.0
- Added: a read-only Claude Config screen (command "Claude Config", "..." menu of the view). It lists your global (`~/.claude`) and project Claude Code configuration (CLAUDE.md, settings, permissions, hooks, MCP servers, rules, skills, agents, commands) with findings by category: bloat, duplication, redundancy, gaps, opportunities and risks. Shows the chat retention setting `cleanupPeriodDays` (3650 = 10 years) and flags large values. A "Copy for AI" button copies the facts, findings and an optimisation prompt as one Markdown block.

## 0.38.0
- Added: automatic session titles (setting `saropaChatExplorer.autoTitle.enabled`, default off). A live session is named once after its first prompt (topic emoji plus the first sentence, up to 50 characters) and renamed once after its third prompt, by appending a title line to the session file. Only the head and tail of the file are read, nothing runs on the prompt path, and sessions you named yourself are skipped. The emoji comes from keyword rules: 26 built-in areas, extendable with `saropaChatExplorer.emojiRules` (`emojiRulesReplaceDefaults` drops the built-in ones). `autoTitle.useHaiku` (default off) asks Haiku in the background instead. Replaces the local session-title hook.
- Added: cumulative token totals per session and per branch or pull request (input, output, cache read, cache write, kept separate, no price). Shown as a Tokens figure beside the context figure in the sidebar card, in the expanded detail of an Open Work chat, and as a per-branch total on each Open Work branch row. /compact never lowers them, and sub-agent replies count. Other extensions can read them with `tokensForChat(id)` and `tokensForWork(key)`; every method is described in docs/API.md. Existing session caches rebuild once.
- Added: the public API now exposes everything read-only: `listChats()`, `getChat(id)`, `listWork()` and `getAccountUsage()` (chat context, tokens, branches, pull requests, pinned, archived, tags, state; branches and pull requests with their chats and tokens; account email, name, organization, plan and 5-hour and 7-day tokens). `apiVersion` stays 1. See docs/API.md.
- Added: an "Account & Usage" section at the top of the sidebar (closed until opened). It shows your Claude Code email, name, organization and plan from `~/.claude.json`, or "Not signed in", and the tokens used in the last 5 hours and last 7 days (input plus output, with cache tokens beside them), summed from your local transcripts. Offline and read-only: no keychain, no network. Limits are set by Anthropic, so no percent of limit is shown.

## 0.37.0
- Added: a public API for other Saropa extensions. `activate` now returns `chatsForFile(path)`, the sessions that read or edited a file (id, title, edited, last used, branch), cached 30 seconds per file. The Saropa Workspace Release Board uses it to show which sessions touched a document.

## 0.36.0
- Changed: on the Project Status page, branches and worktrees created by the same session fold into one row titled with that session, with a collapsed "N branches" list. A branch with its own pull request, uncommitted or unpushed work, or its own need stays a separate row. Section counts and the headline count the folded row once.
- Fixed: on the Project Status page, one session that created many worktrees no longer repeats its "Answer the question" or "Working..." state on every one of those rows. The state shows on one row only.

## 0.35.0
- Added: an Options screen ("..." menu of the view, command "Options") that edits every Saropa Chat Explorer setting. The form is built from the extension's settings list, so new settings appear automatically. Each setting has Reset to default, changes made elsewhere show live, and Web sessions still asks for its one-time consent.
- Added: opt-in, read-only Web (cloud) sessions. Setting `saropaChatExplorer.webSessions.enabled` (default off) adds a Local | Web toggle; the Web list shows title and age, and opening one fetches its transcript on demand into a read-only Markdown tab. It uses an unofficial, undocumented Anthropic API with your Claude Code login token (read-only, never stored, refreshed or logged) and asks you to confirm once before the first call. Failures show a notice in the Web tab only. If you are signed out it says to run `claude auth login`. With the setting off there is no network call and no credential read.
- Added: the Saropa Chat Explorer activity-bar icon shows a blue count badge of sessions waiting for you, and clears it when none are.
- Changed: a waiting dot now bounces once every few seconds instead of throbbing constantly. Reduced-motion and the animate-dots setting still turn it off.
- Changed: the Open Work page is redesigned around "do X, because Y". Needs you and Unfinished are one ranked "Your move" group, followed by In progress, Safe to remove and Everything else (which also holds chats without a branch). Each branch is two lines with a headline (Answer, Read, Fix checks on, Address review on, Merge, Commit, Push, Remove worktree, Prune), one action and a "..." popover for the details. The header reads "Next: ... · N more need you · N waiting". Chat rows open the chat on click; star and mark-read appear on hover or focus. Sort and filters share one View menu.
- Added: a Density option in the View menu of the Open Work page. Relaxed (default) gives rows more room; Compact restores the tight layout. The choice is saved with the view.
- Fixed: pinned sessions are now stored per workspace instead of being shared across all VS Code projects. Existing pins are copied into each workspace the first time it is opened; after that they are independent.
- Changed: search result rows no longer show the "N hits" pill. The occurrence count is now in the tooltip of the "+N more" button.
- Changed: the "+N more" button now sits at the right edge of the search result row.
- Added: setting `saropaChatExplorer.search.contextLines` (1 to 4, default 1) sets how many lines of each matching snippet a search result row shows.
- Changed: user-visible "chats" wording is now "sessions".
- Removed: the "N sessions" label above the Pinned section. It repeated the count badge on the All sessions header.
- Changed: the session list groups are now "All Sessions" (today), "Yesterday", "This Week" (the last 7 days, not counting today or yesterday) and "Older".
- Changed: the relative-time label on each session row is smaller.
- Changed: the status filter moved from the view title bar to a filter row above the session list. It is a dropdown button (funnel and chevron) with a count pill when a filter is on, and a menu of statuses with counts. The Filter by Status command still works from the Command Palette.
- Added: an "Active" quick-filter chip with a count that shows only open chats that are running, waiting, unread or waiting on background agents.
- Added: "Regenerate Session Titles" command and a sparkle button in the view toolbar. Pick This project or All projects, preview old and new titles first, then write; each transcript is backed up under ~/.claude/backups/session_titles first. Live sessions (active or edited in the last 5 minutes) are skipped.
- Fixed: the orange unread dot no longer stays on the chat you are looking at. It clears when you switch to that Claude tab or refocus the window, and is not set while that tab is active in a focused window.
- Changed: the Pinned, All sessions and Archived headers share one style (normal weight, same size, no uppercase). "Archived chats" is now "Archived sessions".

## 0.34.0
- Added: Pin Chat and Unpin Chat commands in the chat row context menu, and a pin button next to Archive on the Project Status page. Pinned chats list first there, as they already do in the sidebar and results. Pins are stored as before.

## 0.33.0
- Added: "Work week (Mon-Sun)" in chats active during keeps the old this-week behavior (since Monday 00:00); "this week" stays the rolling last 7 days.
- Changed: "this week" in chats active during is now the rolling last 7 days (was since Monday 00:00), for active and archived chats alike.
- Added: a third search scope checkbox, Archive (off by default, remembered like the others). Off: searching does not match archived chats (the Results editor already skipped them). On: search text and filters also include archived chats, which list in the Archived section. With no search text the Archived section stays visible either way.
- Changed: the search scope checkboxes read Subs, Archive, External (was Subagents, All projects), in that order. Their settings and behavior are unchanged.
- Added: tooltips on every filter dropdown and label, the search box, section headers, message pills, the Resume button and the status filter Reset link.
- Added: the chat open in this window is highlighted in the list like the official sidebar (selection background, bold title). It follows the focused Claude tab and updates when you switch tabs; with no Claude tab focused it uses the last active tab, else the only live chat of this window.
- Changed: archived chats show a dimmer title and a greyscale emoji.
- Changed: the Archived header reads "Archived chats" in sentence case with a smaller count pill, matching the official sidebar.
- Changed: the row size chip (Tiny, Empty, Abandoned) is replaced by a small ring that fills as the chat's context tokens grow, with a warning color at 80% and an error color at 100% or more; hover shows "136.8k of 300k tokens". New setting `saropaChatExplorer.contextRingTokens` (default 300000, minimum 10000) sets the limit and applies at once. The Tiny, Huge, Empty and Nearly full statuses and filters are unchanged.
- Changed: the dot animation is a minor throb (scale 1.15); dots with several states cycle through their colors while throbbing; grey (idle) dots never animate.
- Fixed: a chat with two or three states at once (for example running plus background agents) showed no dot at all in the sidebar and Project status. The colors were set with inline styles, which the webview security policy blocks; they now come from CSS classes.

## 0.32.0
- Added: the Command Palette command "Saropa: Usage Summary" shows cost per day, week, project and model and the 10 priciest chats (click resumes one).
- Added: a status bar item, shown only when a chat is at 80% context or more, reading "N chats near full"; click opens the sidebar on the Nearly full status. Setting `saropaChatExplorer.showUsageStatusBar` hides it.
- Added: the 90% context warning also offers "Copy hand-over note" (still once per chat per crossing; `saropaChatExplorer.contextWarnings` turns it off).
- Added: export a chat as Markdown from the row context menu, with a save dialog.
- Added: "Copy resume command" on the row context menu (`cd <folder> && claude --resume <id>`).
- Added: the Command Palette command "Saropa: Archive Empty and Tiny Chats" with a modal count confirmation.
- Added: a commit id in the Unpushed commits list searches for the chat that made it (`sha:`).
- Added: a purple dot for a chat waiting on background agents or shells (found from the chat transcript: a launch with no finish notice yet). A chat with several states at once (for example background and unread) alternates between their colors, and the tooltip lists all of them. New color `saropaChatExplorer.dotBackground`.
- Added: setting `saropaChatExplorer.animateDots` (default on) animates the dots; off, or with reduced motion on, they stay still and show the most important state.
- Changed: the file menu command is titled "Saropa: Find Related Chats" (was "Saropa: Related Chats").
- Changed: the Project status page is simpler. One header row (filter box, Filters, Sort, Refresh, "⋯" for Summary, Shortcuts, GitHub status and Show done) and one summary line ("proj — 2 need you · 4 waiting · 3 to clean up"). The group chips, the totals and the "Updated" line are gone (the update time is in the Refresh tooltip); the four state filters moved into a Filters popover with a count badge. The number next to a group always equals the rows listed in it.
- Changed: the "Safe to remove" group is now "Cleanup" and also holds leftover folders git does not list; Cleanup and Idle start closed.
- Changed: each Project status row has one labeled action (Open chat, Open PR, Ask to finish, Ask to clean up, Copy remove command, or "Working…"); the icon buttons moved into a Details block with the creator line, which replaces the Created column. A PR or vs default column that is "—" in every row is left out.
- Changed: Project status reasons are short (a word plus at most 6 words, the full sentence in a tooltip), the default branch gets a small "default" badge, and row tooltips open above the row.

## 0.31.0
- Fixed: `file:<path>` finds chats that only mention the path in text or commands (untracked files, prose), not just chats whose tool file fields held it.
- Changed: search ranking decays the whole score with age (smoothly, never below 30%), so recent and live chats come first among comparable matches.

## 0.30.0
- Changed: the sidebar chat card matches a chat to its branches, worktrees and pull requests with the same matcher as Project status. The folder the card reads is the worktree the chat (or one of its subagents) created, else the worktree it ran in, else the one for the branch its rows record, else its last folder as before. Counts, the Git, Worktrees sections and the hand-over note use that folder; the pull request is looked up for that branch in that repository.
- Added: the Git section of a chat card shows "Created by: created branch X at <local time>", a "Made here (N)" list of every branch and worktree the chat or its subagents created (live ones, and ones "created, now removed"), "Also used" worktrees and branches, and a collapsed "Mentions only (N)" row for names the chat only mentions. A row tooltip shows the command, tool_use id and transcript line. A chat that created something never shows a blank branch area.
- Changed: the Worktrees section marks every worktree the chat created as its own, and lists the removed ones as "created, now removed".
- Changed: the "branch:" search token also matches branches a tool call of the chat or its subagents created (shown as "(created)"); a mention never matches as a creator.
- Changed: the page is titled "Claude Project Status" with the extension version as a subscript. Collapsible sections toggle from the whole header width and show a dim chevron on the right.
- Fixed: Project status showed "0 of 2 worktrees" and one branch because the page state an older build saved (every state chip off) was still read. Saved chip state and saved filter/sort/section state now carry a version; state from another version is ignored and every chip starts on.
- Changed: Project status separates the chat that created a worktree or branch from chats that only name it. A chat whose tool call (or whose subagent's tool call) ran git worktree add, git checkout -b, git switch -c or git branch is the creator and is listed first. Every other chat that only contains the name goes under a closed, muted "Mentions only (N)" toggle on the row and is never merged into the main list. A row with no creator shows the best name-only chats as probable; a name in a chat of another repository, or only in your own question, is always mention only. Relative worktree paths (../name, ./name, git -C <dir>, cd <dir> && git worktree add) are resolved against the folder the tool call ran in, and a subagent whose instructions state the worktree folder counts as its creator. Chats are re-read once after the update.
- Changed: Project status is one overview table, "Work", instead of the Worktrees, Branches and Pull requests tables: one row per branch with its worktree folder, creation time, pull request and chats folded in; pull-request-only branches, remote-only branches and folders git does not list are rows of the same table. The page opens with a headline in plain words ("3 branches: 1 needs you, 1 has unpushed work, 1 is safe to remove") and the rows are grouped by what to do: Needs you, Unfinished work, Waiting, Safe to remove, Idle. A group with no rows is not drawn. Each row reads as a line: the branch name, one verdict word (Dirty, Unpushed, PR failing, PR open, Merged clean, No PR, Remote only, Not a registered worktree, Behind, Active chat, Needs you) and one reason in words ("26 files not committed, 11 behind main", "34 commits not pushed", "Same as main, nothing unique"), at most two tags, the rest in a tooltip. The summary strip has a button per group with its count plus the totals (branches, worktrees, PRs, chats); the Show idle button, the empty-state lines, the pull request author note (now a tooltip on the PR column header) and the repository header block are gone.
- Fixed: rows were still hidden in the installed build because the chip state an older build saved (Needs you, To finish, Waiting and To tidy all off, no version) was read as a choice of the owner. The saved group state now carries a version (bumped again), anything saved by another version is ignored, and a row is never hidden by default: "N of M rows shown" and a Show all button appear only when the owner turned a group or a filter on.
- Changed: the chats of a row are closed behind a count button (the creator chat is named in the Created cell); "Chats without a branch" is closed at the bottom. Chats are never filtered by the group buttons, only the rows are.
- Added: "Ask <chat> to clean up" on every row that has a creator chat (a tool call of the chat or of its subagent made the branch or worktree; a mention never counts). Two icon buttons: Copy prompt, and Resume (opens the chat; the Claude Code panel cannot be pre-filled, so the prompt is copied for pasting and a toast offers the "cd <worktree> && claude --resume <id>" command). The prompt is plain text under 4000 characters and carries receipts per item: branch, worktree path, PR number and checks; when it was created (UTC and local); the tool call time, tool_use id, exact command, session id, transcript path with line number and the subagent id; the branch reflog creation line as independent proof; the commits only on the branch (10 at most, "and N more"); the current state (uncommitted files with names, unpushed commits, ahead and behind). It ends by asking what each is for, what is unfinished and how it will be cleaned up, and not to delete anything before confirmation. The creator chat row has "Ask about all of this chat's leftovers" for one prompt covering everything it created. Nothing is run by the extension.
- Added: the Created cell shows when the branch was made and by which chat; its tooltip lists the exact UTC and local time, the command and the transcript line (the receipt).
- Changed: the chat index keeps, for every worktree or branch a tool call created, the time, tool_use id, the exact command (300 characters) and the line of the transcript file; the record format changed, so chats are re-read once after the update.
- Fixed: the worktree folder of `git worktree add` was taken from the start point when the folder was a variable (`git worktree add --detach "$W" origin/feat/x`), giving folders like contacts/origin/main; the first word after the options is the folder, the second is a start point and is never a folder, `NAME=value` set earlier in the same command is resolved, and arguments in the wrong order (start point first) make no folder. Entries for worktrees and branches that were removed later are kept.
- Added: unmerged branches that exist only on origin are rows with the state Remote only; folders named <repo>-wt-* next to the checkout (or one level up) that git does not list are rows with the state Not a registered worktree, with a hint and the chats that name them.

## 0.29.0
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
