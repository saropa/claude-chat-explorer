/** The one results summary line under the search inputs, like VS Code Search: "x results in y chats - Open in editor". */
export const SUM_HTML = `<div id="sum" role="status" aria-live="polite" hidden></div>`;

export const SUM_CSS = String.raw`
#sum{margin:6px 0 0;color:var(--vscode-descriptionForeground)}
#sum[hidden]{display:none}
#sum a{color:var(--vscode-textLink-foreground);text-decoration:none}
#sum a:hover{color:var(--vscode-textLink-activeForeground,var(--vscode-textLink-foreground));text-decoration:underline}
#sum a:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
.fp,.fi,.gp.cm,.gp2{font-size:var(--vscode-editor-font-size)}
`;

/** Webview script: builds the line from the totals and posts the open-in-editor request. Loaded after the core script. */
export const SUM_JS = String.raw`
const sumEl=$('sum');
function plu(n,w){return nf(n)+' '+w+(n===1?'':'s');}
function sumCounts(){const rs=lastRs;
const hits=tot?tot.totalHits:rs.reduce((a,r)=>a+(r.hits||0),0),chats=tot?tot.totalChats:rs.length;
const x=tot&&tot.hitsCapped?nf(1000000)+'+ results':plu(hits,'result');
return x+' in '+plu(chats,'chat');}
function fromNow(){const m=/(?:^|\s)from:(you|claude|both)(?=\s|$)/i.exec(q.value);return m?m[1].toLowerCase():frm.value;}
function fromNote(){const f=fromNow();return f==='you'?' · from you only':f==='claude'?' · from Claude only':'';}
function sumPlain(){const on=!hasResults&&sessOn&&sess&&sessN>0&&!busy&&err.style.display!=='block';sumEl.hidden=!on;sumEl.textContent=on?plu(sessN,'chat'):'';}
function sumSync(){const has=!!q.value.trim()&&!!lastQ;
if(!has||err.style.display==='block'){sumPlain();return;}
if(busy){sumEl.hidden=!lastMsg;sumEl.textContent=lastMsg;return;}
if(!hasResults){sumPlain();return;}
sumEl.hidden=false;sumEl.innerHTML=esc(sumCounts())+fromNote()+' - <a id="oie" role="button" tabindex="0" title="Show every match in a read-only editor tab">Open in editor</a>';}
function openEd(){recordHist(true);vs.postMessage(Object.assign({type:'openEditor',statuses:Array.from(stOn)},cur()));}
sumEl.addEventListener('click',e=>{if(e.target.closest('#oie')){e.preventDefault();openEd();}});
q.addEventListener('input',sumSync);
`;
