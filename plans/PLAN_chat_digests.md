# PROPOSAL: Chat Digests — a short, searchable record of every chat

**Status: Accepted**

<!-- Open → Accepted → In Progress → Closed (or Declined, with rationale in Decision) -->

Created: 2026-10-30
Type: New command / UX improvement
Related area: Scan / Search / View / Export
Extension version: 0.38.0
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
3. **Search:** digest text is indexed. Normal search hits a digest the same way it hits a message. A new `digest:` token searches digests only (e.g. `digest:pricing`).
4. **Commands:**
   - `Chat Explorer: Build Digests` — builds digests for every chat that has none or is out of date. Shows progress. Can be stopped.
   - `Chat Explorer: Rebuild Digest` (row menu) — rebuilds one digest.
   - `Chat Explorer: Export Digests to Project` — writes one Markdown file per chat into `<project>/docs/history/chats/YYYY-MM-DD_<title>.md`, plus `INDEX.md` with one line per chat.
5. **Archived chats** get digests as well. They are still searchable while hidden from the main list.
6. **Search results:** a chat appears once in results. A digest hit and a message hit in the same chat count as hits of that chat; the snippet prefers the message hit.
7. **Difference from the hand-over note:** `handover.ts` builds a note to continue current work, from live facts, with no AI and no storage. A digest is a stored record of what was decided and done. Both read the chat's file list, branch and folder; the digest reuses those readers and does not copy them.

### How it is built
- **Exact parts (no AI):** files, references, the decision quotes, the date range and the branch come from the parsed chat. The same chat always produces the same output.
- **AI parts:** goal, decision selection and "left open". Uses the existing Haiku runner (`claude -p --model haiku --no-session-persistence`, as in `regenTitlesRun.ts`). The AI input is the owner messages and the agent's reply text only. Tool output is removed first, so a large chat fits.
- **Storage:** digests live beside the records in the extension's storage (new `digests-v1/` folder, one file per chat id). Claude Code's chat files are never written to.
- **Dialog answers:** the parser skips user rows that hold tool results, so dialog answers are not in the records today. The digest builder reads the chat file itself: it pairs each `AskUserQuestion` tool call with its tool result and keeps the question, the options and the chosen answer. This is a separate pass. It needs no `FORMAT` bump.
- **Staleness:** each digest stores the chat file's size and mtime. A digest is stale when either differs from the chat file. With `digest.auto` on, the extension rebuilds a stale digest once the chat file's mtime is more than 10 minutes old and the chat is not busy in `liveState.ts`. The manual commands rebuild any stale digest at once, with no idle wait.
- **Size cap:** a digest file is capped at 20 KB. The exact parts are cut last.

### Settings
| Key | Type | Default | Scope |
|-----|------|---------|-------|
| `saropaChatExplorer.digest.auto` | boolean | `false` | machine |
| `saropaChatExplorer.digest.useAi` | boolean | `true` | machine |

When `digest.auto` is `false`, digests are built only by the commands. When `digest.useAi` is `false`, a digest holds only the exact parts.

---

## Edge Cases

1. **Chat cut off by a context crash** — build the digest from what was saved. Mark it "chat ended without a close".
2. **Chat continued after compaction** — the summary row from compaction is input only. It is never quoted as a decision.
3. **Subagent chats** — their files and references merge into the parent's digest. They get no digest of their own.
4. **Very large chats** — when the AI input after trimming is still over the budget, summarize it in pieces and merge the pieces. The exact parts are not affected.
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

- Exact facts: reuse `Chat.files`, `made`, `cwds`, `git` (`types.ts`, `chatFacts.ts`). New: question-dialog answer extraction (not parsed today; no `AskUserQuestion` handling in `src/`) and reference extraction (URLs, hashes, `#123`, doc paths).
- AI runner: reuse the `regenTitlesRun.ts` pattern.
- Search: `match.ts` reads each record's `text` through `scanBody`. Digest text goes in a side store that `matchChat` consults after the body scan; the record layout does not change. Add `digest:` to `query.ts`.
- View: expanded row section (`webviewExpand.ts`), row marker (`webviewRows.ts`).
- Export: follow `exportMd.ts` and its command wiring. The filename is `YYYY-MM-DD_<title>_<first 8 chars of session id>.md`, so two chats with the same date and title do not collide. Re-export replaces the same file and leaves other files in `docs/history/chats/` alone. `INDEX.md` is rewritten each export.
- No `record.ts` `FORMAT` bump: digests use a separate store (`digests-v1/`), so existing records do not reparse.

---

## Commits

- (none yet)
