/** Webview script part: row, group and section rendering. Shares top-level scope with webviewJs. */
export const RENDER = String.raw`
const CHEV='<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DOTS={g:'Active within the last 5 minutes',o:'Active within the last hour',n:'Last active more than an hour ago'};
function reEsc(t){return t.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&');}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function full(ms){return new Date(ms).toLocaleString();}
function sec(key,label,n,body,cls){const o=!col.has(key);
return '<div class="'+cls+(o?' open':'')+'" data-sec="'+esc(key)+'" role="button" tabindex="0" aria-expanded="'+o+'">'+CHEV+'<span>'+esc(label)+'</span><span class="pill">'+n+'</span></div>'+(o?body:'');}
function ordered(rs){const a=rs.slice();
if(sort.value==='time')a.sort((x,y)=>y.last-x.last);
else if(sort.value==='title')a.sort((x,y)=>x.title.toLowerCase().localeCompare(y.title.toLowerCase()));
else if(sort.value==='length')a.sort((x,y)=>(y.msgs||0)-(x.msgs||0));
else a.sort((x,y)=>y.score-x.score);
return a.filter(r=>pins.has(r.id)).concat(a.filter(r=>!pins.has(r.id)));}
function snip(r){let o='',p=0;for(const g of r.ranges){o+=esc(r.snippet.slice(p,g[0]))+'<mark>'+esc(r.snippet.slice(g[0],g[1]))+'</mark>';p=g[1];}
return o+esc(r.snippet.slice(p));}
function tagActive(t){return new RegExp('(^|\\s)tag:'+reEsc(t)+'(\\s|$)','i').test(q.value);}
function chips(id){return (tags[id]||[]).map(t=>'<span class="chip'+(tagActive(t)?' on':'')+'" data-a="tag" data-t="'+esc(t)+'" title="Filter by tag" role="button" tabindex="0">'+esc(t)+'<b class="cx" data-a="untag" data-t="'+esc(t)+'" title="Remove tag" aria-label="Remove tag '+esc(t)+'" role="button" tabindex="0">×</b></span>').join('');}
function msgHtml(i){return '<div class="mm"><span class="who">'+(i.role==='user'?'You':'Claude')+'</span> <span class="m" title="'+esc(full(i.ts))+'">'+shortAgo(i.ts,Date.now())+'</span><div class="b">'+snip(i)+'</div></div>';}
function fileChip(f){const b=f.path.split(/[\\/]/).pop()||f.path;return '<span class="fp'+(f.edited?' ed':'')+'" title="'+esc((f.edited?'Edited: ':'Read: ')+f.path)+'">'+(f.edited?'✎ ':'')+esc(b)+'</span>';}
function relHtml(x){const d=dotOf(x.last,Date.now());
return '<div class="rr" data-id="'+esc(x.id)+'" tabindex="0" title="'+esc(x.title+'\nShares '+x.shared+(x.shared===1?' file':' files')+' with this chat\n'+full(x.last))+'"><span class="dot '+d+'" title="'+DOTS[d]+'"></span><span class="t">'+esc(x.title)+'</span><span class="pill" title="Shared files">'+x.shared+'</span><span class="tm">'+shortAgo(x.last,Date.now())+'</span></div>';}
function exHtml(r){const e=ex[r.id];
let h='<div class="stat">'+esc(statsText(r))+'</div><div class="tgs"><input class="tin" list="tl" placeholder="+ tag" maxlength="40" aria-label="Add tag"></div>';
if(!e)return h+'<div class="m">Loading...</div>';
if(e.files.length)h+='<div class="cap">Files</div><div class="fps">'+e.files.map(fileChip).join('')+'</div>';
if(e.commands.length)h+='<div class="cap">Commands</div>'+e.commands.map(c=>'<div class="fi">'+esc(c)+'</div>').join('');
const rel=e.related||[];
h+=sec('rel:'+r.id,'Related chats',rel.length,rel.length?rel.map(relHtml).join(''):'<div class="m">None found</div>','sl');
h+=e.items.map(msgHtml).join('');
if(e.items.length<e.total)h+='<a data-a="more" role="button" tabindex="0">Show more ('+(e.total-e.items.length)+')</a>';
return h;}
function rowHtml(r){
const now=Date.now(),p=pins.has(r.id),op=open.has(r.id),d=dotOf(r.last,now);
const tip=[r.title,all.checked?r.project:'',r.hits?r.hits+(r.hits===1?' hit':' hits'):'',full(r.last),statsText(r)].filter(Boolean).join('\n');
return '<div class="r" data-id="'+esc(r.id)+'" tabindex="0" title="'+esc(tip)+'"><div class="rh"><div class="hd"><span class="dot '+d+'" title="'+DOTS[d]+'"></span><span class="t">'+esc(r.title)+'</span>'
+(all.checked?'<span class="pj">'+esc(r.project)+'</span>':'')+'<span class="chips">'+chips(r.id)+'</span>'
+'<button class="ic'+(op?' on':'')+'" data-a="exp" title="'+(op?'Collapse':'Expand')+'" aria-expanded="'+op+'">'+CHEV+'</button>'
+'<button class="ic pn'+(p?' on':'')+'" data-a="pin" title="'+(p?'Unpin':'Pin')+'" aria-pressed="'+p+'">'+(p?'★':'☆')+'</button>'
+'<span class="tm" title="'+esc(full(r.last))+'">'+shortAgo(r.last,now)+'</span></div>'
+(r.snippet?'<div class="s">'+snip(r)+'</div>':'')+'</div>'+(op?'<div class="ex">'+exHtml(r)+'</div>':'')+'</div>';}
function resultsHtml(rs){const a=ordered(rs);if(!a.length)return '';
if(sort.value==='time'){const now=Date.now(),g={};
a.forEach(r=>{const k=dayBucket(r.last,now);(g[k]=g[k]||[]).push(r);});
return DAY_ORDER.filter(k=>g[k]).map(k=>sec('grp:'+k,k,g[k].length,g[k].map(rowHtml).join(''),'gh')).join('');}
return sec('sec:res','Results',a.length,a.map(rowHtml).join(''),'sl');}
function renderHist(){
if(!idle()||!history.length){hist.innerHTML='';return;}
hist.innerHTML=sec('sec:hist','Recent searches',history.length,history.map((h,i)=>{
const f=(h.cs?'Aa ':'')+(h.ww?'ab ':'')+(h.re?'.*':'');
return '<div class="h" data-i="'+i+'" title="'+esc(h.query)+'" role="button" tabindex="0"><span class="q">'+esc(h.query)+'</span><span class="fl">'+esc(f.trim())+'</span><button class="x" data-x="'+i+'" title="Remove" aria-label="Remove">×</button></div>';
}).join('')+'<div class="cap"><a id="clr" role="button" tabindex="0">Clear history</a></div>','sl');}
function renderPinned(){
if(!idle()||q.value.trim()||!pinned.length){pinEl.innerHTML='';return;}
pinEl.innerHTML=sec('sec:pin','Pinned',pinned.length,pinned.map(rowHtml).join(''),'sl');}
function stText(){const m=lastMsg||'';return ix&&dirty?'Searching what is indexed so far ('+ix.done+' of '+ix.total+' chats)'+(m?' - '+m:''):m;}
function render(rs,msg){lastRs=rs;lastMsg=msg;hasResults=rs.length>0;st.textContent=stText();
list.innerHTML=resultsHtml(rs);renderIdle();}
`;
