# Keep Claude sessions warm: extension-managed Stop hook

The prompt-cache keep-warm behavior existed only as a hand-installed global Claude Code Stop hook (`keep_warm.py`, hardcoded Python path), with no user-visible switch and no way for other users to adopt it. The feature now lives in the extension behind a setting, ships its own Node script, and installs or removes the hook itself.

## Finish Report (2026-11-25)

### Behavior
- Setting `saropaChats.keepWarm.enabled` (boolean, default false, `scope: application`), shown in VS Code Settings and on the extension Options screen.
- Config dir: `CLAUDE_CONFIG_DIR` when set and non-blank, else `~/.claude`; defined once in `claudeConfigDir()` (`src/keepWarmSettings.ts`), with one small standalone copy each in `resources/keep_warm.js` and `resources/uninstall_keepwarm.js`.
- On: the bundled `resources/keep_warm.js` is copied to `<config>/saropa-chats/keep_warm.js` (stable across extension updates) and a Stop hook `{ command: <absolute node path>, args: [<that path>], asyncRewake: true, timeout: 3900 }` is added to `<config>/settings.json`. The node path comes from `where node` / `command -v node` (fallback `node -p process.execPath`) and is re-resolved on every enabled activation; a changed path rewrites the entry (own entry matched by the script path in args). Off: only that entry is removed. Reconciled on activation and on setting change.
- `keep_warm.js` is a dependency-free port of the Python watcher: 50 idle minutes before a ping, 20 consecutive-ping cap, 62-minute watcher lifetime, token supersession, `~/.claude/keepwarm/` state and `log.jsonl`, `keepwarm.off` switches (global and per project), and a skip when `CLAUDE_CODE_REMOTE` is set.
- Ping counting no longer depends on the reply text alone: a Stop is a ping turn when the reply starts with the marker, or when `pendingPing` is set and the trimmed reply is at most 80 characters. A longer reply after a wake is a real turn and resets the count.
- Heartbeat: every run with valid stdin writes `<config>/saropa-chats/last_run.json` (`{t, version: 1}`) before any early exit.
- Status bar (`src/keepWarmStatus.ts`, pure summary in `src/keepWarmLog.ts`): shown only while enabled; `$(flame) Warm` plus today's ping count; tooltip lists pings today, cache read share from the last 256 KB of `log.jsonl`, and the last hook run; warning background when the hook is installed and the heartbeat is missing or older than 24 hours; click runs `saropaChats.keepWarmSettings` (opens Settings filtered to `saropaChats.keepWarm`); refreshes every 5 minutes, on setting change and after each reconcile.

### Safety
- Requires `node` on PATH; enable fails with a visible error otherwise.
- `settings.json` that fails to parse is never written.
- Writes go through a unique temp file next to the symlink-resolved target, keep the file mode, skip when nothing changed, and re-read before rename (one retry) to tolerate several VS Code windows.
- `vscode:uninstall` (`resources/uninstall_keepwarm.js`) removes the hook and the copied script, reusing `out/keepWarmSettings.js`. If that module cannot load, the script copy is still deleted (the hook's node then exits non-zero, so pings stop), a message names the settings entry that remains and how to remove it, and the exit code is 0.

### Tooling
- `scripts/install_local.py` + task "Install local build": builds with `npm run package`, installs the `.vsix` through `code.cmd` (plain `code` can resolve to the GUI binary, which ignores `--install-extension`), and checks that `<publisher>.<name>@<version>` is installed. Version read from package.json; `--skip-package` reinstalls only.
- `.vscodeignore` excludes `.claude/` so agent worktrees are not packaged.
- `package.json` version set to 1.0.0 to match the top CHANGELOG heading (check_guards).

### Verification
- `npm run compile` clean; `check_keepwarm`, `check_manifest`, `check_options`, `check_webview`, `check_digest` pass.
- Uninstall script run against a temp HOME: removed only its own entry and the copied script; refused an unparseable file.
- `vsce ls` lists `out/keepWarm*.js`, `resources/keep_warm.js`, `resources/uninstall_keepwarm.js`.
- Hardening: `check_keepwarm` also covers the 80-character ping rule, heartbeat writing (and its absence on bad stdin), `CLAUDE_CONFIG_DIR` paths, absolute node command rewrite, log summary and heartbeat staleness. `keep_warm.js` run with `CLAUDE_CONFIG_DIR` set wrote `last_run.json` and the state file under that dir only. Uninstall run from a copy without `out/` deleted the script and printed the fallback message.
- Not exercised: the status-bar item in a running VS Code, `where node` / `command -v node` resolution on a live enable (and non-Windows),  the 50-minute ping/exit-2 path, watcher supersession, the write-retry path, a symlinked settings.json, the in-VS-Code toggle UI.
