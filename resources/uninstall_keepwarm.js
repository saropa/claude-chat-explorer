#!/usr/bin/env node
/*
 * vscode:uninstall hook for Saropa Chats.
 *
 * Why: the keep-warm feature writes a Stop hook into <claude config dir>/settings.json and a copy of its script into
 * <claude config dir>/saropa-chats/. Uninstalling the extension would otherwise leave a hook that runs a script nobody maintains.
 *
 * VS Code runs this with plain Node and no vscode API, so the hook edit logic is NOT duplicated here: it is loaded from the
 * compiled out/keepWarmSettings.js (out/ ships in the .vsix; scripts/ does not, which is why this file lives in resources/).
 * The same safe writer is used: an unparseable settings.json is never written.
 * If out/ cannot be loaded, the script copy is still deleted: the hook's node then exits non-zero on the missing file, which
 * disables pings, and the leftover settings entry is reported with removal instructions.
 * Always exits 0: a cleanup problem must not block the uninstall.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Standalone copy of claudeConfigDir() in src/keepWarmSettings.ts, needed because that module may be the thing that fails to load.
const configDir = (process.env.CLAUDE_CONFIG_DIR || '').trim() || path.join(os.homedir(), '.claude');

// Loading can fail (out/ missing or corrupt); that must not stop the script copy from being removed.
let k = null;
let loadError = '';
try {
  k = require(path.join(__dirname, '..', 'out', 'keepWarmSettings.js'));
} catch (e) {
  loadError = e instanceof Error ? e.message : String(e);
}

if (k) {
  try {
    const script = k.stableScriptPath();
    const file = k.settingsFilePath();
    const r = k.applyEdit(file, (s) => k.removeHook(s, script));
    // A parse failure is reported and left alone: the user's file may be mid-edit.
    if (!r.ok) { console.error(`Saropa Chats: left ${file} unchanged (${r.why})`); }
    else if (r.changed) { console.log(`Saropa Chats: removed the keep-warm Stop hook from ${file}`); }
    // The stable script copy belongs to the extension alone; remove it regardless of the settings outcome.
    fs.rmSync(script, { force: true });
  } catch (e) {
    // Cleanup is best effort.
    console.error(`Saropa Chats: keep-warm cleanup failed: ${e instanceof Error ? e.message : e}`);
  }
} else {
  // Fallback: same folder and file names as KEEP_WARM_STABLE_DIR / KEEP_WARM_SCRIPT_NAME in src/keepWarmSettings.ts.
  const script = path.join(configDir, 'saropa-chats', 'keep_warm.js');
  const file = path.join(configDir, 'settings.json');
  try { fs.rmSync(script, { force: true }); } catch (e) { /* best effort */ }
  console.error(
    `Saropa Chats: could not load the cleanup code (${loadError}). Deleted ${script}, so the keep-warm hook can no longer ping.\n`
    + `The Stop hook entry remains in ${file}. To remove it, delete the Stop hook whose "args" contain "${script}".`,
  );
}
process.exit(0);
