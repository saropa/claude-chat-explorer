# Publishing Saropa Chat Explorer

Plain steps. Website screens change; where a screen may differ, check the site.

## 1. Check what already exists
Other Saropa extensions (saropa-log-capture, saropa_lints) use the publisher `saropa`.
The publisher, the Open VSX namespace and probably both tokens already exist.
- The scripts read tokens from the environment variables `VSCE_PAT` and `OVSX_PAT`.
- Check they are set (a number above 1 means set; never print the values):
  - `printenv VSCE_PAT | wc -c`
  - `printenv OVSX_PAT | wc -c`
- Look in the `.env` files of your other Saropa repos. Do not paste secrets anywhere.
- Verify each token works:
  - `npx @vscode/vsce verify-pat saropa -p "$VSCE_PAT"`
  - `npx ovsx verify-pat saropa -p "$OVSX_PAT"`
- Both pass and are set in your shell: go to step 5.
- Both pass only from a `.env` file: do step 4 to put them in your shell.

## 2. If the VS Code Marketplace token is missing
(check the site if the screen differs)
1. Sign in to Azure DevOps with the Microsoft account that owns the `saropa` publisher.
2. Open User settings, then Personal access tokens, then New token.
3. Organization: "All accessible organizations" (required).
4. Scopes: Custom defined, show all scopes, Marketplace, tick "Manage".
5. Set an expiry (maximum 1 year). Write the date in a calendar.
6. Copy the token once. It cannot be shown again.
- Publisher: the Visual Studio Marketplace publisher management page lists publishers.
  The id `saropa` must already exist. The id can never be changed. If it is missing, create it there.

## 3. If the Open VSX token is missing
(check the site if the screen differs)
1. Sign in to Open VSX with GitHub.
2. Accept the Eclipse Foundation publisher agreement. An Eclipse account linked to the GitHub account is required.
3. Open User settings, then Access Tokens, then Generate New Token. Copy it once.
4. Create the namespace once: `npx ovsx create-namespace saropa -p "$OVSX_PAT"`. It fails harmlessly if it already exists.
5. The verified-owner badge needs a separate ownership claim request on the Open VSX side.

## 4. Store the tokens
- Add to `~/.zshrc`:
  - `export VSCE_PAT="..."`
  - `export OVSX_PAT="..."`
- Run `source ~/.zshrc`.
- Never commit them. Never paste them in chat. Replace them before they expire.

## 5. Dry run
- `cd` into the repo, then `python3 scripts/publish.py`
- It publishes nothing. It prints every check and what it would do.

## 6. Real publish
- `python3 scripts/publish.py --publish`
- Needs: clean working tree, on `main`, in sync with origin, package.json version equal to the top CHANGELOG entry.
- It publishes to the Marketplace and Open VSX, then tags and creates the release.

## 7. After publishing
- Confirm the listing: search "Saropa Chat Explorer" in the Extensions panel.
  The Marketplace can take several minutes to validate a new version.
- Roll back: unpublish the version on the site, or publish a higher patch version.
  A version number can never be reused.
- First-publish checklist:
  - README renders without broken images.
  - The icon appears.
  - Categories are right.
  - The repository link works.
  - The extension id is `saropa.claude-chat-explorer`.

## 8. Troubleshooting
- 401 or 403: the token expired, has the wrong scope, or the wrong Organization. Make a new one (step 2 or 3).
- "publisher not found": the publisher id is wrong. It must be `saropa`.
- "version already exists": bump the version in package.json and add a CHANGELOG entry.
- A failing check in `publish.py` prints the reason on one line.
