/** Webview script part: row, group and section rendering. Shares top-level scope with webviewJs. */
export const RENDER = String.raw`
const CHEV='<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TAG_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.500 2.500h5l6 6-5 5-6-6z"/><circle cx="5.500" cy="5.500" r="1"/></svg>';
function dotHtml(id){const d=dots[id]||{s:'idle'},t=dotText(d);
return '<span class="dot '+d.s+'" role="img" aria-label="'+esc(t)+'" data-tip="'+esc(dotTip(d))+'"></span>';}
function decorated(r){const d=dots[r.id];return pins.has(r.id)||!!d;}
function stamp(r){return r.hits>0&&r.snipAt?r.snipAt:r.last;}
function resOf(id){return lastRs.concat(pinned,sess?sess.rows.concat(sess.arch||[]):[]).find(r=>r.id===id);}
function reEsc(t){return t.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&');}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function full(ms){return new Date(ms).toLocaleString();}
let noteIn='',sessN=0;
function takeNote(){const n=noteIn;noteIn='';return n?'<span class="sm">'+n+'</span>':'';}
function chatsN(n){return n+(n===1?' chat':' chats');}
function sec(key,label,n,body,cls,note){const o=!col.has(key);
return '<div class="'+cls+(o?' open':'')+'" data-sec="'+esc(key)+'" role="button" tabindex="0" aria-expanded="'+o+'">'+CHEV+'<span class="sn">'+esc(label)+'</span>'+(note||'')+(key==='sec:res'?'':'<span class="pill" role="img" aria-label="'+chatsN(n)+'" data-tip="'+chatsN(n)+'">'+n+'</span>')+'</div>'+(o?body:'');}
function ordered(rs,srt){const a=rs.slice(),k=srt||sort.value;
if(k==='time')a.sort((x,y)=>stamp(y)-stamp(x));
else if(k==='title')a.sort((x,y)=>x.title.toLowerCase().localeCompare(y.title.toLowerCase()));
else if(k==='length')a.sort((x,y)=>(y.msgs||0)-(x.msgs||0));
else if(k==='cost')a.sort((x,y)=>(y.cost||0)-(x.cost||0));
else if(k==='context')a.sort((x,y)=>ctxKey(y)-ctxKey(x));
else a.sort((x,y)=>y.score-x.score);
return a.filter(r=>pins.has(r.id)).concat(a.filter(r=>!pins.has(r.id)));}
function marked(s,rg){let o='',p=0;for(const g of rg){o+=esc(s.slice(p,g[0]))+'<mark>'+esc(s.slice(g[0],g[1]))+'</mark>';p=g[1];}
return o+esc(s.slice(p));}
function snip(r){return marked(r.snippet,r.ranges);}
function tagActive(t){return new RegExp('(^|\\s)tag:'+reEsc(t)+'(\\s|$)','i').test(q.value);}
function chips(id){return (tags[id]||[]).map(t=>'<span class="chip'+(tagActive(t)?' on':'')+'" data-a="tag" data-t="'+esc(t)+'" data-tip="Filter by tag" aria-label="Filter by tag '+esc(t)+'" role="button" tabindex="0">'+esc(t)+'<b class="cx" data-a="untag" data-t="'+esc(t)+'" data-tip="Remove tag" aria-label="Remove tag '+esc(t)+'" role="button" tabindex="0">×</b></span>').join('');}
function fileChip(f){const b=f.path.split(/[\\/]/).pop()||f.path;return '<span class="fp'+(f.edited?' ed':'')+'" data-tip="'+esc((f.edited?'Edited: ':'Read: ')+f.path)+'">'+(f.edited?'✎ ':'')+esc(b)+'</span>';}
function hdHtml(r,op){const p=pins.has(r.id),ia=arch.has(r.id),tg=tagIn&&tagIn.id===r.id;
const ti=r.titleShown&&(!op||r.titleShown===r.title)?marked(r.titleShown,r.titleRanges):esc(r.title);
return '<div class="hd">'+(decorated(r)?dotHtml(r.id):'<span class="dot none" aria-hidden="true"></span>')+'<span class="t" data-tip="k:title">'+ti+'</span>'+rcHtml(r,op,Date.now())+'<span class="ia">'
+'<button class="ic tg'+(tg?' on':'')+'" data-a="addtag" data-tip="Add tag" aria-label="Add tag">'+TAG_SVG+'</button>'
+'<button class="ic ar'+(ia?' on':'')+'" data-a="arch" data-tip="'+(ia?'Unarchive':'Archive')+'" aria-label="'+(ia?'Unarchive':'Archive')+'">'+ARCH_SVG+'</button>'
+'<button class="ic pn'+(p?' on':'')+'" data-a="pin" data-tip="'+(p?'Unpin':'Pin')+'" aria-label="'+(p?'Unpin':'Pin')+'" aria-pressed="'+p+'">'+(p?'★':'☆')+'</button></span>'
+'<button class="ic'+(op?' on':'')+'" data-a="exp" data-tip="'+(op?'Hide details':'Details')+'" aria-label="'+(op?'Hide details':'Details')+'" aria-expanded="'+op+'">'+CHEV+'</button></div>';}
function rowHtml(r){
const now=Date.now(),op=open.has(r.id),ia=arch.has(r.id);
return '<div class="r'+(op?' open':'')+'" data-id="'+esc(r.id)+'" data-vscode-context="'+esc(JSON.stringify({webviewSection:'chat',id:r.id,ccsArchived:ia,ccsUnread:(dots[r.id]||{}).s==='unread'}))+'" tabindex="0"><div class="rh">'
+hdHtml(r,op)+metaHtml(r,now)+'<span class="chips">'+(op?'':(decorated(r)?chips(r.id):'')+tagInput(r.id))+'</span>'+sxHtml(r)+'</div>'+(op?exHtml(r):'')+'</div>';}
function groupsHtml(a){const now=Date.now(),g={};
a.forEach(r=>{const k=dayBucket(stamp(r),now);(g[k]=g[k]||[]).push(r);});
const ks=DAY_ORDER.filter(k=>g[k]);
if(ks.length===1&&!pinShown())return a.map(rowHtml).join('');
return ks.map((k,i)=>sec('grp:'+k,k,g[k].length,g[k].map(rowHtml).join(''),'gh')).join('');}
function resultsHtml(rs){const a=ordered(rs);if(!a.length)return '';
if(sort.value==='time')return groupsHtml(a);
if(!pinShown())return a.map(rowHtml).join('');
return sec('sec:res','Results',a.length,a.map(rowHtml).join(''),'sl',takeNote());}
function openFirst(a){const t=[],r=[];a.forEach(x=>{if(pins.has(x.id)||dots[x.id])t.push(x);else r.push(x);});return{top:t,rest:r};}
function sessBody(a){return sort.value==='time'?groupsHtml(a):a.map(rowHtml).join('');}
function sessRows(a){const g=openFirst(a);if(!g.top.length||!g.rest.length)return sessBody(a);
return g.top.map(rowHtml).join('')+'<div class="osep" role="separator"></div>'+sessBody(g.rest);}
function sessHtml(keep){if(!sessOn||!sess)return '';
const nm=lastMsg==='No matches'?'<div class="nm">No matches for <b>'+esc(lastQ)+'</b></div>':'';
if(!keep.length)return nm;
const a=ordered(keep,sort.value==='score'?'time':sort.value),body=sessRows(a);
if(sort.value==='time'||!pinShown())return nm+body;
return nm+sec('sec:all','All sessions',a.length,body,'sl',takeNote());}
function pinnedLive(){return pinned.filter(r=>!arch.has(r.id));}
function pinShown(){return sessOn&&!lastQ&&!busy&&pinnedLive().length>0;}
function sessBase(){return hasResults||!sessOn||!sess?[]:(pinShown()?sess.rows.filter(r=>!pins.has(r.id)):sess.rows);}
function renderPinned(){
if(!pinShown()){pinEl.innerHTML='';return;}
const pl=pinnedLive();pinEl.innerHTML=sec('sec:pin','Pinned',pl.length,pl.map(rowHtml).join(''),'sl');}
function progTxt(d,t){return d<t?'Searched '+d+' of '+t+' chats':'';}
function noteText(){return '';}
function nkey(x,seen){const b=x.dataset.sec?'s:'+x.dataset.sec:'r:'+(x.dataset.id||x.className);seen[b]=(seen[b]||0)+1;return b+'#'+seen[b];}
function topOf(el,x){while(x&&x.parentNode!==el)x=x.parentNode;return x;}
function refocus(f,fd){let t=f;if(fd){t=Array.from(f.querySelectorAll(fd.tag)).find(x=>x.dataset.a===fd.a&&x.dataset.t===fd.t&&x.className===fd.c)||f;}if(t.focus)t.focus();}
function patch(el,html){const t=document.createElement('template');t.innerHTML=html;const nw=Array.from(t.content.children);
const act=document.activeElement,top=act&&act!==el&&el.contains(act)?topOf(el,act):null,ak=top?nkey(top,{}):null,fd=top&&act!==top?{tag:act.tagName,a:act.dataset.a,t:act.dataset.t,c:act.className}:null;
const old=new Map(),s1={};Array.from(el.children).forEach(c=>old.set(nkey(c,s1),c));
const s2={};let prev=null;
for(const n of nw){const k=nkey(n,s2),o=old.get(k);let node=n;
if(o){old.delete(k);if(o.outerHTML===n.outerHTML)node=o;else el.replaceChild(n,o);}
const ref=prev?prev.nextSibling:el.firstChild;if(node!==ref)el.insertBefore(node,ref);prev=node;}
old.forEach(o=>o.remove());
if(ak&&!act.isConnected){const s3={},f=Array.from(el.children).find(c=>nkey(c,s3)===ak);if(f)refocus(f,fd);}}
function render(rs,msg){lastRs=rs;lastMsg=msg;hasResults=rs.length>0;
const base=hasResults?rs.filter(r=>!arch.has(r.id)):sessBase(),keep=stKeep(base);stUi(stCounts(base));sessN=hasResults?0:keep.length;
const capOn=capShown(),t=capOn?'':noteText(),hid=base.length-keep.length;
noteIn=t||hid?esc(t)+stNote(hid,!!t):'';
patch(list,hasResults?resultsHtml(keep):sessHtml(keep));
const used=noteIn==='';st.classList.toggle('vh',used);st.textContent=t+(hid?(t?' · ':'')+hid+' hidden by status filter':'');
if(!used){st.innerHTML=noteIn;noteIn='';}
$('cap').innerHTML=capHtml();renderPinned();renderArch();sumSync();tipSync();}
`;