/** Export button and its menu, placed at the right of the status line (the results header). */
export const EXPORT_HTML = `<div class="exw" id="exw" title="Run a search to export its matching lines">
<button type="button" class="opt abtn exb" id="exb" title="Run a search to export its matching lines" aria-label="Export matching lines" aria-haspopup="true" aria-expanded="false" aria-controls="exm" disabled><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="abt">Export</span></button>
<div id="exm" role="group" aria-label="Export" hidden>
<div class="sfi" id="exc1" role="button" tabindex="0">Copy to clipboard</div>
<div class="sfi" id="exs1" role="button" tabindex="0">Save to file...</div>
<div class="sfr"></div>
<label class="sfi"><input type="checkbox" id="exc"><span class="sfn">Include context</span></label>
<label class="sfi"><input type="checkbox" id="exu"><span class="sfn">Unique lines only</span></label>
</div>
</div>`;

export const EXPORT_CSS = String.raw`
.exw{flex:none;display:flex;align-items:center}
.exw.off{cursor:default}
#exn{margin:4px 0 0;min-height:0;font-size:0.9em;color:var(--vscode-descriptionForeground);opacity:0;transition:opacity .4s}
#exn.on{opacity:1}
#exn:empty{display:none}
#exm{position:absolute;left:0;top:100%;z-index:20;margin-top:2px;min-width:170px;padding:4px 0;background:var(--vscode-menu-background);color:var(--vscode-menu-foreground);border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,transparent));box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
#exm[hidden]{display:none}
#hint{margin:4px 0;color:var(--vscode-descriptionForeground);font-size:0.9em}
#hint[hidden]{display:none}
`;

/** Webview script: enabled state, menu behavior and the export request. Loaded after the status script. */
export const EXPORT_JS = String.raw`
const exb=$('exb'),exm=$('exm'),exc=$('exc'),exu=$('exu');
function exClose(){exm.hidden=true;exb.setAttribute('aria-expanded','false');}
const exw=$('exw'),exn=$('exn');let exnT;
function exSync(){const on=hasResults&&!busy;exb.disabled=!on;exw.classList.toggle('off',!on);
exb.title=exw.title=on?'Export matching lines':busy?'Export is available when the search finishes':'Run a search to export its matching lines';if(!on)exClose();}
function exNote(){exn.textContent=busy?'Searching. Export is available when the search finishes.':'Run a search first. Export copies the matching lines.';
exn.classList.add('on');clearTimeout(exnT);exnT=setTimeout(()=>{exn.classList.remove('on');exnT=setTimeout(()=>{exn.textContent='';},400);},4000);}
function exLoad(p){exc.checked=!!(p&&p.context);exu.checked=!!(p&&p.unique);}
function exGo(mode){exClose();vs.postMessage(Object.assign({type:'export',mode:mode,context:exc.checked,unique:exu.checked,statuses:Array.from(stOn)},cur()));}
exw.addEventListener('click',e=>{if(exb.disabled&&!e.target.closest('#exm'))exNote();});
exb.addEventListener('click',()=>{if(exb.disabled)return;
if(exm.hidden){exm.hidden=false;exb.setAttribute('aria-expanded','true');}else exClose();});
exm.addEventListener('change',()=>vs.postMessage({type:'exportPrefs',context:exc.checked,unique:exu.checked}));
exm.addEventListener('click',e=>{if(e.target.id==='exc1')exGo('copy');else if(e.target.id==='exs1')exGo('save');});
document.addEventListener('click',e=>{if(!e.target.closest('.exw'))exClose();});
exw.addEventListener('keydown',e=>{if(e.key==='Escape'&&!exm.hidden){e.stopPropagation();exClose();exb.focus();}
else if((e.key==='Enter'||e.key===' ')&&(e.target.id==='exc1'||e.target.id==='exs1')){e.preventDefault();e.target.click();}});
exw.addEventListener('focusout',e=>{if(e.relatedTarget&&!exw.contains(e.relatedTarget))exClose();});
exSync();
`;
