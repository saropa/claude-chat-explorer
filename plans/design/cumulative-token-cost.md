# Cumulative token cost per chat and work item

Problem: /compact resets the context figure (src/contextUsage.ts), so the chat's accumulated cost is invisible.

Owner decisions (2026-10-30):
- Unit: tokens only. Input, output, cache read, cache write, kept separate. No USD, no price table.
- Scope: per chat, plus a sum over the chats grouped under one work item (branch or PR, from src/workChats.ts).
- Public API: both levels exposed on the object returned from activate() (src/api.ts), for other Saropa extensions.
- Deliverable: an API document describing every interface (docs/API.md).
- /compact stays supported: totals are never reset by a compact_boundary row.

- Owner decision (2026-10-30): the public API exposes everything the extension knows, read-only: every chat's data (context, model, folder, state, pins, archive, tags, tokens), work items, and Account & Usage figures. No gatekeeping.
- Owner decision (2026-10-30): the ring tooltip also shows the cumulative total (built).

Design:
- Count each billed assistant reply once (dedupe by message id, as eventOf in src/accountUsage.ts does).
- Include sidechain (sub-agent) replies. Context size (contextUsage.ts) keeps skipping them; cost counts them.
- Chat total = sum over its transcript file. Work total = sum of its chats' totals.
- API: `tokensForChat(id)`, `tokensForWork(key)`; bump API_VERSION only if existing shape changes (additive: no bump needed, but list in docs/API.md).
- UI: show the chat total next to the existing context figure; show the work total in Open Work.
