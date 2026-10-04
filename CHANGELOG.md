# Changelog

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
