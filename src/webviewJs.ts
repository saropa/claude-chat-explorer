import { SHARED_SRC } from './group';
import { GIT_JS } from './webviewGit';
import { EXPORT_JS } from './webviewExport';
import { RENDER } from './webviewRender';
import { MAX_RESULTS } from './search';
import { STATUS } from './webviewStatus';

const CORE = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const q=$('q'),all=$('all'),subs=$('subs'),when=$('when'),sort=$('sort'),msgSel=$('msgs'),hint=$('hint'),st=$('status'),list=$('list'),hist=$('hist'),pinEl=$('pin'),bar=$('bar'),err=$('err'),tl=$('tl');
const flags={cs:$('cs'),ww:$('ww'),re:$('re')};
let timer,history=[],hasResults=false,busy=false,acc=[],prog=null,lastRs=[],lastMsg='',ix=null,dirty=false;
const ixb=$('ixb'),ixt=$('ixt');
let pins=new Set(),tags={},pinned=[],open=new Set(),ex={},col=new Set();
function cur(){return{query:q.value.trim(),all:all.checked,subs:subs.checked,cs:flags.cs.classList.contains('on'),ww:flags.ww.classList.contains('on'),re:flags.re.classList.contains('on'),when:when.value,last:+msgSel.value,sort:sort.value};}
function setFlag(k,v){flags[k].classList.toggle('on',!!v);flags[k].setAttribute('aria-pressed',v?'true':'false');}
function showErr(m){err.style.display=m?'block':'none';err.textContent=m||'';q.classList.toggle('bad',!!m);}
function setBusy(b){busy=b;bar.classList.toggle('on',b);exSync();renderIdle();}
function draft(){vs.postMessage(Object.assign({type:'draft'},cur()));}
function subTxt(){return ix.subs?' (including '+ix.subs+' subagent files)':'';}
function showIx(){ixb.hidden=!ix;if(ix)ixt.textContent=ix.first?'Building the search index for the first time: '+ix.done+' of '+ix.total+subTxt()+'. Later launches are much faster.':'Indexing your chats: '+ix.done+' of '+ix.total+subTxt()+'. Results may be incomplete until this finishes.';}
function go(){clearTimeout(timer);const c=cur();showErr('');hint.hidden=true;draft();dirty=!!(ix&&c.query);
acc=[];prog=null;open.clear();ex={};
stSync();if(!c.query){list.innerHTML='';hasResults=false;st.textContent='';setBusy(false);vs.postMessage(Object.assign({type:'search'},c));return;}
lastMsg='Searching...';st.textContent=stText();setBusy(true);vs.postMessage(Object.assign({type:'search'},c));}
function idle(){return !(hasResults||busy||err.style.display==='block');}
function renderIdle(){renderHist();renderPinned();}
function rerender(){render(lastRs,lastMsg);}
function toggleSec(key){if(col.has(key))col.delete(key);else col.add(key);rerender();
const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec===key);if(n)n.focus();}
hist.addEventListener('click',e=>{
const x=e.target.closest('[data-x]');if(x){e.stopPropagation();vs.postMessage({type:'histRemove',index:+x.dataset.x});return;}
if(e.target.id==='clr'){vs.postMessage({type:'histClear'});return;}
const h=e.target.closest('.h');if(h){const it=history[+h.dataset.i];q.value=it.query;all.checked=!!it.all;subs.checked=it.subs!==false;
setFlag('cs',it.cs);setFlag('ww',it.ww);setFlag('re',it.re);when.value=it.when||'any';msgSel.value=String(it.last||0);go();}});
q.addEventListener('input',()=>{clearTimeout(timer);draft();stSync();timer=setTimeout(go,300);renderPinned();});
q.addEventListener('keydown',e=>{
if(e.key==='Enter'){go();return;}
if(e.key==='ArrowDown'){const f=document.querySelector('.r,[data-sec]');if(f){e.preventDefault();f.focus();}return;}
if(e.altKey&&!e.ctrlKey&&!e.metaKey){const k={KeyC:'cs',KeyW:'ww',KeyR:'re'}[e.code];
if(k){e.preventDefault();setFlag(k,!flags[k].classList.contains('on'));go();}}});
Object.keys(flags).forEach(k=>flags[k].addEventListener('click',()=>{setFlag(k,!flags[k].classList.contains('on'));go();q.focus();}));
all.addEventListener('change',go);
subs.addEventListener('change',go);
when.addEventListener('change',go);
msgSel.addEventListener('change',go);
sort.addEventListener('change',()=>{draft();rerender();});
function askExpand(id,offset){vs.postMessage(Object.assign({type:'expand',id:id,offset:offset},cur()));}
function toggleTag(t){const re=new RegExp('(^|\\s)tag:'+reEsc(t)+'(?=\\s|$)','ig');
q.value=re.test(q.value)?q.value.replace(re,' ').replace(/\s+/g,' ').trim():(q.value.trim()+' tag:'+t).trim();go();}
function onClick(e){
const rr=e.target.closest('.rr');if(rr){vs.postMessage({type:'open',id:rr.dataset.id});return;}
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
vs.postMessage({type:'open',id:id});}
list.addEventListener('click',onClick);pinEl.addEventListener('click',onClick);
document.addEventListener('click',e=>{const s=e.target.closest('[data-sec]');if(s)toggleSec(s.dataset.sec);});
function step(from,d){const all2=Array.from(document.querySelectorAll('[data-sec],.r,.rr'));const i=all2.indexOf(from)+d;
if(i<0){q.focus();return;}if(all2[i])all2[i].focus();}
document.addEventListener('keydown',e=>{const t=e.target;if(!t.classList)return;
if(t.classList.contains('tin')){if(e.key!=='Enter')return;
const row=t.closest('.r');const v=t.value.trim();if(!row||!v)return;vs.postMessage({type:'tagAdd',id:row.dataset.id,tag:v});t.value='';return;}
const isSec=t.hasAttribute('data-sec'),isRow=t.classList.contains('r')||t.classList.contains('rr');
if(!isSec&&!isRow){if((e.key==='Enter'||e.key===' ')&&t.getAttribute('role')==='button'&&t.tagName!=='BUTTON'){e.preventDefault();t.click();}return;}
if(e.key==='ArrowDown'){e.preventDefault();step(t,1);}
else if(e.key==='ArrowUp'){e.preventDefault();step(t,-1);}
else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(isSec)toggleSec(t.dataset.sec);else vs.postMessage({type:'open',id:t.dataset.id});}});
window.addEventListener('message',e=>{const d=e.data;
if(d.type==='restore'){const s=d.state;q.value=s.query||'';all.checked=!!s.all;subs.checked=s.subs!==false;setFlag('cs',s.cs);setFlag('ww',s.ww);setFlag('re',s.re);when.value=s.when||'any';msgSel.value=String(s.last||0);sort.value=s.sort||'score';stLoad(d.statuses);exLoad(d.export);
history=d.history||[];render(s.results||[],s.searched);}
else if(d.type==='meta'){pins=new Set(d.pins);tags=d.tags||{};pinned=d.pinned||[];tl.innerHTML=(d.all||[]).map(t=>'<option value="'+esc(t)+'">').join('');rerender();}
else if(d.type==='expanded'){const n=ex[d.id],more=d.offset>0&&n;
ex[d.id]={items:more?n.items.concat(d.items):d.items,total:d.total,files:d.files,commands:d.commands,related:more?n.related:d.related,git:d.git};rerender();if(gitFocus===d.id){gitFocus='';gitScroll(d.id);}}
else if(d.type==='indexing'){ix={done:d.done,total:d.total,subs:d.subs||0,first:!!d.first};showIx();if(dirty)st.textContent=stText();}
else if(d.type==='indexed'){ix=null;showIx();if(dirty){dirty=false;go();}}
else if(d.type==='history'){history=d.history||[];renderHist();}
else if(d.type==='start'){acc=[];prog=null;}
else if(d.type==='batch'){if(!busy)return;acc=acc.concat(d.results).sort((a,b)=>b.score-a.score).slice(0,` + MAX_RESULTS + String.raw`);prog={done:d.done,total:d.total};
render(acc,'Searched '+d.done+' of '+d.total+' chats, '+acc.length+' matches');}
else if(d.type==='done'){busy=false;bar.classList.remove('on');acc=d.results;render(d.results,d.searched||(prog?'Searched '+prog.total+' of '+prog.total+' chats, '+d.results.length+' matches':''));}
else if(d.type==='error'){setBusy(false);st.textContent='';list.innerHTML='';hasResults=false;showErr(d.message);renderIdle();}
else if(d.type==='short'){setBusy(false);st.textContent='';list.innerHTML='';hasResults=false;hint.textContent=d.message||'Type at least 2 characters';hint.hidden=false;renderIdle();}
else if(d.type==='results'){busy=false;bar.classList.remove('on');render(d.results,d.searched);}});
vs.postMessage({type:'ready'});
`;

export const SCRIPT = SHARED_SRC + RENDER + GIT_JS + CORE + STATUS + EXPORT_JS;
