import { STATUS_SRC } from './status';

/** Funnel button and its popup menu, placed after the search details toggle. */
export const STATUS_HTML = `<div class="sfw">
<button type="button" class="opt abtn sfb" id="sfb" title="Filter by status" aria-label="Filter by status" aria-haspopup="true" aria-expanded="false" aria-disabled="false" aria-controls="sfm"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3-1.5V8.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg><span class="abt">Status</span><span class="sfp" id="sfp" hidden>0</span></button>
<div id="sfm" role="group" aria-label="Status filter" hidden></div>
</div>`;

export const STATUS_CSS = String.raw`
.sfw{flex:none;display:flex;align-items:center;position:relative}
.abtn{width:auto;height:24px;padding:0 8px;gap:5px;position:relative;border-color:var(--vscode-button-secondaryBackground,var(--vscode-widget-border,transparent));font-family:var(--vscode-font-family);font-size:inherit}
.abtn:disabled{opacity:.4;pointer-events:none}
.sfb.act{color:var(--vscode-focusBorder)}
.sfb.dim{opacity:.4;cursor:default}
.sfp{position:absolute;top:-4px;right:-4px;min-width:12px;box-sizing:border-box;padding:0 3px;border-radius:7px;font-size:9px;line-height:13px;text-align:center;font-family:var(--vscode-font-family);background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.sfp[hidden]{display:none}
#sfm{position:absolute;left:0;top:100%;z-index:20;margin-top:2px;min-width:170px;padding:4px 0;background:var(--vscode-menu-background);color:var(--vscode-menu-foreground);border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,transparent));box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
#sfm[hidden]{display:none}
.sfi{display:flex;align-items:center;gap:6px;padding:2px 10px;cursor:pointer}
.sfi:hover{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground)}
.sfi .sfn{flex:1}
.sfr{padding:4px 10px 2px;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-widget-border,transparent));margin-top:4px}
.lnk{padding:0;border:none;background:transparent;color:var(--vscode-textLink-foreground);cursor:pointer;font-family:inherit;font-size:inherit}
.lnk:hover{text-decoration:underline}
`;

/** Webview script: filter state, live filtering, counts and menu behavior. Loaded after the core script. */
const STATUS_JS = String.raw`
const sfb=$('sfb'),sfm=$('sfm'),sfp=$('sfp');
let stOn=new Set(STATUS_KEYS);
sfm.innerHTML=STATUS_KEYS.map(k=>'<label class="sfi"'+(k==='active'?' title="Open chats that are running, waiting for you or unread"':'')+'><input type="checkbox" data-k="'+k+'"><span class="sfn">'+STATUS_LABELS[k]+'</span><span class="pill" data-n="'+k+'">0</span></label>').join('')+'<div class="sfr"><button type="button" class="lnk" id="sfx">Reset</button></div>';
function stCounts(rs){const c={},now=Date.now();STATUS_KEYS.forEach(k=>{c[k]=0;});
rs.forEach(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).forEach(k=>{c[k]++;}));return c;}
function stKeep(rs){if(stOn.size===STATUS_KEYS.length)return rs;const now=Date.now();
return rs.filter(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).some(k=>stOn.has(k)));}
function stUi(c){sfm.querySelectorAll('input').forEach(i=>{i.checked=stOn.has(i.dataset.k);});
sfm.querySelectorAll('[data-n]').forEach(n=>{n.textContent=c[n.dataset.n];});
const off=STATUS_KEYS.length-stOn.size;sfp.textContent=off;sfp.hidden=!off;sfb.classList.toggle('act',off>0);try{advSync();}catch(e){}}
function stNote(n,has){return n>0?(has?' · ':'')+n+' hidden by status filter <button type="button" class="lnk sfr">Reset</button>':'';}
function stClose(){sfm.hidden=true;sfb.setAttribute('aria-expanded','false');}
function stSync(){sfb.setAttribute('aria-disabled','false');sfb.title='Filter by status';sfb.classList.remove('dim');}
function stSave(){vs.postMessage({type:'status',checked:Array.from(stOn)});}
function stReset(){stOn=new Set(STATUS_KEYS);stSave();rerender();}
function stLoad(a){if(Array.isArray(a))stOn=new Set(a.filter(k=>STATUS_KEYS.includes(k)));stSync();}
sfb.addEventListener('click',()=>{if(sfb.getAttribute('aria-disabled')==='true')return;
if(sfm.hidden){sfm.hidden=false;sfb.setAttribute('aria-expanded','true');}else stClose();});
sfm.addEventListener('change',e=>{const k=e.target.dataset.k;if(!k)return;
if(e.target.checked)stOn.add(k);else stOn.delete(k);stSave();rerender();});
sfm.addEventListener('click',e=>{if(e.target.id==='sfx')stReset();});
document.addEventListener('click',e=>{if(e.target.classList.contains('sfr'))stReset();});
document.addEventListener('click',e=>{if(!e.target.closest('.sfw'))stClose();});
const sfw=sfb.parentElement;
sfw.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sfm.hidden){e.stopPropagation();stClose();sfb.focus();}});
sfw.addEventListener('focusout',e=>{if(e.relatedTarget&&!sfw.contains(e.relatedTarget))stClose();});
stSync();
`;

export const STATUS = STATUS_SRC + STATUS_JS;
