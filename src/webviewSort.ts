/** Header icon buttons (sort, status filter) with their popovers: shared markup, styles and open/close behavior. */
const SORT_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 13V3M1.800 5.200L4 3l2.200 2.200M12 3v10M9.800 10.800L12 13l2.200-2.200" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const SORT_HTML = `<div class="pw">
<button type="button" class="opt hb" id="srb" data-tip="Sort results by: Score" aria-label="Sort results by: Score" aria-haspopup="true" aria-expanded="false" aria-controls="srm">${SORT_SVG}<span class="hdot" id="srd" hidden></span></button>
<div id="srm" class="pop" role="group" aria-label="Sort results by" hidden></div>
</div>`;

export const SORT_CSS = String.raw`
.srow{display:flex;align-items:center;gap:4px}
.srow .box{flex:1 1 auto;min-width:0}
.hbs{display:flex;flex:none;align-items:center;gap:2px}
.pw{position:relative;display:flex}
.hb{position:relative;width:26px;height:26px;border-radius:4px}
.hb svg{width:16px;height:16px}
.hb[aria-expanded=true]{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent)}
.hb:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.hdot{position:absolute;top:3px;right:3px;width:7px;height:7px;box-sizing:border-box;border-radius:50%;background:var(--vscode-focusBorder);border:1px solid var(--vscode-sideBar-background,var(--vscode-editor-background))}
.hdot[hidden]{display:none}
.pop{position:absolute;right:0;top:100%;z-index:20;margin-top:2px;min-width:170px;max-width:calc(100vw - 16px);padding:4px 0;box-sizing:border-box;background:var(--vscode-menu-background);color:var(--vscode-menu-foreground);border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,transparent));box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
.pop[hidden]{display:none}
.pt{padding:2px 10px 4px;font-size:0.85em;color:var(--vscode-descriptionForeground)}
.pi{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;cursor:pointer}
.pi:hover{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground)}
.pi input{margin:0;width:13px;height:13px;flex:none}
.pi .sfn{flex:1;min-width:0}
.pi .pill{margin-left:auto}
`;

/** Webview script: the sort state and menu, and the shared popover open/close (one open at a time; Escape and outside click close). */
export const SORT_JS = String.raw`
const SORTS=[['score','Score'],['time','Time'],['title','Title'],['length','Length'],['cost','Cost'],['context','Context']];
const srb=$('srb'),srm=$('srm'),srd=$('srd');
srm.innerHTML='<div class="pt">Sort results by</div>'+SORTS.map(o=>'<label class="al pi"><input type="radio" name="srt" value="'+o[0]+'"><span class="sfn">'+o[1]+'</span></label>').join('');
function sortLabel(){return SORTS.find(o=>o[0]===sort.value)[1];}
function sortUi(){srm.querySelectorAll('input').forEach(i=>{i.checked=i.value===sort.value;});
const t='Sort results by: '+sortLabel();srd.hidden=sort.value==='score';srb.dataset.tip=t;srb.setAttribute('aria-label',srd.hidden?t:t+' (changed from the default)');}
function sortSet(v){sort.value=SORTS.some(o=>o[0]===v)?v:'score';sortUi();try{advSync();}catch(e){}}
srm.addEventListener('change',e=>{const v=e.target.value;if(!v)return;sortSet(v);draft();if(sessOn&&!hasResults)askSess();rerender();});
const POPS=[['srb','srm'],['sfb','sfm']];
function popClose(except){POPS.forEach(p=>{if(p[1]===except)return;$(p[1]).hidden=true;$(p[0]).setAttribute('aria-expanded','false');});}
function popToggle(bid,mid){const m=$(mid),open=m.hidden;popClose(open?mid:'');m.hidden=!open;$(bid).setAttribute('aria-expanded',open?'true':'false');}
srb.addEventListener('click',()=>popToggle('srb','srm'));
document.addEventListener('click',e=>{if(!e.target.closest('.pw'))popClose('');});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const o=POPS.find(p=>!$(p[1]).hidden);if(o){e.stopPropagation();popClose('');$(o[0]).focus();}});
document.addEventListener('focusin',e=>{if(e.target.closest&&!e.target.closest('.pw'))popClose('');});
sortUi();
`;
