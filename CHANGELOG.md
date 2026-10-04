# Changelog

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
