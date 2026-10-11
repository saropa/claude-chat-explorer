import { SHARED_SRC } from './group';
import { POP_JS, TIP_ENGINE_JS } from './webviewPop';
import { OW_GIT_JS } from './openWorkGitJs';
import { OW_PR_JS } from './openWorkPrJs';
import { OW_STATUS_JS } from './openWorkStatusJs';
import { OW_VIEW_JS } from './openWorkViewJs';
import { WORK_MODEL_SRC } from './workModel';

/** Page script of Open Work. Own scope: it reads only the ids of its own page, and no sidebar global. */
const CORE = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const WIDE_PX=1080,WIDE_PR_PX=1360,THROTTLE_MS=250,WATCHDOG_MS=20000;
let rows=[],dots={},days=14,tabId='',hidden=[],open=new Set(),hv={},pend=new Set(),loaded=false,failed='',indexing=false,scan=0,lastAt=0,askedAt=0,watch=0,rtimer=0,lastRender=0,focusId='';
const DONE_TIP='Hide this row until its git or chat state changes';
const body=$('body');let lastB=null;
const pop=makePop([['srb','srm'],['shb','shm']]);
const tipper=makeTip({bounds:()=>{const w=document.documentElement.clientWidth||window.innerWidth||400;return{left:0,right:w,width:w};},html:el=>tipPlain(el.dataset.tip||'')});
$('srm').innerHTML='<div class="pt">Sort rows by</div>'+SORTS.map(g=>'<label class="pi"><input type="radio" name="srt" value="'+g[0]+'"><span>'+g[1]+'</span></label>').join('');
function savePrefs(){vs.postMessage({type:'prefs',hidden:hidden.slice()});}
function dotOf(id){return dots[id]?dots[id].s:'idle';}
function ctxClass(r){return r.ctx?'l'+ctxLevel(r.ctx.pct):'l0';}
function btn(a,label,icon,tip){return ibtn(a,label,icon,tip);}
function rowHtml(r,tab){const d=dots[r.id],s=dotOf(r.id),words=dotText(d||{s:'idle'}),age=shortAgo(r.last,Date.now()),isOpen=open.has(r.id),t=r.title||'Untitled chat';
const c=cellsOf(r),pc=prCells(r),g=viewOf(r),w=wtOf(r),ready=!!(g&&g.ready),locked=!!(w&&w.locked&&!w.main);
const bnd=bandHeld(r,s);let stTxt=s==='waiting'?'Waiting for you':s==='unread'?'Unread':s==='running'?'Running':ready?(w&&w.missing?'Folder missing':'Ready to remove'):locked?'Locked':'';
if(!stTxt&&bnd!=='idle'&&BAND_CHIP[bnd])stTxt=BAND_CHIP[bnd][0].toUpperCase()+BAND_CHIP[bnd].slice(1);
const label=t+', '+(r.project||'no folder')+(stTxt?', '+stTxt:'')+(age?', active '+age+(age==='now'?'':' ago'):'')+(r.pinned?', pinned':'')+(c.busy?', reading git':'')+(pc.busy?', checking pull requests':'');
const hvT=hv[r.id]==='busy'?'Copying...':hv[r.id]==='done'?'Copied':'Copy note';
const dot=d?'<span class="dot '+esc(s)+'" role="img" aria-label="'+esc(words)+'"></span>':'<span class="dot none" aria-hidden="true"></span>';
const isDone=donemap[r.id]!==undefined;
const acts=btn('open','Open chat: '+t,'open','Open chat')+btn('handover','Copy hand-over note: '+t,hv[r.id]==='done'?'check':'copy',hvT==='Copy note'?'Copy hand-over note':hvT)+btn('find','Find in the sidebar search: '+t,'find','Find in the sidebar search')+btn('arch','Archive chat: '+t,'archive','Archive chat')
+(isDone?btn('undone','Show again: '+t,'undone','Show this row again'):btn('done','Mark done: '+t,'done',DONE_TIP))
+prActs(r,t)+brAct(r,t)+(curAnn&&curAnn.cr&&curRk?ibtn('cua','Ask '+t+' about all of its leftovers: copy the prompt','askcopy','Ask this chat about all of its leftovers: copy one prompt that covers every branch, worktree and pull request it created',' data-k="'+esc(curRk)+'" data-m="copy"')+ibtn('cua','Ask '+t+' about all of its leftovers: open the chat','ask','Ask this chat about all of its leftovers: open the chat; the prompt is copied so you can paste it',' data-k="'+esc(curRk)+'" data-m="resume"'):'')
+(c.retry?ibtn('fretry','Retry reading git: '+t,'retry',retryTip(gs[c.retry])||'Read git again',' data-k="'+esc(c.retry)+'"'):'')
+(pc.retry?ibtn('fretry','Retry pull request lookup: '+t,'retry','Look up the pull request again',' data-k="'+esc(pc.retry)+'"'):'')
+(ready&&w&&!w.main?ibtn('rm','Copy '+cw()+'remove command: '+t,'trash','Copy a '+cw()+'command that removes this finished worktree. Nothing is run.',' data-k="'+esc(w.k)+'"'):'');
return '<div class="row" role="listitem" data-id="'+esc(r.id)+'"'+(curAnn?' data-rel="'+esc(curAnn.c==='certain'?'c':'p')+'"':'')+' aria-busy="'+(c.busy||pc.busy?'true':'false')+'"><div class="main"><button type="button" class="rb" data-a="row" tabindex="'+(tab?0:-1)+'" aria-expanded="'+isOpen+'" aria-label="'+esc(label)+'">'+dot
+'<span class="t" data-tip="'+esc(t+'\n'+words+(curAnn?'\n'+relTip(curAnn):''))+'">'+(r.pinned?'<span class="pill">Pinned</span> ':'')+relBadge(curAnn)+esc(t)+'</span>'
+'<span class="meta"><span class="pj" title="'+esc(r.project||'')+'">'+esc(r.project||'')+'</span><span class="br" title="'+(c.br?'Branch: '+c.br:'No branch')+'">'+brCell(r,c)+'</span><span class="fl">'+c.fl+'</span><span class="ah">'+esc(c.ah)+'</span>'+(prsOn?'<span class="pr">'+pc.pr+'</span><span class="kc">'+pc.ck+'</span>':'')+'<span class="cx '+(r.ctx?pctClass(r.ctx.pct):'')+'"'+(r.ctx?' title="Context window used: '+esc(r.ctx.pct)+'%"':'')+'>'+(r.ctx?r.ctx.pct+'%':'')+'</span><span class="st'+(stTxt?' b-'+(bnd==='idle'?(s==='running'?'waiting':'tidy'):bnd):'')+'">'+esc(stTxt)+'</span><span class="tm">'+esc(age)+'</span></span></button>'
+'<div class="acts">'+acts+'</div></div>'
+(isOpen?exHtml(r,words,g):'')+'</div>';}
function exHtml(r,words,g){const kv=[['Chat',esc(r.title||'Untitled chat')],['Folder',esc(r.project||'')],['Last active',esc(new Date(r.last).toLocaleString())],['Context',r.ctx?esc(ctxStat(r.ctx)):''],['State',esc(words)]];
exGit(r).forEach(x=>kv.push(x));kv.push(['Next step',esc(nextStep(dotOf(r.id),g))]);
return '<div class="ex"><dl>'+kv.filter(x=>x[1]!=='').map(x=>'<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>').join('')+'</dl>'+exLists(r)+'</div>';}
function visibleRows(){return rows.filter(r=>!pend.has(r.id)).concat(wtRows()).filter(r=>wsOk(r)&&(showDone||!doneOf(r)));}
function doneCount(){return rows.filter(r=>!pend.has(r.id)&&wsOk(r)&&donemap[r.id]!==undefined&&doneOf(r)).length;}
function chips(){const B=lastB,tot=B?B.tot:null,els=$('cnt');
if(!B){els.innerHTML='';const dn0=doneCount();$('dnb').setAttribute('aria-pressed',String(showDone));$('dnb').textContent='Show done ('+dn0+')';$('dnb').hidden=!dn0&&!showDone;return;}
const by={};BAND_ORDER.forEach(g=>{by[g]=B.shown.filter(it=>it.v.group===g).length;});
els.innerHTML=BAND_ORDER.map(g=>{const n=by[g],on=hidden.indexOf(g)<0;if(!n&&on)return '';const t=GROUP_LABEL[g]+' '+n;
return '<button type="button" class="chip bc b-'+g+'" data-a="band" data-b="'+g+'" aria-pressed="'+on+'" data-tip="'+esc(on?'Click to hide these rows':'Click to show these rows')+'" aria-label="'+esc(t+(on?', shown':', hidden'))+'">'+esc(t)+'</button>';}).join('')
+'<span class="tot" data-tip="Totals for this repository">'+esc(countWord(tot.br,'branch','branches')+' · '+countWord(tot.wt,'worktree')+' · '+countWord(tot.pr,'PR')+' · '+countWord(tot.ch,'chat'))+'</span>';
const dn=doneCount();$('dnb').setAttribute('aria-pressed',String(showDone));$('dnb').textContent='Show done ('+dn+')';$('dnb').hidden=!dn&&!showDone;}
function bodyHtml(vis,total){
const err=failed?'<p class="msg err" role="alert">Could not load chats. '+ibtn('retry','Retry loading the chat list','retry','Retry loading the chat list')+'</p>':'';
if(failed&&!loaded)return err;
if(!loaded)return '<p class="msg" role="status">Loading chats...</p>';
const k=psKey();if(!k){lastB=null;return err+noRepoHtml();}
const B=psBuild(k,vis),ord=psOrder(B);lastB=B;tabId=ord.indexOf(focusId)>=0?focusId:ord[0]||'';
return err+psRepo(k,B)+(filtering()&&!B.shown.length&&!B.nb.length?'<p class="msg">Nothing matches these filters. <button type="button" class="ab" data-a="clearf">Clear filters</button></p>':'');}
function layout(){const w=document.documentElement.clientWidth||window.innerWidth||400;$('wrap').classList.toggle('wide',w>=(prsOn?WIDE_PR_PX:WIDE_PX));prsUi();}
function ago(ms){const s=Math.floor(ms/1000);return s<10?'just now':s<60?s+' s ago':s<3600?Math.floor(s/60)+' min ago':Math.floor(s/3600)+' h ago';}
function updText(){ghUi();$('upd').textContent=lastAt?'Updated '+ago(Date.now()-lastAt):'';$('updw').hidden=!lastAt;}
function render(){lastRender=Date.now();
try{const ae=document.activeElement,had=ae&&ae.classList&&ae.classList.contains('rb');moving=false;const all=visibleRows(),vis=filtered(all);layout();viewUi();progUi();noteUi();
$('ixs').hidden=!indexing;body.setAttribute('aria-busy',String(!loaded&&!failed));updText();
const bh=bodyHtml(vis,all.length);chips();body.innerHTML=bh;
if(refocus){const rf=document.querySelector(refocus);refocus='';if(rf&&rf.focus)rf.focus();}
if(had&&focusId){const b=document.querySelector('.row[data-id="'+focusId+'"] .rb');if(b)b.focus();}
if(moving&&!settleT)settle(HOLD_MS);}
catch(e){console.error('open work render: '+(e&&e.message?e.message:e));body.innerHTML='<p class="msg err">Could not show the chat list. Refresh to try again.</p>';}}
function sched(){if(rtimer)return;rtimer=setTimeout(()=>{rtimer=0;render();},Math.max(0,THROTTLE_MS-(Date.now()-lastRender)));}
function arm(){askedAt=Date.now();clearTimeout(watch);watch=setTimeout(()=>{if(lastAt<=askedAt){failed='no answer';render();}},WATCHDOG_MS);}
function refresh(){failed='';arm();if(!loaded)render();vs.postMessage({type:'refresh',force:true});}
function say(t){$('live').textContent=t;}
function toggleBand(b){const i=hidden.indexOf(b);if(i<0)hidden.push(b);else hidden.splice(i,1);savePrefs();render();}
function act(k,id){
if(k==='open')vs.postMessage({type:'open',id:id});
else if(k==='handover'){if(hv[id]!=='busy'){hv[id]='busy';render();vs.postMessage({type:'handover',id:id});}}
else if(k==='find')vs.postMessage({type:'find',id:id});
else if(k==='arch'){pend.add(id);open.delete(id);vs.postMessage({type:'archive',id:id,on:true});render();}
else if(k==='done'){const r=rows.find(x=>x.id===id);if(!r)return;const fp=fingerprint(dotOf(id),r.last,gitView(r));donemap[id]=fp;open.delete(id);vs.postMessage({type:'done',id:id,on:true,fp:fp});render();}
else if(k==='undone'){delete donemap[id];vs.postMessage({type:'done',id:id,on:false});render();}}
function toggleRow(id,on){if(on===undefined?open.has(id):!on)open.delete(id);else{open.add(id);askDetail(id,true);}focusId=id;render();}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a){const h=e.target.closest('.bh.tg'),b=h&&h.querySelector('[data-a="sec"]');if(b)b.click();return;}const k=a.dataset.a,row=a.closest('.row'),id=row?row.dataset.id:'';
if(k==='retry'||k==='refresh'){refresh();}
else if(k==='idle'){toggleBand('idle');}
else if(k==='band'){toggleBand(a.dataset.b);}
else if(k==='fretry'){retryKey(a.dataset.k);}
else if(k==='pr'||k==='prc'){const n=Number(a.dataset.n);if(/^r\d+$/.test(a.dataset.k||'')&&n>0)vs.postMessage({type:k==='pr'?'openPr':'copyPr',repo:a.dataset.k,n:n});}
else if(k==='brl'){const n=Number(a.dataset.n)||0,b=String(a.dataset.b||'');if(/^r\d+$/.test(a.dataset.k||'')&&b&&b.length<=250)vs.postMessage({type:'openBranch',repo:a.dataset.k,branch:b,n:n});}
else if(k==='ghs'){ghClick();}
else if(k==='repolink'){if(/^r\d+$/.test(a.dataset.k||''))vs.postMessage({type:'openRepo',repo:a.dataset.k});}
else if(k==='dretry'){if(id)retryDetail(id);}
else if(k==='file'){vs.postMessage({type:'openFile',key:a.dataset.k,i:Number(a.dataset.i)});}
else if(k==='rm'){vs.postMessage({type:'copyRemove',key:a.dataset.k});}
else if(k==='more'){vs.postMessage({type:'scanMore'});}
else if(k==='showdone'){showDone=!showDone;render();}
else if(k==='flt'){toggleFlag(a.dataset.f||'');}
else if(k==='clearf'){clearFilters();}
else if(k==='summary'){copySummary();}
else if(k==='sec'){toggleSec(a.dataset.s||'');}
else if(k==='hxm'){const x=String(a.dataset.x||'');if(x&&x.length<=120){psMore[x]=(psMore[x]||0)+PS_STEP;render();}}
else if(k==='hx'){const x=String(a.dataset.x||'');if(x&&x.length<=120){hxSet(x,a.dataset.on!=='1');}}
else if(k==='showall'){hidden=[];savePrefs();clearFilters();}
else if(k==='opc'){const c=String(a.dataset.c||'');if(/^[0-9a-f-]{8,64}$/.test(c))vs.postMessage({type:'open',id:c});}
else if(k==='cu'){const rk=String(a.dataset.k||''),c=String(a.dataset.c||''),b=String(a.dataset.b||''),w=String(a.dataset.w||'');if(/^r\d+$/.test(rk)&&/^[0-9a-f-]{8,64}$/.test(c)&&b.length<=250&&/^[ws]?\d*$/.test(w))vs.postMessage({type:'cleanup',rk:rk,id:c,rows:[{b:b||undefined,w:w||undefined}],mode:a.dataset.m==='resume'?'resume':'copy'});}
else if(k==='cua'){const rk=String(a.dataset.k||'');if(/^r\d+$/.test(rk)&&id)vs.postMessage({type:'cleanup',rk:rk,id:id,all:true,mode:a.dataset.m==='resume'?'resume':'copy'});}
else if(k==='row'&&id){toggleRow(id);}
else if(id){act(k,id);}});
$('srb').addEventListener('click',()=>pop.toggle('srb','srm'));
$('srm').addEventListener('change',e=>{setSort(e.target.value);pop.close('');});
$('shb').addEventListener('click',()=>pop.toggle('shb','shm'));
$('fq').addEventListener('input',()=>{clearTimeout(qT);qT=setTimeout(()=>applyQ($('fq').value),Q_DEBOUNCE_MS);});
function focusStep(t,d){const all=Array.from(document.querySelectorAll('.rb')),i=all.indexOf(t)+d;if(all[i])all[i].focus();}
document.addEventListener('keydown',e=>{if(e.popClosed)return;if(pop.isOpen()&&e.key!=='?'){return;}if(viewKey(e))return;const t=e.target;if(!t||!t.classList||!t.classList.contains('rb'))return;const row=t.closest('.row'),id=row?row.dataset.id:'';if(!id)return;
if(e.key==='ArrowDown'||e.key==='j'){e.preventDefault();focusStep(t,1);}
else if(e.key==='ArrowUp'||e.key==='k'){e.preventDefault();focusStep(t,-1);}
else if(e.key==='Home'||e.key==='End'){e.preventDefault();const all=Array.from(document.querySelectorAll('.rb'));const x=e.key==='Home'?all[0]:all[all.length-1];if(x)x.focus();}
else if(e.key==='Enter'){e.preventDefault();vs.postMessage({type:'open',id:id});}
else if(e.key===' '||e.key==='ArrowRight'){e.preventDefault();toggleRow(id,true);}
else if(e.key==='ArrowLeft'){e.preventDefault();toggleRow(id,false);}
else if(e.key==='Escape'&&open.has(id)){e.preventDefault();toggleRow(id,false);}});
document.addEventListener('focusin',e=>{const t=e.target;if(!t||!t.classList||!t.classList.contains('rb'))return;const row=t.closest('.row');focusId=row?row.dataset.id:focusId;
Array.from(document.querySelectorAll('.rb')).forEach(b=>{b.tabIndex=b===t?0:-1;});});
document.addEventListener('mouseover',e=>{const t=e.target,row=t&&t.closest?t.closest('.row'):null,id=row&&row.dataset?row.dataset.id:'';if(id===hoverId)return;hoverId=id;if(!id&&moving)settle(0);});
document.addEventListener('mouseout',e=>{if(!e.relatedTarget&&hoverId){hoverId='';if(moving)settle(0);}});
document.addEventListener('focusout',()=>{if(moving)settle(HOLD_MS);});
window.addEventListener('resize',layout);
setInterval(updText,10000);
window.addEventListener('message',e=>{const d=e.data;if(!d)return;
if(d.type==='init'){days=d.days||14;hidden=Array.isArray(d.hidden)?d.hidden.filter(b=>BAND_ORDER.indexOf(b)>=0):[];wsN=Number(d.ws)||0;winCmd=d.win===true;setPrsOn(d.prsOn);donemap=d.done&&typeof d.done==='object'?d.done:{};applyView(d.view);render();}
else if(d.type==='chats'){if(d.scan<scan)return;if(d.scan>scan){scanLive=!!d.scanning;prog=null;ended=false;resetDetail();Object.keys(fwatch).forEach(k=>{clearTimeout(fwatch[k]);});fwatch={};touch();}if(d.scan>scan)rels={};scan=d.scan;rows=Array.isArray(d.rows)?d.rows:[];pend.clear();loaded=true;failed='';indexing=!!d.indexing;lastAt=Date.now();clearTimeout(watch);render();say(rows.length+' chats shown.');}
else if(d.type==='chatsFailed'){if(d.scan<scan)return;failed=d.message||'Could not load chats';clearTimeout(watch);render();}
else if(d.type==='dots'){dots=d.map||{};gotDots=true;sched();}
else if(d.type==='folder'){onFolder(d);}
else if(d.type==='repo'){onRepo(d);}
else if(d.type==='rel'){onRel(d);}
else if(d.type==='progress'){onProgress(d);}
else if(d.type==='prs'){onPrs(d);}
else if(d.type==='gh'){onGh(d);}
else if(d.type==='checks'){onChecks(d);}
else if(d.type==='end'){onEnd(d);}
else if(d.type==='notes'){onNotes(d);}
else if(d.type==='detail'){onDetail(d);}
else if(d.type==='summaryState'){onSummaryState(d);}
else if(d.type==='handoverState'){hv[d.id]=d.state||'';if(d.state==='done')setTimeout(()=>{if(hv[d.id]==='done'){hv[d.id]='';sched();}},2000);sched();}});
arm();
vs.postMessage({type:'ready'});
`;

export const OW_SCRIPT = SHARED_SRC + WORK_MODEL_SRC + POP_JS + TIP_ENGINE_JS + OW_GIT_JS + OW_PR_JS + OW_VIEW_JS + OW_STATUS_JS + CORE;
