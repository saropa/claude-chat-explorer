/** Collapsible Account & Usage section at the top of the sidebar. Closed by default; the numbers are fetched when it is opened. */
export const ACCT_HTML = `<details id="acct"><summary>Account &amp; Usage</summary><div id="acb" role="status" aria-live="polite"></div></details>`;

export const ACCT_CSS = String.raw`
#acct{margin:4px 0 6px}
#acct summary{cursor:pointer;color:var(--vscode-descriptionForeground)}
#acct summary:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
#acb{padding:2px 0 0 14px}
#acb .ah{margin-top:4px;color:var(--vscode-descriptionForeground)}
#acb .ar{display:flex;justify-content:space-between;gap:8px}
#acb .ar span:last-child{font-variant-numeric:tabular-nums;text-align:right}
`;

/** Webview script: shows the account and the 5-hour and 7-day token totals. Loaded after the core script. */
export const ACCT_JS = String.raw`
const acctEl=$('acct'),acb=$('acb');
function acRow(k,v){return '<div class="ar"><span>'+esc(k)+'</span><span>'+esc(v)+'</span></div>';}
function acTok(t){return nf(t.io)+' tokens'+(t.cache?' (+'+nf(t.cache)+' cache)':'');}
function acctShow(d){
if(d.failed){acb.textContent='Could not read usage';return;}
const a=d.account;
acb.innerHTML=(a?acRow('Email',a.email)+(a.name?acRow('Name',a.name):'')+(a.org?acRow('Organization',a.org):'')+(a.plan?acRow('Plan',a.plan):''):'<div>Not signed in</div>')
+'<div class="ah">Tokens used (input + output)</div>'+acRow('Last 5 hours',acTok(d.usage.h5))+acRow('Last 7 days',acTok(d.usage.d7));}
acctEl.addEventListener('toggle',()=>{if(acctEl.open){acb.textContent='Loading...';vs.postMessage({type:'acctLoad'});}});
window.addEventListener('message',e=>{if(e.data&&e.data.type==='acct')acctShow(e.data);});
`;
