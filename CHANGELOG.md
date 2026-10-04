# Changelog

## 0.8.1
- Changed: search history now works like VS Code's own Search box. Press Up in the search box to see the previous search and Down for the next one; its text and its Match Case, Whole Word, Regex and Any order toggles and options come back and the search runs. Down past the newest entry, or Escape, restores what you had typed. The "Recent searches" list and "Clear history" link are gone. A small hint under the empty box says "Up and Down arrows show previous searches".
- New: the command "Saropa Chat Search: Clear Search History" (Command Palette and the search view's menu) with a "Search history cleared" message.
- Fixed: history no longer fills with typing prefixes (such as "spouse ch", "spouse chil"). A search is remembered only when you press Enter, click a result, or leave the query alone for 2 seconds after a search that found results. Searches with no results are never remembered.
- Fixed: history no longer shows look-alike duplicates. Two entries are the same when the text (ignoring case unless Match Case is on), Match Case, Whole Word, Regex and Any order are the same; repeating one moves it to the top and updates its When, Messages and subagent values. Saved history is cleaned up the same way when the panel opens.
- Fixed: typing now cancels the running search on the first keystroke and greys the old results, so results of an older query are never shown for a changed query. The new search starts 250 ms after the last keystroke (Enter still starts it at once).
- Checked: Match Case. Body text, titles, phrases, whole-word and any-order searches, highlights, the expanded list and export were all tested against a brute-force count on real chats and follow Match Case exactly; `file:`, `edited:`, `cmd:`, `tag:`, `sha:`, `pr:` and `branch:` always ignore case, on purpose. Earlier history entries that differed only in case used to merge, which made Match Case look unused.
- New: with an empty query, or when a search finds nothing, the panel lists your chats under "All sessions" (with a count and the same decorations as results), using the current Sort (Score means Time), When filter, status filter and All projects scope. "No matches for ..." appears above the list. Pinned chats stay in their own section at the top.
- Changed: the header is more compact so the first results show without scrolling. All projects and Subagents sit on the same row as When and Sort, the status line moved onto the results header ("19 of 19 chats, 4 matches"), and each new search scrolls the results back to the top.
- Fixed: the chevron that expands a row is always visible (it only appeared on hover before), and the pin star is always visible in the narrowest layout. Snippets no longer show a sliver of a third line under the clamp.
- Changed: Git Activity now has its own activity-bar icon ("Saropa Git Activity"). This adds a second icon, and the extra uppercase "SAROPA CHAT SEARCH" pane header above the search box is gone because each icon now holds a single view.

## 0.8.0
- New: see which Claude chats touched a file, to hand a bug to the right chat. Right-click a file in the Explorer, in the editor or on its tab and choose "Saropa Chat Search: Show Chats That Touched This File" (also in the Command Palette for the active file). A list shows each chat, whether it edited or only read the file, when it was last active, its project folder, git branch and status. Pick a chat to resume it. Each row has buttons to copy a hand-over note (file, chat title, session id, edited or read, last active, project folder) and to search the panel for the file; a title button copies the whole list as Markdown.
- New: a status bar count (chat icon and a number) for the active file, shown only when at least one chat touched it. Click it to open the list. Turn it off with the setting `saropaChatSearch.showFileSessionsStatusBar`.
- New: "Find Chats For This File in Search Panel" and "Find Chats That Edited This File in Search Panel" open the panel with `file:<path>` or `edited:<path>` and run the search.
- Subagent file activity counts toward its parent chat, once. The same file in a sibling git worktree (for example `contacts-wt-glass-buttons-2-6` for a `contacts` workspace) is found too. Matching ignores letter case on macOS and Windows. Edited chats list first, then read-only chats, each newest first (up to 200).

## 0.7.0
- Changed: the whole search text is now one phrase by default. `my family` finds chats where "my family" appears together in one message, not chats that merely contain both words. Spaces, tabs and line breaks inside the phrase all match, and Match Case and Match Whole Word apply to the whole phrase. Double quotes are no longer needed (and are ignored).
- New: a "Match any order" toggle (shuffle icon, Alt+O) next to Match Case, Whole Word and Regex. When it is on, the old behavior returns: every word must appear somewhere in the chat, and quoted phrases stay exact. It is off by default, remembered with your other options, and part of the recent-searches list (older entries load with it off). It is dimmed while Use Regular Expression is on.
- Search results, Last N messages, export, the expanded message list and ranking all follow the phrase: a chat whose title contains the phrase ranks first, and an export lists only lines with the phrase.
- Fixed: the highlighted match is always visible. Snippets now start just before the first match instead of showing it at the far end of a clipped line, in result rows and in the expanded list. A matching chat title is highlighted too, and is shortened at the front when the match would be cut off. Expanding a row scrolls the first highlighted match into view.

## 0.6.3
- Fixed: results and controls now fit the panel at any width, from a very narrow sidebar to a wide editor tab. Dropdowns no longer clip their text, the row meta line no longer wraps, and there is never a horizontal scrollbar.
- The search box and filters stay in view while only the results scroll.
- Rows adapt to the width: compact rows show hits and a short time on one line, medium rows add the time in words, and wide rows use a single line with a hit count pill and a time column. Very wide panels show the snippet beside the title.

## 0.6.2
- Fixed: clicking a PR, commit or branch in the Git section no longer changes a `pr:`, `sha:` or `branch:` that sits inside a quoted phrase or a quoted `cmd:` value, and keeps the closing quote and your spacing.
- Fixed: a long Git Activity refresh can no longer make a running search time out and restart the search worker. The refresh now waits while a search or export runs and pauses regularly so the search keeps going; commit merging is also much faster for chats with many commits.
- Fixed: with subagents included, a commit or PR held only by a subagent is counted once, not twice (hit count, score and export lines), and an export writes each line once.
- Fixed: a search worker that stops responding while only background requests were waiting is now restarted (at most 3 times a minute).
- Fixed: with Include subagents off, a pinned row's git count now agrees with its Git section.
- Fixed: exporting with a malformed `sha:` or `pr:` shows the same hint as searching instead of exporting nothing, and a `sha:` longer than 40 characters says "4 to 40 hex characters".
- Fixed: error reports from the old-cache cleanup could go to the wrong window's log when two ran together.
- Faster: searches with very many hits (for example "the" with subagents on) do less work per hit. Results, counts and order are unchanged.

## 0.6.1
- Fixed: the Git Activity view refreshing during indexing could time out and restart the search worker, canceling a running search or export. It now shows an empty or retry state instead and tries again on the next index change.
- Fixed: toggling All projects or changing workspace folders did not refresh the Git Activity view.
- Fixed: a pasted full 40-character commit id (`sha:`) now finds the commit; before, only the start of the stored id matched.
- Fixed: `pr:7` alone, and clicking a PR with one digit, no longer says "Type at least 2 characters".
- A malformed `sha:` (fewer than 4 hex characters) or `pr:` (not a number) now shows a hint under the box instead of silently finding nothing.
- Clicking a PR or commit in the Git section replaces the earlier `pr:` or `sha:` in the query, so PR #12 then #13 finds #13.
- With subagents included, `sha:`/`pr:`/`branch:` now match a chat when its subagents hold the commit or PR, including combined searches such as `sha:X pr:N`. With subagents off, matching, the git icon and the Git section all use only the chat's own git data.
- PRs with the same number in different repositories are kept apart. A PR without a repository is listed under "(unknown repository)".
- Within one chat, a short and a full id of one commit count once (in the Git Activity view they are two commits on a branch). A commit keeps the branch named by a later row, and branch names with non-English letters are kept.
- A failed Git Activity load shows "Could not load git activity. Retry." instead of an empty view, and is not remembered. Tree items keep their expanded state across refreshes, and the view now updates within 5 seconds even during a long index pass.
- A damaged index file that is read from disk after falling out of the memory cache is now always detected and rebuilt. The memory used for tracking checked files no longer grows.
- Cleanup of old index folders stops checking a folder at the first recent file, and it reports file errors it used to ignore once in the log.
- The first start after updating rebuilds the index once.

## 0.6.0
- Each row now shows a small status pill after its title for the chat's most important status: Active, Huge, Empty, Tiny or Abandoned. Normal chats show no pill. Hover it to see every status of the chat.
- The expanded stats line and the row tooltip now show what a chat cost: dollars, lines added and removed, and the models used, for example `$1.23 · +120/-30 lines · opus, sonnet`. Subagents show no cost of their own.
- New Cost option in the Sort menu: costliest chats first.
- New search words: `sha:<start of a commit id>` (4 or more characters), `pr:<number>` (also `pr:#123`) and `branch:<part of a branch name>`. They combine with words and other filters.
- The expanded view has a new Git section listing the chat's PRs and commits. Click one to search for it.
- Rows with PRs or commits show a small git icon with a count. Click it to open the row at its Git section.
- New Git Activity view below the search view: repositories with their PRs and the chats that mention them, and a Branches group with each branch's commits. Click a chat or commit to resume the chat.
- The first start after updating rebuilds the index once.

## 0.5.3
- Searches are much faster after the first one: chat files are kept in memory (up to 64 MB) and checked only once, and the faster built-in checksum is used when available.
- A search no longer waits for the background cleanup of old index files.
- If the search worker restarts during an export, you now see "Export interrupted: the search worker restarted. Try again." instead of nothing. A restart during a search shows "Search worker restarted".
- A search that times out no longer reports a running export as timed out.
- Cleanup no longer removes the index folder of another window running an older version until nothing in it has changed for 7 days.
- A chat that could not be stored is no longer hidden for the rest of the session: it is tried again when its file is removed, when another window writes it, or when memory frees up.
- A chat file that always fails to read (for example a permission problem) is now rebuilt in memory after three tries instead of being searched as empty.
- Cleanup of old index files reads several files at once and no longer runs a second index pass at startup.

## 0.5.2
- A search or export that hits a temporary file error (too many open files, permission, busy disk) no longer deletes your saved chat index; it retries on the next refresh.
- Several windows no longer delete each other's fresh index files.
- The index folder is recreated if it goes missing, and recovers from a read-only or full disk without a restart.
- A chat that is still being written to now stays searchable.
- An export no longer cancels a running search (and the other way round); a canceled export shows a notice.
- Export stops at 20 MB as well as 50,000 lines and says which limit it hit; very large exports no longer trip the search timeout.
- A pattern that matches across several lines now exports those lines.
- `last:<n>` and the Messages dropdown now also limit `cmd:` matches to the final messages.
- Text in quotes such as "see file:x" or "use last:5 now" is searched as plain text, not read as a filter.
- The first start after updating rebuilds the index once.

## 0.5.1
- Search cache rebuilt as one file per chat; several windows share it safely.
- Old cache files from 0.4.x and 0.5.0 are removed once they are a day old.

## 0.5.0
- Search history no longer lists the same search twice.
- Typing waits 300 ms before searching; a search needs at least 2 characters.
- New Messages dropdown and `last:<n>`: search only the final N messages of each chat.
- Quote words to search an exact phrase: `"exact phrase"`.
- New Export button: copy or save one line per matching line of every match.
