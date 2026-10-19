# Note: Cloud / web Claude sessions in the extension

Date: 2026-10-19
Status: Not feasible today. No work planned.

## Question

Can the extension show a user's cloud/web Claude sessions (claude.ai/code)?

## Answer

No. No official API exists for it.

## Findings

- The extension reads local JSONL transcripts from `~/.claude/projects` (`src/files.ts`). It has no code for claude.ai or remote sessions.
- Web sessions are stored on Anthropic's servers. No local file exists for them.
- No documented API lists or downloads web session transcripts or routine runs.
- The Agent SDK `listSessions()` and `getSessionMessages()` read only local JSONL files.
- Auth for web-session features needs a claude.ai login (`claude auth login`). An API key is not sufficient. Bedrock, Vertex and other third-party providers are refused. The org setting `allow_remote_sessions` must be on.
- The CLI's login token is internal and short-lived. No documented way for a third-party extension to use it.
- Calling private claude.ai endpoints with a session cookie would work only unofficially and could break at any time. Not recommended.

## Documented CLI commands

| Command | Effect |
|---|---|
| `claude --teleport` | Interactive picker of web sessions. Loads the chosen session's history into the terminal and checks out its branch. |
| `claude -p "msg" --cloud <id>` | Sends a message into a web session. Prints `{ok, session_id, url}`. Does not read history. |
| `claude --resume` | Lists local sessions only. Does not list web sessions. |

## Unknowns

- Whether `--teleport` writes a JSONL under `~/.claude/projects`. The docs do not say. Likely yes, since local sessions are saved there. Not verified.
- Whether an undocumented session API exists outside the docs checked.

## Test to resolve the first unknown

1. In a git repo with a web session, run `ls -t ~/.claude/projects/*/*.jsonl | head -3`. Note the top file.
2. Run `claude --teleport`. Pick a web session. Exit after it loads.
3. Run the `ls` command again.

- New file: the extension shows teleported sessions after a refresh. Document "teleport to import" in the README.
- No new file: the extension cannot show web sessions.

The picker is interactive. An agent cannot run this test.

## Recommendation

- Do not build cloud import.
- Run the test above. If a file appears, add a README tip.
- Request an export API from Anthropic with `/feedback` in Claude Code.

## Sources

- https://code.claude.com/docs/en/claude-code-on-the-web.md
- https://code.claude.com/docs/en/sessions.md
- https://code.claude.com/docs/en/agent-sdk/sessions.md
