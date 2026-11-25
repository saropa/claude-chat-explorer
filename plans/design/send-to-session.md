# Send input to a Claude session (Compact, Run handover)

Status: plan, not started. Audience: project owner and implementing agents.

## Problem

The context popover (ring slot on a chat row) shows how full a chat's context is, but its only action is Resume. When a chat is near its limit, the owner has to open it, click into the input and type `/compact` or ask for `/handover` by hand. The extension has no way to put input into a session. The popover code says so: `src/webviewCtx.ts:80` ("the extension has no way to run /compact in a session, so none is offered").

Need: a general "send input to a Claude session" capability. First consumers: Compact and Run handover buttons in the popover.

## Goals

- One host-side service `sendToSession(id, input, opts)` that picks the safest working mechanism for the session's state and always reports a visible outcome.
- Popover buttons: Compact, Run handover. Disabled with a stated reason when sending is not possible.
- The owner confirms every send. Nothing is submitted to a model without an explicit click on a confirm action naming the session and the exact text.
- An audit log of every send attempt and its outcome.

## Non-goals

- Free-text chat from the sidebar (later phase, separate checklist item).
- Sending to sessions on other machines, cloud sessions or Remote Control.
- Driving the Claude Code panel by simulated keystrokes or clipboard paste automation.
- Using undocumented Claude Code IPC (see Findings: peer messaging socket).

## Findings (verified from code unless marked)

### What this extension already does with sessions

| Area | File:line | What it does |
|---|---|---|
| Open/resume | `src/resume.ts:7-18` | `openChat`: `claude-vscode.primaryEditor.open(id)`; fallback `vscode://anthropic.claude-code/open?session=<id>`; error toast. Passes no prompt. |
| New session | `src/resume.ts:21-29` | `claude-vscode.editor.open` with no args. |
| Resume from row | `src/extension.ts:182-185` | `resume(id)`: mark read, `openChat`. Popover Resume: `src/webviewCtx.ts:128`; card Resume: `src/webviewJs.ts:86`. |
| Copy resume command | `src/copyResume.ts:9-17`, `src/workCleanup.ts:81-84` | Clipboard `cd "<dir>" && claude --resume <id>`. Runs nothing. |
| Hand-over note | `src/handover.ts:91-105`, `src/handoverRun.ts:9-22`, `src/handoverLive.ts:17-32` | Builds a Markdown fact sheet (folder, branch, git, PRs, related chats) and copies it to the clipboard. Not the owner's `/handover` command; sends nothing to a session. |
| Clean-up prompt | `src/openWork.ts:271-288` | Copies a prompt, opens the chat, tells the owner to paste. Comment at :272 and toast at :286 say "the agent panel cannot be pre-filled". That is wrong for agent extension 2.1.332 (see below) when the panel is not already open. |
| Headless claude | `src/regenTitlesRun.ts:12-17`, `src/digestRun.ts:43-62` | `execFile('claude', ['-p','--model','haiku','--no-session-persistence'])`, prompt on stdin, cwd = tmpdir, env `SESSION_TITLE_HOOK_CHILD=1`. Fresh throwaway sessions only; never `--resume`. |
| Keep warm | `src/keepWarm.ts:50-80`, `src/keepWarmSettings.ts:24-38`, `resources/keep_warm.js:145-225` | Installs a Stop hook (`asyncRewake: true`, timeout above 62 min) in `~/.claude/settings.json`. The watcher polls each minute; after 50 idle minutes it exits 2 with an instruction on stderr, which wakes the idle session and makes Claude reply. This is a working, shipped path that injects text into a live idle session. Watcher lifetime is capped at 62 min (`keep_warm.js:42`); a newer Stop supersedes it via a token (`keep_warm.js:186-201`). |
| Live state | `src/liveState.ts:28-54` | Reads `~/.claude/sessions/<pid>.json`: `sessionId`, `pid`, `status` (busy/waiting/idle), `entrypoint`. Only `entrypoint === 'claude-vscode'` (or missing) gets a dot (:34); every alive pid is still recorded in `pids` (:48) before the dot filter. |
| Window marker | `src/windowMarker.ts:19-29` | Maps a session pid to this/other VS Code window via `ps` parent pids. Returns undefined on Windows (:20), so "which window" is unknown on the owner's platform. |
| Open Claude tabs | `src/extension.ts:159-172, 453` | Detects Claude webview tabs via `tabGroups` (`/claude/i` on viewType) and their labels. |
| Agent extension present | `src/diagnostics.ts:28` | `getExtension('anthropic.claude-code')`. |
| No terminal use | grep of `src/` | No `createTerminal`, `sendText` or terminal tracking anywhere. |

### Session file contents (observed on this machine, 18 files, agent extension 2.1.332)

`{"pid", "sessionId", "cwd", "startedAt", "version", "kind":"interactive", "entrypoint":"claude-vscode", "status", "messagingSocketPath":"\\\\.\\pipe\\LOCAL\\cc-msg-...", "peerProtocol":1, "peerFeatures":["notify_idle","artifact_yield"], ...}`. All 18 had `entrypoint: claude-vscode`. The `entrypoint` value for a terminal-started CLI session was not observed (open question Q3).

### Agent extension (anthropic.claude-code 2.1.332, `extension.js` and `webview/index.js`)

- `claude-vscode.primaryEditor.open(sessionId, prompt)` takes a second argument, the initial prompt. The URI handler `/open` reads `session` and `prompt` query params and calls the same command.
- `createPanel`: when a panel for that session is already open, it reveals it and, if a prompt was given, shows "Session is already open. Your prompt was not applied — enter it manually." The prompt is dropped.
- When the panel is not open (closed session, or remembered tab revived, or a new panel), the prompt goes to the webview as `initialPrompt`; the webview calls `setInputText(prompt)`. The prompt is pre-filled in the input box, not submitted. The owner presses Enter.
- When the sidebar holds the session, `showSessionInSidebar(id, prompt)` / `activateSessionFromServer` set `initialPrompt` on the existing session object: pre-fill path. Not exercised by hand (open question Q4).
- Public commands also include `claude-vscode.terminal.open(...)`, `claude-vscode.focus` (focus input). No public command submits a message.
- These are internal behaviors of a closed-source extension, not a documented API; they can change on any update.

### Claude Code CLI and hooks (docs)

- Two processes resuming one session both write one transcript; "messages from one of them can be missing". Add `--fork-session` to keep both. https://code.claude.com/docs/en/sessions (section "Branch a session").
- `claude -p --resume <id> "prompt"` sends a follow-up to an existing session. https://code.claude.com/docs/en/sessions ("Access conversations from scripts").
- For a running background session (agent view), `claude --resume <id> "prompt"` delivers the prompt as its next turn; "A prompt that starts with `/` or `!` isn't sent, and neither is any prompt while the session waits on your answer to a question." Applies to background sessions only, not to VS Code panel sessions. Same page.
- `--fork-session`, `--session-id`, `--input-format stream-json`, `--no-session-persistence` (print mode only). https://code.claude.com/docs/en/cli-reference
- `asyncRewake`: "runs in the background and wakes Claude on exit code 2. The hook's stderr ... is shown to Claude as a system reminder". UserPromptSubmit can block a prompt and add `additionalContext`; its default timeout is 30 s. https://code.claude.com/docs/en/hooks
- Hooks return context or decisions; the docs read do not describe a hook running a built-in slash command such as `/compact` (open question Q2).

### Owner's commands

- `~/.claude/commands/compact.md`: the owner's `/compact` is a custom command that refuses to compact and redirects to `/handover`. Whether a user command shadows the built-in `/compact` is open question Q1. Either way, in this setup "Compact" and "Run handover" may end in the same place.
- `~/.claude/commands/handover.md`: `/handover` with no argument writes `docs/handover/<YYYYMMDD_HHMM>_<title>.md` at the repo root (a complete session record) so the owner can `/clear` and resume; with a handover id it resumes. It is a model-run command (listed as a skill), so Claude can be asked in plain words to run it. `/compact` built-in cannot be run by the model.

## Session states and what works

| State | How detected | Pre-fill (b) | Inbox hook (e) | Terminal sendText (a) | Headless resume (c) |
|---|---|---|---|---|---|
| S1 Live, panel open in this window | live pid + Claude tab with this chat | No: prompt dropped; fall back to reveal + clipboard | Yes when idle and a watcher is armed | n/a | No: two writers |
| S2 Live, panel in sidebar of this window | live pid, no tab; sidebar not detectable today | Pre-fill path in code, unverified (Q4) | Yes when idle and armed | n/a | No |
| S3 Live in an integrated terminal of this window | live pid, non-vscode entrypoint (value Q3), shell pid parent | n/a | Yes when idle and armed | Possible, needs pid-to-terminal mapping (Windows: no `ps`) | No |
| S4 Live elsewhere (other window, external terminal) | live pid, no tab here; window unknown on Windows | Unsafe: opening a second panel resumes the same id in a second process | Yes when idle and armed | No | No |
| S5 Closed / no live process | no alive pid | Yes: opens and pre-fills | No: no process | n/a | Possible; runs unattended (Q6) |
| Any, status busy or waiting | `status` in session file | Blocked | Blocked | Blocked | Blocked |

"Armed" means the last Stop of that session started an inbox watcher that is still inside its lifetime (62 min for the keep-warm watcher).

## Mechanism comparison

| | Mechanism | Feasibility | Constraints | Risks |
|---|---|---|---|---|
| a | VS Code terminal `sendText` | Medium. Needs mapping claude pid to `Terminal.processId` (shell) via parent pid; `windowMarker` has no Windows path | Only S3; text typed into a TUI | Text lands in a dialog or permission prompt if state changed; submits without the panel's own checks |
| b | Agent extension `primaryEditor.open(id, prompt)` | High for S5, verified in 2.1.332 code | Pre-fills only, owner presses Enter; dropped when panel already open | Undocumented argument; may change. S4 opens a second process on the same id |
| c | `claude -p --resume <id>` | High for S5 | No live UI; permission mode of a new `-p` run; file-writing commands need `--allowedTools` | Two-writer transcript loss if a process is live (documented); unattended model run spends tokens |
| d | Agent SDK resume | Same as c underneath | New npm dependency (blast-radius gate) | Same as c |
| e | asyncRewake inbox (extend the keep-warm watcher) | High, path already shipped | Live idle sessions with an armed watcher only; text arrives as a system reminder, not a user turn; cannot run built-in `/compact` | Model may decline or misread; hook install edits `~/.claude/settings.json` |
| f | Peer messaging socket (`messagingSocketPath`) | Unknown | Undocumented protocol | Rejected: private IPC |

## Recommendation

1. Phase 1 uses only mechanism b plus a clipboard fallback: the extension never submits anything; it places the exact text in the session's input box (or on the clipboard) and the owner presses Enter. This removes the consent problem and makes `/compact` work, because the owner submits it as a real slash command.
2. The popover gets Compact and Run handover buttons; both go through one host service with a state gate (no live process, or panel open in this window) and a refusal for busy/waiting.
3. Phase 2 adds true remote send for live idle sessions through an inbox read by the asyncRewake watcher, opt-in behind a setting and a modal confirm, plain-language instructions only (Run handover), never slash commands.
4. Terminal `sendText` and headless `-p --resume` are later, separate items; the peer socket and Agent SDK are rejected.
5. Every attempt writes one line to an audit log and shows a toast naming the session and what happened.

## Phased rollout

### Phase 1: pre-fill or copy (minimal slice)

- [ ] `src/sendInput.ts` (new, no webview code): `sendToSession(id, kind, deps)` where `kind` is `'compact' | 'handover'`. Text map in one place: `compact` -> `/compact`, `handover` -> `/handover`. Validates id with `isSessionId`.
- [ ] State gate from `liveState`: expose raw status and pid presence for every entrypoint (today `readLive` drops non-vscode statuses at `liveState.ts:49`). Refuse when status is busy or waiting.
- [ ] Route by state:
  - S5 (no live pid): `executeCommand('claude-vscode.primaryEditor.open', id, text)`; toast "Opened <title>. /compact is in the input box: press Enter to send." On command failure: copy text, toast with the error.
  - S1 (live, Claude tab with this chat in this window): `primaryEditor.open(id)` without a prompt (reveal only, avoids the agent extension's own "not applied" toast), copy text, `claude-vscode.focus`, toast "Session is open. /compact is on the clipboard: paste and press Enter."
  - S2/S3/S4 (live, no tab here): do not open (second-process risk). Copy text; toast "<title> is open elsewhere. /compact is on the clipboard: paste it into that session."
- [ ] Host message `sendInput` from the webview with `{id, kind}`; handler in `src/extension.ts` next to `resume` (:182).
- [ ] Popover action row (`ctxPopHtml`, `src/webviewCtx.ts:81-82`): add Compact and Run handover buttons before Resume; update the comment at :80. Click handler at :128.
- [ ] Audit log: append JSON line `{t, id, kind, state, route, outcome}` to the extension's storage folder (`sendInput.jsonl`), plus a line in the existing output log.
- [ ] Fix the stale claim in `src/openWork.ts:272,286` and use the same pre-fill route for the clean-up prompt (separate commit; same service).
- [ ] CHANGELOG entry; README section.

### Phase 2: inbox send to live idle sessions (separate decision)

- [ ] Inbox file `~/.claude/saropa-chats/inbox/<sessionId>.json` `{nonce, text, created, expires}` written by the extension after a modal confirm.
- [ ] Watcher reads it each poll (extend `keep_warm.js` or ship a sibling `inbox.js` registered the same way; Q7). On a valid, unexpired entry: delete it, log, exit 2 with the text on stderr.
- [ ] Only allowlisted plain-language instructions ("Run the /handover command now and report the file path."); no `/` prefix, no free text in this phase.
- [ ] Delivery receipt: the extension watches for the inbox file to disappear and for the session status to turn busy; toast "Delivered" or, after a timeout, "Not delivered: the session has no active listener (idle over N minutes). Pre-fill instead?" with a button that falls back to Phase 1.
- [ ] Setting `saropaChats.sendInput.remote` (off by default); install/remove reconciled like `keepWarm.ts:50-80`.

### Phase 3: integrated terminal sessions (separate decision)

- [ ] Map session pid to a VS Code terminal: `Terminal.processId` (shell pid) equals the claude process parent. Needs a Windows parent-pid source (`windowMarker.ts:20` has none); evaluate cost.
- [ ] `terminal.show()` then `sendText(text, false)` (no Enter) so the owner submits; auto-submit only behind its own setting.

### Phase 4: closed sessions, unattended (rejected, see D2)

- [ ] `claude -p --resume <id> --output-format json` for S5 when the owner chooses "Run in background" instead of opening. Requires answers to Q5/Q6. Never when any pid for the id is alive.

### Phase 5: free text (separate decision)

- [ ] Popover or card text box; same service, same gate; Phase 1 route only unless Phase 2 is on.

## UX in the popover

Action row, left to right: Compact, Run handover, Resume (primary stays Resume).

| Condition | Compact / Run handover | Visible reason (tooltip and `aria-describedby`) |
|---|---|---|
| Agent extension not installed | Disabled | "Needs the Claude Code extension." |
| Status busy | Disabled | "Claude is working. Try again when it finishes." |
| Status waiting | Disabled | "Claude is waiting for your answer in that session." |
| Background agents still running (`also` contains background) | Enabled, confirm text warns | "Background tasks are still running in this chat." |
| Live elsewhere (no tab here) | Enabled; result is clipboard only | Button subtitle "Copies the command" |
| Otherwise | Enabled | none |

- Disabled buttons stay focusable (`aria-disabled`, not `disabled`) so the reason is reachable by keyboard; activating one shows the reason as a toast, so no tap is silent.
- Confirm: Phase 1 needs none beyond the click, because nothing is submitted (owner presses Enter). Phase 2 uses a modal: "Send to <title>: 'Run the /handover command now...'? Claude will act on it immediately." Buttons: Send, Cancel.
- States refresh with the live dot updates the popover already receives (`.cxd` rewrite, `webviewCtx.ts:118`); the action row is static today (`:80`), so button enablement needs its own in-place attribute update that keeps focus.
- All strings through `vscode.l10n.t` host-side, third person, as in `keepWarm.ts:18-26`.

## Settings

- `saropaChats.sendInput.enabled` (default true): show Compact and Run handover in the popover.
- `saropaChats.sendInput.compactText` (default `/compact`) and `saropaChats.sendInput.handoverText` (default `/handover`): the exact text placed; validated to a single line under 200 chars.
- Phase 2: `saropaChats.sendInput.remote` (default false).

## Checks and tests (scripts/checks style)

- `scripts/checks/check_send_input.js` (new): route table per state (S1-S5, busy, waiting) with stubbed `executeCommand`, clipboard and toasts; asserts every path produces exactly one toast and one audit line; asserts busy/waiting never call `executeCommand` with a prompt; asserts S2-S4 never call `primaryEditor.open`; invalid id rejected.
- `check_ring.js`: popover action row contains Compact and Run handover with `data-a` values; disabled reason text present for busy/waiting.
- `check_webview.js`: click on the new buttons posts `{type:'sendInput', id, kind}` only.
- `check_guards.js`: the text map has one source (no duplicate `/compact` literal outside `sendInput.ts` and package.json defaults).
- Phase 2: `check_keepwarm.js` cases for inbox: expired entry ignored, nonce consumed once, text starting with `/` rejected, superseded watcher does not deliver.
- Manual (unverified until done): pre-fill in panel (S5), sidebar (S2), already-open panel (S1) on agent extension 2.1.332.

## Risks

- `primaryEditor.open`'s prompt argument is internal; a future agent extension can drop it. Mitigation: if pre-fill cannot be confirmed (no API to confirm), the toast always says the text is also on the clipboard.
- Clipboard overwrite: the owner's clipboard content is replaced. Toast says so.
- Status lag: session files update on state changes; a send between a prompt and the file update can hit a busy session. Phase 1 is safe (owner submits); Phase 2 must re-check status inside the watcher before exiting 2.
- S4 detection on Windows: no window marker, so "live with no tab here" covers both other windows and the sidebar of this window; S2 is treated as S4 (clipboard only) until Q4 is answered.
- Phase 2 text arrives as a system reminder; the model can treat it as non-user input and decline, which is correct behavior under the owner's own rules. Delivery receipt must report this as "delivered, not acted on" when no handover file appears.
- Handover writes files into the repo and may commit (per the owner's command); Phase 2 makes that happen without the owner at the keyboard.

## Decisions

- D1 (Q1): popover shows Run handover only; no Compact button.
- D2 (Q5): closed sessions open with the text pre-filled; no unattended `claude -p --resume` run. Phase 4 is rejected.
- D3 (Q7): Phase 2 ships a separate inbox Stop hook (`inbox.js`), independent of keep-warm.
- D4 (Q8): Run handover sends `/handover` plus an instruction to stop after writing the file: no `/clear`, no commit.
- D5 (Q9): audit log at `~/.claude/saropa-chats/send.log.jsonl`.

## Open questions

- Q2: Can any hook output run a built-in slash command (`/compact`, `/clear`)? Docs read do not say so.
- Q3: What `entrypoint` value does a terminal-started CLI session write in `~/.claude/sessions/*.json`?
- Q4: Does pre-fill work when the session is shown in the agent extension's sidebar (code path exists, not run)?
- Q6: Does `claude -p --resume <id> "/compact"` compact a closed session's transcript? Not covered by the docs read.
