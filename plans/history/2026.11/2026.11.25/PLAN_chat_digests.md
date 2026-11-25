# PROPOSAL: Chat Digests — a short, searchable record of every chat

**Status: Closed**

<!-- Open → Accepted → In Progress → Closed (or Declined, with rationale in Decision) -->

Created: 2026-10-30
Type: New command / UX improvement
Related area: Scan / Search / View / Export
Extension version: 0.38.0 (plan updated for 0.49.0)
Filed from: a session in the `web` project (owner request; the work belongs to this repo)

---

## Summary

Each chat gets a digest: a one-page record with the goal, the owner's decisions, the files changed, the references, and the work left open. Digests appear in the explorer's list and expanded row. Search covers them like any other chat text. A digest can be exported as Markdown into a project's `docs/history/`.

Why it matters: chats hold decisions and context that are needed later. A full chat file is too long to reread. `/compact` loses detail and is not a handover.

---

## Motivation

- The `web` project alone has 46 chats (244 MB). Some are archived. They may hold critical decisions, so they cannot be deleted.
- To find out "why did we decide X" today, the owner has to open and scroll whole chats.
- `/compact` rewrites a chat from memory and drops facts. A digest has to keep facts exactly as recorded.

---

## Behavior

**Current:** Not available. The index already holds per-chat files (with the edited flag), worktrees and branches created (`made`), folders (`cwds`), git, and the title. Markdown export (`exportMd.ts`) writes the full chat.

**Proposed:**

### What the owner sees
1. **List row:** a small digest marker on chats that have a digest. Hovering it shows the goal line.
2. **Expanded row:** a "Digest" section above the messages. It has five parts:
   - **Goal** — 1–2 lines (AI-written).
   - **Decisions** — each owner decision quoted exactly, labeled by source: "Dialog" (an answer given in the question dialog) or "Message" (an owner message the AI marks as a decision). Each Message decision links to its message in the chat by message index (the record keeps the index and file line of every message). A Dialog decision shows the question beside the answer.
   - **Files changed** — the complete list from the index (edited files first). Nothing summarized.
   - **References** — URLs, commit hashes, PR numbers, plan or doc paths found in the chat. Taken out exactly as written.
   - **Left open** — 1–5 bullets (AI-written), from the chat's last stretch.
3. **Search:** digest text is searchable. Normal search hits a digest the same way it hits a message. A new `digest:` token matches digest text only (e.g. `digest:pricing`). Combined with plain words it is AND: the plain words still scan the body. `from:` does not apply to digest text. A digest hit on a subagent's facts lands on the parent row, since those facts merge into the parent's digest.
4. **Commands:**
   - `Chat Explorer: Build Digests` — builds digests for every chat that has none or is out of date. Before running, it shows how many chats it will build and asks to confirm. Shows progress. Can be stopped. AI calls run at most 2 at a time (the `execLimit.ts` pattern).
   - `Chat Explorer: Rebuild Digest` (row menu) — rebuilds one digest.
   - `Chat Explorer: Export Digests to Project` — writes one Markdown file per chat into `<project>/docs/history/chats/YYYY-MM-DD_<slug>_<first 8 chars of session id>.md`, plus `INDEX.md` with one line per chat. The target project is the open workspace folder; the command exports the chats whose project dir matches that folder.
5. **Archived chats** get digests as well. They are searchable in Archive scope (search leaves archived chats out unless Archive scope is on).
6. **Search results:** a chat appears once in results. A digest hit and a message hit in the same chat count as hits of that chat; the snippet prefers the message hit. A digest-only hit has no message (`msg` -1). Its snippet is the matching digest line, labeled "Digest". Clicking it opens the expanded row at the Digest section.
7. **Difference from the hand-over note:** `handover.ts` builds a note to continue current work, from live facts, with no AI and no storage. A digest is a stored record of what was decided and done. Both read the chat's file list, branch and folder; the digest reuses those readers and does not copy them.

### How it is built
- **Exact parts (no AI):** files, references, Dialog decisions (question + answer), the date range and the branch come from the parsed chat. The same chat always produces the same output.
- **Message decisions are AI-selected.** The AI returns message indexes only. The quoted text is copied verbatim from the record, so the AI never rewrites a quote. Selection can differ between builds; the quote text cannot.
- **AI parts:** goal, decision selection and "left open". Uses the existing Haiku runner (`claude -p --model haiku --no-session-persistence`, as in `regenTitlesRun.ts`). The AI input is the owner messages and the agent's reply text only. Tool output is removed first, so a large chat fits.
- **Storage:** digests live beside the records in the extension's storage (new `digests-v1/` folder, one file per chat id). Claude Code's chat files are never written to.
- **Dialog answers:** the parser skips user rows that hold tool results, so dialog answers are not in the records today. The digest builder reads the chat file itself: it pairs each `AskUserQuestion` tool call with its tool result and keeps the question, the options and the chosen answer. It reads these from the structured result stored on the tool-result row (`toolUseResult`), with a fallback to parsing the tool_result text. Verify the field shape against a real chat file before coding. This is a separate pass. It needs no `FORMAT` bump.
- **Staleness:** each digest stores the chat file's size and mtime. A digest is stale when either differs from the chat file. With `digest.auto` on, the extension rebuilds a stale digest once the chat file's mtime is more than 10 minutes old and the chat is not busy in `liveState.ts`. The manual commands rebuild any stale digest at once, with no idle wait.
- **Size cap:** a digest file is capped at 20 KB. Files changed is exempt and stays complete. The cap applies to the rest, trimmed in this order: Left open, Goal, Message decisions, References, Dialog decisions.

### Settings
| Key | Type | Default | Scope |
|-----|------|---------|-------|
| `saropaChats.digest.auto` | boolean | `false` | machine |
| `saropaChats.digest.useAi` | boolean | `true` | machine |

When `digest.auto` is `false`, digests are built only by the commands. When `digest.useAi` is `false`, a digest holds only the exact parts.

---

## Edge Cases

1. **Chat cut off by a context crash** — build the digest from what was saved. Mark it "chat ended without a close".
2. **Chat continued after compaction** — the summary row from compaction is input only. It is never quoted as a decision.
3. **Subagent chats** — their files and references merge into the parent's digest. They get no digest of their own. A search hit on that text lands on the parent row.
4. **Very large chats** — when the AI input after trimming is still over the budget, summarize it in pieces and merge the pieces. At most 8 pieces; past that, the middle of the chat is dropped and the digest is marked "input trimmed". Each call keeps the runner's 120 s timeout and 3 tries. The exact parts are not affected.
5. **AI failure or no `claude` CLI** — save the exact parts and mark the AI parts "not generated". Retry on the next build.
6. **Private text** — digests stay in extension storage. Export runs only when the owner runs the export command.
7. **Chat moved or renamed folder** — digests are keyed by session id, so they follow the chat.
8. **Owner decision vs. owner chatter** — decided 2026-10-30: "Decisions" holds both question-dialog answers and AI-picked owner messages, each labeled by source (recommended option).

---

## Alternatives Considered

- **A Claude Code skill run per project** — writes Markdown into the repo. It does not reach the explorer's list or search, so the owner would have two places to look. Rejected: the owner requires full integration with the explorer's list and search.
- **`/compact` output** — loses detail. Not a record.
- **Full Markdown export (existing)** — keeps everything but is too long to read through.

---

## Decision

Accepted 2026-10-30 by the owner. Decisions:
- Accept the proposal as written.
- `digest.auto` default `false`: digests build only by command.
- `digest.useAi` default `true`.
- Full scope in one release and one PR: list marker, expanded section, search, three commands, export.

---

## Implementation Notes

- Exact facts: reuse `Chat.files`, `made`, `cwds`, `git` (`types.ts`, `chatFacts.ts`). New: question-dialog answer extraction (not parsed into records today; `activityMap.ts` already recognizes `AskUserQuestion`, for activity display only) and reference extraction (URLs, hashes, `#123`, doc paths).
- AI runner: reuse the `regenTitlesRun.ts` pattern. Cap concurrency at 2 with the `execLimit.ts` pattern.
- Search: `match.ts` reads each record's `text` through `scanBody`. Digest text goes in a side store; the record layout does not change. `matchChat` rejects a chat at the bloom prefilter (`match.ts`) before the body scan, and the bloom holds only chat text. So the digest check runs before the bloom gate: a digest hit keeps the chat; otherwise the bloom gate and body scan run as today. Add `digest:` to `query.ts`.
- Worker: search runs in `worker.ts`. The worker reads digest files from `digests-v1/` lazily and caches them by chat id and digest file mtime. After a build or rebuild, the host posts the changed ids to the worker, which drops those cache entries.
- View: expanded row section (`webviewExpand.ts`), row marker (`webviewRows.ts`).
- Export: follow `exportMd.ts` and its command wiring. The filename is `YYYY-MM-DD_<slug>_<first 8 chars of session id>.md`, so two chats with the same date and title do not collide. Slug = title lowercased, every run of characters outside `[a-z0-9]` becomes one `-`, trimmed, max 60 chars, `untitled` if empty. A chat whose folder changed (`cwds`) exports under the project it started in. Re-export replaces the same file and leaves other files in `docs/history/chats/` alone. `INDEX.md` is rewritten each export.
- No `record.ts` `FORMAT` bump: digests use a separate store (`digests-v1/`), so existing records do not reparse.

---

## Built as

Changes from the text above, decided while building:
- Ids are `saropaChats.*`. Command titles follow the neighbors and say "session": "Saropa: Build Session Digests", "Saropa: Rebuild Session Digest" (row menu, hidden from the palette), "Saropa: Export Session Digests to Project".
- The worker writes the digest file in the save step and drops its own cache entry there, so the host posts no invalidation message. Other windows see a new digest when their listing (30 s) is read again.
- `from:` and `last:` select messages, so plain words skip digest text when either is set. `digest:` tokens still match.
- The automatic rebuild treats running and waiting sessions as busy, and rebuilds stale digests only; a session with no digest is built by the commands.
- A Message decision links to the session file at its line (opened in the editor; files over 50 MB show the line number instead).
- `INDEX.md` sits in `docs/history/chats/` beside the exported files.
- "Chat ended without a close" means the last main-thread message row is not an agent reply that finished its turn (`stop_reason` end_turn).
- "Open Results in Editor" lists the matching digest lines of a session found only by its digest.

## Commits

- 7b0cbf2 feat: chat digest builder, store and search integration
- 85a4f5b feat: digest marker, Digest card section and digest snippets in the panel
- a66566f feat: Build, Rebuild and Export digest commands, settings and digest check
- 47b92e3 refactor: drop unused digest invalidation message and card helper
- c5fb3a4 docs: Chat Digests in README and CHANGELOG, plan closed
- f8d813d merge of feat/chat-digests into main (conflicts in CHANGELOG.md, package.json, src/webviewLayout.ts resolved by keeping both sides)
- 7751243 fix: digest review findings

---

## Finish Report (2026-11-25)

**Objective.** Chats hold owner decisions and context that later work needs, but a full chat file is too long to reread and `/compact` drops facts. Each chat now gets a stored digest (goal, decisions, files changed, references, left open) that is shown in the panel, searchable, and exportable as Markdown.

**What was built.** Core in `src/digest.ts` (exact parts, references, dialog answers, size cap), `src/digestAi.ts` (Haiku runner, pieces and merge, 2-slot limit), `src/digestStore.ts` (`<globalStorage>/digests-v1/<id>.json`), `src/digestBuild.ts` (worker side), `src/digestRun.ts` (host commands, auto rebuild, export), `src/digestMd.ts` (Markdown, slug, file names), `src/webviewDigest.ts` (marker and Digest section). Search changes in `match.ts` (digest check before the bloom gate, shared `digestTermsApply` and `digestLineHits`), `query.ts` (`digest:`), `search.ts`, `worker.ts`, `editorSearch.ts`, `export.ts`.

**Review fixes (7751243).**
- A pending worker build was dropped after 15 minutes, though a worst-case build runs longer. `PENDING_MS` is now derived from the AI constants (pieces, tries, timeout, slots).
- Search-results export and the results editor listed no digest lines for digest matches. Both now use the shared `digestLineHits`, and plain terms count against the digest only under the same condition `matchChat` uses.
- CSS hex colors (`#000`, `color: #333`) were extracted as PR references. Leading-zero and color-context matches are now skipped.
- Re-export after a title change left the old `_<id8>.md` file. `supersededExports` lists the files to delete before the write.
- Clicking the digest marker on a closed row did not scroll to the Digest section. A pending target is applied once the section renders.
- Host messages in `digestRun.ts` use `vscode.l10n.t`.

**Verification.** `npx tsc -p .` is clean. `check_digest.js`, `check_webview.js`, `check_scan.js`, `check_api.js`, `check_manifest.js`, `check_keepwarm.js`, `check_ring.js`, `check_options.js` and `check_activity.js` pass on the merged tree. The AI runner is exercised only through a stub. The real `claude` CLI and the running VS Code panel are unverified.

**Known limits.**
- A bare `#333` with no context is still listed as a PR reference.
- `PR: #42` is rejected by the colon rule.
- Webview digest strings are literal; this repo has no webview l10n setup.
- `check_guards.js` fails because `package.json` (0.49.0) and the top CHANGELOG heading (1.0.0) differ. The cause is outside this feature.
