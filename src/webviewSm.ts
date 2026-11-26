/** The Session Manager header menu: a button beside the collapse header that opens a small popover (same popover engine as the Activity gear). */

/** Header row and menu-button styling. The button is a sibling of #smh, so clicking it never collapses the section. */
export const SM_CSS = `
/* Header row: the collapse button takes the width, the menu button sits at its right end (a button inside a button is invalid and its click would also collapse). */
#smhr{display:flex;align-items:center}
#smm{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:6px;padding:0;border:none;border-radius:4px;background:transparent;cursor:pointer;color:var(--vscode-icon-foreground,var(--vscode-descriptionForeground))}
#smm:hover,#smm[aria-expanded=true]{background:var(--vscode-toolbar-hoverBackground)}
#smm:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}`;

/** The menu button (three dots) and its popover; the item runs the bulk title generator. Wording: "Generate", not "Regenerate". */
export const SM_MENU_HTML = `<div class="pw"><button type="button" id="smm" title="Session Manager menu" aria-label="Session Manager menu" aria-haspopup="true" aria-expanded="false" aria-controls="smmm"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="13" cy="8" r="1.3" fill="currentColor"/></svg></button>
<div id="smmm" class="pop" role="group" aria-label="Session Manager menu" hidden><button type="button" class="acto" id="smgen" title="Write new titles for your sessions, with a preview and a backup first">Generate session titles</button></div></div>`;

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
})();`;
