import { MAX_RESULTS } from './search';

export const SCRIPT = String.raw`
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const q=$('q'),all=$('all'),when=$('when'),sort=$('sort'),st=$('status'),list=$('list'),hist=$('hist'),pinEl=$('pin'),bar=$('bar'),err=$('err'),tl=$('tl');
const flags={cs:$('cs'),ww:$('ww'),re:$('re')};
let timer,history=[],hasResults=false,busy=false,acc=[],prog=null,lastRs=[],lastMsg='';
let pins=new Set(),tags={},pinned=[],open=new Set(),ex={};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function cur(){return{query:q.value.trim(),all:all.checked,cs:flags.cs.classList.contains('on'),ww:flags.ww.classList.contains('on'),re:flags.re.classList.contains('on'),when:when.value,sort:sort.value};}
function setFlag(k,v){flags[k].classList.toggle('on',!!v);flags[k].setAttribute('aria-pressed',v?'true':'false');}
function showErr(m){err.style.display=m?'block':'none';err.textContent=m||'';q.classList.toggle('bad',!!m);}
function setBusy(b){busy=b;bar.classList.toggle('on',b);renderIdle();}
function draft(){vs.postMessage(Object.assign({type:'draft'},cur()));}
function go(){clearTimeout(timer);const c=cur();showErr('');draft();
acc=[];prog=null;open.clear();ex={};
if(!c.query){list.innerHTML='';hasResults=false;st.textContent='';setBusy(false);vs.postMessage(Object.assign({type:'search'},c));return;}
st.textContent='Searching...';setBusy(true);vs.postMessage(Object.assign({type:'search'},c));}
function idle(){return !(hasResults||busy||err.style.display==='block');}
function renderIdle(){renderHist();renderPinned();}
function renderHist(){
if(!idle()||!history.length){hist.innerHTML='';return;}
hist.innerHTML='<div class="cap">Recent searches</div>'+history.map((h,i)=>{
const f=(h.cs?'Aa ':'')+(h.ww?'ab ':'')+(h.re?'.*':'');
return '<div class="h" data-i="'+i+'" title="'+esc(h.query)+'"><span class="q">'+esc(h.query)+'</span><span class="fl">'+esc(f.trim())+'</span><button class="x" data-x="'+i+'" title="Remove" aria-label="Remove">×</button></div>';
}).join('')+'<div class="cap"><a id="clr">Clear history</a></div>';}
function renderPinned(){
if(!idle()||q.value.trim()||!pinned.length){pinEl.innerHTML='';return;}
pinEl.innerHTML='<div class="cap">Pinned</div>'+pinned.map(rowHtml).join('');}
hist.addEventListener('click',e=>{
const x=e.target.closest('[data-x]');if(x){e.stopPropagation();vs.postMessage({type:'histRemove',index:+x.dataset.x});return;}
if(e.target.id==='clr'){vs.postMessage({type:'histClear'});return;}
const h=e.target.closest('.h');if(h){const it=history[+h.dataset.i];q.value=it.query;all.checked=!!it.all;
setFlag('cs',it.cs);setFlag('ww',it.ww);setFlag('re',it.re);when.value=it.when||'any';go();}});
q.addEventListener('input',()=>{clearTimeout(timer);draft();timer=setTimeout(go,400);renderPinned();});
q.addEventListener('keydown',e=>{
if(e.key==='Enter'){go();return;}
if(e.altKey&&!e.ctrlKey&&!e.metaKey){const k={KeyC:'cs',KeyW:'ww',KeyR:'re'}[e.code];
if(k){e.preventDefault();setFlag(k,!flags[k].classList.contains('on'));go();}}});
Object.keys(flags).forEach(k=>flags[k].addEventListener('click',()=>{setFlag(k,!flags[k].classList.contains('on'));go();q.focus();}));
all.addEventListener('change',go);
when.addEventListener('change',go);
sort.addEventListener('change',()=>{draft();render(lastRs,lastMsg);});
function ordered(rs){const a=rs.slice();
if(sort.value==='time')a.sort((x,y)=>y.last-x.last);
else if(sort.value==='title')a.sort((x,y)=>x.title.toLowerCase().localeCompare(y.title.toLowerCase()));
else a.sort((x,y)=>y.score-x.score);
return a.filter(r=>pins.has(r.id)).concat(a.filter(r=>!pins.has(r.id)));}
function ago(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return 'just now';
const u=[['minute',60],['hour',3600],['day',86400],['week',604800],['month',2592000],['year',31536000]];
let pick=u[0];for(const x of u){if(s>=x[1])pick=x;}const n=Math.floor(s/pick[1]);return n+' '+pick[0]+(n===1?'':'s')+' ago';}
function absShort(ms){return new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function snip(r){let o='',p=0;for(const g of r.ranges){o+=esc(r.snippet.slice(p,g[0]))+'<mark>'+esc(r.snippet.slice(g[0],g[1]))+'</mark>';p=g[1];}
return o+esc(r.snippet.slice(p));}
function tagActive(t){return new RegExp('(^|\\s)tag:'+t.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&')+'(\\s|$)','i').test(q.value);}
function chips(id){return (tags[id]||[]).map(t=>'<span class="chip'+(tagActive(t)?' on':'')+'" data-a="tag" data-t="'+esc(t)+'" title="Filter by tag">'+esc(t)+'<b class="cx" data-a="untag" data-t="'+esc(t)+'" title="Remove tag">×</b></span>').join('');}
function msgHtml(i){return '<div class="mm"><span class="who">'+(i.role==='user'?'You':'Claude')+'</span> <span class="m" title="'+esc(new Date(i.ts).toLocaleString())+'">'+ago(i.ts)+'</span><div class="b">'+snip(i)+'</div></div>';}
function exHtml(id){
let h='<div class="tgs">'+chips(id)+'<input class="tin" list="tl" placeholder="+ tag" maxlength="40"></div>';
const e=ex[id];if(!e)return h+'<div class="m">Loading...</div>';
if(e.files.length)h+='<div class="cap">Files</div>'+e.files.map(f=>'<div class="fi">'+(f.edited?'edited ':'')+esc(f.path)+'</div>').join('');
if(e.commands.length)h+='<div class="cap">Commands</div>'+e.commands.map(c=>'<div class="fi">'+esc(c)+'</div>').join('');
h+=e.items.map(msgHtml).join('');
if(e.items.length<e.total)h+='<a data-a="more">Show more ('+(e.total-e.items.length)+')</a>';
return h;}
function rowHtml(r){
const p=pins.has(r.id),op=open.has(r.id);
const meta=(r.hits?r.hits+(r.hits===1?' hit':' hits')+' · ':'')+'<span title="'+esc(new Date(r.last).toLocaleString())+'">'+ago(r.last)+' · '+esc(absShort(r.last))+'</span>'+(all.checked?' · '+esc(r.project):'');
return '<div class="r" data-id="'+esc(r.id)+'" title="'+esc(new Date(r.last).toLocaleString())+'"><div class="hd"><button class="ic" data-a="exp" title="'+(op?'Collapse':'Expand')+'" aria-expanded="'+op+'">'+(op?'▾':'▸')+'</button><div class="t">'+esc(r.title)+'</div><button class="ic'+(p?' on':'')+'" data-a="pin" title="'+(p?'Unpin':'Pin')+'" aria-pressed="'+p+'">'+(p?'★':'☆')+'</button></div><div class="m">'+meta+'</div>'+(r.snippet?'<div class="s">'+snip(r)+'</div>':'')+'<div class="chips">'+chips(r.id)+'</div>'+(op?'<div class="ex">'+exHtml(r.id)+'</div>':'')+'</div>';}
function render(rs,msg){lastRs=rs;lastMsg=msg;hasResults=rs.length>0;st.textContent=msg||'';
list.innerHTML=ordered(rs).map(rowHtml).join('');renderIdle();}
function rerender(){render(lastRs,lastMsg);}
function askExpand(id,offset){vs.postMessage(Object.assign({type:'expand',id:id,offset:offset},cur()));}
function toggleTag(t){const re=new RegExp('(^|\\s)tag:'+t.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&')+'(?=\\s|$)','ig');
q.value=re.test(q.value)?q.value.replace(re,' ').replace(/\s+/g,' ').trim():(q.value.trim()+' tag:'+t).trim();go();}
function onClick(e){const row=e.target.closest('.r');if(!row)return;const id=row.dataset.id;const a=e.target.closest('[data-a]');
if(a){const k=a.dataset.a;e.stopPropagation();
if(k==='exp'){if(open.has(id))open.delete(id);else{open.add(id);delete ex[id];askExpand(id,0);}rerender();}
else if(k==='pin')vs.postMessage({type:'pin',id:id});
else if(k==='tag')toggleTag(a.dataset.t);
else if(k==='untag')vs.postMessage({type:'tagRemove',id:id,tag:a.dataset.t});
else if(k==='more')askExpand(id,ex[id]?ex[id].items.length:0);
return;}
if(e.target.closest('.ex'))return;
vs.postMessage({type:'open',id:id});}
list.addEventListener('click',onClick);pinEl.addEventListener('click',onClick);
document.addEventListener('keydown',e=>{const t=e.target;if(!t.classList||!t.classList.contains('tin')||e.key!=='Enter')return;
const row=t.closest('.r');const v=t.value.trim();if(!row||!v)return;vs.postMessage({type:'tagAdd',id:row.dataset.id,tag:v});t.value='';});
window.addEventListener('message',e=>{const d=e.data;
if(d.type==='restore'){const s=d.state;q.value=s.query||'';all.checked=!!s.all;setFlag('cs',s.cs);setFlag('ww',s.ww);setFlag('re',s.re);when.value=s.when||'any';sort.value=s.sort||'score';
history=d.history||[];render(s.results||[],s.searched);}
else if(d.type==='meta'){pins=new Set(d.pins);tags=d.tags||{};pinned=d.pinned||[];tl.innerHTML=(d.all||[]).map(t=>'<option value="'+esc(t)+'">').join('');rerender();}
else if(d.type==='expanded'){const n=ex[d.id];
ex[d.id]=(d.offset>0&&n)?{items:n.items.concat(d.items),total:d.total,files:d.files,commands:d.commands}:{items:d.items,total:d.total,files:d.files,commands:d.commands};rerender();}
else if(d.type==='indexing'){bar.classList.add('on');st.textContent='Indexing '+d.done+' of '+d.total+' chats';}
else if(d.type==='indexed'){bar.classList.toggle('on',busy);if(!busy&&/^Indexing/.test(st.textContent))st.textContent='';}
else if(d.type==='history'){history=d.history||[];renderHist();}
else if(d.type==='start'){acc=[];prog=null;}
else if(d.type==='batch'){if(!busy)return;acc=acc.concat(d.results).sort((a,b)=>b.score-a.score).slice(0,` + MAX_RESULTS + String.raw`);prog={done:d.done,total:d.total};
render(acc,'Searched '+d.done+' of '+d.total+' chats, '+acc.length+' matches');}
else if(d.type==='done'){busy=false;bar.classList.remove('on');acc=d.results;render(d.results,d.searched||(prog?'Searched '+prog.total+' of '+prog.total+' chats, '+d.results.length+' matches':''));}
else if(d.type==='error'){setBusy(false);st.textContent='';list.innerHTML='';hasResults=false;showErr(d.message);renderIdle();}
else if(d.type==='results'){busy=false;bar.classList.remove('on');render(d.results,d.searched);}});
vs.postMessage({type:'ready'});
`;
