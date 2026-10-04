# Security Policy

## Supported versions

- Only the latest release of Saropa Chat Explorer gets security fixes.
- Update to the latest version before you report an issue.

## Reporting a vulnerability

- Email security@saropa.com.
- Do not open a public issue for a vulnerability.
- Include:
  - A description of the problem and its impact.
  - Steps to reproduce.
  - The extension version and the VS Code version.
- Expect an acknowledgment within 7 days.
- No fix date is promised. We will keep you updated on progress.

## What the extension does with data

- Reads Claude Code chat files under `~/.claude/projects`.
- Reads live session files under `~/.claude/sessions`.
- Keeps a local index cache in the extension's global storage folder.
- Makes no network requests and sends no telemetry.
  - A search of `src/` finds no HTTP client, `fetch`, `XMLHttpRequest`, WebSocket, `net` or `dns` use.
  - The panel's content security policy blocks all loads (`default-src 'none'`).
- Starts local programs in two places only, both with `execFile` (no shell):
  - `ps -A -o pid=,ppid=` finds parent process ids, to mark which VS Code window owns a session.
  - `sqlite3 -readonly` reads Claude Code's archived-chat list. It runs only when the user runs "Import Archived Chats from Claude Code". It reads a temporary copy of VS Code's `state.vscdb`, which is deleted afterward.
- Runs its search in a worker thread (`worker_threads`), not a separate process.
- Opens a chat by calling the Claude Code extension, or by a `vscode://` link to it.

## What it never does

- Writes to Claude Code's data. Its writes go to its own global storage folder and a temporary folder.
- Uploads anything.

## In scope

- Code execution.
- Path traversal.
- Reading or writing files outside the locations above.
- Injection through chat content into the panel.
- Exposure of secrets.

## Out of scope

- Issues in VS Code or Claude Code themselves.
- Social engineering.
- The content of your own chats.

## Secrets in chats

- The cache stores chat text on your disk.
- The cache is not encrypted. The source contains no encryption of it.
- Treat the extension's global storage folder as sensitive.
- To clear the cache, close VS Code and delete that folder.

## Disclosure

- Coordinated: we fix first, then publish an advisory.
- We credit the reporter if they want it.
