# Chats that touched this file

Built in 0.8.0 at file level; line-level remains not built.

- Status: deferred by the owner, not started.
- What: right-click a file in the editor, or use a status-bar count, to open the search panel filtered to the chats that edited or read that file.
- Order: file-level first. Line-level ("which chat changed these lines") later.
- Data: the existing file map in src/related.ts.
- Data: toolUseResult.filePath, structuredPatch, oldString and newString in chat rows.
- Risk: line matching drifts after later edits, so ship file-level first.
