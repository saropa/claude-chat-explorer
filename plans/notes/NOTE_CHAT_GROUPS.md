# Note: Claude chat groupings

Written for: the project owner.

## Question

Can this extension read Claude's named chat groupings, such as the group "Test only"?

## Answer

No. The local records do not hold chat groupings. The extension cannot read them from here.

## What was checked

| Source | Result |
|---|---|
| Tool list in this session | No tool reads chat groupings. The Artifact tools cover artifacts only. |
| `~/.claude/projects/**/*.jsonl` (Claude Code transcripts) | No field stores a group name for a chat. |
| `~/Library/Application Support/Claude` | No match for "Test only" or the chat title. |

## Findings

- The string "Test only" appears once in a contacts transcript (`22eb3898-19ee-4316-be07-d87a8384586d.jsonl`). It is a table cell in a bug list ("Nothing. Test only"). It is not a group name.
- The chat title "Games Sudoku and Futoshiki: polish, save, share links" does not appear as a chat record. It appears only in the git status snapshot that Claude Code attaches to contacts sessions, and in this session's own messages.
- The git status snapshot lists file names such as `bugs/DESIGN_FUTOSHIKI_BOARD_POLISH.md` and `docs/guides/SUDOKU_REF.md`. These are project files, not chat records.

## Unknown

- Where claude.ai stores chat groupings. The local records do not show it.

## Options

1. Export the group list from claude.ai and give the file path to this project. Recommended. It gives the extension a real source to read.
2. Give a claude.ai API or connector that exposes groupings. Only possible if one exists. Not verified.

## Next step

Export the group list (or paste the group names), and the extension can be scoped to it.
