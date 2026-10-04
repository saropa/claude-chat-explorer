/** Export button and its menu, placed at the right of the status line (the results header). */
export const EXPORT_HTML = `<div class="exw">
<button type="button" class="opt exb dim" id="exb" title="Search to export" aria-label="Export matching lines" aria-haspopup="true" aria-expanded="false" aria-disabled="true" aria-controls="exm"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div id="exm" role="group" aria-label="Export" hidden>
<div class="sfi" id="exc1" role="button" tabindex="0">Copy to clipboard</div>
<div class="sfi" id="exs1" role="button" tabindex="0">Save to file...</div>
<div class="sfr"></div>
<label class="sfi"><input type="checkbox" id="exc"><span class="sfn">Include context</span></label>
<label class="sfi"><input type="checkbox" id="exu"><span class="sfn">Unique lines only</span></label>
</div>
</div>`;

export const EXPORT_CSS = String.raw`
.exw{position:relative;flex:none;display:flex;align-items:center}
.exb{width:24px;height:22px}
.exb.dim{opacity:.4;cursor:default}
#exm{position:absolute;right:0;top:100%;z-index:20;margin-top:2px;min-width:170px;padding:4px 0;background:var(--vscode-menu-background);color:var(--vscode-menu-foreground);border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,transparent));box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
#exm[hidden]{display:none}
#hint{margin:4px 0;color:var(--vscode-descriptionForeground);font-size:0.9em}
#hint[hidden]{display:none}
`;

/** Webview script: enabled state, menu behavior and the export request. Loaded after the status script. */
export const EXPORT_JS = String.raw`
const exb=$('exb'),exm=$('exm'),exc=$('exc'),exu=$('exu');
function exClose(){exm.hidden=true;exb.setAttribute('aria-expanded','false');}
function exSync(){const on=hasResults&&!busy;exb.setAttribute('aria-disabled',on?'false':'true');
exb.title=on?'Export matching lines':'Search to export';exb.classList.toggle('dim',!on);if(!on)exClose();}
function exLoad(p){exc.checked=!!(p&&p.context);exu.checked=!!(p&&p.unique);}
function exGo(mode){exClose();vs.postMessage(Object.assign({type:'export',mode:mode,context:exc.checked,unique:exu.checked,statuses:Array.from(stOn)},cur()));}
exb.addEventListener('click',()=>{if(exb.getAttribute('aria-disabled')==='true')return;
if(exm.hidden){exm.hidden=false;exb.setAttribute('aria-expanded','true');}else exClose();});
exm.addEventListener('change',()=>vs.postMessage({type:'exportPrefs',context:exc.checked,unique:exu.checked}));
exm.addEventListener('click',e=>{if(e.target.id==='exc1')exGo('copy');else if(e.target.id==='exs1')exGo('save');});
document.addEventListener('click',e=>{if(!e.target.closest('.exw'))exClose();});
const exw=exb.parentElement;
exw.addEventListener('keydown',e=>{if(e.key==='Escape'&&!exm.hidden){e.stopPropagation();exClose();exb.focus();}
else if((e.key==='Enter'||e.key===' ')&&(e.target.id==='exc1'||e.target.id==='exs1')){e.preventDefault();e.target.click();}});
exw.addEventListener('focusout',e=>{if(e.relatedTarget&&!exw.contains(e.relatedTarget))exClose();});
exSync();
`;
