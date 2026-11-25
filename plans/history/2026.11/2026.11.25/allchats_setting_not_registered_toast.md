# "saropaChats.activity.allChats is not a registered configuration" toast

Turning on Show All Chats raised the toast "Unable to write to User Settings because saropaChats.activity.allChats is not a registered configuration", and the interface did not change. The cause was not in the code: the VS Code window was still running extension build 0.49.0, which predates the setting.

## Findings

- `package.json` registers `saropaChats.activity.allChats` (boolean, default `false`) under `contributes.configuration.properties`.
- `src/activity.ts` writes it through `getConfiguration('saropaChats').update('activity.allChats', ...)`, so the section and key resolve to the registered name.
- Installed manifests checked: `saropa.claude-chat-explorer-1.0.0` and `-1.1.0` contain the key. `-0.49.0` does not.
- `extensions.json` lists 1.1.0 as the active install. 0.49.0 and 1.0.0 are marked obsolete.
- `Saropa Chats.log` activation lines (`activate: version X, ... path ...`) show windows started at 14:01, 16:08 and 17:04 UTC on 2026-11-25 activated 0.49.0. Only windows started at 20:07 UTC (1.0.0) and 20:30 UTC (1.1.0) run 1.x.
- 0.49.0 does not contribute the `saropaChats.activityAllChats` command. A window running only 0.49.0 cannot offer the Show All Chats toggle.
- Per-window logs (`logs\20261125T090128\windowN\exthost\output_logging_*`) show windows 1, 2 and 5 activating 0.49.0 first. Later, within the same window, a new extension host activated 1.0.0 or 1.1.0, for example window2 at 20:30:31Z (1.0.0) and 20:30:36Z (1.1.0). The extension host restarted without a window reload.
- Such a window runs the 1.x command code, so the toggle is offered. Its configuration registry still holds the 0.49.0 manifest, which lacks `activity.allChats`, so the write is rejected.
- Ruled out: no `allChats` entry in `%APPDATA%\Code\User\settings.json`, no VS Code profiles, no Insiders install.
- Comparing version numbers cannot detect this case, because the running code is already the new build. Detection has to ask whether the window's registry knows each manifest key.

## Resolution

Run `Developer: Reload Window` (a full window reload, not `Restart Extension Host`) in every window open since before the update, then turn the setting on again.

Follow-up code change (CHANGELOG, Unreleased): on activation, each manifest configuration key is checked with `inspect()`. A key that declares a default but reports no `defaultValue` marks the registry as stale, and a warning offers Reload Window. Setting writes from the Activity toggles route rejections to the same prompt instead of the generic toast.

## Diagnostic aid

The activation log line already records the version and install path. Searching `%APPDATA%\Code\logs\<session>\**\*Saropa Chats.log` for `activate: version` shows which build each window loaded.
