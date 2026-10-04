# Changelog

Release notes for Saropa Chat Search, newest first. Dates are the git dates of each release.

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
