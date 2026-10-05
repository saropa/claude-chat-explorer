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
  - `git`, read-only, in the working folders of chats and the repositories they belong to: when the Git section of a chat card opens, and when the Open Work page scans. 5 second limit per command, `--no-pager --no-optional-locks`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`. The code allows exactly these command shapes (any other git subcommand throws before it starts):
    - `git rev-parse --show-toplevel --git-common-dir --symbolic-full-name HEAD` (or the same without `--symbolic-full-name HEAD` when the repository has no commits)
    - `git rev-parse --short HEAD`
    - `git rev-parse --abbrev-ref origin/HEAD`
    - `git symbolic-ref --short HEAD`
    - `git status --porcelain=v1 --branch -z --untracked-files=normal`
    - `git worktree list --porcelain -z`
    - `git for-each-ref --format=<name, upstream, track fields> refs/heads` (or `refs/heads/<branch>` for one branch)
    - `git for-each-ref --merged=<default branch> --format=%(refname:lstrip=2) refs/heads`
    - `git rev-list --count <default branch>..<commit>`
    - `git rev-list --max-count=20 --format=<short id, subject> @{u}..HEAD`
    - `git remote get-url origin` (only to read the owner of the origin remote, and only when a pull request list holds a fork pull request)
  - `gh`, read-only, only while `saropaChatExplorer.lookupPullRequests` is on (the default). 8 second limit per command, no shell, at most 2 gh commands at once across the sidebar and the Open Work page. Exactly two command shapes are allowed:
    - `gh pr list --state open --limit 100 --json number,title,headRefName,isDraft,reviewDecision,url,headRefOid,isCrossRepository,headRepositoryOwner`, once per repository (the argument list must be identical; on an older `gh` the same command without `headRefOid,isCrossRepository,headRepositoryOwner` is allowed). Results are kept 5 minutes.
    - `gh pr view <number> --json statusCheckRollup,headRefOid`, where `<number>` is digits only, for pull requests on branches the Open Work page shows. Results are kept 2 minutes.
    - Clicking a PR opens its https address in the browser.
  - The code allows no other git subcommand and no other gh subcommand; any other call throws before it starts. It never runs fetch, pull, checkout, reset, clean, stash, commit, push, worktree add or remove, branch delete, or gc.
  - The commands the Open Work page offers ("Copy remove command", "Copy delete command") are only copied to the clipboard. The extension never runs them. On Windows a path or branch name with characters a Windows shell would act on gets no command ("Remove manually").
- Runs its search in a worker thread (`worker_threads`), not a separate process.
- Opens a chat by calling the agent extension, or by a `vscode://` link to it.

## What it never does

- Writes to the agent's data. Its writes go to its own global storage folder and a temporary folder.
- Writes to your repositories. It runs only the read-only commands above.
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
