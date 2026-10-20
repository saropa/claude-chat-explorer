/** Local | Web toggle and the Web (cloud) session list. The toggle exists only when the setting is on; the Web list is fetched only when the tab is opened. */
export const WEB_HTML = `<div id="wtog" role="tablist" aria-label="Session source" hidden><button id="wloc" role="tab" aria-selected="true">Local</button><button id="wweb" role="tab" aria-selected="false" title="Web (cloud) sessions: unofficial, read-only">Web</button></div>`;
export const WEB_BODY = `<div id="web" hidden><div id="wnote" role="status"></div><div id="wlist"></div></div>`;

export const WEB_CSS = String.raw`
#wtog{display:flex;gap:2px;margin:4px 0 6px}
#wtog[hidden],#web[hidden]{display:none}
#wtog button{border:none;background:transparent;color:var(--vscode-descriptionForeground);font:inherit;padding:2px 10px;border-radius:9px;cursor:pointer}
#wtog button[aria-selected=true]{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
#wtog button:focus-visible,.wr:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
html.webmode #hdr .top>:not(#wtog),html.webmode #frow,html.webmode #res{display:none}
#web{flex:1 1 auto;min-height:80px;overflow-y:auto}
#wnote{padding:6px 10px;color:var(--vscode-descriptionForeground)}
#wnote:empty{display:none}
.wr{display:flex;align-items:baseline;gap:8px;padding:4px 10px;cursor:pointer}
.wr:hover{background:var(--vscode-list-hoverBackground)}
.wr .wt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wr .wa{flex:none;color:var(--vscode-descriptionForeground)}
`;

export const WEB_JS = String.raw`
const wtog=$('wtog'),wloc=$('wloc'),wweb=$('wweb'),webEl=$('web'),wnote=$('wnote'),wlist=$('wlist');
function webMode(on){document.documentElement.classList.toggle('webmode',on);webEl.hidden=!on;wloc.setAttribute('aria-selected',on?'false':'true');wweb.setAttribute('aria-selected',on?'true':'false');
if(on){wnote.textContent='Loading web sessions...';wlist.textContent='';vs.postMessage({type:'webLoad'});}}
wloc.addEventListener('click',()=>webMode(false));
wweb.addEventListener('click',()=>webMode(true));
wlist.addEventListener('click',e=>{const r=e.target.closest('.wr');if(r)vs.postMessage({type:'webOpen',id:r.dataset.id});});
wlist.addEventListener('keydown',e=>{const r=e.target.closest('.wr');if(r&&(e.key==='Enter'||e.key===' ')){e.preventDefault();vs.postMessage({type:'webOpen',id:r.dataset.id});}});
window.addEventListener('message',e=>{const d=e.data;
if(d.type==='webEnabled'){wtog.hidden=!d.on;if(!d.on)webMode(false);}
else if(d.type==='webList'){const rows=d.rows||[];wnote.textContent=d.notice||(rows.length?'':'No web sessions found');
wlist.innerHTML=rows.map(r=>'<div class="wr" role="button" tabindex="0" data-id="'+esc(r.id)+'" title="'+esc(r.title)+'"><span class="wt">'+esc(r.title)+'</span><span class="wa">'+(r.updated?esc(shortAgo(r.updated,Date.now())):'')+'</span></div>').join('');}});
`;
