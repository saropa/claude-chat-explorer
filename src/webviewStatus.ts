import { STATUS_SRC } from './status';

/** Status filter state for the sidebar script. The picker lives in the view title bar (see headerCommands); the host posts setStatuses. */
export const STATUS_CSS = String.raw`
.lnk{padding:0;border:none;background:transparent;color:var(--vscode-textLink-foreground);cursor:pointer;font-family:inherit;font-size:inherit}
.lnk:hover{text-decoration:underline}
`;

/** Webview script: filter state, live filtering, counts and menu behavior. Loaded after the core script. */
const STATUS_JS = String.raw`
let stOn=new Set(STATUS_KEYS);
function stKeep(rs){if(stOn.size===STATUS_KEYS.length)return rs;const now=Date.now();
return rs.filter(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).some(k=>stOn.has(k)));}
function stNote(n,has){return n>0?(has?' · ':'')+n+' hidden by status filter <button type="button" class="lnk sfre">Reset</button>':'';}
function stSave(){vs.postMessage({type:'status',checked:Array.from(stOn)});}
function stReset(){stOn=new Set(STATUS_KEYS);stSave();rerender();}
function stLoad(a){if(Array.isArray(a))stOn=new Set(a.filter(k=>STATUS_KEYS.includes(k)));}
document.addEventListener('click',e=>{if(e.target.classList.contains('sfre'))stReset();});
`;

export const STATUS = STATUS_SRC + STATUS_JS;
