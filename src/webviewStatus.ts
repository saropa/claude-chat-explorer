import { STATUS_SRC } from './status';

/** Funnel icon button in the header row and its popover (checkable status list); a dot shows when a status is turned off. */
export const STATUS_HTML = `<div class="pw">
<button type="button" class="opt hb" id="sfb" data-tip="Filter by status" aria-label="Filter by status" aria-haspopup="true" aria-expanded="false" aria-controls="sfm"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 3h12l-4.500 5.500V13l-3-1.500V8.500z" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linejoin="round"/></svg><span class="hdot" id="sfp" hidden></span></button>
<div id="sfm" class="pop" role="group" aria-label="Status filter" hidden></div>
</div>`;

export const STATUS_CSS = String.raw`
.sfrow{padding:4px 10px 2px;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-widget-border,transparent));margin-top:4px}
.lnk{padding:0;border:none;background:transparent;color:var(--vscode-textLink-foreground);cursor:pointer;font-family:inherit;font-size:inherit}
.lnk:hover{text-decoration:underline}
`;

/** Webview script: filter state, live filtering, counts and menu behavior. Loaded after the core script. */
const STATUS_JS = String.raw`
const sfb=$('sfb'),sfm=$('sfm'),sfp=$('sfp');
let stOn=new Set(STATUS_KEYS);
sfm.innerHTML='<div class="pt">Show chats that are</div>'+STATUS_KEYS.map(k=>'<label class="al pi" data-tip="'+esc(STATUS_TIPS[k])+'"><input type="checkbox" data-k="'+k+'"><span class="sfn">'+STATUS_LABELS[k]+'</span><span class="pill" data-n="'+k+'">0</span></label>').join('')+'<div class="sfrow"><button type="button" class="lnk" id="sfx">Reset</button></div>';
function stCounts(rs){const c={},now=Date.now();STATUS_KEYS.forEach(k=>{c[k]=0;});
rs.forEach(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).forEach(k=>{c[k]++;}));return c;}
function stKeep(rs){if(stOn.size===STATUS_KEYS.length)return rs;const now=Date.now();
return rs.filter(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).some(k=>stOn.has(k)));}
function stUi(c){sfm.querySelectorAll('input').forEach(i=>{i.checked=stOn.has(i.dataset.k);});
sfm.querySelectorAll('[data-n]').forEach(n=>{n.textContent=c[n.dataset.n];});
const off=STATUS_KEYS.length-stOn.size,t=off?'Filter by status ('+off+' of '+STATUS_KEYS.length+' turned off)':'Filter by status';
sfp.hidden=!off;sfb.dataset.tip=t;sfb.setAttribute('aria-label',t);try{advSync();}catch(e){}}
function stNote(n,has){return n>0?(has?' · ':'')+n+' hidden by status filter <button type="button" class="lnk sfre">Reset</button>':'';}
function stSave(){vs.postMessage({type:'status',checked:Array.from(stOn)});}
function stReset(){stOn=new Set(STATUS_KEYS);stSave();rerender();}
function stLoad(a){if(Array.isArray(a))stOn=new Set(a.filter(k=>STATUS_KEYS.includes(k)));}
sfb.addEventListener('click',()=>popToggle('sfb','sfm'));
sfm.addEventListener('change',e=>{const k=e.target.dataset.k;if(!k)return;
if(e.target.checked)stOn.add(k);else stOn.delete(k);stSave();rerender();});
sfm.addEventListener('click',e=>{if(e.target.id==='sfx')stReset();});
document.addEventListener('click',e=>{if(e.target.classList.contains('sfre'))stReset();});
`;

export const STATUS = STATUS_SRC + STATUS_JS;
