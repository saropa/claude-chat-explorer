# Account & Usage panel

Owner decision (2026-10-30): build an "Account & Usage" section in the sidebar like Claude Code's own panel.

- Account: read `oauthAccount` in `~/.claude.json` (emailAddress, displayName, organizationName, seatTier). Read-only, offline.
- Usage: computed locally from token counts in `~/.claude/projects` transcripts, per 5-hour and 7-day window. No keychain access, no network, no undocumented endpoint.
- Limits are server-side, so no percent of limit is shown. Show token totals and reset-free rolling windows.
- Rejected: Anthropic usage endpoint with the keychain token (undocumented, security-sensitive).
- Owner decisions 2026-10-30: cache tokens are plain rows, not in brackets; no clipped text (values wrap, full text in a tooltip); wider row and group spacing; nowrap labels in a fixed label column; per window a 4-way breakdown (input, output, cache write, cache read) plus total, and a per-model split (top 4) for the 7-day window; shimmer placeholders while loading, old numbers kept during a rescan.
- Owner decision 2026-10-30: every element of the section has a tooltip (title attribute): header, labels, full values, window headings, token rows (say what each counts), per-model rows (full model id and tokens), shimmer placeholders ("Loading usage").
- Owner decision 2026-10-30: more windows, each with the same breakdown: Last 5 hours, Today (since local midnight), Yesterday (previous local calendar day, a bounded range), Last 3 days, Last 5 days, Last 7 days. One collapsible block per window (heading shows name and Total; breakdown rows underneath; open by default for Last 5 hours and Today only), all with tooltips. Per-model split stays under Last 7 days only. All windows come from the same cached events (no extra scan).
