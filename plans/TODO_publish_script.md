1. script needs to check for and install :
> tsc (TypeScript)

2. instead of failing, ask user if they want to check in ([yes]/n/retry)
>  [FAIL] working tree is not clean (2 changed paths)

3. all of this post-build needs to be handled by the script too:

============================================================
  [INFO] would run: npx @vscode/vsce publish --packagePath /Users/craighathaway/Documents/src/claude-chat-explorer/claude-chat-explorer-0.25.1.vsix (token not set: would be skipped)
  [INFO] would run: npx ovsx publish /Users/craighathaway/Documents/src/claude-chat-explorer/claude-chat-explorer-0.25.1.vsix (token not set: would be skipped)
  [INFO] would run: git tag -a v0.25.1 -m Release 0.25.1
  [INFO] would run: git push origin v0.25.1
  [INFO] would run: gh release create v0.25.1 /Users/craighathaway/Documents/src/claude-chat-explorer/claude-chat-explorer-0.25.1.vsix --title v0.25.1 --notes-file <changelog entry>
  [INFO] release notes: 13 lines from the 0.25.1 CHANGELOG entry
