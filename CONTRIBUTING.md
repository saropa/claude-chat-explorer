# Contributing

## Build

- `npm install`
- `npm run compile` builds `src/` into `out/`.
- `node scripts/check_manifest.js` fails on a bad `package.json` contribution. `npm run package` runs it first.
- `node scripts/bench.js` (after compile) prints timings.

## Package

- `npm run package` builds a `.vsix` in the repo root.
- Never commit a `.vsix`.

## Branch flow

- Work in a sibling worktree on a feature branch: `git worktree add -b <branch> ../claude-chat-search-wt-<name>`.
- Merge into `main` fast-forward only, then delete the branch and the worktree.
- Update `CHANGELOG.md` for any change a user can see.

## Rules

- No runtime dependencies. `package.json` lists dev dependencies only.
- US English in code, comments, docs and commit messages.
- Never commit tokens, screenshots, Chrome profiles or chat files.
- Keep the extension local-only: no network code of its own.
- Design docs live in `plans/` (`plans/design` open, `plans/done` finished).

## Pull requests

- Keep each pull request to one change.
- Fill in the pull request template.
