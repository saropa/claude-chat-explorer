import { SHARED_SRC } from './group';
import { POP_JS, TIP_ENGINE_JS } from './webviewPop';
import { OW_GIT_JS } from './openWorkGitJs';
import { OW_PR_JS } from './openWorkPrJs';
import { WORK_MODEL_SRC } from './workModel';

/** Page script of Open Work. Own scope: it reads only the ids of its own page, and no sidebar global. */
const CORE = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const WIDE_PX=760,THROTTLE_MS=250,WATCHDOG_MS=20000;
const GROUPS=[['attention','By attention'],['chat','By chat'],['repo','By repository']];
let rows=[],dots={},days=14,group='attention',hidden=[],open=new Set(),hv={},pend=new Set(),loaded=false,failed='',indexing=false,scan=0,lastAt=0,askedAt=0,watch=0,rtimer=0,lastRender=0,focusId='';
const DONE_TIP='Hide this row until its git or chat state changes';
const body=$('body'),grm=$('grm');
const pop=makePop([['grb','grm']]);
const tipper=makeTip({bounds:()=>{const w=document.documentElement.clientWidth||window.innerWidth||400;return{left:0,right:w,width:w};},html:el=>tipPlain(el.dataset.tip||'')});
grm.innerHTML='<div class="pt">Group chats by</div>'+GROUPS.map(g=>'<label class="pi"><input type="radio" name="grp" value="'+g[0]+'"><span>'+g[1]+'</span></label>').join('');
function groupLabel(){return GROUPS.find(g=>g[0]===group)[1];}
function groupUi(){grm.querySelectorAll('input').forEach(i=>{i.checked=i.value===group;});const t='Group chats by: '+groupLabel();$('grt').textContent=groupLabel();$('grb').setAttribute('aria-label',t);}
function savePrefs(){vs.postMessage({type:'prefs',group:group,hidden:hidden.slice(),wsOnly:wsOnly});}
function dotOf(id){return dots[id]?dots[id].s:'idle';}
function ctxClass(r){return r.ctx?'l'+ctxLevel(r.ctx.pct):'l0';}
function btn(a,label,txt,tip){return '<button type="button" class="ab" data-a="'+a+'" aria-label="'+esc(label)+'" data-tip="'+esc(tip||label)+'">'+txt+'</button>';}
function rowHtml(r,tab){const wt=r.kind==='wt',d=wt?null:dots[r.id],s=wt?'idle':dotOf(r.id),words=dotText(d||{s:'idle'}),age=wt?'':shortAgo(r.last,Date.now()),isOpen=open.has(r.id),t=r.title||(wt?'Worktree':'Untitled chat');
const c=cellsOf(r),pc=prCells(r),g=viewOf(r),w=wt?r.w:wtOf(r),ready=!!(g&&g.ready),locked=!!(w&&w.locked&&!w.main);
const stTxt=s==='waiting'?'Waiting for you':s==='unread'?'Unread':s==='running'?'Running':ready?(w&&w.missing?'Folder missing':'Ready to remove'):locked?'Locked':'';
const label=t+', '+(r.project||'no folder')+(wt?', worktree':'')+(stTxt?', '+stTxt:'')+(age?', active '+age+(age==='now'?'':' ago'):'')+(r.pinned?', pinned':'')+(c.busy?', reading git':'')+(pc.busy?', checking pull requests':'');
const hvT=hv[r.id]==='busy'?'Copying...':hv[r.id]==='done'?'Copied':'Copy note';
const dot=wt?'<span class="dot none" aria-hidden="true"></span>':d?'<span class="dot '+esc(s)+'" role="img" aria-label="'+esc(words)+'"></span>':'<span class="dot none" aria-hidden="true"></span>';
const isDone=!wt&&donemap[r.id]!==undefined;
const acts=(wt?'':btn('open','Open chat: '+t,'Open','Open chat')+btn('handover','Copy hand-over note: '+t,esc(hvT),'Copy hand-over note')+btn('find','Find in the sidebar search: '+t,'Find','Find in the sidebar search')+btn('arch','Archive chat: '+t,'Archive','Archive chat')
+(isDone?btn('undone','Show again: '+t,'Undo done','Show this row again'):btn('done','Mark done: '+t,'Done',DONE_TIP)))
+prActs(r,t)
+(c.retry?'<button type="button" class="ab" data-a="fretry" data-k="'+esc(c.retry)+'" aria-label="'+esc('Retry reading git: '+t)+'" data-tip="'+esc(retryTip(gs[c.retry])||'Read git again')+'">Retry</button>':'')
+(pc.retry?'<button type="button" class="ab" data-a="fretry" data-k="'+esc(pc.retry)+'" aria-label="'+esc('Retry pull request lookup: '+t)+'" data-tip="Look up the pull request again">Retry</button>':'')
+(ready&&w&&!w.main?'<button type="button" class="ab" data-a="rm" data-k="'+esc(w.k)+'" aria-label="'+esc('Copy remove command: '+t)+'" data-tip="Copy a command that removes this finished worktree. Nothing is run.">Copy remove command</button>':'');
return '<div class="row" role="listitem" data-id="'+esc(r.id)+'" aria-busy="'+(c.busy||pc.busy?'true':'false')+'"><div class="main"><button type="button" class="rb" data-a="row" tabindex="'+(tab?0:-1)+'" aria-expanded="'+isOpen+'" aria-label="'+esc(label)+'">'+dot
+'<span class="t" data-tip="'+esc(t+(wt?'\nWorktree with no chat':'\n'+words))+'">'+(r.pinned?'<span class="pill">Pinned</span> ':'')+esc(t)+'</span>'
+'<span class="meta"><span class="pj">'+esc(r.project||'')+'</span><span class="br">'+c.br+'</span><span class="fl">'+c.fl+'</span><span class="ah">'+esc(c.ah)+'</span>'+(prsOn?'<span class="pr">'+pc.pr+'</span><span class="kc">'+pc.ck+'</span>':'')+'<span class="cx '+(wt?'l0':ctxClass(r))+'">'+(!wt&&r.ctx?r.ctx.pct+'% full':'')+'</span><span class="st">'+esc(stTxt)+'</span><span class="tm">'+esc(age)+'</span></span></button>'
+'<div class="acts">'+acts+'</div></div>'
+(isOpen?exHtml(r,words,g):'')+'</div>';}
function exHtml(r,words,g){const wt=r.kind==='wt',kv=wt?[['Worktree',esc(r.title||'')],['Repository',esc(r.project||'')]]:[['Chat',esc(r.title||'Untitled chat')],['Folder',esc(r.project||'')],['Last active',esc(new Date(r.last).toLocaleString())],['Context',r.ctx?esc(ctxStat(r.ctx)):''],['State',esc(words)]];
exGit(r).forEach(x=>kv.push(x));if(!wt)kv.push(['Next step',esc(nextStep(dotOf(r.id),g))]);
return '<div class="ex"><dl>'+kv.filter(x=>x[1]!=='').map(x=>'<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>').join('')+'</dl>'+exLists(r)+'</div>';}
function visibleRows(){return rows.filter(r=>!pend.has(r.id)).concat(wtRows()).filter(r=>wsOk(r)&&(showDone||!doneOf(r)));}
function doneCount(){return rows.filter(r=>!pend.has(r.id)&&wsOk(r)&&donemap[r.id]!==undefined&&doneOf(r)).length;}
function chips(vis){const by=bandRows(vis,dots,bandHeld);
$('cnt').innerHTML=['needs','finish','waiting','tidy'].map(b=>{const n=by[b].length,t=n+' '+BAND_CHIP[b],on=hidden.indexOf(b)<0;
return '<button type="button" class="chip" data-a="band" data-b="'+b+'" aria-pressed="'+on+'" aria-label="'+esc(t+(on?', shown':', hidden'))+'">'+esc(t)+'</button>';}).join('');
const idle=hidden.indexOf('idle')<0;$('idl').setAttribute('aria-pressed',String(idle));$('idl').textContent='Show idle ('+by.idle.length+')';
const dn=doneCount();$('dnb').setAttribute('aria-pressed',String(showDone));$('dnb').textContent='Show done ('+dn+')';$('dnb').hidden=!dn&&!showDone;
$('wsb').setAttribute('aria-pressed',String(wsOnly));$('wsb').hidden=!wsN;}
function bodyHtml(vis){
if(failed&&!loaded)return '<p class="msg err" role="alert">Could not load chats. <button type="button" class="ab" data-a="retry">Retry</button></p>';
if(!loaded)return '<p class="msg" role="status">Loading chats...</p>';
const err=failed?'<p class="msg err" role="alert">Could not load chats. <button type="button" class="ab" data-a="retry">Retry</button></p>':'';
if(!vis.length)return err+'<p class="msg">No chats in the last '+days+' days.</p>';
const gr=groupRows(vis,dots,group,hidden,bandHeld);
if(!gr.length)return err+'<p class="msg">Nothing to show with these filters. <button type="button" class="ab" data-a="idle">Show idle</button></p>';
let tabId=gr.some(g=>g.rows.some(r=>r.id===focusId))?focusId:gr[0].rows[0].id;
const th='<div class="th" aria-hidden="true"><div class="a"><span></span><span>Chat</span><span>Folder</span><span>Branch</span><span>Files</span><span>Ahead</span>'+(prsOn?'<span>PR</span><span>Checks</span>':'')+'<span>Context</span><span>State</span><span>Active</span></div><div class="b"></div></div>';
return err+th+gr.map(g=>'<section class="band" aria-label="'+esc(g.label)+'"><h2 class="bh" role="heading" aria-level="2">'+esc(g.label)+' <span class="pill">'+g.rows.length+'</span></h2><div role="list">'+g.rows.map(r=>rowHtml(r,r.id===tabId)).join('')+'</div></section>').join('');}
function layout(){const w=document.documentElement.clientWidth||window.innerWidth||400;$('wrap').classList.toggle('wide',w>=WIDE_PX);prsUi();}
function updText(){$('upd').textContent=lastAt?'Updated '+(Date.now()-lastAt<10000?'just now':Math.floor((Date.now()-lastAt)/1000)+' s ago'):'';}
function render(){lastRender=Date.now();
try{const ae=document.activeElement,had=ae&&ae.classList&&ae.classList.contains('rb');moving=false;const vis=visibleRows();layout();chips(vis);progUi();noteUi();
$('ixs').hidden=!indexing;body.setAttribute('aria-busy',String(!loaded&&!failed));groupUi();updText();
body.innerHTML=bodyHtml(vis);
if(had&&focusId){const b=document.querySelector('.row[data-id="'+focusId+'"] .rb');if(b)b.focus();}
if(moving&&!settleT)settle(HOLD_MS);}
catch(e){console.error('open work render: '+(e&&e.message?e.message:e));body.innerHTML='<p class="msg err">Could not show the chat list. Refresh to try again.</p>';}}
function sched(){if(rtimer)return;rtimer=setTimeout(()=>{rtimer=0;render();},Math.max(0,THROTTLE_MS-(Date.now()-lastRender)));}
function arm(){askedAt=Date.now();clearTimeout(watch);watch=setTimeout(()=>{if(lastAt<=askedAt){failed='no answer';render();}},WATCHDOG_MS);}
function refresh(){failed='';arm();if(!loaded)render();vs.postMessage({type:'refresh',force:true});}
function say(t){$('live').textContent=t;}
function setGroup(v){if(!GROUPS.some(g=>g[0]===v))return;group=v;savePrefs();render();}
function toggleBand(b){const i=hidden.indexOf(b);if(i<0)hidden.push(b);else hidden.splice(i,1);savePrefs();render();}
function act(k,id){
if(k==='open')vs.postMessage({type:'open',id:id});
else if(k==='handover'){if(hv[id]!=='busy'){hv[id]='busy';render();vs.postMessage({type:'handover',id:id});}}
else if(k==='find')vs.postMessage({type:'find',id:id});
else if(k==='arch'){pend.add(id);open.delete(id);vs.postMessage({type:'archive',id:id,on:true});render();}
else if(k==='done'){const r=rows.find(x=>x.id===id);if(!r)return;const fp=fingerprint(dotOf(id),r.last,gitView(r));donemap[id]=fp;open.delete(id);vs.postMessage({type:'done',id:id,on:true,fp:fp});render();}
else if(k==='undone'){delete donemap[id];vs.postMessage({type:'done',id:id,on:false});render();}}
function toggleRow(id,on){if(on===undefined?open.has(id):!on)open.delete(id);else{open.add(id);askDetail(id,true);}focusId=id;render();}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;const k=a.dataset.a,row=a.closest('.row'),id=row?row.dataset.id:'';
if(k==='retry'||k==='refresh'){refresh();}
else if(k==='idle'){toggleBand('idle');}
else if(k==='band'){toggleBand(a.dataset.b);}
else if(k==='fretry'){retryKey(a.dataset.k);}
else if(k==='pr'||k==='prc'){const n=Number(a.dataset.n);if(/^r\d+$/.test(a.dataset.k||'')&&n>0)vs.postMessage({type:k==='pr'?'openPr':'copyPr',repo:a.dataset.k,n:n});}
else if(k==='dretry'){if(id)retryDetail(id);}
else if(k==='file'){vs.postMessage({type:'openFile',key:a.dataset.k,i:Number(a.dataset.i)});}
else if(k==='rm'){vs.postMessage({type:'copyRemove',key:a.dataset.k});}
else if(k==='more'){vs.postMessage({type:'scanMore'});}
else if(k==='ws'){wsOnly=!wsOnly;savePrefs();render();}
else if(k==='showdone'){showDone=!showDone;render();}
else if(k==='row'&&id){toggleRow(id);}
else if(id){act(k,id);}});
$('grb').addEventListener('click',()=>pop.toggle('grb','grm'));
grm.addEventListener('change',e=>{setGroup(e.target.value);pop.close('');});
function focusStep(t,d){const all=Array.from(document.querySelectorAll('.rb')),i=all.indexOf(t)+d;if(all[i])all[i].focus();}
document.addEventListener('keydown',e=>{const t=e.target;if(!t||!t.classList||!t.classList.contains('rb'))return;const row=t.closest('.row'),id=row?row.dataset.id:'';if(!id)return;
if(e.key==='ArrowDown'){e.preventDefault();focusStep(t,1);}
else if(e.key==='ArrowUp'){e.preventDefault();focusStep(t,-1);}
else if(e.key==='Home'||e.key==='End'){e.preventDefault();const all=Array.from(document.querySelectorAll('.rb'));const x=e.key==='Home'?all[0]:all[all.length-1];if(x)x.focus();}
else if(e.key==='Enter'){e.preventDefault();vs.postMessage({type:'open',id:id});}
else if(e.key===' '||e.key==='ArrowRight'){e.preventDefault();toggleRow(id,true);}
else if(e.key==='ArrowLeft'){e.preventDefault();toggleRow(id,false);}
else if(e.key==='Escape'&&open.has(id)&&grm.hidden){e.preventDefault();toggleRow(id,false);}});
document.addEventListener('focusin',e=>{const t=e.target;if(!t||!t.classList||!t.classList.contains('rb'))return;const row=t.closest('.row');focusId=row?row.dataset.id:focusId;
Array.from(document.querySelectorAll('.rb')).forEach(b=>{b.tabIndex=b===t?0:-1;});});
document.addEventListener('mouseover',e=>{const t=e.target,row=t&&t.closest?t.closest('.row'):null,id=row&&row.dataset?row.dataset.id:'';if(id===hoverId)return;hoverId=id;if(!id&&moving)settle(0);});
document.addEventListener('mouseout',e=>{if(!e.relatedTarget&&hoverId){hoverId='';if(moving)settle(0);}});
document.addEventListener('focusout',()=>{if(moving)settle(HOLD_MS);});
window.addEventListener('resize',layout);
setInterval(updText,10000);
window.addEventListener('message',e=>{const d=e.data;if(!d)return;
if(d.type==='init'){days=d.days||14;if(GROUPS.some(g=>g[0]===d.group))group=d.group;hidden=Array.isArray(d.hidden)?d.hidden.filter(b=>BAND_ORDER.indexOf(b)>=0):[];wsOnly=!!d.wsOnly;wsN=Number(d.ws)||0;setPrsOn(d.prsOn);donemap=d.done&&typeof d.done==='object'?d.done:{};render();}
else if(d.type==='chats'){if(d.scan<scan)return;if(d.scan>scan){scanLive=!!d.scanning;prog=null;resetDetail();Object.keys(fwatch).forEach(k=>{clearTimeout(fwatch[k]);});fwatch={};touch();}scan=d.scan;rows=Array.isArray(d.rows)?d.rows:[];pend.clear();loaded=true;failed='';indexing=!!d.indexing;lastAt=Date.now();clearTimeout(watch);render();say(rows.length+' chats shown.');}
else if(d.type==='chatsFailed'){if(d.scan<scan)return;failed=d.message||'Could not load chats';clearTimeout(watch);render();}
else if(d.type==='dots'){dots=d.map||{};gotDots=true;sched();}
else if(d.type==='folder'){onFolder(d);}
else if(d.type==='repo'){onRepo(d);}
else if(d.type==='progress'){onProgress(d);}
else if(d.type==='prs'){onPrs(d);}
else if(d.type==='checks'){onChecks(d);}
else if(d.type==='end'){onEnd(d);}
else if(d.type==='notes'){onNotes(d);}
else if(d.type==='detail'){onDetail(d);}
else if(d.type==='handoverState'){hv[d.id]=d.state||'';if(d.state==='done')setTimeout(()=>{if(hv[d.id]==='done'){hv[d.id]='';sched();}},2000);sched();}});
arm();
vs.postMessage({type:'ready'});
`;

export const OW_SCRIPT = SHARED_SRC + WORK_MODEL_SRC + POP_JS + TIP_ENGINE_JS + OW_GIT_JS + OW_PR_JS + CORE;
