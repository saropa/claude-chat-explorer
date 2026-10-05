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

- Reads Claude Code transcripts under `~/.claude/projects`.
- Reads live session files under `~/.claude/sessions`.
- Reads open chat tab ids from VS Code's workspace `state.vscdb`, read-only, on a temporary copy.
- Keeps a local index cache in the extension's global storage folder. It includes each chat's working folder path.
- Makes no network requests of its own and sends no telemetry.
  - A search of `src/` finds no HTTP client, `fetch`, `XMLHttpRequest`, WebSocket, `net` or `dns` use.
  - The optional open PR lookup goes through the `gh` CLI, which contacts GitHub with the user's own `gh` sign-in. It is on by default and the setting `saropaChatExplorer.lookupPullRequests` turns it off. With it off, `gh` is never started.
  - The panel's content security policy blocks all loads (`default-src 'none'`).
- Starts local programs in four places only, all with `execFile` (no shell):
  - `ps -A -o pid=,ppid=` finds parent process ids, to mark which VS Code window owns a session.
  - `sqlite3 -readonly` reads the agent's archived-chat list. It runs only when the user runs "Import Archived Chats from the Agent". It reads a temporary copy of VS Code's `state.vscdb`, which is deleted afterward.
  - `git`, read-only, in the single working folder of a chat, only when the Git section of that chat's card opens (5 second limit, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`). Exact command lines:
    - `git rev-parse --show-toplevel --git-common-dir --abbrev-ref HEAD` (or the same without `--abbrev-ref HEAD` when the repository has no commits)
    - `git status --porcelain=v1 --branch -z`
    - `git worktree list --porcelain`
    - `git for-each-ref --format=<name, upstream, track fields> refs/heads`
  - `gh pr list --state open --limit 100 --json number,title,headRefName,isDraft,reviewDecision,url`, once per repository, 15 second limit, only while `saropaChatExplorer.lookupPullRequests` is on (the default). Results are kept 5 minutes. Clicking a PR in the card opens its https address in the browser.
  - The code allows no other git subcommand and no other gh subcommand; any other call throws before it starts. It never runs fetch, pull, checkout, reset, clean, stash, commit, push, worktree add or remove, or gc.
- Runs its search in a worker thread (`worker_threads`), not a separate process.
- Opens a chat by calling the agent extension, or by a `vscode://` link to it.

## What it never does

- Writes to the agent's data. Its writes go to its own global storage folder and a temporary folder.
- Uploads anything.

## In scope

- Code execution.
- Path traversal.
- Reading or writing files outside the locations above.
- Injection through chat content into the panel.
- Exposure of secrets.

## Out of scope

- Issues in VS Code or the agent extension themselves.
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
