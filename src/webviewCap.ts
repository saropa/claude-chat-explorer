/** Webview part: the "result set only contains a subset" notice (results, All sessions, Archived). Shares top-level scope with webviewJs. */
export const CAP_CSS = String.raw`
#cap{position:sticky;top:0;z-index:2;background:var(--vscode-sideBar-background,var(--vscode-editor-background))}
#cap:empty{display:none}
.cn{padding:2px 10px 3px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-widget-border,transparent)}
.cn.in{border-bottom:none;padding-left:24px}
.cl{overflow-wrap:anywhere}
.cw{display:flex;align-items:flex-start;gap:4px;overflow-wrap:anywhere}
.cw svg{flex:none;width:14px;height:14px;margin-top:1px;color:var(--vscode-editorWarning-foreground)}
.cw span{min-width:0}
`;

export const CAP_JS = String.raw`
const WARN_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M8 2l6.500 11.500h-13zM8 6.500v3.200M8 11.600v.4"/></svg>';
const WARN_TXT='The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.';
let tot=null,capN=500;
function nf(n){return Number(n).toLocaleString();}
function capBox(line,cls){return '<div class="cn'+(cls||'')+'">'+(line?'<div class="cl">'+esc(line)+'</div>':'')+'<div class="cw">'+WARN_SVG+'<span>'+WARN_TXT+'</span></div></div>';}
function capSearch(){const m=tot.hitsCapped?nf(1000000)+'+':nf(tot.totalHits);
return 'Showing the top '+nf(tot.max)+' of '+nf(tot.totalChats)+' chats ('+m+(tot.totalHits===1&&!tot.hitsCapped?' match':' matches')+')';}
function capSess(){return sessOn&&!!sess&&!hasResults&&sess.total>sess.rows.length;}
function capShown(){return hasResults?!!(tot&&tot.capped):capSess();}
function capHtml(){if(hasResults)return tot&&tot.capped?capBox(capSearch()):'';
return capSess()?capBox('Showing the first '+nf(sess.rows.length)+' of '+nf(sess.total)+' sessions'):'';}
function capArch(){if(hasResults)return tot&&tot.capped?capBox('','in'):'';
const d=sess;return sessOn&&d&&!lastQ&&d.archTotal>(d.arch||[]).length?capBox('Showing the first '+nf(d.arch.length)+' of '+nf(d.archTotal)+' archived sessions','in'):'';}
`;
