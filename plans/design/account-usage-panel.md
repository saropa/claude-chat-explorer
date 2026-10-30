# Account & Usage panel

Owner decision (2026-10-30): build an "Account & Usage" section in the sidebar like Claude Code's own panel.

- Account: read `oauthAccount` in `~/.claude.json` (emailAddress, displayName, organizationName, seatTier). Read-only, offline.
- Usage: computed locally from token counts in `~/.claude/projects` transcripts, per 5-hour and 7-day window. No keychain access, no network, no undocumented endpoint.
- Limits are server-side, so no percent of limit is shown. Show token totals and reset-free rolling windows.
- Rejected: Anthropic usage endpoint with the keychain token (undocumented, security-sensitive).
