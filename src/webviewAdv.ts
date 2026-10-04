/** Search details: an ellipsis toggle under the search box that shows the When and Messages rows. */
export const ADV_HTML = `<div class="advr"><button type="button" class="opt" id="advb" title="Toggle search details" aria-label="Toggle search details" aria-expanded="false" aria-controls="adv"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="3.500" cy="8" r="1.200" fill="currentColor"/><circle cx="8" cy="8" r="1.200" fill="currentColor"/><circle cx="12.500" cy="8" r="1.200" fill="currentColor"/></svg><span class="advn" id="advn" hidden></span></button></div>
<div id="adv" hidden>
<label class="ar2" for="when"><span class="lb2">chats active during</span><select id="when" aria-label="chats active during"><option value="any">any time</option><option value="1h">last hour</option><option value="2h">last 2 hours</option><option value="4h">last 4 hours</option><option value="8h">last 8 hours</option><option value="today">today</option><option value="week">this week</option><option value="month">this month</option></select></label>
<label class="ar2" for="msgs"><span class="lb2">messages to search</span><select id="msgs" aria-label="messages to search"><option value="0">all messages</option><option value="10">last 10</option><option value="25">last 25</option><option value="50">last 50</option><option value="100">last 100</option></select></label>
</div>`;

export const ADV_CSS = String.raw`
.advr{display:flex;justify-content:flex-end;height:18px;margin-top:1px}
#advb{width:auto;min-width:22px;height:16px;padding:0 3px;gap:3px}
#advb.on{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent)}
.advn{min-width:12px;box-sizing:border-box;padding:0 3px;border-radius:7px;font-size:10px;line-height:12px;text-align:center;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.advn[hidden]{display:none}
#adv{margin-top:2px}
#adv[hidden]{display:none}
.ar2{display:block;margin:0 0 4px}
.lb2{display:block;margin-bottom:1px;font-size:0.85em;color:var(--vscode-descriptionForeground)}
#adv select{display:block;width:100%;min-width:0;box-sizing:border-box;padding:1px 3px;color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border);font-family:inherit;font-size:inherit;outline:none;text-overflow:ellipsis}
#adv select:focus{border-color:var(--vscode-focusBorder)}
#adv select option{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-listBackground,var(--vscode-dropdown-background))}
`;

export const ADV_JS = String.raw`
const advb=$('advb'),adv=$('adv'),advn=$('advn');
function advSync(){const n=(when.value!=='any'?1:0)+(msgSel.value!=='0'?1:0),o=!adv.hidden;
advb.setAttribute('aria-expanded',o?'true':'false');advb.classList.toggle('on',o);
advn.hidden=o||!n;advn.textContent=n;
advb.title=!o&&n?'Toggle search details. When and Messages filters are active':'Toggle search details';
advn.title='When and Messages filters are active';}
function setOpts(w,l){when.value=w||'any';if(when.value!==(w||'any'))when.value='any';msgSel.value=String(l||0);if(msgSel.value!==String(l||0))msgSel.value='0';advSync();}
function advSet(o,save){adv.hidden=!o;advSync();if(save)vs.postMessage({type:'advOpen',open:o});}
advb.addEventListener('click',()=>advSet(adv.hidden,true));
when.addEventListener('change',advSync);msgSel.addEventListener('change',advSync);
advSync();
`;
