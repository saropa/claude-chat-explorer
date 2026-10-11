/** Project status layer of the page script: ONE overview table "Work", a row per branch (its worktree and pull request folded in, plus pull-request-only rows, remote-only branches and folders git does not list),
 *  grouped by what the owner has to do (Needs you, Unfinished work, Waiting, Safe to remove, Idle), with a headline in plain words on top, the chats inside the row they belong to (closed by default,
 *  the creator chat named in the Created cell), and "Chats without a branch" at the bottom, closed.
 *  Shares the page's top-level scope (GIT_JS, PR_JS and VIEW_JS run before it, CORE after); nothing here touches the page at load. */
export const OW_STATUS_JS = String.raw`
const BAND_RANK=['needs','finish','waiting','tidy','idle'];
let tabDone={},curAnn=null,curRk='',rels={},psMore={};
const PS_PAGE=5,PS_STEP=20,PR_NOTE='Pull request author is not shown: the read-only pull request list does not return it.';
/** The chats of one row that are listed now: the 5 newest, and 20 more per click on Show more. */
function psList(it){const l=it.vis.concat(it.nr||[]),lim=PS_PAGE+(psMore[it.hk]||0);return{l:l.slice(0,lim),left:Math.max(0,l.length-lim)};}
function attn(r){return bandHeld(r,dotOf(r.id))!=='idle';}
function hxKeyS(x){return 'x:'+String(x).slice(0,60);}
/** A row's chat list is closed until opened. */
function hxOn(it){const v=sec[hxKeyS(it.hk)];return v!==undefined?v:false;}
function hxSet(x,on){sec[hxKeyS(x)]=on;refocus='[data-a="hx"][data-x="'+x.replace(/[^A-Za-z0-9:_-]/g,'')+'"]';saveView();render();}
function psRow(r,it){const t=r.id===tabId&&!tabDone[r.id];if(t)tabDone[r.id]=1;curAnn=it&&it.an?it.an[r.id]||null:null;const h=rowHtml(r,t);curAnn=null;return h;}
const REL_NAME={'cwd':'ran in the folder','git-branch-field':'its rows record the branch','created-by-tool-call':'created it','subagent':'via a subagent','name-in-text':'name in the chat','files-touched':'touched its files','time-window':'active at that time'};
const REL_SHORT={'cwd':'folder','git-branch-field':'branch','created-by-tool-call':'created','subagent':'subagent','name-in-text':'name','files-touched':'files','time-window':'time'};
function relBadge(a){if(!a)return '';const nr=a.n!==undefined;return '<span class="bd '+(a.c==='certain'?'bd-info':'bd-muted')+'" data-rel="'+esc(a.c)+'">'+esc(nr?'nearest by time (probable)':a.c==='mention'?'mention only':(a.c==='probable'?'probable: ':'')+(REL_SHORT[a.y]||a.y))+'</span> ';}
function relTip(a){if(!a)return '';const o=a.n!==undefined?[]:['Related by: '+(REL_NAME[a.y]||a.y)+' ('+a.c+')'];if(a.m&&a.m.length)o.push('Also: '+a.m.map(x=>REL_NAME[x]||x).join(', '));if(a.t&&a.n===undefined)o.push(a.t);
if(a.n!==undefined){const h=Math.round(Math.abs(a.n)/3600000);o.push('Nearest by time (probable): '+(a.n===0?'overlaps':a.n<0?'ended '+(h<48?h+' h':Math.round(h/24)+' days')+' before the branch was made':'started '+(h<48?h+' h':Math.round(h/24)+' days')+' after the branch was last changed'));}
if(a.c==='probable')o.push('Probable: no chat is certain for this row');if(a.c==='mention')o.push('Mention only: the chat contains the name but did not create it or work in it');return o.join('\n');}
function relAnn(h){return{y:h.why,c:h.conf,m:h.more,t:h.note,n:h.near,cr:h.cr===true,rc:h.rc};}
function mxKey(it){return it.hk+':m';}
function mxOn(it){return sec[hxKeyS(mxKey(it))]===true;}
/** The chats of one row: those the folder or branch logic found (certain), merged with the matcher's hits. crs: the creators (a tool call of the chat or of its subagent made the row), with their receipts. */
function psMerge(rl,kind,key,base,byId,shown,sort){const hits=rl&&rl[kind]&&Array.isArray(rl[kind][key])?rl[kind][key]:[],have={},rows=[],an={},near=[],men=[],crs=[];let relN=0;
base.forEach(r=>{have[r.id]=1;rows.push(r);an[r.id]={y:'cwd',c:'certain',t:kind==='w'?'The chat ran in this worktree':'The chat folder has this branch checked out'};});
hits.forEach(h=>{if(h.cr===true&&h.conf==='certain')crs.push({id:h.id,rc:Array.isArray(h.rc)?h.rc:[]});const r=byId[h.id];if(h.near!==undefined){if(r&&shown(r))near.push(r),an[r.id]=relAnn(h);return;}
if(!r){relN++;return;}if(have[h.id]){if(h.conf!=='mention')an[h.id]=relAnn(h);return;}have[h.id]=1;an[h.id]=relAnn(h);if(h.conf==='mention'){if(shown(r))men.push(r);return;}rows.push(r);});
rows.sort(sort);men.sort(sort);return{rows:rows,an:an,near:near,men:men,relN:relN,crs:crs};}
/** Two merged chat sets of one row (its worktree's and its branch's), each chat once; a creator note from either side is kept. */
function psJoin(a,b){if(!a)return b;if(!b)return a;const have={},rows=[],near=[],men=[],an=Object.assign({},b.an,a.an),crs=a.crs.map(c=>({id:c.id,rc:c.rc.slice()}));
[a,b].forEach(m=>m.rows.forEach(r=>{if(!have[r.id]){have[r.id]=1;rows.push(r);}}));[a,b].forEach(m=>m.near.forEach(r=>{if(!have[r.id]){have[r.id]=1;near.push(r);}}));[a,b].forEach(m=>m.men.forEach(r=>{if(!have[r.id]){have[r.id]=1;men.push(r);}}));
Object.keys(b.an).forEach(id=>{const x=b.an[id];if(x.cr&&!(an[id]&&an[id].cr))an[id]=x;});
b.crs.forEach(c=>{const o=crs.find(x=>x.id===c.id);if(!o)crs.push({id:c.id,rc:c.rc.slice()});else c.rc.forEach(p=>{if(!o.rc.some(q=>q.u===p.u&&q.c===p.c))o.rc.push(p);});});
return{rows:rows,an:an,near:near,men:men,relN:a.relN+b.relN,crs:crs};}
/** The creator of a row: the chat whose tool call made it first (earliest receipt); its receipts. */
function psCreator(crs){let best=null;crs.forEach(c=>{const t=c.rc.length?Math.min.apply(null,c.rc.map(p=>p.t||Infinity)):Infinity;if(!best||t<best.t)best={id:c.id,rc:c.rc,t:t};});return best;}
function psUtc(ms){return new Date(ms).toISOString().slice(0,19).replace('T',' ')+' UTC';}
/** Created cell tooltip: the exact time and, per receipt, the tool call time, the command and the transcript line. */
function psCreatedTip(it){const o=[];const ms=it.created?it.created*1000:0;if(ms)o.push('Created '+psUtc(ms)+', local '+new Date(ms).toLocaleString()+(it.crTitle?' by chat "'+it.crTitle+'"':''));else if(it.crTitle)o.push('Created by chat "'+it.crTitle+'"');
(it.cr?it.cr.rc:[]).slice(0,2).forEach(p=>{o.push('Tool call at '+(p.t?psUtc(p.t):'unknown time'));o.push('Command: '+(p.c||'').slice(0,200));o.push('Transcript line '+p.l+', tool_use '+(p.u||'?')+(p.a?', subagent '+String(p.a).slice(0,8):''));});
if(!o.length)o.push(it.info&&it.info.au?'Last commit by '+it.info.au+'. No chat is known to have created this.':'No creation time is known.');return o.join('\n');}
function psEvid(k,rp,info,w,hasNear){const rl=rels[k],busy=rp.st==='running'||rp.st==='queued'||scanLive;
if(!rl&&busy)return 'Matching chats...';
return !rl?'chat matching not finished':!rl.ok?(rl.indexing?'chats are still being indexed':'chat matching unavailable'):'no matching chat found'+(hasNear?'; nearest by time is listed':'');}
function psKey(){return Object.keys(repos).filter(k=>{const rp=repos[k];return rp&&rp.name&&rp.ws;}).sort()[0]||'';}
function psHit(hay){return !fq||filterMatch(hay,fq);}
function hxKey(p,n){return p+':'+String(n).replace(/[^A-Za-z0-9_-]/g,'_');}
function psModel(k){const rp=repos[k],p=prsOn?prs[k]:null,m=new Map();
const get=n=>{let r=m.get(n);if(!r){r={name:n,local:false,wt:null,pr:null,info:null};m.set(n,r);}return r;};
(rp.branches||[]).forEach(b=>{const r=get(b.n);r.local=true;r.info=b;});
(rp.worktrees||[]).forEach(w=>{if(!w.detached&&w.branch){const r=get(w.branch);r.local=true;r.wt=w;}});
(rp.remotes||[]).forEach(b=>{const r=get(b.n);r.remote=true;if(!r.local&&!r.info)r.info={n:b.n,ts:b.ts,au:b.au,cr:0,up:true,gone:false,a:undefined,b:undefined};});
if(p)psPrList(p).forEach(x=>{const r=get(x.b);r.pr={n:x.n,title:x.title,draft:x.draft,review:x.review,link:x.link,c:p.chk[x.n]||null};});
return{rp:rp,p:p,list:Array.from(m.values()),wts:rp.worktrees||[],byName:m};}
function psPrList(p){const l=(p.all||[]).slice();Object.keys(p.by||{}).forEach(b=>{if(!l.some(x=>x.b===b))l.push(Object.assign({b:b},p.by[b]));});return l;}
function psWFacts(w){if(w.facts&&w.facts.ok)return w.facts;for(let i=0;i<(w.fks||[]).length;i++){const e=gs[w.fks[i]];if(e&&e.st==='ok'&&e.f)return{ok:true,fileTotal:e.f.fileTotal||0,ahead:e.f.ahead||0,behind:e.f.behind||0,gone:!!e.f.gone,files:e.f.files||[]};}return w.facts||null;}
function psPrFact(pr){return pr?{n:pr.n,review:pr.review||'',draft:!!pr.draft,checks:pr.c&&pr.c.st!=='checking'?pr.c.st:'unknown'}:undefined;}
function psIsMerged(rp,name){return !!(name&&name!==rp.defLocal&&rp.mset&&rp.mset[name]);}
function psWView(rp,w,pr){const f=psWFacts(w),ok=!!(f&&f.ok),q=psPrFact(pr),g={wt:true,ok:ok,files:ok?f.fileTotal:0,ahead:ok?f.ahead:0,gone:ok?!!f.gone:false,locked:!!w.locked&&!w.main,pr:q};
g.ready=wtReady(w,ok?{ok:true,files:g.files,ahead:g.ahead,gone:g.gone,pr:q}:undefined,wtOpen(w));return g;}
function psBr(k,rp,b,n){if(!b)return '<span class="nb">—</span>';const pl=prsOn?prs[k]:null;if(!rp.gh||(pl&&pl.st==='unavailable'&&pl.reason==='not a GitHub repository'))return '<code>'+esc(b)+'</code>';
return '<button type="button" class="lk" data-a="brl" data-k="'+esc(k)+'" data-b="'+esc(b)+'" data-n="'+(n||0)+'" data-tip="'+esc(n?'Open pull request #'+n+' on GitHub':'Open the branch on GitHub')+'">'+esc(b)+'</button>';}
function psAb(a,b){if(typeof a!=='number'||typeof b!=='number')return '<span class="nb" data-tip="Not read">—</span>';return a>0||b>0?'<span class="ah" data-tip="'+esc(countWord(a,'commit')+' ahead of and '+countWord(b,'commit')+' behind the default branch')+'">'+(a>0?'↑'+a:'')+(a>0&&b>0?' ':'')+(b>0?'↓'+b:'')+'</span>':'<span class="q" data-tip="Level with the default branch">level</span>';}
function psAgo(ms){return ms?shortAgo(ms,Date.now()):'';}
/** The pull request cell: the number (a link when the host has its address), draft, and one checks mark. */
function psPrCell(k,pr){if(!pr)return '<span class="nb">—</span>';const c=pr.c,ck=c&&c.st!=='checking'&&c.st!=='unavailable'&&c.st!=='none'?'<span class="ck '+(c.st==='failing'?'fail':c.st==='pending'?'pend':'pass')+'" data-tip="'+esc(ckTip(c))+'">'+(c.st==='failing'?'✗':c.st==='pending'?'◔':'✓')+'</span>':c&&c.st==='checking'?SPINP:'';
const num=pr.link?'<button type="button" class="lk" data-a="pr" data-k="'+esc(k)+'" data-n="'+pr.n+'" data-tip="'+esc('Open pull request #'+pr.n+(pr.title?': '+pr.title:'')+(pr.review?' ('+pr.review+')':''))+'">#'+pr.n+'</button>':'<span data-tip="'+esc(pr.title||'')+'">#'+pr.n+'</span>';
return num+(pr.draft?' <span class="q">draft</span>':'')+' '+ck;}
function psChatsCell(it){const nr=it.nr||[],n=it.vis.length+nr.length;
if(!n)return '<span class="nb" data-tip="'+esc(it.ev||'')+'">'+(it.relN>0?'0':'—')+'</span>'+(it.relN>0?' <span class="q hid" data-tip="'+esc(countWord(it.relN,'chat')+' relate to this row but are older than the days shown')+'">+'+it.relN+'</span>':'')+((it.mn||[]).length?' <span class="q" data-tip="Chats that only contain the name">'+it.mn.length+' mention'+(it.mn.length===1?'':'s')+'</span>':'');
const on=hxOn(it);return '<button type="button" class="ab hxb" data-a="hx" data-x="'+esc(it.hk)+'" data-on="'+(on?1:0)+'" aria-expanded="'+on+'" aria-label="'+esc(countWord(n,'chat')+' in '+it.name)+'" data-tip="'+esc((on?'Hide ':'Show ')+countWord(n,'chat')+' in '+it.name+(nr.length&&!it.vis.length?'. '+it.ev+' (nearest by time, probable)':''))+'"><span class="car" aria-hidden="true"></span>'+n+'</button>';}
function psMen(it){const mn=it.mn||[];if(!mn.length)return '';const on=mxOn(it);return '<p class="sub mnp"><button type="button" class="ab hxb mnb" data-a="hx" data-x="'+esc(mxKey(it))+'" data-on="'+(on?1:0)+'" aria-expanded="'+on+'" data-tip="'+esc('Chats that only contain the name of '+it.name+': none of them created it or worked in it')+'"><span class="car" aria-hidden="true"></span>Mentions only ('+mn.length+')</button></p>'+(on?'<div class="nest mnl" role="list" aria-label="'+esc('Chats that only mention '+it.name)+'">'+mn.map(r=>psRow(r,it)).join('')+'</div>':'');}
function psChatRow(it){if(!hxOn(it))return '';const o=psList(it),mp=psMen(it);return o.l.length||mp?'<div class="hxr" role="row">'+(o.l.length?'<div class="nest" role="list" aria-label="'+esc('Chats in '+it.name)+'">'+o.l.map(r=>psRow(r,it)).join('')+(o.left>0?'<p class="sub"><button type="button" class="ab" data-a="hxm" data-x="'+esc(it.hk)+'">Show '+Math.min(PS_STEP,o.left)+' more</button> <span class="q">'+o.left+' not listed yet, newest first</span></p>':'')+'</div>':'')+mp+'</div>':'';}
/** The Ask buttons of a row whose creator chat is known: copy the clean-up prompt, or open the chat with the prompt on the clipboard. */
function psAsk(k,it){if(!it.cr)return '';const t=it.crTitle||'the creator chat',x=' data-k="'+esc(k)+'" data-c="'+esc(it.cr.id)+'" data-b="'+esc(it.r?it.r.name:'')+'" data-w="'+esc(it.w?it.w.k:it.s?it.s.k:'')+'"';
return ibtn('cu','Ask '+t+' to clean up: copy the prompt','askcopy','Ask '+t+' to clean up: copy a prompt with receipts (what it created, when, the command, the reflog and the current state)',x+' data-m="copy"')+ibtn('cu','Ask '+t+' to clean up: open the chat','ask','Ask '+t+' to clean up: open the chat; the prompt is copied so you can paste it',x+' data-m="resume"');}
function psTags(v){const t=v.tags||[];if(!t.length)return '';return t.slice(0,2).map(x=>'<span class="bd bd-muted">'+esc(x)+'</span>').join(' ')+(t.length>2?' <span class="q" data-tip="'+esc(t.slice(2).join(', '))+'">+'+(t.length-2)+'</span>':'');}
/** One row of the Work table: name with its reason, created, pull request, distance from the default branch, chats, actions. */
function psWrow(k,B,it){const rp=B.rp,v=it.v,w=it.w,r=it.r,ready=!!(w&&!w.main&&it.ready);
const nm=it.s?'<span class="pn bn" data-tip="'+esc(it.s.path)+'">'+esc(it.name)+'</span>':'<span class="bn">'+(r?psBr(k,rp,r.name,it.pr&&it.pr.link?it.pr.n:0):'<span class="bn-t" data-tip="'+esc(w?w.path||'':'')+'">'+esc(it.name)+(w&&w.detached?' <span class="q">detached '+esc(w.sha||'')+'</span>':'')+'</span>')+'</span>';
const wtn=w&&!w.main&&r?' <span class="wtn pn" data-tip="'+esc(w.path||w.name)+'">'+esc(w.name)+'</span>':'';
const why='<div class="why" data-g="'+v.group+'"><span class="vd vd-'+v.group+'">'+esc(v.state)+'</span> <span class="rs">'+esc(v.reason)+'</span> '+psTags(v)+'</div>';
const cre='<span class="cw" data-tip="'+esc(psCreatedTip(it))+'">'+(it.created?esc(psAgo(it.created*1000)):'<span class="nb">—</span>')+'</span>'+(it.crTitle?'<span class="cby"> by '+(it.cr&&it.cr.id?'<button type="button" class="lk" data-a="opc" data-c="'+esc(it.cr.id)+'" data-tip="'+esc('Open the chat that created this: '+it.crTitle)+'">'+esc(it.crTitle)+'</button>':esc(it.crTitle))+'</span>':it.info&&it.info.au&&it.created?'<span class="cby q"> by '+esc(it.info.au)+'</span>':'');
const acts=psAsk(k,it)+(ready?ibtn('rm','Copy '+cw()+'remove command: '+it.name,'trash','Copy a '+cw()+'command that removes this finished worktree. Nothing is run.',' data-k="'+esc(w.k)+'"'):'')+(it.pr&&it.pr.link?ibtn('prc','Copy the link of pull request #'+it.pr.n,'link','Copy the pull request link',' data-k="'+esc(k)+'" data-n="'+it.pr.n+'"'):'');
return '<div class="wr" role="row" data-g="'+v.group+'"'+(w?' data-w="'+esc(w.k)+'"':'')+(r?' data-b="'+esc(r.name)+'"':'')+(it.s?' data-s="'+esc(it.s.k)+'"':'')+'><div class="c-nm" role="cell"><div class="nl">'+nm+wtn+'</div>'+why+'</div>'
+'<div class="c-cr" role="cell" data-l="Created">'+cre+'</div><div class="c-pr" role="cell" data-l="PR">'+psPrCell(k,it.pr)+'</div><div class="c-vs" role="cell" data-l="vs default">'+(it.s?'<span class="nb">—</span>':psAb(it.va,it.vb))+'</div><div class="c-ch" role="cell" data-l="Chats">'+psChatsCell(it)+'</div><div class="c-ac acts2" role="cell">'+acts+'</div></div>'+psChatRow(it);}
function psHead(){return '<div class="wh" role="row"><span role="columnheader">Branch</span><span role="columnheader">Created</span><span role="columnheader" data-tip="'+esc(prsOn?PR_NOTE:PRS_OFF+' '+PR_NOTE)+'">PR</span><span role="columnheader" data-tip="Commits ahead of and behind the default branch">vs default</span><span role="columnheader">Chats</span><span role="columnheader"></span></div>';}
function psGroup(k,B,g,list){const open=secOpen('g:'+g),t=GROUP_LABEL[g];
return '<section class="band ps wg g-'+g+'" aria-label="'+esc(t)+'"><h2 class="bh tg g-'+g+(open?' op':'')+'" role="heading" aria-level="2"><button type="button" class="ab" data-a="sec" data-s="g:'+g+'" aria-expanded="'+open+'" data-tip="'+esc((open?'Collapse ':'Expand ')+t)+'">'+esc(t)+'</button><span class="pill">'+list.length+'</span><span class="chv" aria-hidden="true"></span></h2>'+(open?'<div class="wk" role="table" aria-label="'+esc(t)+'">'+list.map(it=>psWrow(k,B,it)).join('')+'</div>':'')+'</section>';}
function psSort(a,b){if(sortMode==='name')return a.name.localeCompare(b.name);return b.ts-a.ts||a.name.localeCompare(b.name);}
/** Everything the page shows: one item per branch (with its worktree and pull request), per worktree without a branch, per unregistered folder; verdict, creator, chats. */
function psBuild(k,vis){tabDone={};curRk=k;const M=psModel(k),rp=M.rp,chats=vis.filter(r=>r.kind!=='wt'),byW={},byB={},nb=[];
/* A chat attaches by folder to its worktree, by branch to the worktree that has the branch checked out, and by branch to its branch row. */
chats.slice().sort(rowCmp(sortMode)).forEach(r=>{const e=fOf(r),f=e&&e.f,inR=!!(f&&f.rk===k&&f.branch&&!f.detached),br=inR?M.byName.get(f.branch):null,
w=(r.fk&&M.wts.find(x=>x.fks&&x.fks.indexOf(r.fk)>=0))||(inR?M.wts.find(x=>!x.detached&&x.branch===f.branch):null)||null;
if(w)(byW[w.k]=byW[w.k]||[]).push(r);
if(br)(byB[br.name]=byB[br.name]||[]).push(r);
if(!w&&!br)nb.push(r);});
const rl=rels[k]&&rels[k].ok?rels[k]:null,byId={},used={},srt=rowCmp(sortMode),def=rp.defLocal||'';chats.forEach(r=>{byId[r.id]=r;});
const mg=(kind,key,base)=>{const m=psMerge(rl,kind,key,base,byId,()=>true,srt);m.rows.concat(m.near,m.men).forEach(r=>{used[r.id]=1;});return m;};
const items=[];
const mk=(r,w,s)=>{const name=s?s.name:r?r.name:w.name,pr=r?r.pr:null,info=r?r.info:null,f=w?psWFacts(w):null,ok=!!(f&&f.ok),g=w?psWView(rp,w,pr):{ok:true,files:0,ahead:0,gone:!!(info&&info.gone),branch:name,pr:psPrFact(pr)};
const m=psJoin(w?mg('w',w.k,byW[w.k]||[]):s?mg('w',s.k,[]):null,r?mg('b',r.name,byB[r.name]||[]):null)||{rows:[],an:{},near:[],men:[],relN:0,crs:[]};
const cr=psCreator(m.crs),crr=cr?byId[cr.id]:null,chatSt=m.rows.some(c=>dotOf(c.id)==='waiting')?'waiting':m.rows.some(c=>dotOf(c.id)==='unread')?'unread':m.rows.some(c=>dotOf(c.id)==='running')?'running':'';
const isDef=!!r&&r.name===def&&!(w&&w.detached);
const v=workVerdict({name:name,defName:def,isDef:isDef,local:!!(r&&r.local)||(!r&&!!w),remote:!!(r&&r.remote),stray:s?{git:!!s.git}:null,
wt:w?{missing:!!w.missing,main:!!w.main,locked:!!w.locked,ws:!!w.ws,known:ok,unread:ok?'':rp.st==='timeout'?'timed out':rp.st==='error'?'error':(rp.st==='running'||rp.st==='queued'||scanLive)?'still reading':'no answer',files:ok?f.fileTotal:0,unpushed:ok?f.ahead:0,behind:w.db||0,gone:ok?!!f.gone:false,merged:w.merged}:null,
a:isDef&&ok?f.ahead:w&&typeof w.da==='number'?w.da:info&&typeof info.a==='number'?info.a:undefined,bh:isDef&&ok?f.behind:w&&typeof w.db==='number'?w.db:info&&typeof info.b==='number'?info.b:undefined,
up:info?!!info.up:ok?!!f.upstream:false,gone:ok?!!f.gone:!!(info&&info.gone),merged:psIsMerged(rp,name),
pr:pr?{n:pr.n,checks:psPrFact(pr).checks,review:pr.review||'',draft:!!pr.draft}:null,chat:chatSt});
const lastC=m.rows.reduce((a,c)=>Math.max(a,c.last||0),0);
const it={w:w,r:r,s:s||null,pr:pr,info:info,g:g,name:name,hk:hxKey(s?'s':w?'w':'b',s?s.k:w?w.k:name),chatsAll:m.rows,vis:m.rows,nr:m.near,mn:m.men,an:m.an,relN:m.relN,v:v,cr:cr,crTitle:cr?(crr?crr.title||'Untitled chat':'an older chat'):'',isDef:isDef,
created:(info&&info.cr)||(cr&&cr.t&&cr.t!==Infinity?Math.round(cr.t/1000):0)||0,ts:Math.max(info?info.ts:0,lastC/1000),ready:!!(w&&!w.main&&g.ready),
va:isDef&&ok?f.ahead:w&&typeof w.da==='number'?w.da:info?info.a:undefined,vb:isDef&&ok?f.behind:w&&typeof w.db==='number'?w.db:info?info.b:undefined};
it.ev=psEvid(k,rp,info,w,m.near.length>0);
const hay=[name,w?w.name:'',w?w.path:'',w?w.branch:'',pr?'#'+pr.n+' '+pr.title:'',it.crTitle,info?info.au:'',s?s.path:''].join(' ');
const own=!filtering()||(psHit(hay)&&flagPass(g,flt));it.show=own||m.rows.length>0;items.push(it);};
M.list.forEach(r=>mk(r,r.wt,null));
M.wts.forEach(w=>{if(w.detached&&!w.main)mk(null,w,null);});
(rp.stray||[]).forEach(s=>mk(null,null,s));
const quiet=it=>it.isDef&&(it.v.group==='idle'||it.v.group==='tidy'),all=items.filter(it=>!(quiet(it)&&!it.chatsAll.length&&!it.nr.length&&!it.mn.length)); /* the default branch is listed when it has something open or chats; a quiet one with no chat says nothing */
const shown=all.filter(it=>it.show),grp={needs:[],finish:[],waiting:[],tidy:[],idle:[]};
shown.forEach(it=>grp[it.v.group].push(it));BAND_RANK.forEach(g=>{grp[g].sort(psSort);});
const nb2=nb.filter(r=>!used[r.id]);
return{M:M,rp:rp,p:M.p,all:all,shown:shown,grp:grp,nb:nb2,nbAll:nb2.length,tot:{br:all.filter(it=>!it.s&&!(it.isDef&&(it.v.group==='idle'||it.v.group==='tidy'))).length,wt:M.wts.length,pr:M.list.filter(r=>r.pr).length,ch:chats.length,st:all.filter(it=>it.s).length}};}
function psOrder(B){const o=[],seen={},add=r=>{if(!seen[r.id]){seen[r.id]=1;o.push(r.id);}};BAND_RANK.forEach(g=>{if(hidden.indexOf(g)<0&&secOpen('g:'+g))B.grp[g].forEach(it=>{if(hxOn(it))psList(it).l.forEach(add);});});if(secOpen('nb'))B.nb.forEach(add);return o;}
/** The state of the pull request lookup, in the repository line: looking up, or why it is unknown with a retry. */
function psPrState(k,M){if(!prsOn)return '';const p=M.p;if(!p||p.st==='queued'||p.st==='checking')return ' '+SPINP+' <span class="q">Looking up pull requests</span>';
if(p.st==='unavailable'){const rt=prRetryKey({p:p,rk:k});return ' '+prUnk(p.reason)+(rt?' '+ibtn('fretry','Retry the pull request lookup','retry','Look up the pull requests again',' data-k="'+esc(rt)+'"'):'');}return '';}
function psHeadline(B){return workHeadline(B.all.filter(it=>!it.s&&!(it.isDef&&(it.v.group==='idle'||it.v.group==='tidy'))).map(it=>({group:it.v.group,state:it.v.state})),B.tot.st,scanComplete());}
function psRepo(k,B){const rp=B.rp,busy=rp.st==='running'||rp.st==='queued',bad=rp.st==='timeout'||rp.st==='error',M=B.M;
let h='<div class="psl" data-rk="'+esc(k)+'"><span class="pn psn">'+esc(rp.name)+'</span>'+(rp.gh?ibtn('repolink','Open '+rp.name+' on GitHub','open','Open the repository on GitHub',' data-k="'+esc(k)+'"'):'')
+(busy?' '+SPIN:'')+(bad?' <span class="q">'+esc(rp.st==='timeout'?'timed out':'error')+'</span> '+ibtn('fretry','Retry reading '+rp.name,'retry','Read this repository again',' data-k="'+esc(k)+'"'):'')+psPrState(k,M)+'</div>';
if(!M.wts.length&&busy)return h+'<p class="sub">Reading git...</p>';
h+='<p class="hl" role="status">'+esc(psHeadline(B))+'</p>';
const total=B.all.length,shown=BAND_RANK.reduce((n,g)=>n+(hidden.indexOf(g)<0?B.grp[g].length:0),0);
if(shown<total)h+='<p class="sub psh" role="status">'+shown+' of '+total+' rows shown: '+(filtering()?'the filters and ':'')+'the group buttons above hide the rest. <button type="button" class="ab" data-a="showall">Show all</button></p>';
let first=true;BAND_RANK.forEach(g=>{if(hidden.indexOf(g)>=0||!B.grp[g].length)return;if(first){h+=psHead();first=false;}h+=psGroup(k,B,g,B.grp[g]);});
if(B.nbAll>0)h+='<section class="band ps" aria-label="Chats without a branch"><h2 class="bh tg g-ps'+(secOpen('nb')?' op':'')+'" role="heading" aria-level="2"><button type="button" class="ab" data-a="sec" data-s="nb" aria-expanded="'+secOpen('nb')+'" data-tip="'+(secOpen('nb')?'Collapse':'Expand')+' Chats without a branch. Chats whose folder is not in this repository, is not a git folder, or whose branch was not found.">Chats without a branch</button> <span class="pill">'+B.nb.length+'</span><span class="chv" aria-hidden="true"></span></h2>'+(secOpen('nb')?'<div class="nest" role="list">'+B.nb.map(psRow).join('')+'</div>':'')+'</section>';
return h;}
function noRepoHtml(){return wsN===0||(ended&&!scanLive)||notes.gitMissing?'<p class="msg" role="status">Open a git repository folder.</p>':'<p class="msg" role="status">Reading git...</p>';}
`;
