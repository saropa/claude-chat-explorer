# Note: Cloud / web Claude sessions in the extension

Date: 2026-10-20 (updated)
Status: Decision: opt-in read-only implemented (`saropaChatExplorer.webSessions.enabled`, default off). Code: `src/webApi.ts`, `src/webSessions.ts`, `src/webviewWeb.ts`; test: `scripts/check_web.js`.

## Findings (from the official extension's Session Manager "Web" tab; undocumented API)

- List: `GET https://api.anthropic.com/v1/code/sessions?limit=200` (fallback `GET /v1/sessions`). `{data:[{id,title,updated_at,session_status,session_context:{sources}}]}`.
- Transcript: `GET /v1/code/sessions/{id}/teleport-events?limit=1000&cursor=<next_cursor>`, paged until no `next_cursor`. `{data:[{payload}], next_cursor}`.
- Headers: `Authorization: Bearer <OAuth access token>`, `anthropic-version: 2023-06-01`, `anthropic-beta: ccr-byoc-2025-07-29`, `x-organization-uuid` (optional; read from `~/.claude.json` `oauthAccount.organizationUuid`).
- Token: `claudeAiOauth.accessToken` and `expiresAt` from the macOS keychain (service `Claude Code-credentials`, via `security find-generic-password -w`), else `~/.claude/.credentials.json`. Read only: never refreshed, written, logged or persisted. Expired or missing: "Sign in with the Claude Code CLI (claude auth login) and retry".

## Risks

- Unofficial and undocumented: may break or change without notice; may be subject to Anthropic's terms. Hence opt-in, a one-time confirm dialog, and failures confined to the Web tab.
- Unverified: the keychain service name, and that transcript payloads match the local JSONL row shape (user/assistant rows are mapped; anything else shows as raw JSON).
- The extension has no in-panel transcript viewer; a web session opens as a read-only Markdown document (same layout as the Markdown export).
