/** Collapsible Account & Usage section at the top of the sidebar. Closed by default; the numbers are fetched when it is opened. */
/**
 * The settings gear and its popover. They sit beside the <details>, not inside its <summary> (a button inside a summary is invalid and its
 * click would also toggle the section), and are positioned over the summary's right end by ACCT_CSS. The setting is a real checkbox.
 */
const ACCT_SETTINGS = `<div class="pw"><button type="button" id="accts" title="Account &amp; Usage settings" aria-label="Account &amp; Usage settings" aria-haspopup="true" aria-expanded="false" aria-controls="acctm"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM6.9 1.5h2.2l.4 1.8 1.2.7 1.7-.6 1.1 1.9-1.3 1.2v1.4l1.3 1.2-1.1 1.9-1.7-.6-1.2.7-.4 1.8H6.9l-.4-1.8-1.2-.7-1.7.6-1.1-1.9 1.3-1.2V7.3L2.5 6.1l1.1-1.9 1.7.6 1.2-.7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg></button>
<div id="acctm" class="pop" role="group" aria-label="Account &amp; Usage settings" hidden><label class="acto" title="Do not show the email address in the Account block"><input type="checkbox" id="acthide"><span>Hide account email<span class="actd">Removes the email row; plan and usage stay</span></span></label>
<label class="acto" title="Hide personal details while sharing the screen"><input type="checkbox" id="actss"><span>Screen-share mode<span class="actd">Hides email, name and organization</span></span></label></div></div>`;

/** Section markup: the collapsible block plus the settings gear, in a wrapper that anchors the gear to the header's right end. */
export const ACCT_HTML = `<div id="acctw"><details id="acct"><summary title="Your account and the tokens you used, read from local files only"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Account &amp; Usage</summary><div id="acb" role="status" aria-live="polite"></div></details>${ACCT_SETTINGS}</div>`;

export const ACCT_CSS = String.raw`
/* The wrapper anchors the gear over the right end of the summary row; padding-right on the summary keeps its text clear of the gear. */
#acctw{position:relative}
#acctw>.pw{position:absolute;right:0;top:0}
#acct>summary{padding-right:28px}
#accts{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;margin:1px 6px 0 0;padding:0;border:none;border-radius:4px;background:transparent;cursor:pointer;color:var(--vscode-icon-foreground,var(--vscode-descriptionForeground))}
#accts:hover,#accts[aria-expanded=true]{background:var(--vscode-toolbar-hoverBackground)}
#accts:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#acct{margin:4px 0 1px} /* 1px, not 6: the idle status strip (#sb: progress bar + status line, about 5px) sits between this header and Session Manager, so the three headers end up evenly spaced */
#acct>summary{cursor:pointer;color:var(--vscode-descriptionForeground);list-style:none;display:flex;align-items:center;gap:4px;padding:2px 0}
#acct>summary::-webkit-details-marker{display:none}
#acct[open]>summary>.chev{transform:rotate(90deg)}
#acct summary:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
#acb{padding:4px 0 2px 14px}
/* Native-style layout: small uppercase headings, then label/value rows. */
#acb .ah{display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 2px;font-size:.85em;letter-spacing:.04em;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground)}
#acb .ah:first-child{margin-top:2px}
#acb .rg{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px}
#acb .ar{display:grid;grid-column:1/-1;grid-template-columns:subgrid;padding:2px 0;align-items:baseline}
#acb .ar span:first-child{white-space:nowrap;color:var(--vscode-descriptionForeground)}
#acb .ar span:last-child{font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere;min-width:0;font-weight:600}
/* Detail rows are indented sub-rows of the window above them and only render when View details is on. */
#acb .ar.sub span:first-child{padding-left:10px;font-size:.92em}
#acb .ar.sub span:last-child{font-weight:400}
/* View details toggle: a link-styled button, same placement as the native panel. */
#acb .vd{all:unset;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:400;color:var(--vscode-textLink-foreground)}
#acb .vd:hover{text-decoration:underline}
#acb .vd:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
#acb .sk{display:block;height:10px;margin:7px 0;border-radius:3px;background:linear-gradient(90deg,var(--vscode-editorWidget-background,rgba(128,128,128,.15)) 25%,var(--vscode-list-hoverBackground,rgba(128,128,128,.3)) 50%,var(--vscode-editorWidget-background,rgba(128,128,128,.15)) 75%);background-size:200% 100%;animation:acsh 1.4s linear infinite}
#acb .w80{width:80%}#acb .w60{width:60%}#acb .w70{width:70%}#acb .w50{width:50%}
@keyframes acsh{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){#acb .sk{animation:none}}
#acb.stale{opacity:.6}
`;

/** Webview script: Account and Usage headings with token rows; "View details" adds every window, the token split and the per-model split. Loaded after the core script. */
export const ACCT_JS = String.raw`
const acctEl=$('acct'),acb=$('acb');
/* Summary windows always show; the rest appear only with details on. */
const AC_WINS=[['h5','Last 5 hours',1],['today','Today',1],['yest','Yesterday',0],['d3','Last 3 days',0],['d5','Last 5 days',0],['d7','Last 7 days',1]];
let acHas=false,acData=null,acDetail=false,acHide=false,acSS=false; /* acHide: setting account.hideEmail; acSS: account.screenShare (implies acHide, also hides name and org). The host already strips these fields from the data; the flags are a second guard. */
function acRow(k,v,c,tip){return '<div class="ar'+(c?' '+c:'')+'"'+(tip?' title="'+esc(tip)+'"':'')+'><span>'+esc(k)+'</span><span>'+esc(v)+'</span></div>';}
/* One window: the total row, plus input/output/cache sub-rows when details are on. */
function acWin(w,t){let h=acRow(w[1],nf(t.io),'','Input + output tokens');
if(acDetail)h+=acRow('Input',nf(t.i),'sub')+acRow('Output',nf(t.o),'sub')+acRow('Cache write',nf(t.cw),'sub')+acRow('Cache read',nf(t.cr),'sub');return h;}
function acSkel(){return ['w80','w60','w70','w50'].map(c=>'<div class="sk '+c+'" title="Loading usage"></div>').join('');}
function acRender(){
const d=acData;if(!d)return;
acb.classList.remove('stale');
if(d.failed){acb.innerHTML='<div title="The usage files could not be read; reopen the section to retry">Could not read usage</div>';return;}
/* Hide-email: the Email row is left out entirely (not masked), so plan and the rest keep their place and nothing hints at the address. */
const a=d.account,m=d.usage.models||[];
/* Account block: email always; name, organization and plan are detail-only except plan, which is short. */
let h='<div class="ah">Account</div><div class="rg">'+(a?(acHide||acSS||!a.email?'':acRow('Email',a.email))+(a.plan?acRow('Plan',a.plan):'')+(acDetail&&!acSS&&a.name?acRow('Name',a.name):'')+(acDetail&&!acSS&&a.org?acRow('Organization',a.org):''):acRow('Email','Not signed in'))+'</div>';
h+='<div class="ah"><span>Usage (tokens)</span><button class="vd" type="button" aria-expanded="'+acDetail+'" title="Show or hide every window, the token split and the per-model split">'+(acDetail?'Hide details':'View details')+'</button></div><div class="rg">'+AC_WINS.filter(w=>acDetail||w[2]).map(w=>acWin(w,d.usage[w[0]])).join('')+'</div>';
/* Per-model split is detail-only; it covers the last 7 days. */
if(acDetail&&m.length)h+='<div class="ah">By model (7 days)</div><div class="rg">'+m.map(x=>acRow(x.model,nf(x.io),'',x.id||x.model)).join('')+'</div>';
acb.innerHTML=h;}
function acctShow(d){acData=d;acHas=true;acRender();}
/* Delegated click so the button survives each re-render. */
acb.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.vd')){acDetail=!acDetail;acRender();}});
acctEl.addEventListener('toggle',()=>{vs.postMessage({type:'secOpen',name:'acct',open:acctEl.open}); /* remembered between sessions */
if(acctEl.open){if(acHas)acb.classList.add('stale');else acb.innerHTML=acSkel();vs.postMessage({type:'acctLoad'});}});
window.addEventListener('message',e=>{if(e.data&&e.data.type==='acct')acctShow(e.data);});
/* Settings popover: makePop (POP_JS, which precedes this script in the page) supplies Escape / outside click / focus-out closing and returns focus to the gear on Escape. */
function acctMenu(){
const gear=$('accts'),hide=$('acthide'),ss=$('actss');
/* Without makePop (or the markup) the popover could never open: hide the gear so there is no dead button, and say why once. */
if(!gear||!hide||!ss||typeof makePop!=='function'){if(gear)gear.hidden=true;console.warn('Account settings unavailable: popover helper or controls missing');return;}
const pop=makePop([['accts','acctm']]);
gear.addEventListener('click',()=>pop.toggle('accts','acctm'));
/* Each checkbox flips at once (the visible outcome); the host's 'acctPrefs' answer puts it back if the write did not take effect. */
hide.addEventListener('change',()=>vs.postMessage({type:'acctSet',key:'hideEmail',value:!!hide.checked}));
ss.addEventListener('change',()=>vs.postMessage({type:'acctSet',key:'screenShare',value:!!ss.checked}));}
acctMenu();
/* The values in effect, sent on load, after every write and on any settings change: set the box and redraw the block if it is loaded. */
window.addEventListener('message',e=>{const d=e.data;if(!d||d.type!=='acctPrefs')return;acHide=d.hideEmail===true;acSS=d.screenShare===true;const h=$('acthide'),x=$('actss');if(h)h.checked=acHide;if(x)x.checked=acSS;if(acData)acRender();});
`;
