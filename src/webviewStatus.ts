import { STATUS_SRC } from './status';

/** Status filter state for the sidebar script. The picker lives in the view title bar (see headerCommands); the host posts setStatuses. */
export const STATUS_CSS = String.raw`
.lnk{padding:0;border:none;background:transparent;color:var(--vscode-textLink-foreground);cursor:pointer;font-family:inherit;font-size:inherit}
.lnk:hover{text-decoration:underline}
#frow{position:relative;display:flex;align-items:center;gap:6px;padding:4px 8px;flex-wrap:wrap}
.fb,.fa{display:inline-flex;align-items:center;gap:4px;height:22px;box-sizing:border-box;padding:0 6px;cursor:pointer;color:var(--vscode-foreground);background:transparent;border:1px solid var(--vscode-widget-border,var(--vscode-input-border,transparent));border-radius:11px}
.fb:hover,.fa:hover{background:var(--vscode-toolbar-hoverBackground)}
.fb:focus-visible,.fa:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.fb svg,.fa svg{width:14px;height:14px;flex:none}
.fb.on,.fa.on{background:var(--vscode-inputOption-activeBackground,var(--vscode-toolbar-hoverBackground));border-color:var(--vscode-inputOption-activeBorder,var(--vscode-focusBorder))}
.fbn{min-width:14px;box-sizing:border-box;padding:0 4px;border-radius:7px;line-height:14px;text-align:center;font-size:calc(var(--vscode-font-size) - 2px);background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.fbn[hidden]{display:none}
.fas{display:inline-flex;align-items:center;gap:3px;color:var(--vscode-descriptionForeground)}
.fm{position:absolute;z-index:20;left:8px;top:100%;min-width:200px;max-width:calc(100% - 16px);padding:4px 0;background:var(--vscode-menu-background,var(--vscode-dropdown-background));color:var(--vscode-menu-foreground,var(--vscode-foreground));border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,transparent));border-radius:4px;box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
.fm[hidden]{display:none}
.fh{padding:4px 12px 2px;font-size:calc(var(--vscode-font-size) - 2px);color:var(--vscode-descriptionForeground)}
.fi2{display:flex;align-items:center;gap:6px;padding:3px 12px;cursor:pointer;white-space:nowrap}
.fi2:hover,.fi2:focus-visible{background:var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground));color:var(--vscode-menu-selectionForeground,inherit);outline:none}
.fck{width:14px;flex:none;text-align:center;visibility:hidden}
.fi2.on .fck{visibility:visible}
.fsep{height:0;margin:4px 0;border-top:1px solid var(--vscode-menu-separatorBackground,var(--vscode-widget-border,transparent))}
`;

/** Webview script: filter state, live filtering, counts and menu behavior. Loaded after the core script. */
const STATUS_JS = String.raw`
let stOn=new Set(STATUS_KEYS);
function stKeep(rs){if(stOn.size===STATUS_KEYS.length)return rs;const now=Date.now();
return rs.filter(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).some(k=>stOn.has(k)));}
function stNote(n,has){return n>0?(has?' · ':'')+n+' hidden by status filter <button type="button" class="lnk sfre" data-tip="Show sessions of every status again">Reset</button>':'';}
function stSave(){vs.postMessage({type:'status',checked:Array.from(stOn)});}
function stReset(){stOn=new Set(STATUS_KEYS);stSave();rerender();}
function stLoad(a){if(Array.isArray(a))stOn=new Set(a.filter(k=>STATUS_KEYS.includes(k)));}
document.addEventListener('click',e=>{if(e.target.classList.contains('sfre'))stReset();});
const frow=$('frow');let fbOpen=false,fbCnt={},fbAct=0;
const FUNNEL='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M2 3h12l-4.500 5.500V13l-3-1.500V8.500z"/></svg>';
const CHEVD='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
const BOLT='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M9 1.500L3.500 9H8l-1 5.500L12.500 7H8z"/></svg>';
function fbFiltered(){return stOn.size<STATUS_KEYS.length;}
function fbOnlyActive(){return stOn.size===1&&stOn.has('active');}
function fbHtml(){const n=fbFiltered()?stOn.size:0,now=fbOpen;
let m='<div class="fh">Status</div>'+STATUS_KEYS.map(k=>'<div class="fi2'+(stOn.has(k)?' on':'')+'" role="menuitemcheckbox" aria-checked="'+stOn.has(k)+'" tabindex="0" data-fs="'+k+'" data-tip="'+esc(STATUS_TIPS[k]||'')+'"><span class="fck">✓</span><span>'+esc(STATUS_LABELS[k])+' · '+(fbCnt[k]||0)+'</span></div>').join('');
if(n)m+='<div class="fsep" role="separator"></div><div class="fi2" role="menuitem" tabindex="0" data-fs="*">Show all statuses</div>';
return '<button type="button" class="fb'+(n?' on':'')+'" data-fa="menu" aria-haspopup="menu" aria-expanded="'+now+'" aria-label="Filter sessions'+(n?', '+n+' active':'')+'" data-tip="Filter sessions by status">'+FUNNEL+'<span class="fbn"'+(n?'':' hidden')+'>'+n+'</span>'+CHEVD+'</button>'
+'<button type="button" class="fa'+(fbOnlyActive()?' on':'')+'" data-fa="active" aria-pressed="'+fbOnlyActive()+'" aria-label="Active sessions only, '+fbAct+'" data-tip="'+esc(STATUS_TIPS.active)+'">'+BOLT+'Active<span class="fas"><span class="dot running" aria-hidden="true"></span>'+fbAct+'</span></button>'
+'<div class="fm" role="menu" aria-label="Filter sessions"'+(fbOpen?'':' hidden')+'>'+m+'</div>';}
function fbSync(base){const now=Date.now();fbCnt={};fbAct=0;
(base||[]).forEach(r=>statusesOf(r,pins.has(r.id),now,(dots[r.id]||{}).s).forEach(k=>{fbCnt[k]=(fbCnt[k]||0)+1;}));fbAct=fbCnt.active||0;
frow.innerHTML=fbHtml();}
function fbClose(){if(!fbOpen)return;fbOpen=false;rerender();}
function fbChange(){stSave();rerender();}
frow.addEventListener('click',e=>{const b=e.target.closest('[data-fa]'),i=e.target.closest('[data-fs]');
if(b&&b.dataset.fa==='menu'){fbOpen=!fbOpen;rerender();return;}
if(b&&b.dataset.fa==='active'){stOn=fbOnlyActive()?new Set(STATUS_KEYS):new Set(['active']);fbChange();return;}
if(i){const k=i.dataset.fs;if(k==='*')stOn=new Set(STATUS_KEYS);else if(stOn.has(k))stOn.delete(k);else stOn.add(k);fbChange();}});
frow.addEventListener('keydown',e=>{const i=e.target.closest&&e.target.closest('[data-fs]');if(i&&(e.key==='Enter'||e.key===' ')){e.preventDefault();i.click();}});
document.addEventListener('click',e=>{if(fbOpen&&!(e.target.closest&&e.target.closest('#frow')))fbClose();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fbOpen)fbClose();});
`;

export const STATUS = STATUS_SRC + STATUS_JS;
