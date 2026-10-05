import { SHARED_SRC } from './group';
import { GIT_JS } from './webviewGit';
import { SORT_JS } from './webviewSort';
import { POP_JS } from './webviewPop';
import { TIPS_JS } from './webviewTips';
import { RENDER } from './webviewRender';
import { CAP_JS } from './webviewCap';
import { ADV_JS } from './webviewAdv';
import { STATUS } from './webviewStatus';
import { LAYOUT_JS } from './webviewLayout';
import { EXPAND_JS } from './webviewExpand';
import { HIST_JS } from './webviewHist';
import { ARCH_JS } from './webviewArchive';
import { ROWS_JS } from './webviewRows';
import { TIP_JS } from './webviewTip';
import { CTX_JS } from './webviewCtx';
import { TOUCH_JS } from './webviewTouch';
import { SUM_JS } from './webviewSum';

const CORE = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const q=$('q'),all=$('all'),subs=$('subs'),when=$('when'),sort={value:'score'},msgSel=$('msgs'),frm=$('frm'),hint=$('hint'),st=$('status'),list=$('list'),pinEl=$('pin'),res=$('res'),bar=$('bar'),err=$('err'),tl=$('tl');
const flags={cs:$('cs'),ww:$('ww'),any:$('any'),re:$('re')};
let timer,history=[],hasResults=false,busy=false,acc=[],prog=null,lastRs=[],lastMsg='',ix=null,dirty=false,sn=0,stale=false,lastQ='',sessOn=false,sess=null,sessTimer;
const ixb=$('ixb'),ixt=$('ixt');
let pins=new Set(),tags={},pinned=[],open=new Set(),ex={},col=new Set(),arch=new Set(),dots={},archOpen=false;
function cur(){return{query:q.value.trim(),all:all.checked,subs:subs.checked,cs:flags.cs.classList.contains('on'),ww:flags.ww.classList.contains('on'),any:flags.any.classList.contains('on'),re:flags.re.classList.contains('on'),when:when.value,last:+msgSel.value,from:frm.value,sort:sort.value};}
function setFlag(k,v){flags[k].classList.toggle('on',!!v);flags[k].setAttribute('aria-pressed',v?'true':'false');const rx=flags.re.classList.contains('on');flags.any.disabled=rx;flags.any.title=rx?'Match any order is off while regular expressions are on':'Match words in any order (Alt+O)';}
function showErr(m){err.style.display=m?'block':'none';err.textContent=m||'';q.classList.toggle('bad',!!m);}
function setBusy(b){busy=b;bar.classList.toggle('on',b);renderIdle();}
function draft(){vs.postMessage(Object.assign({type:'draft'},cur()));}
function subTxt(){return ix.subs?' (including '+ix.subs+' subagent files)':'';}
function showIx(){ixb.hidden=!ix;if(ix)ixt.textContent=ix.first?'Building the search index for the first time: '+ix.done+' of '+ix.total+subTxt()+'. Later launches are much faster.':'Indexing your chats: '+ix.done+' of '+ix.total+subTxt()+'. Results may be incomplete until this finishes.';}
function go(){clearTimeout(timer);clearTimeout(histTimer);const c=cur();showErr('');hint.hidden=true;draft();dirty=!!ix;
stale=false;res.classList.remove('stale');res.scrollTop=0;acc=[];prog=null;open.clear();mOpen.clear();ex={};lzClear();sn++;sess=null;lastQ=c.query;sessOn=!c.query;
tot=null;hasResults=false;lastRs=[];lastMsg=c.query?'Searching...':'';setBusy(!!c.query);
vs.postMessage(Object.assign({type:'search',sn:sn},c));if(!c.query)askSess();rerender();}
function askSess(){vs.postMessage(Object.assign({type:'sessions',sn:sn},cur()));}
function askSessSoon(){clearTimeout(sessTimer);sessTimer=setTimeout(askSess,200);}
function renderIdle(){renderPinned();}
function rerender(){render(lastRs,lastMsg);}
function toggleSec(key){if(LAZY.test(key))lzToggle(key);
else if(key==='sec:arch'){archOpen=!archOpen;vs.postMessage({type:'archOpen',open:archOpen});}
else if(col.has(key))col.delete(key);else col.add(key);rerender();
const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec===key);if(n){n.focus();if(key==='sec:arch'&&archOpen)n.scrollIntoView({block:'start'});}}
function typed(){if(busy)vs.postMessage({type:'cancel'});busy=false;bar.classList.remove('on');
stale=true;res.classList.add('stale');clearTimeout(timer);clearTimeout(histTimer);histIdx=-1;wantHist=false;draft();ahSync();timer=setTimeout(go,250);}
q.addEventListener('input',typed);
q.addEventListener('focus',ahSync);q.addEventListener('blur',ahSync);
q.addEventListener('keydown',e=>{
if(e.key==='Enter'){histIdx=-1;wantHist=true;go();return;}
if(e.key==='Escape'&&histEsc()){e.preventDefault();return;}
if((e.key==='ArrowUp'||e.key==='ArrowDown')&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
if(histNav(e.key==='ArrowUp')){e.preventDefault();return;}
e.preventDefault();if(e.key==='ArrowDown'){const f=document.querySelector('.r,[data-sec]');if(f)f.focus();}return;}
if(e.altKey&&!e.ctrlKey&&!e.metaKey){const k={KeyC:'cs',KeyW:'ww',KeyO:'any',KeyR:'re'}[e.code];
if(k&&!flags[k].disabled){e.preventDefault();histIdx=-1;setFlag(k,!flags[k].classList.contains('on'));go();}}});
Object.keys(flags).forEach(k=>flags[k].addEventListener('click',()=>{histIdx=-1;setFlag(k,!flags[k].classList.contains('on'));go();q.focus();}));
all.addEventListener('change',go);
subs.addEventListener('change',go);
when.addEventListener('change',go);
msgSel.addEventListener('change',go);
frm.addEventListener('change',go);
function askExpand(id,offset,lite){vs.postMessage(Object.assign({type:'expand',id:id,offset:offset,lite:!!lite},cur()));}
function openCard(id){open.add(id);lzReset(id);cntAsk(id);if(ex[id]){ex[id].full=false;ex[id].failed=false;}askExpand(id,0,false);}
function exMerge(d){const n=ex[d.id]||{};
if(d.offset>0)return Object.assign({},n,{items:(n.items||[]).concat(d.items),total:d.total});
const items=n.items&&n.items.length>d.items.length?n.items:d.items;
if(d.lite)return Object.assign({files:[],commands:[],git:null,full:false},n,{items:items,total:d.total});
return{items:items,total:d.total,files:d.files,commands:d.commands,git:d.git,full:true};}
function toggleTag(t){const re=new RegExp('(^|\\s)tag:'+reEsc(t)+'(?=\\s|$)','ig');
q.value=re.test(q.value)?q.value.replace(re,' ').replace(/\s+/g,' ').trim():(q.value.trim()+' tag:'+t).trim();go();}
function openId(id){recordHist(true);vs.postMessage({type:'open',id:id});}
function onClick(e){
if(e.target.closest('[data-a=import]')){vs.postMessage({type:'importArchived'});return;}
const rr=e.target.closest('.rr');if(rr){openId(rr.dataset.id);return;}
const row=e.target.closest('.r');if(!row)return;const id=row.dataset.id;const a=e.target.closest('[data-a]');
if(a){const k=a.dataset.a;e.stopPropagation();
if(k==='exp'){if(open.has(id)){open.delete(id);delete cnt[id];vs.postMessage({type:'cardClosed',id:id});}else openCard(id);rerender();}
	else if(k==='mx')mxToggle(id);
else if(k==='pin')vs.postMessage({type:'pin',id:id});
else if(k==='resume')openId(id);
else if(k==='read')vs.postMessage({type:'read',id:id});
else if(k==='copyid')vs.postMessage({type:'copyId',id:id});
else if(k==='handover'){if(hv[id]!=='busy'){hv[id]='busy';rerender();vs.postMessage({type:'handover',id:id,query:q.value.trim()});}}
else if(k==='addtag')tagToggle(id);
else if(k==='arch')archToggle(id);
else if(k==='tag')toggleTag(a.dataset.t);
else if(k==='untag')vs.postMessage({type:'tagRemove',id:id,tag:a.dataset.t});
else if(k==='more')askExpand(id,ex[id]?ex[id].items.length:0,true);
else if(k==='git')gitOpen(id);
else if(k==='gfile')vs.postMessage({type:'gitFile',id:id,i:Number(a.dataset.i)});
else if(k==='xretry'){if(ex[id])ex[id].failed=false;askExpand(id,0,false);rerender();}
else if(k==='lretry'){const lk=a.dataset.key;delete lz[lk];lzLoad(lk);rerender();}
else if(k==='gpr')vs.postMessage({type:'gitPr',id:id,n:Number(a.dataset.n)});
else if(k==='pr')addTok('pr:'+a.dataset.n);
else if(k==='sha')addTok('sha:'+a.dataset.s);
return;}
if(e.target.closest('.ex')||(e.target.closest('.ml')&&!e.target.closest('.mi')))return;
openId(id);}
list.addEventListener('click',onClick);pinEl.addEventListener('click',onClick);
document.addEventListener('click',e=>{const s=e.target.closest('[data-sec]');if(s&&!e.target.closest('.lnk'))toggleSec(s.dataset.sec);});
function step(from,d){const all2=Array.from(document.querySelectorAll('[data-sec],.r,.rr'));const i=all2.indexOf(from)+d;
if(i<0){q.focus();return;}if(all2[i])all2[i].focus();}
document.addEventListener('keydown',e=>{const t=e.target;if(!t.classList||t===q)return; // the search box handles its own arrows (history)
if(t.classList.contains('tin')){tagKey(e,t);return;}
if(e.key==='Escape'&&mxEsc(e,t))return;
if(t.classList.contains('r')&&mxKey(e,t))return;
const isSec=t.hasAttribute('data-sec'),isRow=t.classList.contains('r')||t.classList.contains('rr');
if(!isSec&&!isRow){if((e.key==='Enter'||e.key===' ')&&t.getAttribute('role')==='button'&&t.tagName!=='BUTTON'){e.preventDefault();t.click();}return;}
if(e.key==='ArrowDown'){e.preventDefault();step(t,1);}
else if(e.key==='ArrowUp'){e.preventDefault();step(t,-1);}
else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(isSec)toggleSec(t.dataset.sec);else openId(t.dataset.id);}});
window.addEventListener('message',e=>{const d=e.data;const live=d.sn===undefined||(d.sn===sn&&!stale);
if(d.type==='restore'){const s=d.state;q.value=s.query||'';all.checked=!!s.all;subs.checked=s.subs!==false;setFlag('cs',s.cs);setFlag('ww',s.ww);setFlag('any',s.any);setFlag('re',s.re);setOpts(s.when,s.last,s.from);sortSet(s.sort||'score');stLoad(d.statuses);archOpen=!!d.archOpen;advSet(!!d.advOpen,false);
capN=d.max||500;tot=s.totals||null;history=d.history||[];lastQ=s.query||'';sessOn=!(s.results&&s.results.length);render(s.results||[],s.searched);if(sessOn)askSess();ahSync();}
else if(d.type==='meta'){pins=new Set(d.pins);tags=d.tags||{};pinned=d.pinned||[];arch=new Set(d.arch||[]);tl.innerHTML=(d.all||[]).map(t=>'<option value="'+esc(t)+'">').join('');rerender();if(sessOn&&!hasResults)askSessSoon();}
else if(d.type==='expanded'){ex[d.id]=exMerge(d);rerender();}
else if(d.type==='expandFailed'){if(!d.lite){ex[d.id]=Object.assign({items:[],total:0,files:[],commands:[],git:null},ex[d.id],{full:false,failed:true,reason:d.reason});rerender();}}
else if(d.type==='gitLive'){const k=d.part+':'+d.id;if(lz[k]){lz[k]={s:'done',data:d.data};rerender();}}
else if(d.type==='counts')cntSet(d);
else if(d.type==='handoverState')handoverState(d);
else if(d.type==='related'){const k='rel:'+d.id;if(lz[k]){lz[k]={s:'done',data:d.related||[]};rerender();}}
else if(d.type==='relatedFailed'){const k='rel:'+d.id;if(lz[k]){lz[k]={s:'fail',reason:d.reason};rerender();}}
else if(d.type==='indexing'){ix={done:d.done,total:d.total,subs:d.subs||0,first:!!d.first};showIx();}
else if(d.type==='indexed'){ix=null;showIx();if(dirty){dirty=false;go();}}
else if(d.type==='history'){history=d.history||[];histIdx=-1;if(!history.length)lastRec='';ahSync();}
else if(d.type==='sessions'){if(d.sn!==sn)return;sess={rows:d.rows||[],total:d.total||0,arch:d.arch||[],archTotal:d.archTotal||0};capN=d.max||capN;rerender();}
else if(d.type==='dots'){dots=d.map||{};rerender();}
else if(!live)return;
else if(d.type==='start'){acc=[];prog=null;tot=null;}
else if(d.type==='batch'){if(!busy)return;acc=acc.concat(d.results).sort((a,b)=>b.score-a.score).slice(0,capN);if(d.totals){tot=d.totals;capN=d.totals.max;}prog={done:d.done,total:d.total};
sessOn=false;render(acc,progTxt(d.done,d.total));}
else if(d.type==='done'){busy=false;bar.classList.remove('on');acc=d.results;tot=d.totals||null;const n=d.results.length;sessOn=!n;
render(d.results,d.searched||'');if(n)histAfter();else askSess();}
else if(d.type==='error'){setBusy(false);sessOn=false;sess=null;lastMsg='';hasResults=false;lastRs=[];showErr(d.message);rerender();}
else if(d.type==='short'){setBusy(false);hint.textContent=d.message||'Type at least 2 characters';hint.hidden=false;sessOn=true;hasResults=false;lastRs=[];lastMsg='';askSess();rerender();}
else if(d.type==='results'){tot=null;busy=false;bar.classList.remove('on');sessOn=!d.results.length;render(d.results,d.searched);if(sessOn&&lastQ)askSess();}
else if(d.type==='setQuery'){q.value=d.query||'';go();}});
vs.postMessage({type:'ready'});
`;

export const SCRIPT = SHARED_SRC + CAP_JS + RENDER + ROWS_JS + EXPAND_JS + GIT_JS + HIST_JS + POP_JS + CORE + STATUS + SORT_JS + TIPS_JS + LAYOUT_JS + ARCH_JS + ADV_JS + TIP_JS + CTX_JS + TOUCH_JS + SUM_JS;
