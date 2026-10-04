/** Webview script part: the Archived section (rows built only when expanded) and the archive action. Shares top-level scope with webviewJs. */
export const ARCH_CSS = String.raw`
.arh .imp{margin-left:auto;padding:0 4px;font-size:11px;font-weight:400;letter-spacing:0;text-transform:none}
.arh .imp+.pill{margin-left:6px}
.ic.ar.on{color:var(--vscode-foreground)}
.ic.ar svg{width:13px;height:13px}
`;

export const ARCH_JS = String.raw`
const archEl=$('arch');
const ARCH_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M2 3h12v3H2zM3 6v7h10V6M6.500 9h3"/></svg>';
function archData(){
if(hasResults){const a=lastRs.filter(r=>arch.has(r.id));return{rows:a,n:a.length};}
if(sessOn&&sess&&!lastQ)return{rows:sess.arch||[],n:sess.archTotal||0};
return{rows:[],n:0};}
function archHtml(){const d=archData();if(!d.n)return '';const o=archOpen;
let h='<div class="sl arh'+(o?' open':'')+'" data-sec="sec:arch" role="button" tabindex="0" aria-expanded="'+o+'">'+CHEV+'<span class="sn">Archived</span>'
+'<button type="button" class="lnk imp" data-a="import" data-tip="Import the archived chats list from Claude Code (read-only, once)" aria-label="Import archived chats from Claude Code">Import</button>'
+'<span class="pill" role="img" aria-label="'+chatsN(d.n)+'" data-tip="'+d.n+(lastQ?' archived chats match':' archived chats')+'">'+d.n+'</span></div>';
if(o)h+=capArch();
if(o)h+=ordered(stKeep(d.rows),lastQ?undefined:(sort.value==='score'?'time':sort.value)).map(rowHtml).join('');
return h;}
function renderArch(){patch(archEl,archHtml());}
function archToggle(id){const on=!arch.has(id);if(on)arch.add(id);else arch.delete(id);
if(sess){const from=on?sess.rows:sess.arch,to=on?sess.arch:sess.rows,i=(from||[]).findIndex(r=>r.id===id);
if(i>=0){to.push(from.splice(i,1)[0]);sess.total+=on?-1:1;sess.archTotal+=on?1:-1;}}
vs.postMessage({type:'archive',id:id,on:on});rerender();}
archEl.addEventListener('click',onClick);
`;
