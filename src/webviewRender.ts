/** Webview script part: row, group and section rendering. Shares top-level scope with webviewJs. */
export const RENDER = String.raw`
const CHEV='<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function dotHtml(id){const d=dots[id]||{s:'idle',ring:false},t=dotText(d);
return '<span class="dot '+d.s+(d.ring?' ring':'')+'" role="img" aria-label="'+esc(t)+'" title="'+esc(t)+'"></span>';}
function liveN(a){return a.filter(r=>!arch.has(r.id)).length;}
function reEsc(t){return t.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&');}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function full(ms){return new Date(ms).toLocaleString();}
let noteIn='';
function takeNote(){const n=noteIn;noteIn='';return n?'<span class="sm">'+n+'</span>':'';}
function sec(key,label,n,body,cls,note){const o=!col.has(key);
return '<div class="'+cls+(o?' open':'')+'" data-sec="'+esc(key)+'" role="button" tabindex="0" aria-expanded="'+o+'">'+CHEV+'<span class="sn">'+esc(label)+'</span>'+(note||'')+'<span class="pill">'+n+'</span></div>'+(o?body:'');}
function ordered(rs,srt){const a=rs.slice(),k=srt||sort.value;
if(k==='time')a.sort((x,y)=>y.last-x.last);
else if(k==='title')a.sort((x,y)=>x.title.toLowerCase().localeCompare(y.title.toLowerCase()));
else if(k==='length')a.sort((x,y)=>(y.msgs||0)-(x.msgs||0));
else if(k==='cost')a.sort((x,y)=>(y.cost||0)-(x.cost||0));
else a.sort((x,y)=>y.score-x.score);
return a.filter(r=>pins.has(r.id)).concat(a.filter(r=>!pins.has(r.id)));}
function marked(s,rg){let o='',p=0;for(const g of rg){o+=esc(s.slice(p,g[0]))+'<mark>'+esc(s.slice(g[0],g[1]))+'</mark>';p=g[1];}
return o+esc(s.slice(p));}
function snip(r){return marked(r.snippet,r.ranges);}
function tagActive(t){return new RegExp('(^|\\s)tag:'+reEsc(t)+'(\\s|$)','i').test(q.value);}
function chips(id){return (tags[id]||[]).map(t=>'<span class="chip'+(tagActive(t)?' on':'')+'" data-a="tag" data-t="'+esc(t)+'" title="Filter by tag" role="button" tabindex="0">'+esc(t)+'<b class="cx" data-a="untag" data-t="'+esc(t)+'" title="Remove tag" aria-label="Remove tag '+esc(t)+'" role="button" tabindex="0">×</b></span>').join('');}
function subPill(t){return '<span class="sub" title="Subagent'+(t?': '+esc(t):'')+'">Subagent'+(t?' · '+esc(t):'')+'</span>';}
function msgHtml(i){return '<div class="mm"><span class="who">'+(i.role==='user'?'You':'Claude')+'</span> '+(i.sub!==undefined?subPill(i.sub)+' ':'')+'<span class="m" title="'+esc(full(i.ts))+'">'+shortAgo(i.ts,Date.now())+'</span><div class="b">'+snip(i)+'</div></div>';}
function fileChip(f){const b=f.path.split(/[\\/]/).pop()||f.path;return '<span class="fp'+(f.edited?' ed':'')+'" title="'+esc((f.edited?'Edited: ':'Read: ')+f.path)+'">'+(f.edited?'✎ ':'')+esc(b)+'</span>';}
function relHtml(x){
return '<div class="rr" data-id="'+esc(x.id)+'" tabindex="0" title="'+esc(x.title+'\nShares '+x.shared+(x.shared===1?' file':' files')+' with this chat\n'+full(x.last))+'">'+dotHtml(x.id)+'<span class="t">'+esc(x.title)+'</span><span class="pill" title="Shared files">'+x.shared+'</span><span class="tm">'+shortAgo(x.last,Date.now())+'</span></div>';}
function exHtml(r){const e=ex[r.id];
let h='<div class="stat">'+esc(statsText(r))+'</div><div class="tgs"><input class="tin" list="tl" placeholder="+ tag" maxlength="40" aria-label="Add tag"></div>';
if(!e)return h+'<div class="m">Loading...</div>';
if(e.files.length)h+='<div class="cap">Files</div><div class="fps">'+e.files.map(fileChip).join('')+'</div>';
if(e.commands.length)h+='<div class="cap">Commands</div>'+e.commands.map(c=>'<div class="fi">'+esc(c)+'</div>').join('');
const rel=e.related||[];
h+=gitHtml(r,e);
h+=sec('rel:'+r.id,'Related chats',rel.length,rel.length?rel.map(relHtml).join(''):'<div class="m">None found</div>','sl');
h+=e.items.map(msgHtml).join('');
if(e.items.length<e.total)h+='<a data-a="more" role="button" tabindex="0">Show more ('+(e.total-e.items.length)+')</a>';
return h;}
function subRow(r,s){const now=Date.now();
return '<div class="rr sr" data-id="'+esc(r.id)+'" tabindex="0" role="button" aria-label="'+esc('Subagent'+(s.type?' '+s.type:'')+': '+(s.desc||'')+'. Resumes the parent chat')+'" title="'+esc('Subagent'+(s.type?' ('+s.type+')':'')+(s.desc?': '+s.desc:'')+'\nResumes the parent chat\n'+full(s.last))+'"><span class="t">'+subPill(s.type)+' '+(s.descShown?marked(s.descShown,s.descRanges):esc(s.desc||''))+'</span><span class="tm" title="'+esc(full(s.last))+'">'+shortAgo(s.last,now)+'</span>'+(s.snippet?'<div class="s">'+snip(s)+'</div>':'')+'</div>';}
function subsHtml(r){if(!r.subs||!r.subs.length)return '';const more=(r.subTotal||r.subs.length)-r.subs.length;
return r.subs.map(s=>subRow(r,s)).join('')+(more>0?'<div class="m sr">+'+more+' more subagent matches</div>':'');}
function rowHtml(r){
const now=Date.now(),p=pins.has(r.id),op=open.has(r.id),ia=arch.has(r.id);
const tip=[r.title,all.checked?r.project:'',hitTxt(r),full(r.last),statsText(r)].filter(Boolean).join('\n');
return '<div class="r" data-id="'+esc(r.id)+'" data-vscode-context="'+esc(JSON.stringify({webviewSection:'chat',id:r.id,ccsArchived:ia,ccsUnread:(dots[r.id]||{}).s==='unread'}))+'" tabindex="0" title="'+esc(tip)+'"><div class="rh"><div class="hd">'+dotHtml(r.id)+'<span class="t">'+(r.titleShown?marked(r.titleShown,r.titleRanges):esc(r.title))+'</span>'+pillHtml(r)+hitPill(r)
+(all.checked?'<span class="pj">'+esc(r.project)+'</span>':'')+gitIcon(r)
+'<button class="ic'+(op?' on':'')+'" data-a="exp" title="'+(op?'Collapse':'Expand')+'" aria-expanded="'+op+'">'+CHEV+'</button>'
+'<button class="ic ar'+(ia?' on':'')+'" data-a="arch" title="'+(ia?'Unarchive':'Archive')+'" aria-label="'+(ia?'Unarchive':'Archive')+'">'+ARCH_SVG+'</button>'
+'<button class="ic pn'+(p?' on':'')+'" data-a="pin" title="'+(p?'Unpin':'Pin')+'" aria-pressed="'+p+'">'+(p?'★':'☆')+'</button>'
+'<span class="tm" title="'+esc(full(r.last))+'">'+shortAgo(r.last,now)+'</span></div>'+metaHtml(r,now)+'<span class="chips">'+chips(r.id)+'</span>'
+(r.self===false?'<div class="msub">matched in subagent</div>':'')+(r.snippet&&r.self!==false?'<div class="s">'+snip(r)+'</div>':'')+subsHtml(r)+'</div>'+(op?'<div class="ex">'+exHtml(r)+'</div>':'')+'</div>';}
function groupsHtml(a){const now=Date.now(),g={};
a.forEach(r=>{const k=dayBucket(r.last,now);(g[k]=g[k]||[]).push(r);});
return DAY_ORDER.filter(k=>g[k]).map((k,i)=>sec('grp:'+k,k,g[k].length,g[k].map(rowHtml).join(''),'gh')).join('');}
function resultsHtml(rs){const a=ordered(rs);if(!a.length)return '';
if(sort.value==='time')return groupsHtml(a);
return sec('sec:res','Results',a.length,a.map(rowHtml).join(''),'sl',takeNote());}
function sessHtml(keep){if(!sessOn||!sess)return '';
const nm=lastMsg==='No matches'?'<div class="nm">No matches for <b>'+esc(lastQ)+'</b></div>':'';
if(!keep.length)return nm;
const a=ordered(keep,sort.value==='score'?'time':sort.value);
if(sort.value==='time')return nm+groupsHtml(a);
return nm+sec('sec:all','All sessions',a.length,a.map(rowHtml).join(''),'sl',takeNote());}
function pinnedLive(){return pinned.filter(r=>!arch.has(r.id));}
function pinShown(){return sessOn&&!lastQ&&!busy&&pinnedLive().length>0;}
function sessBase(){return hasResults||!sessOn||!sess?[]:(pinShown()?sess.rows.filter(r=>!pins.has(r.id)):sess.rows);}
function renderPinned(){
if(!pinShown()){pinEl.innerHTML='';return;}
const pl=pinnedLive();pinEl.innerHTML=sec('sec:pin','Pinned',pl.length,pl.map(rowHtml).join(''),'sl');}
function cnts(d,t,n){return d+' of '+t+' chats, '+n+(n===1?' match':' matches');}
function noteText(){if(hasResults||busy||(lastMsg&&lastMsg!=='No matches'))return lastMsg||'';
return sessOn&&sess&&(lastQ||sort.value!=='time')?sess.rows.length+' of '+sess.total+' chats':'';}
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
const base=hasResults?rs.filter(r=>!arch.has(r.id)):sessBase(),keep=stKeep(base);stUi(stCounts(base));
const capOn=capShown(),t=capOn?'':noteText(),hid=base.length-keep.length;
noteIn=t||hid?esc(t)+stNote(hid,!!t):'';
patch(list,hasResults?resultsHtml(keep):sessHtml(keep));
const used=noteIn==='';st.classList.toggle('vh',used);st.textContent=t+(hid?(t?' · ':'')+hid+' hidden by status filter':'');
if(!used){st.innerHTML=noteIn;noteIn='';}
$('cap').innerHTML=capHtml();renderPinned();renderArch();stSync();exSync();}
`;