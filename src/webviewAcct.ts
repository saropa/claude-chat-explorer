/** Collapsible Account & Usage section at the top of the sidebar. Closed by default; the numbers are fetched when it is opened. */
export const ACCT_HTML = `<details id="acct"><summary title="Your account and the tokens you used, read from local files only">Account &amp; Usage</summary><div id="acb" role="status" aria-live="polite"></div></details>`;

export const ACCT_CSS = String.raw`
#acct{margin:4px 0 6px}
#acct summary{cursor:pointer;color:var(--vscode-descriptionForeground)}
#acct summary:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
#acb{padding:4px 0 2px 14px}
#acb .ag{margin-top:10px}
#acb .ag:first-child{margin-top:2px}
#acb details.aw{margin-top:8px}
#acb details.aw summary{cursor:pointer;list-style:none;position:relative;padding-left:12px;display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;padding-top:2px;padding-bottom:2px;color:var(--vscode-descriptionForeground)}
#acb details.aw summary::-webkit-details-marker{display:none}
#acb details.aw summary::before{content:'\25B8';position:absolute;left:0;top:2px}
#acb details.aw[open]>summary::before{content:'\25BE'}
#acb details.aw summary span:first-child{white-space:nowrap}
#acb details.aw summary span:last-child{text-align:right;font-variant-numeric:tabular-nums;color:var(--vscode-foreground);font-weight:600;min-width:0;overflow-wrap:anywhere}
#acb details.aw summary:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
#acb details.aw .ar:last-child{margin-bottom:2px}
#acb .ah{margin-bottom:2px;color:var(--vscode-descriptionForeground)}
#acb .mt{margin-top:6px}
#acb .rg{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px}
#acb .ar{display:grid;grid-column:1/-1;grid-template-columns:subgrid;padding:2px 0;align-items:baseline}
#acb .ar span:first-child{white-space:nowrap;max-width:14em;overflow:hidden;text-overflow:ellipsis}
#acb .ar span:last-child{font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere;min-width:0}
#acb .ar.t{border-top:1px solid var(--vscode-panel-border,var(--vscode-widget-border,transparent));margin-top:2px;padding-top:4px;font-weight:600}
#acb .sk{display:block;height:10px;margin:7px 0;border-radius:3px;background:linear-gradient(90deg,var(--vscode-editorWidget-background,rgba(128,128,128,.15)) 25%,var(--vscode-list-hoverBackground,rgba(128,128,128,.3)) 50%,var(--vscode-editorWidget-background,rgba(128,128,128,.15)) 75%);background-size:200% 100%;animation:acsh 1.4s linear infinite}
#acb .w80{width:80%}#acb .w60{width:60%}#acb .w70{width:70%}#acb .w50{width:50%}
@keyframes acsh{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){#acb .sk{animation:none}}
#acb.stale{opacity:.6}
`;

/** Webview script: shows the account and the 5-hour and 7-day token totals. Loaded after the core script. */
export const ACCT_JS = String.raw`
const acctEl=$('acct'),acb=$('acb');
const AC_TIPS={Email:'Email of the signed-in account',Name:'Display name of the account',Organization:'Organization of the account',Plan:'Plan or seat tier of the account',Input:'Input: prompt tokens sent to the model',Output:'Output: tokens the model generated','Cache write':'Cache write: tokens written to the prompt cache','Cache read':'Cache read: tokens served from the prompt cache','Total':'Total: input + output tokens (cache tokens not included)'};
function acRow(k,v,o){o=o||{};const t=esc(v),lt=esc(o.lt||AC_TIPS[k]||k),vt=esc(o.vt||v);return '<div class="ar'+(o.c?' '+o.c:'')+'"><span title="'+lt+'">'+esc(k)+'</span><span title="'+vt+'">'+t+'</span></div>';}
const AC_WINS=[['h5','Last 5 hours','Tokens used in the rolling last 5 hours'],['today','Today','Tokens used since local midnight'],['yest','Yesterday','Tokens used yesterday: the previous local calendar day, midnight to midnight'],['d3','Last 3 days','Tokens used in the rolling last 3 days'],['d5','Last 5 days','Tokens used in the rolling last 5 days'],['d7','Last 7 days','Tokens used in the rolling last 7 days']];
let acHas=false;
const acOpen=new Set(['h5','today']);
function acWin(k,h,tip,t){return '<details class="aw" data-w="'+k+'"'+(acOpen.has(k)?' open':'')+'><summary title="'+esc(tip+' (click to show or hide the breakdown)')+'"><span>'+esc(h)+'</span><span title="'+esc('Total: input + output tokens. '+tip)+'">'+esc(nf(t.io))+'</span></summary>'+'<div class="rg">'+acRow('Input',nf(t.i))+acRow('Output',nf(t.o))+acRow('Cache write',nf(t.cw))+acRow('Cache read',nf(t.cr))+acRow('Total',nf(t.io),{c:'t'})+'</div></details>';}
function acSkel(){return ['w80','w60','w70','w50'].map(c=>'<div class="sk '+c+'" title="Loading usage"></div>').join('');}
function acctShow(d){
acb.classList.remove('stale');
if(d.failed){acb.innerHTML='<div title="The usage files could not be read; reopen the section to retry">Could not read usage</div>';acHas=true;return;}
const a=d.account,m=d.usage.models||[];
acHas=true;
acb.innerHTML='<div class="ag">'+(a?'<div class="rg">'+acRow('Email',a.email)+(a.name?acRow('Name',a.name):'')+(a.org?acRow('Organization',a.org):'')+(a.plan?acRow('Plan',a.plan):'')+'</div>':'<div title="No signed-in account found">Not signed in</div>')+'</div>'
+'<div class="ag"><div class="ah" title="Tokens per time window; the figure is input + output">Tokens used</div>'+AC_WINS.map(w=>acWin(w[0],w[1],w[2],d.usage[w[0]])).join('')+'</div>'
+(m.length?'<div class="ag"><div class="ah" title="Input + output tokens per model over the last 7 days (top 4)">By model (input + output)</div><div class="rg">'+m.map(x=>acRow(x.model,nf(x.io),{lt:x.id||x.model,vt:(x.id||x.model)+': '+nf(x.io)+' tokens'})).join('')+'</div></div>':'');}
acb.addEventListener('toggle',e=>{const w=e.target.dataset&&e.target.dataset.w;if(w){if(e.target.open)acOpen.add(w);else acOpen.delete(w);}},true);
acctEl.addEventListener('toggle',()=>{if(acctEl.open){if(acHas)acb.classList.add('stale');else acb.innerHTML=acSkel();vs.postMessage({type:'acctLoad'});}});
window.addEventListener('message',e=>{if(e.data&&e.data.type==='acct')acctShow(e.data);});
`;
