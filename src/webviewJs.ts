import { SHARED_SRC } from './group';
import { GIT_JS } from './webviewGit';
import { EXPORT_JS } from './webviewExport';
import { RENDER } from './webviewRender';
import { MAX_RESULTS } from './search';
import { STATUS } from './webviewStatus';
import { LAYOUT_JS } from './webviewLayout';
import { HIST_JS } from './webviewHist';

const CORE = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const q=$('q'),all=$('all'),subs=$('subs'),when=$('when'),sort=$('sort'),msgSel=$('msgs'),hint=$('hint'),st=$('status'),list=$('list'),pinEl=$('pin'),res=$('res'),bar=$('bar'),err=$('err'),tl=$('tl');
const flags={cs:$('cs'),ww:$('ww'),any:$('any'),re:$('re')};
let timer,history=[],hasResults=false,busy=false,acc=[],prog=null,lastRs=[],lastMsg='',ix=null,dirty=false,sn=0,stale=false,lastQ='',sessOn=false,sess=null,sessTimer;
const ixb=$('ixb'),ixt=$('ixt');
let pins=new Set(),tags={},pinned=[],open=new Set(),ex={},col=new Set();
function cur(){return{query:q.value.trim(),all:all.checked,subs:subs.checked,cs:flags.cs.classList.contains('on'),ww:flags.ww.classList.contains('on'),any:flags.any.classList.contains('on'),re:flags.re.classList.contains('on'),when:when.value,last:+msgSel.value,sort:sort.value};}
function setFlag(k,v){flags[k].classList.toggle('on',!!v);flags[k].setAttribute('aria-pressed',v?'true':'false');flags.any.disabled=flags.re.classList.contains('on');}
function showErr(m){err.style.display=m?'block':'none';err.textContent=m||'';q.classList.toggle('bad',!!m);}
function setBusy(b){busy=b;bar.classList.toggle('on',b);exSync();renderIdle();}
function draft(){vs.postMessage(Object.assign({type:'draft'},cur()));}
function subTxt(){return ix.subs?' (including '+ix.subs+' subagent files)':'';}
function showIx(){ixb.hidden=!ix;if(ix)ixt.textContent=ix.first?'Building the search index for the first time: '+ix.done+' of '+ix.total+subTxt()+'. Later launches are much faster.':'Indexing your chats: '+ix.done+' of '+ix.total+subTxt()+'. Results may be incomplete until this finishes.';}
function go(){clearTimeout(timer);clearTimeout(histTimer);const c=cur();showErr('');hint.hidden=true;draft();dirty=!!ix;
stale=false;res.classList.remove('stale');res.scrollTop=0;acc=[];prog=null;open.clear();ex={};sn++;sess=null;lastQ=c.query;sessOn=!c.query;
stSync();hasResults=false;lastRs=[];lastMsg=c.query?'Searching...':'';setBusy(!!c.query);
vs.postMessage(Object.assign({type:'search',sn:sn},c));if(!c.query)askSess();rerender();}
function askSess(){vs.postMessage(Object.assign({type:'sessions',sn:sn},cur()));}
function askSessSoon(){clearTimeout(sessTimer);sessTimer=setTimeout(askSess,200);}
function renderIdle(){renderPinned();}
function rerender(){render(lastRs,lastMsg);}
function toggleSec(key){if(col.has(key))col.delete(key);else col.add(key);rerender();
const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec===key);if(n)n.focus();}
function typed(){if(busy)vs.postMessage({type:'cancel'});busy=false;bar.classList.remove('on');exSync();
stale=true;res.classList.add('stale');clearTimeout(timer);clearTimeout(histTimer);histIdx=-1;wantHist=false;draft();stSync();ahSync();timer=setTimeout(go,250);}
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
sort.addEventListener('change',()=>{draft();if(sessOn&&!hasResults)askSess();rerender();});
function showMatch(id){const row=Array.from(document.querySelectorAll('.r')).find(x=>x.dataset.id===id);const m=row&&row.querySelector('.ex .mm mark');if(m)m.scrollIntoView({block:'nearest'});}
function askExpand(id,offset){vs.postMessage(Object.assign({type:'expand',id:id,offset:offset},cur()));}
function toggleTag(t){const re=new RegExp('(^|\\s)tag:'+reEsc(t)+'(?=\\s|$)','ig');
q.value=re.test(q.value)?q.value.replace(re,' ').replace(/\s+/g,' ').trim():(q.value.trim()+' tag:'+t).trim();go();}
function openId(id){recordHist(true);vs.postMessage({type:'open',id:id});}
function onClick(e){
const rr=e.target.closest('.rr');if(rr){openId(rr.dataset.id);return;}
const row=e.target.closest('.r');if(!row)return;const id=row.dataset.id;const a=e.target.closest('[data-a]');
if(a){const k=a.dataset.a;e.stopPropagation();
if(k==='exp'){if(open.has(id))open.delete(id);else{open.add(id);delete ex[id];askExpand(id,0);}rerender();}
else if(k==='pin')vs.postMessage({type:'pin',id:id});
else if(k==='tag')toggleTag(a.dataset.t);
else if(k==='untag')vs.postMessage({type:'tagRemove',id:id,tag:a.dataset.t});
else if(k==='more')askExpand(id,ex[id]?ex[id].items.length:0);
else if(k==='git')gitOpen(id);
else if(k==='pr')addTok('pr:'+a.dataset.n);
else if(k==='sha')addTok('sha:'+a.dataset.s);
return;}
if(e.target.closest('.ex'))return;
openId(id);}
list.addEventListener('click',onClick);pinEl.addEventListener('click',onClick);
document.addEventListener('click',e=>{const s=e.target.closest('[data-sec]');if(s&&!e.target.closest('.lnk'))toggleSec(s.dataset.sec);});
function step(from,d){const all2=Array.from(document.querySelectorAll('[data-sec],.r,.rr'));const i=all2.indexOf(from)+d;
if(i<0){q.focus();return;}if(all2[i])all2[i].focus();}
document.addEventListener('keydown',e=>{const t=e.target;if(!t.classList)return;
if(t.classList.contains('tin')){if(e.key!=='Enter')return;
const row=t.closest('.r');const v=t.value.trim();if(!row||!v)return;vs.postMessage({type:'tagAdd',id:row.dataset.id,tag:v});t.value='';return;}
const isSec=t.hasAttribute('data-sec'),isRow=t.classList.contains('r')||t.classList.contains('rr');
if(!isSec&&!isRow){if((e.key==='Enter'||e.key===' ')&&t.getAttribute('role')==='button'&&t.tagName!=='BUTTON'){e.preventDefault();t.click();}return;}
if(e.key==='ArrowDown'){e.preventDefault();step(t,1);}
else if(e.key==='ArrowUp'){e.preventDefault();step(t,-1);}
else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(isSec)toggleSec(t.dataset.sec);else openId(t.dataset.id);}});
window.addEventListener('message',e=>{const d=e.data;const live=d.sn===undefined||(d.sn===sn&&!stale);
if(d.type==='restore'){const s=d.state;q.value=s.query||'';all.checked=!!s.all;subs.checked=s.subs!==false;setFlag('cs',s.cs);setFlag('ww',s.ww);setFlag('any',s.any);setFlag('re',s.re);when.value=s.when||'any';msgSel.value=String(s.last||0);sort.value=s.sort||'score';stLoad(d.statuses);exLoad(d.export);
history=d.history||[];lastQ=s.query||'';sessOn=!(s.results&&s.results.length);render(s.results||[],s.searched);if(sessOn)askSess();ahSync();}
else if(d.type==='meta'){pins=new Set(d.pins);tags=d.tags||{};pinned=d.pinned||[];tl.innerHTML=(d.all||[]).map(t=>'<option value="'+esc(t)+'">').join('');rerender();if(sessOn&&!hasResults)askSessSoon();}
else if(d.type==='expanded'){const n=ex[d.id],more=d.offset>0&&n;
ex[d.id]={items:more?n.items.concat(d.items):d.items,total:d.total,files:d.files,commands:d.commands,related:more?n.related:d.related,git:d.git};rerender();if(gitFocus===d.id){gitFocus='';gitScroll(d.id);}
if(!(d.offset>0))showMatch(d.id);}
else if(d.type==='indexing'){ix={done:d.done,total:d.total,subs:d.subs||0,first:!!d.first};showIx();}
else if(d.type==='indexed'){ix=null;showIx();if(dirty){dirty=false;go();}}
else if(d.type==='history'){history=d.history||[];histIdx=-1;if(!history.length)lastRec='';ahSync();}
else if(d.type==='sessions'){if(d.sn!==sn)return;sess={rows:d.rows||[],total:d.total||0};rerender();}
else if(!live)return;
else if(d.type==='start'){acc=[];prog=null;}
else if(d.type==='batch'){if(!busy)return;acc=acc.concat(d.results).sort((a,b)=>b.score-a.score).slice(0,` + MAX_RESULTS + String.raw`);prog={done:d.done,total:d.total};
sessOn=false;render(acc,cnts(d.done,d.total,acc.length));}
else if(d.type==='done'){busy=false;bar.classList.remove('on');acc=d.results;const n=d.results.length;sessOn=!n;
render(d.results,d.searched||(prog?cnts(prog.total,prog.total,n):''));if(n)histAfter();else askSess();}
else if(d.type==='error'){setBusy(false);sessOn=false;sess=null;lastMsg='';hasResults=false;lastRs=[];showErr(d.message);rerender();}
else if(d.type==='short'){setBusy(false);hint.textContent=d.message||'Type at least 2 characters';hint.hidden=false;sessOn=true;hasResults=false;lastRs=[];lastMsg='';askSess();rerender();}
else if(d.type==='results'){busy=false;bar.classList.remove('on');sessOn=!d.results.length;render(d.results,d.searched);if(sessOn&&lastQ)askSess();}});
vs.postMessage({type:'ready'});
`;

export const SCRIPT = SHARED_SRC + RENDER + GIT_JS + HIST_JS + CORE + STATUS + EXPORT_JS + LAYOUT_JS;
