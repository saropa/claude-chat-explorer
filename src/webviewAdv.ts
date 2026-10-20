/** Search details: an ellipsis toggle under the search box that shows the When, Messages and scope rows (label left, control right). Sort and status live in the header icons. */
export const ADV_HTML = `<div class="advr"><button type="button" class="opt" id="advb" title="Toggle search details" aria-label="Toggle search details" aria-expanded="false" aria-controls="adv"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="3.500" cy="8" r="1.200" fill="currentColor"/><circle cx="8" cy="8" r="1.200" fill="currentColor"/><circle cx="12.500" cy="8" r="1.200" fill="currentColor"/></svg><span class="advn" id="advn" hidden></span></button></div>
<div id="adv" hidden>
<label class="ar2" for="when" title="Only search chats that had activity in this time range"><span class="lb2">chats active during</span><select id="when" aria-label="chats active during" title="Only search chats that had activity in this time range"><option value="any">any time</option><option value="1h">last hour</option><option value="2h">last 2 hours</option><option value="4h">last 4 hours</option><option value="8h">last 8 hours</option><option value="today">today</option><option value="week" title="The last 7 days, counted back from now">this week</option><option value="workweek" title="Since Monday 00:00 of the current week">Work week (Mon-Sun)</option><option value="month">this month</option></select></label>
<label class="ar2" for="msgs" title="Limit the search to the most recent messages of each chat"><span class="lb2">messages to search</span><select id="msgs" aria-label="messages to search" title="Limit the search to the most recent messages of each chat"><option value="0">all messages</option><option value="10">last 10</option><option value="25">last 25</option><option value="50">last 50</option><option value="100">last 100</option></select></label>
<label class="ar2" for="frm" title="Match only your messages, only the agent's, or both"><span class="lb2">messages from</span><select id="frm" aria-label="messages from" title="Match only your messages, only the agent's, or both"><option value="both">both</option><option value="you">you</option><option value="agent">agent</option></select></label>
<div class="ar2" role="group" aria-labelledby="lbsc" title="Which chats the search covers"><span class="lb2" id="lbsc">search scope</span><div class="scr"><label class="al" title="Subs: include subagent chats in search results"><input type="checkbox" id="subs" checked> Subs</label><label class="al" title="Archive: also search archived chats (off: archived chats are not matched)"><input type="checkbox" id="arc"> Archive</label><label class="al" title="External: search every project, not only this workspace"><input type="checkbox" id="all"> External</label></div></div>
</div>`;

export const ADV_CSS = String.raw`
.advr{display:flex;justify-content:flex-end;height:20px;margin-top:4px}
#advb{width:auto;min-width:22px;height:18px;padding:0 3px;gap:3px}
#advb.on{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent)}
.advn{min-width:12px;box-sizing:border-box;padding:0 3px;border-radius:7px;line-height:14px;text-align:center;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.advn[hidden]{display:none}
#adv{padding-bottom:6px}
#adv[hidden]{display:none}
.ar2{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);align-items:center;gap:0 8px;margin:0;padding:6px 0 0}
#adv .ar2:first-child{padding-top:2px}
.lb2{display:block;margin:0;line-height:16px;color:var(--vscode-descriptionForeground)}
#adv select{display:block;width:100%;min-width:0;height:26px;box-sizing:border-box;padding:0 4px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);border-radius:2px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);outline:none;text-overflow:ellipsis}
.scr{display:flex;flex-wrap:wrap;align-items:center;gap:0 12px;min-width:0}
.al{display:inline-flex;align-items:center;gap:4px;min-height:24px;cursor:pointer}
.al input{margin:0;width:13px;height:13px}
#adv select:focus{border-color:var(--vscode-focusBorder);outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#adv select option{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-listBackground,var(--vscode-dropdown-background))}
@media (max-width:219px){.ar2{grid-template-columns:minmax(0,1fr);gap:2px 0}}
`;

export const ADV_JS = String.raw`
const advb=$('advb'),adv=$('adv'),advn=$('advn');
function selTxt(el){return el.options[el.selectedIndex].text.toLowerCase();}
function advList(){const l=[];if(when.value!=='any')l.push('chats active '+selTxt(when));if(msgSel.value!=='0')l.push('messages '+selTxt(msgSel));if(frm.value!=='both')l.push('messages from '+selTxt(frm));
if(!subs.checked)l.push('subs off');if(arc.checked)l.push('archive on');if(all.checked)l.push('external');return l;}
function advSync(){const l=advList(),n=l.length,o=!adv.hidden,t='Hidden settings changed: '+l.join(', ');
advb.setAttribute('aria-expanded',o?'true':'false');advb.classList.toggle('on',o);
advn.hidden=o||!n;advn.textContent=n;
advb.title=!o&&n?'Toggle search details. '+t:'Toggle search details';advn.title=t;}
function setOpts(w,l,f){when.value=w||'any';if(when.value!==(w||'any'))when.value='any';msgSel.value=String(l||0);if(msgSel.value!==String(l||0))msgSel.value='0';f=f==='claude'?'agent':f;frm.value=f||'both';if(frm.value!==(f||'both'))frm.value='both';advSync();}
function advSet(o,save){adv.hidden=!o;advSync();if(save)vs.postMessage({type:'advOpen',open:o});}
advb.addEventListener('click',()=>advSet(adv.hidden,true));
[when,msgSel,frm,all,subs,arc].forEach(e=>e.addEventListener('change',advSync));
advSync();
`;
