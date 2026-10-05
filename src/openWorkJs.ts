import { SHARED_SRC } from './group';
import { POP_JS, TIP_ENGINE_JS } from './webviewPop';
import { WORK_MODEL_SRC } from './workModel';

/** Page script of Open Work. Own scope: it reads only the ids of its own page, and no sidebar global. */
const CORE = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const WIDE_PX=760,THROTTLE_MS=250,WATCHDOG_MS=20000;
const GROUPS=[['attention','By attention'],['chat','By chat'],['repo','By repository']];
let rows=[],dots={},days=14,group='attention',hidden=[],open=new Set(),hv={},pend=new Set(),loaded=false,failed='',indexing=false,scan=0,lastAt=0,askedAt=0,watch=0,rtimer=0,lastRender=0,focusId='';
const body=$('body'),grm=$('grm');
const pop=makePop([['grb','grm']]);
const tipper=makeTip({bounds:()=>{const w=document.documentElement.clientWidth||window.innerWidth||400;return{left:0,right:w,width:w};},html:el=>tipPlain(el.dataset.tip||'')});
grm.innerHTML='<div class="pt">Group chats by</div>'+GROUPS.map(g=>'<label class="pi"><input type="radio" name="grp" value="'+g[0]+'"><span>'+g[1]+'</span></label>').join('');
function groupLabel(){return GROUPS.find(g=>g[0]===group)[1];}
function groupUi(){grm.querySelectorAll('input').forEach(i=>{i.checked=i.value===group;});const t='Group chats by: '+groupLabel();$('grt').textContent=groupLabel();$('grb').setAttribute('aria-label',t);}
function savePrefs(){vs.postMessage({type:'prefs',group:group,hidden:hidden.slice()});}
function dotOf(id){return dots[id]?dots[id].s:'idle';}
function ctxClass(r){return r.ctx?'l'+ctxLevel(r.ctx.pct):'l0';}
function btn(a,label,txt,tip){return '<button type="button" class="ab" data-a="'+a+'" aria-label="'+esc(label)+'" data-tip="'+esc(tip||label)+'">'+txt+'</button>';}
function rowHtml(r,tab){const d=dots[r.id],s=dotOf(r.id),words=dotText(d||{s:'idle'}),age=shortAgo(r.last,Date.now()),isOpen=open.has(r.id),t=r.title||'Untitled chat';
const stTxt=s==='waiting'?'Waiting for you':s==='unread'?'Unread':s==='running'?'Running':'';
const label=t+', '+(r.project||'no folder')+(stTxt?', '+stTxt:'')+', active '+age+(age==='now'?'':' ago')+(r.pinned?', pinned':'');
const hvT=hv[r.id]==='busy'?'Copying...':hv[r.id]==='done'?'Copied':'Copy note';
const dot=d?'<span class="dot '+esc(s)+'" role="img" aria-label="'+esc(words)+'"></span>':'<span class="dot none" aria-hidden="true"></span>';
return '<div class="row" role="listitem" data-id="'+esc(r.id)+'"><div class="main"><button type="button" class="rb" data-a="row" tabindex="'+(tab?0:-1)+'" aria-expanded="'+isOpen+'" aria-label="'+esc(label)+'">'+dot
+'<span class="t" data-tip="'+esc(t+'\n'+words)+'">'+(r.pinned?'<span class="pill">Pinned</span> ':'')+esc(t)+'</span>'
+'<span class="meta"><span class="pj">'+esc(r.project||'')+'</span><span class="cx '+ctxClass(r)+'">'+(r.ctx?r.ctx.pct+'% full':'')+'</span><span class="st">'+esc(stTxt)+'</span><span class="tm">'+esc(age)+'</span></span></button>'
+'<div class="acts">'+btn('open','Open chat: '+t,'Open','Open chat')+btn('handover','Copy hand-over note: '+t,esc(hvT),'Copy hand-over note')+btn('find','Find in the sidebar search: '+t,'Find','Find in the sidebar search')+btn('arch','Archive chat: '+t,'Archive','Archive chat')+'</div></div>'
+(isOpen?exHtml(r,words):'')+'</div>';}
function exHtml(r,words){const kv=[['Chat',esc(r.title||'Untitled chat')],['Folder',esc(r.project||'')],['Last active',esc(new Date(r.last).toLocaleString())],['Context',r.ctx?esc(ctxStat(r.ctx)):''],['State',esc(words)],['Next step',esc(nextStep(dotOf(r.id)))]];
return '<div class="ex"><dl>'+kv.filter(x=>x[1]!=='').map(x=>'<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>').join('')+'</dl></div>';}
function visibleRows(){return rows.filter(r=>!pend.has(r.id));}
function chips(vis){const by=bandRows(vis,dots);
$('cnt').innerHTML=['needs','finish','waiting','tidy'].map(b=>{const n=by[b].length,t=n+' '+BAND_CHIP[b],on=hidden.indexOf(b)<0;
return '<button type="button" class="chip" data-a="band" data-b="'+b+'" aria-pressed="'+on+'" aria-label="'+esc(t+(on?', shown':', hidden'))+'">'+esc(t)+'</button>';}).join('');
const idle=hidden.indexOf('idle')<0;$('idl').setAttribute('aria-pressed',String(idle));$('idl').textContent='Show idle ('+by.idle.length+')';}
function bodyHtml(vis){
if(failed&&!loaded)return '<p class="msg err" role="alert">Could not load chats. <button type="button" class="ab" data-a="retry">Retry</button></p>';
if(!loaded)return '<p class="msg" role="status">Loading chats...</p>';
const err=failed?'<p class="msg err" role="alert">Could not load chats. <button type="button" class="ab" data-a="retry">Retry</button></p>':'';
if(!vis.length)return err+'<p class="msg">No chats in the last '+days+' days.</p>';
const gs=groupRows(vis,dots,group,hidden);
if(!gs.length)return err+'<p class="msg">Nothing to show with these filters. <button type="button" class="ab" data-a="idle">Show idle</button></p>';
let tabId=gs.some(g=>g.rows.some(r=>r.id===focusId))?focusId:gs[0].rows[0].id;
const th='<div class="th" aria-hidden="true"><div class="a"><span></span><span>Chat</span><span>Folder</span><span>Context</span><span>State</span><span>Active</span></div><div class="b"></div></div>';
return err+th+gs.map(g=>'<section class="band" aria-label="'+esc(g.label)+'"><h2 class="bh" role="heading" aria-level="2">'+esc(g.label)+' <span class="pill">'+g.rows.length+'</span></h2><div role="list">'+g.rows.map(r=>rowHtml(r,r.id===tabId)).join('')+'</div></section>').join('');}
function layout(){const w=document.documentElement.clientWidth||window.innerWidth||400;$('wrap').classList.toggle('wide',w>=WIDE_PX);}
function updText(){$('upd').textContent=lastAt?'Updated '+(Date.now()-lastAt<10000?'just now':Math.floor((Date.now()-lastAt)/1000)+' s ago'):'';}
function render(){lastRender=Date.now();
try{const ae=document.activeElement,had=ae&&ae.classList&&ae.classList.contains('rb');const vis=visibleRows();layout();chips(vis);
$('ixs').hidden=!indexing;body.setAttribute('aria-busy',String(!loaded&&!failed));groupUi();updText();
body.innerHTML=bodyHtml(vis);
if(had&&focusId){const b=document.querySelector('.row[data-id="'+focusId+'"] .rb');if(b)b.focus();}}
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
else if(k==='arch'){pend.add(id);open.delete(id);vs.postMessage({type:'archive',id:id,on:true});render();}}
function toggleRow(id,on){if(on===undefined?open.has(id):!on)open.delete(id);else open.add(id);focusId=id;render();}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;const k=a.dataset.a,row=a.closest('.row'),id=row?row.dataset.id:'';
if(k==='retry'||k==='refresh'){refresh();}
else if(k==='idle'){toggleBand('idle');}
else if(k==='band'){toggleBand(a.dataset.b);}
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
window.addEventListener('resize',layout);
setInterval(updText,10000);
window.addEventListener('message',e=>{const d=e.data;if(!d)return;
if(d.type==='init'){days=d.days||14;if(GROUPS.some(g=>g[0]===d.group))group=d.group;hidden=Array.isArray(d.hidden)?d.hidden.filter(b=>BAND_ORDER.indexOf(b)>=0):[];render();}
else if(d.type==='chats'){if(d.scan<scan)return;scan=d.scan;rows=Array.isArray(d.rows)?d.rows:[];pend.clear();loaded=true;failed='';indexing=!!d.indexing;lastAt=Date.now();clearTimeout(watch);render();say(rows.length+' chats shown.');}
else if(d.type==='chatsFailed'){if(d.scan<scan)return;failed=d.message||'Could not load chats';clearTimeout(watch);render();}
else if(d.type==='dots'){dots=d.map||{};sched();}
else if(d.type==='handoverState'){hv[d.id]=d.state||'';if(d.state==='done')setTimeout(()=>{if(hv[d.id]==='done'){hv[d.id]='';sched();}},2000);sched();}});
arm();
vs.postMessage({type:'ready'});
`;

export const OW_SCRIPT = SHARED_SRC + WORK_MODEL_SRC + POP_JS + TIP_ENGINE_JS + CORE;
