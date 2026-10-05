import { POP_CSS } from './webviewPop';

/** Header icon buttons (tips, sort, status filter) with their popovers: shared markup, styles and open/close behavior. */
const SORT_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 13V3M1.800 5.200L4 3l2.200 2.200M12 3v10M9.800 10.800L12 13l2.200-2.200" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const SORT_HTML = `<div class="pw">
<button type="button" class="opt hb" id="srb" data-tip="Sort results by: Score" aria-label="Sort results by: Score" aria-haspopup="true" aria-expanded="false" aria-controls="srm">${SORT_SVG}<span class="hdot" id="srd" hidden></span></button>
<div id="srm" class="pop" role="group" aria-label="Sort results by" hidden></div>
</div>`;

export const SORT_CSS = String.raw`
.srow{display:flex;align-items:center;gap:4px}
.srow .box{flex:1 1 auto;min-width:0}
.hbs{display:flex;flex:none;align-items:center;gap:2px}
`+POP_CSS+String.raw`.hb{position:relative;width:26px;height:26px;border-radius:4px}
.hb svg{width:16px;height:16px}
.hb[aria-expanded=true]{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent)}
.hb:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.hdot{position:absolute;top:3px;right:3px;width:7px;height:7px;box-sizing:border-box;border-radius:50%;background:var(--vscode-focusBorder);border:1px solid var(--vscode-sideBar-background,var(--vscode-editor-background))}
.hdot[hidden]{display:none}
.pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
.pi{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;cursor:pointer}
.pop .pi{display:flex}
.pi:hover{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground)}
.pi input{margin:0;width:13px;height:13px;flex:none}
.pi .sfn{flex:1;min-width:0}
.pi .pill{margin-left:auto}
#srm{min-width:min(220px,calc(100vw - 16px))}
.pg{display:grid;grid-template-columns:1fr 1fr;justify-items:start;align-items:center}
.pg .pi{width:100%;box-sizing:border-box}
`;

/** Webview script: the sort state and menu, and the popover wiring (open/close lives in webviewPop). */
export const SORT_JS = String.raw`
const SORTS=[['score','Score'],['time','Time'],['title','Title'],['length','Length'],['cost','Cost'],['context','Context']];
const srb=$('srb'),srm=$('srm'),srd=$('srd');
srm.innerHTML='<div class="pt">Sort results by</div><div class="pg">'+SORTS.map(o=>'<label class="al pi"><input type="radio" name="srt" value="'+o[0]+'"><span class="sfn">'+o[1]+'</span></label>').join('')+'</div>';
function sortLabel(){return SORTS.find(o=>o[0]===sort.value)[1];}
function sortUi(){srm.querySelectorAll('input').forEach(i=>{i.checked=i.value===sort.value;});
const t='Sort results by: '+sortLabel();srd.hidden=sort.value==='score';srb.dataset.tip=t;srb.setAttribute('aria-label',srd.hidden?t:t+' (changed from the default)');}
function sortSet(v){sort.value=SORTS.some(o=>o[0]===v)?v:'score';sortUi();try{advSync();}catch(e){}}
srm.addEventListener('change',e=>{const v=e.target.value;if(!v)return;sortSet(v);draft();if(sessOn&&!hasResults)askSess();rerender();});
const pop=makePop([['srb','srm'],['sfb','sfm'],['tpb','tpm']]);
function popClose(except){pop.close(except);}
function popToggle(bid,mid){pop.toggle(bid,mid);}
srb.addEventListener('click',()=>popToggle('srb','srm'));
sortUi();
`;
