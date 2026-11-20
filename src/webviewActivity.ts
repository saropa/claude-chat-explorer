/** The Activity section of the session list page: a collapsible header and the diagram below it (drawn inside a shadow root, see activitySection). */
import { activitySection, diagramSvg } from './activityHtml';

/** Page CSS for the section frame only; the diagram's own CSS lives inside its shadow root. */
export const ACT_CSS = `
#act{flex:none}
#acth{display:flex;align-items:center;gap:4px;width:100%;text-align:left;padding:2px 8px;margin:4px 0 6px;font:inherit;border:none;background:transparent;cursor:pointer;color:var(--vscode-descriptionForeground)}
#acth[aria-expanded=true]>.chev{transform:rotate(90deg)}
#acth:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#actb[hidden]{display:none}
html.webmode #act{display:none}`; // the cloud-sessions mode has no local chat to show activity for

/** Header (same chevron look as the other collapsible sections) plus the empty host the diagram is attached to. */
export const ACT_HTML = `<div id="act"><button type="button" id="acth" aria-expanded="true" aria-controls="actb" title="Collapse or expand the Activity diagram"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Activity</button><div id="actb"><div id="actd"></div></div></div>`;

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
root.innerHTML = ${JSON.stringify(diagramSvg() + '<div id="cap" aria-live="polite"></div>')};
host.style.setProperty('--fade', '${fadeMs}ms');
${s.script}
})();`; // the collapse toggle itself (secSet) lives in the list page's layout script, which also restores the saved state
}
