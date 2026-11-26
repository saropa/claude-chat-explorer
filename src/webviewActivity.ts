/** The Activity section of the session list page: a collapsible header and the diagram below it (drawn inside a shadow root, see activitySection). */
import { activitySection, captionHtml, diagramSvg, pillsHtml } from './activityHtml';
import { SPEED_CHOICES, SPEED_LABELS } from './activityFeed';

/** Page CSS for the section frame only; the diagram's own CSS lives inside its shadow root. */
export const ACT_CSS = `
#act{flex:none}
/* Splitter between Session Manager and Activity: thin hit area (taller than the visible line) so it is easy to grab. */
#spl{height:7px;margin:-3px 0;position:relative;z-index:1;cursor:ns-resize;touch-action:none;background:linear-gradient(var(--vscode-sideBarSectionHeader-border,var(--vscode-panel-border,transparent)),var(--vscode-sideBarSectionHeader-border,var(--vscode-panel-border,transparent))) center/100% 1px no-repeat} /* 1px resting line centered in the 7px hit area, so the handle is discoverable without a hover */
/* Hover/drag/focus swaps the thin line for a solid sash-colored bar (shorthand resets the gradient). */
#spl:hover,#spl.drag,#spl:focus-visible{background:var(--vscode-sash-hoverBorder,var(--vscode-focusBorder));outline:none}
/* A hidden section body has nothing to resize, so the splitter goes too. */
#act:has(#acth[aria-expanded=false]) #spl{display:none}
/* User-chosen height (--ah) applies only once dragged; otherwise the body keeps its natural content height. */
#act.sized #actb{height:var(--ah);overflow:auto}
body.dragging{cursor:ns-resize;user-select:none}
/* Header row: the collapse button takes the width, the settings button sits at its right end as a sibling (a button inside a button is invalid and its click would also collapse). */
#acthr{display:flex;align-items:center;margin:4px 0 6px}
#acth{display:flex;align-items:center;gap:4px;flex:1;min-width:0;text-align:left;padding:2px 8px;margin:0;font:inherit;border:none;background:transparent;cursor:pointer;color:var(--vscode-descriptionForeground)}
#acts{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:6px;padding:0;border:none;border-radius:4px;background:transparent;cursor:pointer;color:var(--vscode-icon-foreground,var(--vscode-descriptionForeground))}
#acts:hover,#acts[aria-expanded=true]{background:var(--vscode-toolbar-hoverBackground)}
#acts:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
/* The settings popover: section titles, one row per option (a label around a native input, so clicking the text toggles it), a separator. */
#actm .actt{padding:4px 10px 2px;font-size:calc(var(--vscode-font-size) - 2px);color:var(--vscode-descriptionForeground)}
#actm .acto{display:flex;align-items:flex-start;gap:6px;width:100%;box-sizing:border-box;padding:3px 10px;margin:0;font:inherit;text-align:left;border:none;background:transparent;color:inherit;cursor:pointer}
#actm .acto:hover,#actm .acto:focus-within,#actm button.acto:focus-visible{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground);outline:none}
#actm .acto input{margin:2px 0 0}
#actm .actd{display:block;font-size:calc(var(--vscode-font-size) - 2px);opacity:.8}
#actm hr{border:none;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-widget-border,transparent));margin:4px 0}
#acth[aria-expanded=true]>.chev{transform:rotate(90deg)}
#acth:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#actb[hidden]{display:none}
html.webmode #act{display:none}`; // the cloud-sessions mode has no local chat to show activity for

/** One Slow / Medium / Fast radio group of the settings popover; ids are `<prefix>0..2` so the script finds each input by id. Values from activityFeed.ts. */
function speedGroup(key: 'refreshMs' | 'fadeMs', prefix: string, title: string, tip: string): string {
  const opts = SPEED_LABELS.map((label, i) => `<label class="acto" title="${tip} ${SPEED_CHOICES[key][i]} ms"><input type="radio" name="${prefix}" id="${prefix}${i}" value="${SPEED_CHOICES[key][i]}"><span>${label}</span></label>`).join('');
  // The title carries the value in effect (filled by the script), so a custom value set in settings.json, matching no radio, is still shown.
  return `<div class="actt" id="${prefix}l">${title}<span id="${prefix}v"></span></div><div role="radiogroup" aria-labelledby="${prefix}l">${opts}</div>`;
}

/**
 * The section's settings: a gear button at the right end of the header and its popover. Settings are real inputs (radios for the speeds,
 * a checkbox for the all-chats mode); Open in browser opens a screen, so it is a plain button and not a checkbox.
 */
const ACT_SETTINGS = `<div class="pw"><button type="button" id="acts" title="Activity settings" aria-label="Activity settings" aria-haspopup="true" aria-expanded="false" aria-controls="actm"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM6.9 1.5h2.2l.4 1.8 1.2.7 1.7-.6 1.1 1.9-1.3 1.2v1.4l1.3 1.2-1.1 1.9-1.7-.6-1.2.7-.4 1.8H6.9l-.4-1.8-1.2-.7-1.7.6-1.1-1.9 1.3-1.2V7.3L2.5 6.1l1.1-1.9 1.7.6 1.2-.7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg></button>
<div id="actm" class="pop" role="group" aria-label="Activity settings" hidden>${speedGroup('refreshMs', 'actr', 'Refresh speed', 'Check the chat log every')}${speedGroup('fadeMs', 'actf', 'Fade speed', 'A flash fades out in')}<hr>
<label class="acto" title="Follow every live chat, each in its own color, not only the chat in the focused tab"><input type="checkbox" id="actall"><span>All chats<span class="actd">Every live chat, each in its own color</span></span></label><hr>
<button type="button" class="acto" id="actbr" title="Open the Activity diagram of all live chats in a browser tab">Open in browser</button></div></div>`;

/** Header row (same chevron look as the other collapsible sections, plus the settings button) and the empty host the diagram is attached to. */
export const ACT_HTML = `<div id="act"><div id="spl" role="separator" aria-orientation="horizontal" tabindex="0" title="Drag to resize the Activity section (double-click to reset)" aria-label="Resize Activity section"></div><div id="acthr"><button type="button" id="acth" aria-expanded="true" aria-controls="actb" title="Collapse or expand the Activity diagram"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Activity</button>${ACT_SETTINGS}</div><div id="actb"><div id="actd"></div></div></div>`;

/**
 * Wires the settings popover (page DOM, outside the diagram's shadow root). Needs makePop (POP_JS) and `vs` from the list page's script;
 * without them (another page reusing the section) it does nothing. A choice is posted to the host, which writes the setting and answers
 * with a 'prefs' message carrying the values in effect; that message, also sent on page load and on any settings change, sets the inputs.
 */
const ACT_MENU_JS = `(function(){
if (typeof makePop !== 'function' || typeof vs === 'undefined') { return; }
const el = (id) => document.getElementById(id);
const gear = el('acts'), menu = el('actm');
if (!gear || !menu) { return; }
// Own popover pair: Escape, an outside click and focus leaving close it, and Escape returns focus to the gear (makePop's keydown handler).
const pop = makePop([['acts', 'actm']]);
gear.addEventListener('click', () => pop.toggle('acts', 'actm'));
const groups = { refreshMs: 'actr', fadeMs: 'actf' };
// The values of radio i, from activityFeed.ts (embedded, not read back from the markup, so markup and script cannot drift apart).
const CH = ${JSON.stringify(SPEED_CHOICES)};
for (const key of Object.keys(groups)) {
  for (let i = 0; i < 3; i++) {
    const r = el(groups[key] + i);
    // change fires only for a newly checked radio, so picking the current speed posts nothing (nothing would change).
    if (r) { r.addEventListener('change', () => { if (r.checked) { vs.postMessage({ type: 'actSet', key, value: CH[key][i] }); } }); }
  }
}
const all = el('actall');
// The checkbox flips at once (the visible outcome); the host's 'prefs' answer puts it back if the write did not take effect.
if (all) { all.addEventListener('change', () => vs.postMessage({ type: 'actSet', key: 'allChats', value: !!all.checked })); }
const br = el('actbr');
// Opening a screen: the menu closes and the host runs the browser command, which shows its own outcome.
if (br) { br.addEventListener('click', () => { pop.close(''); gear.focus(); vs.postMessage({ type: 'actBrowser' }); }); }
/** Sets one radio group from the value in effect; the title shows it in ms, so a custom value matching no radio is still visible. */
const setGroup = (key, ms) => {
  const prefix = groups[key];
  for (let i = 0; i < 3; i++) { const r = el(prefix + i); if (r) { r.checked = CH[key][i] === ms; } }
  const v = el(prefix + 'v'); if (v) { v.textContent = ' · ' + ms + ' ms'; }
};
addEventListener('message', (e) => {
  const d = e.data, m = d && d.type === 'act' ? d.m : null;
  if (!m || m.type !== 'prefs') { return; }
  if (Number.isFinite(m.refreshMs)) { setGroup('refreshMs', m.refreshMs); }
  if (Number.isFinite(m.fadeMs)) { setGroup('fadeMs', m.fadeMs); }
  if (all) { all.checked = m.all === true; }
});
})();`;

/** Script that builds the diagram in the host's shadow root and wires the collapse toggle. `fadeMs`: initial flash fade time (setting `activity.fadeMs`). */
export function actScript(fadeMs: number): string {
  const s = activitySection(fadeMs);
  // The stylesheet is adopted (not a <style> element) because the page's CSP only allows nonce-tagged style elements.
  return `(function(){
const host = document.getElementById('${s.hostId}');
const root = host.attachShadow({ mode: 'open' });
const sheet = new CSSStyleSheet();
sheet.replaceSync(${JSON.stringify(s.css)});
root.adoptedStyleSheets = [sheet];
root.innerHTML = ${JSON.stringify(diagramSvg() + pillsHtml() + captionHtml())}; // captionHtml: the same caption row markup as the standalone page
host.style.setProperty('--fade', '${fadeMs}ms');
${s.script}
})();
${ACT_MENU_JS}`; // the collapse toggle itself (secSet) lives in the list page's layout script, which also restores the saved state
}
