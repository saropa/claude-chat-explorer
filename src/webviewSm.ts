/** The Session Manager header menu: a button beside the collapse header that opens a small popover (same popover engine as the Activity gear). */

/** Header row and menu-button styling. The button is a sibling of #smh, so clicking it never collapses the section. */
export const SM_CSS = `
/* Header row: the collapse button takes the width, the menu button sits at its right end (a button inside a button is invalid and its click would also collapse). */
#smhr{display:flex;align-items:center}
#smm{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:6px;padding:0;border:none;border-radius:4px;background:transparent;cursor:pointer;color:var(--vscode-icon-foreground,var(--vscode-descriptionForeground))}
#smm:hover,#smm[aria-expanded=true]{background:var(--vscode-toolbar-hoverBackground)}
#smm:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
/* Checkable menu item: a fixed-width gutter holds the check so the labels of checked and unchecked items stay aligned; the mark follows aria-checked (the one source of the state). */
#smkw .smck{flex:none;width:1em;visibility:hidden}
#smkw[aria-checked=true] .smck{visibility:visible}
/* Group divider between menu sections (titles and digests, cleanup, views, settings): a theme-token hairline with a little breathing room. */
#smmm .smsep{height:0;margin:4px 0;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-widget-border,currentColor))}`;

/** Webview-to-host message: the Keep warm item was activated (the host flips the setting). One literal shared with the page script below. */
export const SM_KEEPWARM_MSG = 'smKeepWarm';
/** Host-to-webview message carrying the setting in effect ({ type, keepWarm: boolean }); sent on load, after a toggle and on any settings change. */
export const SM_PREFS_MSG = 'smPrefs';

/** Webview-to-host message for the command items below: { type, key }. The host runs only the command that SM_CMD_ITEMS maps this key to. */
export const SM_CMD_MSG = 'smCmd';

/**
 * Command items of the menu, in display order, with a null entry for a group divider. The single source for the markup AND for the host's
 * whitelist: the page sends only a key, and the host looks the command id up here, so the page can never name an arbitrary command.
 * Every command listed shows its own outcome (picker, modal, message), so the menu adds no feedback of its own.
 */
export const SM_CMD_ITEMS: Array<{ key: string; label: string; title: string; cmd: string } | null> = [
  { key: 'build', label: 'Build session digests', title: 'Summarize each session into a digest, with a cost estimate and confirmation first', cmd: 'saropaChats.buildDigests' },
  { key: 'export', label: 'Export session digests to project', title: 'Write the digests as Markdown files into the project folder', cmd: 'saropaChats.exportDigests' },
  { key: 'timeline', label: 'Show decisions timeline', title: 'Open the decisions found in the digests as a timeline', cmd: 'saropaChats.showDecisionsTimeline' },
  null,
  { key: 'tiny', label: 'Archive empty and tiny sessions', title: 'Archive sessions with no or very few messages, after a confirmation (nothing is deleted)', cmd: 'saropaChats.archiveTiny' },
  null,
  { key: 'usage', label: 'Usage summary', title: 'Session cost per day, week, project and model', cmd: 'saropaChats.usageSummary' },
  { key: 'editor', label: 'Open results in editor', title: 'Open the current search results as a document', cmd: 'saropaChats.openResultsInEditor' },
];

/** Markup of the command items: buttons with a data-key (the page script reads it) and role=separator dividers between groups. */
const CMD_ITEMS_HTML = SM_CMD_ITEMS.map((i) => (i ? `<button type="button" class="acto smc" id="smc-${i.key}" data-key="${i.key}" title="${i.title}">${i.label}</button>` : '<div class="smsep" role="separator"></div>')).join('');

/** The menu button (three dots) and its popover. Groups, top to bottom: titles and digests, cleanup, views, then the Keep warm toggle. Wording: "Generate", not "Regenerate". */
export const SM_MENU_HTML = `<div class="pw"><button type="button" id="smm" title="Session Manager menu" aria-label="Session Manager menu" aria-haspopup="true" aria-expanded="false" aria-controls="smmm"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="13" cy="8" r="1.3" fill="currentColor"/></svg></button>
<div id="smmm" class="pop" role="group" aria-label="Session Manager menu" hidden><button type="button" class="acto" id="smgen" title="Write new titles for your sessions, with a preview and a backup first">Generate session titles</button>${CMD_ITEMS_HTML}<div class="smsep" role="separator"></div><button type="button" class="acto" id="smkw" role="menuitemcheckbox" aria-checked="false" title="Ping idle Claude sessions before the prompt cache expires (installs a Stop hook in Claude settings)"><span class="smck" aria-hidden="true">&#10003;</span>Keep Claude sessions warm</button></div></div>`;

/**
 * Wires the menu. Needs makePop (POP_JS) and `vs` from the list page's script; without them it does nothing.
 * The item closes the popover, returns focus to the button and posts 'smRegen'; the host runs saropaChats.regenTitles, which shows its own pickers and outcome.
 */
export const SM_MENU_JS = `(function(){
if (typeof makePop !== 'function' || typeof vs === 'undefined') { return; }
const btn = document.getElementById('smm'), gen = document.getElementById('smgen');
if (!btn || !gen) { return; }
// Own popover pair: Escape, an outside click and focus leaving close it; Escape returns focus to the button (makePop's keydown handler).
const pop = makePop([['smm', 'smmm']]);
btn.addEventListener('click', () => pop.toggle('smm', 'smmm'));
gen.addEventListener('click', () => { pop.close(''); btn.focus(); vs.postMessage({ type: 'smRegen' }); });
// Keep warm toggle: the click only asks the host to flip the setting. The check is NOT flipped here; it follows the host's smPrefs reply,
// so it always shows the value really in effect (a failed write or an overriding scope leaves it unchanged).
// Command items: each closes the popover, returns focus, and posts only its key; the host maps it to a whitelisted command.
${JSON.stringify(SM_CMD_ITEMS.filter((i) => i !== null).map((i) => i.key))}.forEach((k) => { const b = document.getElementById('smc-' + k); if (b) { b.addEventListener('click', () => { pop.close(''); btn.focus(); vs.postMessage({ type: '${SM_CMD_MSG}', key: k }); }); } });
const kw = document.getElementById('smkw');
if (kw) {
  kw.addEventListener('click', () => { pop.close(''); btn.focus(); vs.postMessage({ type: '${SM_KEEPWARM_MSG}' }); });
  // Host pushes the current value on load and whenever the setting changes (Settings UI, command palette, this menu).
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== '${SM_PREFS_MSG}') { return; }
    kw.setAttribute('aria-checked', d.keepWarm === true ? 'true' : 'false');
  });
}
})();`;
