# Claude configuration panel

Read-only panel showing Claude Code configuration at global (`~/.claude`) and project (`<workspace>/.claude`, `CLAUDE.md`) level, with findings and a copy-to-AI handover.

## Decisions (owner confirmed)
- Placement: new editor tab, opened by a command and a sidebar kebab item. Follows the `optionsPanel.ts` pattern.
- Findings: deterministic rules in code. No AI call.
- Handover: one Copy button producing a single Markdown block: facts + findings + an optimisation prompt. Same pattern as `copyResume.ts`.
- Not editable.

## Scope
- Sources per level: settings.json (+ settings.local.json), CLAUDE.md, rules/, skills/, agents/, commands/, hooks, permissions, MCP servers, env.
- Facts shown: file, size, key values (e.g. `cleanupPeriodDays` = 3650 days, shown as 10 years).
- Finding categories: bloat, duplication, redundancy, gaps, opportunities, risks.
- Example rules: CLAUDE.md over a size threshold; duplicate or shadowed permission entries; same rule in global and project; broad allow-all entries; large retention value (disk growth); missing project CLAUDE.md; unused/empty dirs.

## Out of scope
- Editing config, AI analysis, auto-fixes.
