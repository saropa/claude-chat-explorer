# Changelog

Release notes for Saropa Chat Explorer, newest first. Dates are the git dates of each release.

## 0.22.0 - 2026-10-05
- Added: an Open Work page. Run "Saropa Chat Explorer: Open Work" from the Command Palette, or press the checklist icon in the title bar of the sidebar, and a tab opens with one row for every chat from the last 14 days (change it with the new setting "Open Work Days", 1 to 90), plus every chat that is open now, minus archived chats. Each row shows the chat state dot, the title, the project folder, how full its context is, how long ago it was active and whether it is pinned.
- Added: chats are placed in bands: "Needs you" (waiting for your answer, or finished while you were away), "Waiting on others" (running now) and "Idle" (everything else). The "To finish" and "Ready to tidy" bands are there but stay empty until git and pull request state arrive in a later release; the page says so. Group the list By attention, By chat or By repository (the project folder for now), turn bands on and off with the count chips at the top, and show or hide idle chats. Your choices are remembered.
- Added: each row has Open chat, Copy hand-over note, Find (runs a search for the chat in the sidebar) and Archive (with an Undo in the message that appears). A row expands to show its full title, folder, last active time, context use and a plain next step. Arrow keys move between rows, Enter opens the chat, Space or Right opens a row, Left or Escape closes it.
- Added: at 760 px or wider the page is a table with columns; narrower it is a stack of cards with no sideways scrolling. While the search index is first being built the page shows "Indexing..." and says the list may be incomplete, then fills in by itself. If the chat list cannot be read, or nothing answers within 20 seconds, it shows "Could not load chats" with a Retry button instead of waiting forever.
- Changed: the menu and tooltip code is now one shared module used by both the sidebar and the Open Work page. The sidebar looks and behaves the same.
- Changed: the build check now runs through one shared test harness with a fake clock. It runs the sidebar and the Open Work page (at 400, 760 and 1400 px), fails on any script error, checks that popovers and tooltips stay inside the window, scans the new page for fixed fonts, fixed colors and agent names, and starts the real search worker to check that the chat list answers at once. A second check makes sure the Open Work code only makes soft worker requests (so it can never restart the search worker) and that the read-only git and gh command list has not changed.

## 0.21.1 - 2026-10-05
- Changed: Copy hand-over note now writes everything the card shows: the Git section (branch, ahead and behind, open pull request with number, title and link), Uncommitted files (count and up to 20 names), Unpushed commits (count and up to 20 with short id and subject), Worktrees (path, branch, which one this chat used) and Related chats (title, id, shared files), after the chat title, session id, folder, branch, last active time and context percent. The parts are read at the same time with one 5 second limit. A part that fails or is too slow is written as "Not available" and the copy never waits longer. The button shows "Copying..." and then "Copied".
- Changed: the Related chats header always shows a dimmed 0 when no chat shares files; it still opens and says "No other chat touched the same files".
- Changed: the stat labels in the info panel (Messages, Last active and so on) have 1 px more space above them.
- Changed: the extension no longer names a specific agent in its text, so it can work with other agents later. The "messages from" drop-down is Both, You and Agent, the search prefix is from:you or from:agent (from:claude still works, so saved searches keep working), and tooltips, notices, settings text and the README use neutral wording. Command and setting ids are unchanged.
- Changed: the tag editor wraps. Tag chips and the input flow onto new lines instead of overflowing at narrow widths, and long tag names are cut with an ellipsis.
- Changed: the "Enter to add, Esc to cancel" hint is no longer on screen. It is a tooltip on the tag input, and the placeholder is "Add tag".
- Changed: the build check covers the neutral wording, the full hand-over note, the zero Related pill, the stat label margin and the tag editor.

## 0.21.0 - 2026-10-05
- Added: when you expand a chat card, the counts on its Git, Uncommitted files, Unpushed commits, Worktrees and Related chats sections now load by themselves in the background, so you can see which sections are worth opening. The sections still load their contents only when you open them. Each count shows a small faint "..." until it arrives and then fills in without redrawing the card or closing any open section. If a count cannot be read (slow git, no upstream branch, not a git folder) no number is shown and there is no error. The Git count is the number of open pull requests and appears only when pull request lookups are on. Counts are reused for 30 seconds, so closing and reopening a card does not ask again. Collapsed cards never load anything, and counting never slows down a search.
- Changed: the count badge in the section headers is one step smaller with tighter padding, and a zero count is dimmed so sections with something in them stand out. A section with zero can still be opened.
- Changed: the build check now covers the counts: one request on expand and none for collapsed cards, badges filling in place, the "..." placeholder, dimmed zero, and stale answers being ignored.

## 0.20.1 - 2026-10-05
- Changed: the Search tips menu is easier to read: one example chip per row with a short plain description beside it, grouped under two quiet headings, in the VS Code font and theme colors.

## 0.20.0 - 2026-10-05
- Added: an info icon beside the sort and filter icons opens "Search tips". It lists every prefix the search understands (file:, edited:, cmd:, tag:, sha:, pr:, branch:, last: and from:) with one example each. Click an example to put it in the search box and run it.
- Added: search by who wrote the message. The new "messages from" drop-down in the search details has Both (default), You and Claude. You means only your own messages; Claude means Claude's replies and everything a subagent said. It changes hit counts, snippets, the nested subagent rows and Open in editor. The summary line adds "from you only" or "from Claude only" when it is not Both, the choice is remembered with your other search settings, and the "..." count includes it. You can also type from:you or from:claude in the search box. File, tag and git filters are not affected by it.
- Changed: the search box hint is now just "Search chats". It used to be cut off by the four option buttons; the prefixes now live in Search tips.
- Fixed: the sort and status menus opened off-screen or squeezed to one letter wide. They now open inside the panel under their icon, never wider than the panel (8 px margin), wrap long text, and close when you scroll the panel. Checked at 220, 330 and 600 px wide.
- Fixed: the sort menu shows its options in two neat left-aligned columns.
- Changed: all panel text now uses the same font, size, weight and line height as VS Code's own Search view (13 px by default, following your VS Code settings). Code and file paths use the editor font. No size or font is hard-coded any more.
- Changed: the build check now covers the tips menu, menu placement at three widths, the author filter and a scan that no fixed font is left in the page styles.

## 0.19.1 - 2026-10-05
- Fixed: a chat whose branch has the same name as a tag (for example both called main) showed no upstream and no unpushed commits.
- Fixed: a chat in detached HEAD now shows "detached at <short id>", and Unpushed commits says "Detached HEAD: no branch to push" instead of "no upstream branch".
- Fixed: a folder with no commits now shows its branch name and "No commits yet" instead of "unknown".
- Fixed: when git could not list worktrees (for example it timed out), the Worktrees section said "No worktrees found". It now shows the error with a Retry link.
- Fixed: Escape closed only the tooltip when one was showing, so the sort and status menus needed two presses. One press now closes both.
- Fixed: open chats now list first only in All sessions when you are not searching. They no longer reorder a "No matches" list, and pinned chats that are not open stay in their usual place.
- Fixed: the Tiny tooltip now says "1 to 3 messages" (no messages is Empty). Mid-size now reads "10 MB or less" everywhere, matching Huge ("over 10 MB").
- Fixed: a Git file or pull request link from a card you closed could still be resolved later. The list is now cleared when a card closes or reopens.
- Changed: removed code that nothing used (the old export job, saved export options, a leftover related-chats field and two style leftovers).

## 0.19.0 - 2026-10-04
- Changed: in a chat card, Git, Uncommitted files, Unpushed commits, Worktrees and Related chats are now five separate sections stacked one under the other. All five start collapsed. Nothing is fetched until you open a section, so opening a card is much lighter. Each section shows "Loading..." while it loads and a count when it arrives, and a failed or slow one shows a Retry link. Unpushed commits now lists the commits (short id and subject).
- Changed: sort and status moved out of the search details into two icon buttons beside the search box. Each opens a small menu (sort choices; a checkable status list) and shows a dot when it is not at its default. Escape or a click outside closes it. Both apply to search results and to All sessions.
- Changed: the status "Normal" is now called "Mid-size" (a chat with none of the other statuses: 4 to 299 messages, 10 MB or less, active in the last 30 days, context under 80 percent, not pinned, not running, waiting or unread). Each status in the list has a tooltip with its exact rule. Your saved status choices still load.
- Changed: in All sessions, chats that are open (with a dot) now list above chats that are not open, even when the others were active more recently, with a thin divider between the two blocks. Pinned chats are unchanged.
- Changed: the search details are more compact: each drop-down sits beside its label, drop-downs are the same height and corners as the search box and use its colors, and the gap under the "..." button is smaller.
- Fixed: Up and Down in the search box now only walk the search history. Down in an empty box shows the newest earlier search. Down at the newest end of a non-empty box moves to the first chat in the list.
- Removed: the Export button in the panel. Open in editor (the summary line under the search box) shows the same matches.
- Changed: the build check now also covers the collapsed sections, the sort and status menus, the arrow keys and the open-chats-first order.

## 0.18.2 - 2026-10-04
- Fixed: a bug since 0.15.2 where expanding a chat that has related chats stayed on "Loading..." forever (no Git section, no Related chats), and the panel then stopped updating while that card was open (search results, status dots and pins froze). A renamed helper was still called by its old name.
- Fixed: one section that fails to draw (stats, Git, files, Related chats) now shows "Could not show this section" and no longer stops the rest of the card or the panel.
- Fixed: the card no longer waits forever when details cannot be loaded (chat not indexed yet, invalid search pattern, or a slow read). It shows "Could not load details. Retry" with a Retry link.
- Fixed: a slow card load, hand-over note or git lookup no longer restarts the search worker, so it cannot cancel a running search or show "Search timed out: simplify the pattern".
- Added: the build now runs the panel script against sample messages and stops the release if it throws.

## 0.18.1 - 2026-10-04
- Fixed: expanding a chat card could leave its Git section on "Loading..." forever. Every git and gh call now has a hard time limit (git 5 seconds, gh 8 seconds), is killed when it runs out, cannot wait for input and never takes git locks. The whole section gives up after 10 seconds and shows "Git info timed out. Retry" with a Retry link. A timed-out load is not remembered, so Retry starts clean.
- Changed: the Git section now loads in two steps. Branch, files not committed and worktrees show first; the pull request lookup follows ("Looking up pull requests...") and a slow or failed lookup no longer holds back the rest.
- Changed: the Status filter moved from the main row into the search details panel (the "..." toggle). While the panel is closed and a status filter is on, the "..." toggle shows its count dot.
- Changed: the "All sessions" and "Results" headers (and a lone day header) are gone when there is only one group; the rows sit directly under the summary line. With no search, the summary line shows the chat count. Headers stay when Pinned shows or when there are several day groups, and the Archived section is unchanged.

## 0.18.0 - 2026-10-04
- Added: one summary line under the search box, like VS Code Search: "2,040 results in 265 chats - Open in editor". While a search runs it shows the progress instead, and it is hidden when the search box is empty. It replaces the chat count and match count that used to repeat in the Results header.
- Added: Open in editor (also the command "Saropa Chat Explorer: Open Results in Editor") opens every match in a read-only editor tab titled "Search: your query". The top says how many results and chats, then each chat has a header line (title, project, date) followed by its matching lines with one line of context above and below. Line numbers are the real line numbers in the chat's JSONL file. Matches are highlighted. Ctrl+click (Cmd+click on Mac) a chat header to resume that chat in the Claude panel. It uses your current query, filters, sort and the Match Case, Whole Word, Any Order and Regex toggles, and says in its header when the result limit cut the list.
- Changed: the search box and its Aa, ab, shuffle and .* toggles now match VS Code's own input boxes (a little taller, 2px corners, theme placeholder and focus colors). All panel text uses the VS Code font family and the editor font size variables.

## 0.17.1 - 2026-10-04
- Fixed: the 0.17.0 package shipped old compiled files, so the Git section did not work. Packaging now deletes and rebuilds everything first.
- Changed: the Worktrees row appears only when the repository has more than one worktree, and the worktree the chat uses is marked even when the folder is reached through a link.

## 0.17.0 - 2026-10-04
- Changed: git information now lives in the chat card. Expand a chat and open its Git section to see the branch (with commits ahead and behind), files not committed (click a file name to open it), commits not pushed, the worktrees of the chat's repository, the open pull request (click to open it in your browser) and the PRs and commits the chat mentions. The section has a count pill like Related chats, opens by itself when the chat has git state and loads only when the card opens.
- Removed: the second activity-bar icon "Saropa Git Activity", with its Git Activity tree and Work in Progress view. Their Refresh, Copy Summary, Group by Chat, Group by Worktree and Show Clean Chats commands are gone too.
- Removed: the setting `saropaChatExplorer.workInProgressDays`. The card shows the worktrees of its own folder, so no grouping or day range is needed. `saropaChatExplorer.lookupPullRequests` stays and now controls the pull request line in the Git section.
- Changed: the Git icon on a row still shows how many PRs and commits the chat mentions, and clicking it opens the card at the Git section.

## 0.16.0 - 2026-10-04
- Changed: dots are plain now, like the official Claude sidebar. Green is running, blue is waiting for you, orange is unread, grey is open but idle. The rings and outlines are gone. Hover a dot to see whether the chat is open in this window or another one.
- Changed: a chat counts as open when it has a tab in Claude Code, even if no Claude process is running for it (a restored tab). Those chats now show a grey dot, so the dots match the sidebar's open list.
- Added: Show Diagnostics lists the number of open tabs and which VS Code workspace database the tab list came from.

## 0.15.3 - 2026-10-04
- Changed: dots now match the official Claude sidebar. Only chats open in Claude Code for VS Code show a dot (running, waiting for you, unread or open). Closed chats show none, and a chat that closes loses its unread mark.
- Changed: the Active status filter counts only those open chats. Chats open in a terminal or other Claude app get no dot.

## 0.15.2 - 2026-10-04
- Changed: every chat is one line. The time of the last message is plain text at the right edge ("now", "5m", "2h", "3d", "2w"), not a pill, and the title is cut with an ellipsis before it.
- Changed: the message-count pill and the "Huge" pill are gone from rows. The count stays in the title tooltip and the open card. A Huge chat shows a small chart icon with the tooltip "Huge chat".
- Changed: for open, unread or pinned chats the right side reads, left to right: "% full" pill, Git icon with its count, chart icon (Huge only), time. The Empty, Tiny and Abandoned chips and the "% full" pill now share the look of the other pills.
- Changed: the details arrow appears on hover, on focus and while the card is open, and covers the time and icons then. Search results keep the hits pill and show the time of the newest match at the right edge.

## 0.15.1 - 2026-10-04
- Fixed: plain rows no longer show tag chips or the message-count pill (only open, unread and pinned chats do). Related chats in the card now re-collapses for each new search and shows no "0" pill. Results with equal scores are now ordered newest first.
- Changed: with All projects on, plain rows show the project folder name next to the time again, including archived rows.

## 0.15.0 - 2026-10-04
- Changed: the chat list is calmer. Only chats that are open in Claude Code, unread or pinned show the status dot, the status chip (Huge, Empty, Tiny, Abandoned), the "% full" context pill, the Git icon and the open-window marker. Every other chat is a plain row: the title alone.
- Changed: a plain row shows its title and the time of its last message on the right (the time pill). The message count moves to the title tooltip and the card. Day groups still show how recent a chat is.
- Changed: the open card has a little more space between its sections. Every stat in it (Messages, Last active, Active for, Size, Context, Cost, Lines, Models) has a tooltip, including the full context text such as "19% (191k of 1M tokens)". The Lines tooltip says how many lines were added and removed in the chat's edits.
- Changed: Related chats in the card is collapsed when no other chat touched the same files, open when some did, and its count is a pill.
- Changed: with a search, every result still shows its hits pill and the time of its newest match. The dot and chips appear only for open, unread or pinned chats.
- Changed: search scans open and unread chats first, then the rest newest first, so their results appear first. The results and the result cap are the same as before.

## 0.14.4 - 2026-10-04
- The right-click item for finding the chats that touched a file is now named "Saropa: Related Chats".

## 0.14.3 - 2026-10-04
- Changed: "Saropa: Related Chats" no longer opens a pop-up list. It opens the Saropa Chat Explorer panel and searches `file:<path>` there (the workspace-relative path, or the full path outside a workspace). The status bar count opens the same search. Your other options are left as they are.
- New: for a `file:` or `edited:` search, each chat row shows a pill after the time: "edited" (green) or "read" (muted). With Score sort and a file-only search, edited chats come first, then read-only chats, each newest first.
- New: the expanded row has a Copy hand-over note button for every chat. The note holds the title, session id, folder, git branch, last active time, context percent and, for file searches, the file and whether it was edited or read.
- Removed: the pop-up list and its Copy list button. The Export button copies the matching lines instead.

## 0.14.2 - 2026-10-04
- Fixed: the result counts no longer repeat. "All sessions" showed "146 of 146 chats" next to a "146" badge; it now shows only the badge.
- Changed: search results show the number of matching chats once, in the badge. The grey text beside it now says something different: the total matches (for example "89 matches"), hidden-by-status-filter chats, or search progress. It is left out when it would repeat the badge.
- Changed: with sort by time, the single grey line above the day groups shows the total matches; each day keeps only its badge.
- Changed: badges have a tooltip and a screen-reader label that spell out the count once, for example "146 chats".

## 0.14.1 - 2026-10-04
- Changed: the search details (`...`) now hold all four settings, each with a label above it: chats active during, messages to search, sort results by, and search scope. Sort moved here from the main row. Labels have more space above and below.
- Changed: All projects and Subagents now sit on one row under "search scope" in the details.
- Changed: the row under the search box has two labeled buttons, Status (filter by status) and Export. They were unlabeled icons.
- Changed: the count on the `...` button now also counts a non-default sort, All projects ticked and Subagents unticked. Its tooltip lists them, for example "Hidden settings changed: sort by time, all projects".
- Fixed: Export looked disabled but could still be clicked and did nothing. It is now truly disabled until a search has results, with a tooltip saying so. Clicking it shows "Run a search first. Export copies the matching lines." for 4 seconds.
- Fixed: Match any order now says in its tooltip why it is off while regular expressions are on.

## 0.14.0 - 2026-10-04
- New: a Work in Progress view, the second view in the Git activity-bar container. It lists chats active in the last 7 days (or running now) that have something pending: files not checked in, commits not pushed, an open or linked pull request, or a running session. The view badge shows how many.
- Each chat shows its title, branch and state (running, waiting, unread or time since last active) with a colored icon. Open it to see the folder (worktree, main checkout or folder missing), the files not checked in (first 20, with status letters), commits not pushed or behind, the pull request, and an Open chat action.
- View menu: Refresh, Copy Summary, Group by Chat (default), Group by Worktree, and Show Clean Chats (off by default). Group by Worktree lists worktrees with their files, commits, pull request and chats, and a "Branches without a worktree" group. The grouping is remembered.
- New: pull request lookup with the local `gh` command, on by default. Turn it off with `saropaChatExplorer.lookupPullRequests`. If `gh` is missing, signed out or offline, the view shows one muted line "Open PRs unavailable" and nothing else changes.
- New: setting `saropaChatExplorer.workInProgressDays` (default 7, 1 to 60).
- Privacy change: the extension now starts read-only `git` commands, and, while the PR lookup is on, `gh`, which contacts GitHub with your own `gh` sign-in. The extension adds no network code of its own and never shows links. It never fetches, pulls, checks out, resets, cleans, stashes, commits or pushes. README and SECURITY.md list the exact commands.
- The view scans when it first shows, on Refresh, when it shows again after more than a minute, and 10 seconds after a running chat finishes. Never on a timer while hidden. At most 60 folders per scan; the view says how many were not scanned.
- Show Diagnostics now lists the two settings, folders scanned, whether git and gh were found, and the last scan time.
- The search index stores each chat's working folder, so the first start rebuilds the index once.

## 0.13.0 - 2026-10-04
- Changed: the extension id is now `saropa.claude-chat-explorer` (it was `saropa.claude-chat-search`), to match the name Saropa Chat Explorer.
- Action needed: uninstall `saropa.claude-chat-search`, then install the new version. Both cannot run side by side.
- Renamed settings (set them again if you changed them): `saropaChatSearch.maxResults` is now `saropaChatExplorer.maxResults`; `saropaChatSearch.contextWarnings` is now `saropaChatExplorer.contextWarnings`; `saropaChatSearch.showFileSessionsStatusBar` is now `saropaChatExplorer.showFileSessionsStatusBar`.
- Saved options (pins, tags, archived chats, statuses, history) and the search cache start fresh once, because VS Code keeps extension data per id. The cache rebuilds on first start.
- Commands in the Command Palette keep their titles; only their internal ids changed (affects custom keybindings).

## 0.12.2 - 2026-10-04
- The right-click item for the chats that touched a file now reads "Saropa: Chats That Touched This File".

## 0.12.1 - 2026-10-04
- Renamed to Saropa Chat Explorer. The name shows in the Extensions list, the activity bar, the panel, messages, the output channel and the Command Palette. Settings, commands and your saved data keep working as before.
- Changed: the file menu has one item, "Saropa: Chats for This File", in the Explorer, editor and tab menus. It lists the chats that touched the file, edited ones first. Use the buttons on a row to copy a hand-over note or to search the panel.
- Removed: the menu items "Find Chats For This File" and "Find Chats That Edited This File". Search `file:<name>` or `edited:<name>` in the panel, or use the button on a row.

## 0.12.0 - 2026-10-04
- New: a context pill on the pill line shows how full a chat's context window is. It appears only from 60 percent: amber at 60 to 79, orange at 80 to 89, red at 90 and above, such as "82% full". Its tooltip shows tokens used of the window, the model, the number of compactions, and notes when the figure lags one turn or the window size is a guess.
- New: the open card has a Context stat, such as "82% (164k of 200k, opus-4-6)". Chats with no usage data show nothing.
- New: a Context sort (fullest first, chats with no data last) and a "Nearly full" status (80 percent or more) in the status filter. It is checked by default, like the other statuses.
- New: a notification when a live chat reaches 80 percent ("Claude may auto-compact soon") and 90 percent ("Start a new chat or run /compact soon"), with Open chat and Dismiss. Each chat warns once per level and again after a compaction. At most one per check and 3 in 10 minutes. Old idle chats never warn. The setting `saropaChatSearch.contextWarnings` (default on) turns it off.
- Changed: Show Diagnostics lists how many live chats are at 80 percent or more.
- Note: the figure approximates Claude Code's own and lags one turn. Window sizes come from the model name. The first start rebuilds the search index once.
- After installing, run "Developer: Reload Window" so VS Code loads the new version.

## 0.11.1 - 2026-10-04
- Changed: the chat title gets more room. The green Active chip is gone, because the status dot already shows running, waiting and unread. The status filter still has Active.
- Changed: the Huge, Empty, Tiny and Abandoned chips and the Git count moved from the title line to the pill line, after the count and time pills. The title line now holds only the dot, the title and the chevron.
- Changed: the pin, archive and tag icons appear over the end of the title (with a soft fade) when you hover a row or tab into it. They take no room at rest. They are still reachable with Tab and at every panel width.
- New: a pinned chat shows a small filled star at the start of the pill line, so a pinned chat is never hidden.
- Changed: the chevron is narrower, and its click area is 24 px tall. Clicking anywhere on the row still opens it.
- New: an open card shows the whole title, wrapped. The tooltip on a title (row, related chat, archived or pinned) starts with the full title, and focusing a row with the keyboard shows it too.
- After installing, run "Developer: Reload Window" so VS Code loads the new version.

## 0.11.0 - 2026-10-04
- Changed: one row per chat. A search row shows only the newest match across the chat and its subagents, as a snippet of at most two lines. Before, the row showed the main thread's match first and listed subagent matches under it.
- New: a quiet "+N more" under the snippet opens the other matches in place, newest first, 20 at a time. They load only when you open the list. Identical texts collapse into one item with a count such as x3, and "Same text as the latest match" marks copies of the row's snippet. Click an item to resume the chat. Right Arrow opens the list, Left Arrow or Escape closes it.
- Changed: with a search, the time pill, the day groups and the Time sort use the time of the newest match. The chat's last active time is in the pill tooltip and in a new Last active stat in the open card.
- Changed: when the newest match comes from a subagent, a purple pill with its agent type sits on the pill line.
- Changed: the open card no longer repeats the matching messages, because they are one click away in the row.
- Fixed: the hits pill said "matching messages" but counts occurrences. It now says occurrences, and its tooltip adds the matching message count.
- New: one themed tooltip replaces the browser tooltips in the results and the card. It wraps, stays inside the panel, shows exact dates and the full snippet, and closes on Escape, scroll or when you move away.
- Changed: a tag icon on each row replaces the "+ Add tag" row. Click it, type a name, press Enter. A chat with no tags shows no tag row.
- New: the status dot shows where a live chat is open. A solid ring means this VS Code window, a dashed ring means another window. Running and waiting chats keep their solid dot and get the ring as a thin outer ring. This needs the local `ps` command (macOS and Linux); without it the ring looks as before.
- New: Show Diagnostics also lists this extension host's process id, the live session count (this window and other windows) and the parent process ids found.
- After installing, run "Developer: Reload Window" so VS Code loads the new version.

## 0.10.0 - 2026-10-04
- Changed: an open chat is now a calm card with an action bar. Resume is the one filled button. Pin, Archive and Copy ID sit beside it, and Mark read appears only for an unread chat.
- Changed: every row shows two small pills under its title: the message count and how long ago it was active (now, 3 mins, 6 hrs, 2 days, 3 wks, 4 mos). A search adds a hits pill. The time at the right of the title is gone, so each fact shows once.
- Changed: the open card has labeled stats (Active for, Files edited, Size, Cost, Lines, Models) in place of one line of numbers. Matching messages come first, then matched files, stats, tags, Git and related chats. On a wide panel the card uses two columns.
- Changed: tags are chips with a remove button, and + Add tag opens an input. Enter adds a tag and Escape cancels. Git shows as wrapped pills. Related chats show "3 shared files" and their own time pill.
- New: Copy ID copies the chat's session id and shows "Copied session id".
- After installing, run "Developer: Reload Window" so VS Code loads the new version.

## 0.9.3 - 2026-10-04
- New: the result limit is now visible. When more than 500 chats match, the top of the results says "Showing the top 500 of 1,284 chats (21,904 matches)" and warns that the result set only contains a subset, as VS Code Search does. Every match is still counted. A chat with more than 9,999 hits shows "9,999+", and the match total stops at "1,000,000+".
- New: All sessions and Archived show the same notice when their list is cut off, and an export that hits its limit says so and asks you to narrow the search.
- New: setting `saropaChatSearch.maxResults` (default 500, 50 to 2000) sets that limit.
- New: "this week" (since Monday 00:00) and "this month" (since the 1st, 00:00) in the time filter, in local time. Saved searches and history keep working.
- Changed: a `...` button under the search box (Toggle search details) shows or hides the When and Messages filters. They start hidden, the choice is remembered per workspace, and a count on the button shows when a filter is set. Each filter is now its own row with a label: "chats active during" and "messages to search".
- Changed: with Sort set to Time, the day groups (Today, Yesterday, This week, Last week, Earlier) show directly, with no "All sessions" or "Results" header above them. The count summary shows only for a search.
- After installing, run "Developer: Reload Window" so VS Code loads the new version.

## 0.9.2 - 2026-10-04
- Fixed: the sidebar icons were missing in 0.9.1 and earlier since 0.8.1. VS Code rejected the Git Activity container id because it held a dot, and dropped both sidebar containers. The id is now plain letters.
- New: the packaging step checks the manifest and stops on a bad container id, an undeclared command, a missing icon, or a command with no handler.
- After installing, run "Developer: Reload Window" so VS Code loads the new version.

## 0.9.1 - 2026-10-04
- Fixed: the extension now has an icon in the Extensions list and its details page. Before, it had none. The sidebar icons were already packaged and render.
- New: the command "Saropa Chat Search: Show Diagnostics" shows the version, whether startup finished, how many chats are indexed, and whether Claude Code and its sessions folder are found.
- Changed: the package no longer ships the internal plans folder.
- If a menu item or icon is missing after an install, run "Developer: Reload Window" so VS Code loads the new version.

## 0.9.0 - 2026-10-04
- New: the status dot now shows what Claude Code shows. Green is running, blue is waiting for you, orange is unread, grey is idle, and a hollow ring means the chat is open somewhere else. Hover a dot for its name.
- Changed: "Active" now means running, waiting for you or unread. Before, it meant active in the last hour.
- New: archive chats. They leave results, All sessions, Pinned and Git Activity, and wait in a collapsed Archived section at the bottom. Archive and Unarchive are on the row and in its right-click menu.
- New: "Import Archived Chats from Claude Code" copies your Claude Code archive into ours, once, when you ask. It needs the `sqlite3` tool and changes nothing in Claude Code.
- New: "Mark as Read" in the row's right-click menu. Resuming a chat marks it read.
- Changed: export leaves out archived chats.

## 0.8.1 - 2026-10-04
- Changed: search history works like VS Code's Search box. Up and Down in the search box step through earlier searches, with their toggles and options. Escape or Down past the newest restores your typing.
- New: the command "Clear Search History".
- Changed: with an empty query or no matches, the panel lists all your chats under "All sessions".
- Changed: a more compact header, a chevron that is always visible, and Git Activity in its own activity-bar icon.
- Fixed: history no longer fills with typing prefixes or look-alike duplicates. Typing cancels the running search at once, so old results never show for a new query.

## 0.8.0 - 2026-10-04
- New: see which Claude chats touched a file. Use the Explorer, editor or tab menu, or the Command Palette. Pick a chat to resume it, or copy a hand-over note.
- New: a status bar count of chats that touched the active file. A setting turns it off.
- New: "Find Chats For This File" and "Find Chats That Edited This File" run `file:` and `edited:` searches.
- Changed: subagent file activity counts toward the parent chat, and files in sibling git worktrees are found.

## 0.7.0 - 2026-10-04
- Changed: the whole query is one exact phrase by default. "my family" finds those words together in one message.
- New: a "Match any order" toggle (Alt+O) restores the every-word-anywhere behavior.
- Fixed: the highlighted match is always visible in result rows and the expanded list.

## 0.6.3 - 2026-10-04
- Fixed: results and controls fit any panel width with no horizontal scrollbar.
- Changed: the search box and filters stay in view while results scroll. Rows adapt to compact, medium and wide panels.

## 0.6.2 - 2026-10-04
- Fixed: clicking a PR, commit or branch no longer alters quoted text in the query.
- Fixed: a long Git Activity refresh no longer restarts a running search. Subagent commits are counted once.
- Faster: searches with very many hits do less work.

## 0.6.1 - 2026-10-04
- Fixed: Git Activity refreshes no longer cancel a running search or export, and the view follows the All projects option.
- Fixed: a full 40-character `sha:` finds its commit. `pr:7` works alone. Bad `sha:` or `pr:` values show a hint.
- Changed: subagent commits and PRs match their parent chat when subagents are included.

## 0.6.0 - 2026-10-04
- New: a status pill on each row (Active, Huge, Empty, Tiny or Abandoned) and cost info (dollars, lines changed, models). Sort by Cost.
- New: `sha:`, `pr:` and `branch:` search words, a Git section in the expanded row, and a git icon with a count.
- New: a Git Activity view with repositories, PRs, branches and commits. Click a chat or commit to resume it.

## 0.5.3 - 2026-10-04
- Faster: repeat searches read chat files from memory, and a background cleanup no longer delays a search.
- Fixed: a worker restart during an export now says "Export interrupted". A chat that failed to store is retried.

## 0.5.2 - 2026-10-03
- Fixed: temporary file errors no longer delete the saved index. Several windows no longer delete each other's files.
- Changed: export stops at 20 MB or 50,000 lines and says which limit it hit. An export no longer cancels a search.
- Fixed: `last:<n>` also limits `cmd:` matches. Quoted text such as "see file:x" is searched as plain text.

## 0.5.1 - 2026-10-03
- Changed: the search cache is one file per chat, so several windows share it safely.
- Changed: old cache files from 0.4.x and 0.5.0 are removed once a day old.

## 0.5.0 - 2026-10-03
- New: a Messages dropdown and `last:<n>` search only the last N messages of each chat.
- New: quote words for an exact phrase, and an Export button (copy or save matching lines).
- Changed: search history lists each search once. Typing waits before searching and needs 2 characters.

## 0.4.1 - 2026-10-03
- Fixed: the cache recovers from damaged files, a dead search worker restarts, and several windows no longer collide.
- Fixed: regular expressions with escaped literal characters.

## 0.4.0 - 2026-10-03
- New: subagent search. Subagent matches nest under their parent chat with a Subagent pill.
- Changed: indexing runs in a background worker with an on-disk cache, so the editor never freezes.
- A pattern that hangs shows "Search timed out" and the worker restarts.

## 0.3.0 - 2026-10-03
- New: a status filter (funnel menu) with counts. The choice is saved per workspace.

## 0.2.2 - 2026-10-03
- Fixed: session ids are validated, the cache saves and loads safely, and partial results show while indexing.
- Changed: errors go to the "Saropa Chat Search" output channel.

## 0.2.1 - 2026-10-03
- New: indexing progress in the status bar and a panel banner. The search reruns when indexing finishes.

## 0.2.0 - 2026-10-03
- New: day groups, chat stats, a Length sort and related chats.
- Changed: the panel was restyled.

## 0.1.0 - 2026-10-03
- New: a background index, rows that expand in place, and `file:`, `cmd:` and `tag:` search.
- New: pin and tag chats.

## 0.0.6 - 2026-10-03
- Fixed: a duplicate heading in the search panel.

## 0.0.5 - 2026-10-03
- Changed: the result cap rose from 50 to 500.

## 0.0.4 - 2026-10-03
- New: When and Sort controls.

## 0.0.3 - 2026-10-03
- New: results stream in live. Title matches rank first and recent matches score higher.

## 0.0.2 - 2026-10-03
- Renamed to Saropa Chat Search. New filters, search history, progress display and saved results.
- Chat titles now match Claude Code's titles.

## 0.0.1 - 2026-10-03
- First release: search the full text of Claude Code chats from the activity bar. MIT license.
