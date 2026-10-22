/** Project status layer of the page script: ONE overview table "Work", a row per branch (its worktree and pull request folded in, plus pull-request-only rows, remote-only branches and folders git does not list),
 *  grouped by what the owner has to do (Your move, In progress, Safe to remove, Everything else), each row "do X, because Y" with one action, a headline in plain words on top, the chats inside the row they belong to (closed by default,
 *  the creator chat named in the row's overflow popover), and the chats without a branch inside Everything else.
 *  Shares the page's top-level scope (GIT_JS, PR_JS and VIEW_JS run before it, CORE after); nothing here touches the page at load. */
export const OW_STATUS_JS = String.raw`
const BAND_RANK=['needs','waiting','tidy','idle'];
let waitN=0,tabDone={},curAnn=null,curRk='',rels={},psMore={};
const PS_PAGE=5,PS_STEP=20,PR_NOTE='Pull request author is not shown: the read-only pull request list does not return it.';
/** The chats of one row that are listed now: the 5 newest, and 20 more per click on Show more. */
function psList(it){const l=it.vis.concat(it.nr||[]),lim=PS_PAGE+(psMore[it.hk]||0);return{l:l.slice(0,lim),left:Math.max(0,l.length-lim)};}
function attn(r){return bandHeld(r,dotOf(r.id))!=='idle';}
function hxKeyS(x){return 'x:'+String(x).slice(0,60);}
/** A row's chat list is closed until opened. */
function hxOn(it){const v=sec[hxKeyS(it.hk)];return v!==undefined?v:false;}
function hxSet(x,on){sec[hxKeyS(x)]=on;refocus='[data-a="hx"][data-x="'+x.replace(/[^A-Za-z0-9:_-]/g,'')+'"]';saveView();render();}
function psRow(r,it){curHk=it&&it.hk?it.hk:'nb';const t=r.id===tabId&&!tabDone[r.id];if(t)tabDone[r.id]=1;curAnn=it&&it.an?it.an[r.id]||null:null;const h=rowHtml(r,t);curAnn=null;curHk='';return h;}
const REL_NAME={'cwd':'ran in the folder','git-branch-field':'its rows record the branch','created-by-tool-call':'created it','subagent':'via a subagent','name-in-text':'name in the session','files-touched':'touched its files','time-window':'active at that time'};
const REL_SHORT={'cwd':'folder','git-branch-field':'branch','created-by-tool-call':'created','subagent':'subagent','name-in-text':'name','files-touched':'files','time-window':'time'};
function relBadge(a){if(!a)return '';const nr=a.n!==undefined;return '<span class="bd '+(a.c==='certain'?'bd-info':'bd-muted')+'" data-rel="'+esc(a.c)+'">'+esc(nr?'nearest by time (probable)':a.c==='mention'?'mention only':(a.c==='probable'?'probable: ':'')+(REL_SHORT[a.y]||a.y))+'</span> ';}
function relTip(a){if(!a)return '';const o=a.n!==undefined?[]:['Related by: '+(REL_NAME[a.y]||a.y)+' ('+a.c+')'];if(a.m&&a.m.length)o.push('Also: '+a.m.map(x=>REL_NAME[x]||x).join(', '));if(a.t&&a.n===undefined)o.push(a.t);
if(a.n!==undefined){const h=Math.round(Math.abs(a.n)/3600000);o.push('Nearest by time (probable): '+(a.n===0?'overlaps':a.n<0?'ended '+(h<48?h+' h':Math.round(h/24)+' days')+' before the branch was made':'started '+(h<48?h+' h':Math.round(h/24)+' days')+' after the branch was last changed'));}
if(a.c==='probable')o.push('Probable: no session is certain for this row');if(a.c==='mention')o.push('Mention only: the session contains the name but did not create it or work in it');return o.join('\n');}
function relAnn(h){return{y:h.why,c:h.conf,m:h.more,t:h.note,n:h.near,cr:h.cr===true,rc:h.rc};}
function fxKey(it){return it.hk+':f';}
function fxOn(it){return sec[hxKeyS(fxKey(it))]===true;}
function mxKey(it){return it.hk+':m';}
function mxOn(it){return sec[hxKeyS(mxKey(it))]===true;}
/** The chats of one row: those the folder or branch logic found (certain), merged with the matcher's hits. crs: the creators (a tool call of the chat or of its subagent made the row), with their receipts. */
function psMerge(rl,kind,key,base,byId,shown,sort){const hits=rl&&rl[kind]&&Array.isArray(rl[kind][key])?rl[kind][key]:[],have={},rows=[],an={},near=[],men=[],crs=[];let relN=0;
base.forEach(r=>{have[r.id]=1;rows.push(r);an[r.id]={y:'cwd',c:'certain',t:kind==='w'?'The session ran in this worktree':'The session folder has this branch checked out'};});
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
function psCreatedTip(it){const o=[];const ms=it.created?it.created*1000:0;if(ms)o.push('Created '+psUtc(ms)+', local '+new Date(ms).toLocaleString()+(it.crTitle?' by session "'+it.crTitle+'"':''));else if(it.crTitle)o.push('Created by session "'+it.crTitle+'"');
(it.cr?it.cr.rc:[]).slice(0,2).forEach(p=>{o.push('Tool call at '+(p.t?psUtc(p.t):'unknown time'));o.push('Command: '+(p.c||'').slice(0,200));o.push('Transcript line '+p.l+', tool_use '+(p.u||'?')+(p.a?', subagent '+String(p.a).slice(0,8):''));});
if(!o.length)o.push(it.info&&it.info.au?'Last commit by '+it.info.au+'. No session is known to have created this.':'No creation time is known.');return o.join('\n');}
function psEvid(k,rp,info,w,hasNear){const rl=rels[k],busy=rp.st==='running'||rp.st==='queued'||scanLive;
if(!rl&&busy)return 'Matching sessions...';
return !rl?'session matching not finished':!rl.ok?(rl.indexing?'sessions are still being indexed':'session matching unavailable'):'no matching session found'+(hasNear?'; nearest by time is listed':'');}
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
function psBr(k,rp,b,n,cl){if(!b)return '<span class="nb">—</span>';const pl=prsOn?prs[k]:null;if(!rp.gh||(pl&&pl.st==='unavailable'&&pl.reason==='not a GitHub repository'))return '<code'+(cl?' data-tip="'+esc(b+'\n'+cl)+'"':'')+'>'+esc(b)+'</code>';
return '<button type="button" class="lk" data-a="brl" data-k="'+esc(k)+'" data-b="'+esc(b)+'" data-n="'+(n||0)+'" data-tip="'+esc((n?'Open pull request #'+n+' on GitHub':'Open the branch on GitHub')+(cl?'\n'+cl:''))+'">'+esc(b)+'</button>';}
function psAb(a,b){if(typeof a!=='number'||typeof b!=='number')return '<span class="nb" data-tip="Not read">—</span>';return a>0||b>0?'<span class="ah" data-tip="'+esc(countWord(a,'commit')+' ahead of and '+countWord(b,'commit')+' behind the default branch')+'">'+(a>0?'↑'+a:'')+(a>0&&b>0?' ':'')+(b>0?'↓'+b:'')+'</span>':'<span class="q" data-tip="Level with the default branch">level</span>';}
function psAgo(ms){return ms?shortAgo(ms,Date.now()):'';}
/** The pull request cell: the number (a link when the host has its address), draft, and one checks mark. */
function psPrCell(k,pr){if(!pr)return '<span class="nb">—</span>';const c=pr.c,ck=c&&c.st!=='checking'&&c.st!=='unavailable'&&c.st!=='none'?'<span class="ck '+(c.st==='failing'?'fail':c.st==='pending'?'pend':'pass')+'" data-tip="'+esc(ckTip(c))+'">'+(c.st==='failing'?'✗':c.st==='pending'?'◔':'✓')+'</span>':c&&c.st==='checking'?SPINP:'';
const num=pr.link?'<button type="button" class="lk" data-a="pr" data-k="'+esc(k)+'" data-n="'+pr.n+'" data-tip="'+esc('Open pull request #'+pr.n+(pr.title?': '+pr.title:'')+(pr.review?' ('+pr.review+')':''))+'">#'+pr.n+'</button>':'<span data-tip="'+esc(pr.title||'')+'">#'+pr.n+'</span>';
return num+(pr.draft?' <span class="q">draft</span>':'')+' '+ck;}
function psChatsCell(it){const nr=it.nr||[],n=it.vis.length+nr.length;
if(!n){const o=[];if(it.relN>0)o.push('<span class="q hid" data-tip="'+esc(countWord(it.relN,'session')+' relate to this row but are older than the days shown')+'">+'+it.relN+' older</span>');if((it.mn||[]).length)o.push('<span class="q" data-tip="Sessions that only contain the name">'+it.mn.length+' mention'+(it.mn.length===1?'':'s')+'</span>');return o.join(' ');}
const on=hxOn(it);return '<button type="button" class="ab hxb" data-a="hx" data-x="'+esc(it.hk)+'" data-on="'+(on?1:0)+'" aria-expanded="'+on+'" aria-label="'+esc(countWord(n,'chat')+' in '+it.name)+'" data-tip="'+esc((on?'Hide ':'Show ')+countWord(n,'chat')+' in '+it.name+(nr.length&&!it.vis.length?'. '+it.ev+' (nearest by time, probable)':''))+'">'+countWord(n,'chat')+' <span class="car" aria-hidden="true"></span></button>';}
function psMen(it){const mn=it.mn||[];if(!mn.length)return '';const on=mxOn(it);return '<p class="sub mnp"><button type="button" class="ab hxb mnb" data-a="hx" data-x="'+esc(mxKey(it))+'" data-on="'+(on?1:0)+'" aria-expanded="'+on+'" data-tip="'+esc('Sessions that only contain the name of '+it.name+': none of them created it or worked in it')+'"><span class="car" aria-hidden="true"></span>Mentions only ('+mn.length+')</button></p>'+(on?'<div class="nest mnl" role="list" aria-label="'+esc('Sessions that only mention '+it.name)+'">'+mn.map(r=>psRow(r,it)).join('')+'</div>':'');}
function psChatRow(it){if(!hxOn(it))return '';const o=psList(it),mp=psMen(it);return o.l.length||mp?'<div class="hxr" role="row">'+(o.l.length?'<div class="nest" role="list" aria-label="'+esc('Sessions in '+it.name)+'">'+o.l.map(r=>psRow(r,it)).join('')+(o.left>0?'<p class="sub"><button type="button" class="ab" data-a="hxm" data-x="'+esc(it.hk)+'">Show '+Math.min(PS_STEP,o.left)+' more</button> <span class="q">'+o.left+' not listed yet, newest first</span></p>':'')+'</div>':'')+mp+'</div>':'';}
/** The creator line of a row: "Created 4d ago by <chat>", or "" when nothing is known. */
function psCrLine(it){const ms=it.created?it.created*1000:0,ago=ms?psAgo(ms):'',by=it.crTitle||(it.info&&it.info.au&&ms?it.info.au:'');
if(!ago&&!by)return '';return 'Created'+(ago?' '+ago+(ago==='now'?'':' ago'):'')+(by?' by '+by:'');}
function psTags(v){const t=v.tags||[];if(!t.length)return '';return t.slice(0,2).map(x=>'<span class="bd bd-muted">'+esc(x)+'</span>').join(' ')+(t.length>2?' <span class="q" data-tip="'+esc(t.slice(2).join(', '))+'">+'+(t.length-2)+'</span>':'');}
/** The Ask data of a row whose creator chat is known (the attributes the cu handler reads). */
function psAskAttrs(k,it){return ' data-k="'+esc(k)+'" data-c="'+esc(it.cr?it.cr.id:'')+'" data-b="'+esc(it.r?it.r.name:'')+'" data-w="'+esc(it.w?it.w.k:it.s?it.s.k:'')+'"';}
function psTxtBtn(a,label,tip,extra){return '<button type="button" class="ab pb" data-a="'+a+'"'+(extra||'')+' data-tip="'+esc(tip)+'">'+esc(label)+'</button>';}
/** The one labeled button of a row, from what the row needs: open the waiting or unread chat, open the pull request, ask the creator chat to finish or clean up, copy the remove command; "Working…" text while a chat runs; nothing for an idle row. */
function psPrimary(k,it){const v=it.v,w=it.w,q=it.pr,ask=(label,tip)=>it.cr?psTxtBtn('cu',label,tip+' (opens '+(it.crTitle||'the creator session')+'; the prompt is copied so you can paste it)',psAskAttrs(k,it)+' data-m="resume"'):'';
if(it.cid)return psTxtBtn('opc','Open chat','Open the chat: '+it.cTitle,' data-c="'+esc(it.cid)+'"');
if(q&&q.link&&((q.c&&q.c.st==='failing')||q.review==='changes requested'||q.review==='approved'))return psTxtBtn('pr','Open PR','Open pull request #'+q.n+' on GitHub',' data-k="'+esc(k)+'" data-n="'+q.n+'"');
if(v.state==='Dirty'||v.state==='Unpushed')return ask('Ask to finish','Ask the session that made this branch to finish it');
if(it.s)return ask('Ask to clean up','Ask the session that made this folder to clean it up');
if(v.group==='tidy'&&w&&!w.main&&it.ready)return psTxtBtn('rm','Copy remove command','Copy a '+cw()+'command that removes this finished worktree. Nothing is run.',' data-k="'+esc(w.k)+'"');
return '';}
function psDetKey(it){return 'b:'+it.hk;}
function psDetOn(it){return menuKey===psDetKey(it);}
/** The overflow popover of a row, opened by its "..." button: the full status sentence, who created it and when (with the receipts in the tooltip), the folder, and the secondary actions. */
function psDetails(k,it){const v=it.v,w=it.w,rp=repos[k]||{},kv=[['Status',esc(v.state+(v.reason?': '+v.full:''))]];
if(w&&!w.main&&it.r)kv.push(['Worktree',esc(w.name)]);
const cre='<span class="cw" data-tip="'+esc(psCreatedTip(it))+'">'+(it.created?esc(psAgo(it.created*1000))+(psAgo(it.created*1000)==='now'?'':' ago'):'<span class="nb">not known</span>')+'</span>'+(it.crTitle?'<span class="cby"> by '+(it.cr&&it.cr.id?'<button type="button" class="lk" data-a="opc" data-c="'+esc(it.cr.id)+'" data-tip="'+esc('Open the session that created this: '+it.crTitle)+'">'+esc(it.crTitle)+'</button>':esc(it.crTitle))+'</span>':it.info&&it.info.au&&it.created?'<span class="cby q"> by '+esc(it.info.au)+'</span>':'');
kv.push(['Creator','<span class="c-cr">'+cre+'</span>']);
const path=w?w.path||'':it.s?it.s.path:'';if(path)kv.push(['Folder',esc(path)]);
if(!(it.vis.length+(it.nr||[]).length))kv.push(['Chats',esc(it.ev||'')]);
const x=psAskAttrs(k,it),t=it.crTitle||'the creator session';
const acts=(w&&!w.main&&it.ready?psTxtBtn('rm','Copy remove command','Copy a '+cw()+'command that removes this finished worktree. Nothing is run.',' data-k="'+esc(w.k)+'"'):'')
+(rp.gh&&it.r?psTxtBtn('brl','Open on GitHub',it.pr&&it.pr.link?'Open pull request #'+it.pr.n+' on GitHub':'Open the branch on GitHub',' data-k="'+esc(k)+'" data-b="'+esc(it.r.name)+'" data-n="'+(it.pr&&it.pr.link?it.pr.n:0)+'"'):'')
+(it.pr&&it.pr.link?psTxtBtn('prc','Copy PR link','Copy the link of pull request #'+it.pr.n,' data-k="'+esc(k)+'" data-n="'+it.pr.n+'"'):'')
+(it.cr?psTxtBtn('cu','Copy clean-up prompt','Copy a prompt for '+t+' with receipts: what it created, when, the command, the reflog and the current state',x+' data-m="copy"')+psTxtBtn('cu','Ask '+t+' to clean up','Open '+t+'; the prompt is copied so you can paste it',x+' data-m="resume"'):'');
return '<div class="ovp wd" role="dialog" aria-label="'+esc('More about '+it.name)+'"><dl>'+kv.map(e=>'<dt>'+e[0]+'</dt><dd>'+e[1]+'</dd>').join('')+'</dl>'+(acts?'<div class="wda">'+acts+'</div>':'')+'</div>';}
/** One row of the Work list, two lines. Line 1: a colored dot, the headline "do X" (the verdict's todo, else its reason; the full sentence in the tooltip) and the one action. Line 2: only the facts that mean something (branch, PR, ahead or behind, tags, chats toggle, age). The "..." button opens the popover with the rest. */
function psWrow(k,B,it,kid){const rp=B.rp,v=it.v,w=it.w,r=it.r,cl=[w&&!w.main&&w.path?w.path:'',psCrLine(it)].filter(Boolean).join('\n'),head=v.todo||v.reason||v.state;
const nm=it.s?'<span class="pn bn" data-tip="'+esc(it.s.path+(cl?'\n'+cl:''))+'">'+esc(it.name)+'</span>':'<span class="bn">'+(r?psBr(k,rp,r.name,it.pr&&it.pr.link?it.pr.n:0,cl):'<span class="bn-t" data-tip="'+esc((w?w.path||'':'')+(cl?'\n'+cl:''))+'">'+esc(it.name)+(w&&w.detached?' <span class="q">detached '+esc(w.sha||'')+'</span>':'')+'</span>')+'</span>';
const fd=it.fold&&!kid,mp=[fd?'<span class="bn"><span class="bn-t" data-tip="'+esc('Created by '+(it.crTitle||'one session')+'\n'+it.fold.map(x=>x.name).join('\n'))+'">'+esc(it.crTitle||'Untitled session')+'</span></span>':nm];
if(fd){const fo=fxOn(it);mp.push('<button type="button" class="ab hxb fxb" data-a="hx" data-x="'+esc(fxKey(it))+'" data-on="'+(fo?1:0)+'" aria-expanded="'+fo+'" aria-label="'+esc(it.fold.length+' branches from '+(it.crTitle||'this session'))+'" data-tip="'+esc((fo?'Hide ':'Show ')+'the '+it.fold.length+' branches and worktrees this session created')+'">'+it.fold.length+' branches <span class="car" aria-hidden="true"></span></button>');}
if(it.pr)mp.push('PR '+psPrCell(k,it.pr));
if(!it.s&&typeof it.va==='number'&&typeof it.vb==='number'&&(it.va>0||it.vb>0))mp.push(psAb(it.va,it.vb));
const tg=psTags({tags:(v.tags||[]).filter(x=>!(x==='draft'&&it.pr))});if(tg)mp.push(tg);
const ch=psChatsCell(it);if(ch)mp.push(ch);
const ag=it.ts?psAgo(it.ts*1000):'';if(ag)mp.push('<span class="q" data-tip="Last activity on this branch or in its chats">'+esc(ag)+'</span>');
const dk=psDetKey(it)+(fd?':f':''),on=menuKey===dk,ov='<button type="button" class="ab ib ovb" data-a="mnu" data-x="'+esc(dk)+'" aria-haspopup="true" aria-expanded="'+on+'" aria-label="'+esc('More about '+it.name)+'" data-tip="More: who created it, and more actions">⋯</button>';
return '<div class="wr" role="row" data-g="'+v.group+'"'+(fd?' data-f="1"':(w?' data-w="'+esc(w.k)+'"':'')+(r?' data-b="'+esc(r.name)+'"':'')+(it.s?' data-s="'+esc(it.s.k)+'"':'')+(kid?' data-kid="1"':''))+'><div class="wl1"><span class="dt dt-'+v.group+'" role="img" aria-label="'+esc(v.state)+'" data-tip="'+esc(v.state)+'"></span><span class="todo" data-tip="'+esc(v.full)+'">'+esc(head)+'</span><span class="c-ac acts2">'+psPrimary(k,it)+'</span>'+ov+'</div>'
+'<div class="meta wl2">'+mp.join(' <span class="sep" aria-hidden="true">·</span> ')+'</div>'
+(on?psDetails(k,it):'')+'</div>'+psChatRow(it)+(fd&&fxOn(it)?'<div class="hxr fxr" role="row"><div class="nest" role="list" aria-label="'+esc('Branches from '+(it.crTitle||'one session'))+'">'+it.fold.filter(m=>m.show).map(m=>psWrow(k,B,m,1)).join('')+'</div></div>':'');}
/** One group: header with its count (read from psCounts, so the number equals the rows listed) and its rows. */
function psGroup(k,B,g,list,C){const open=secOpen('g:'+g),t=GROUP_LABEL[g],n=g==='idle'?C.idle+B.nb.length:C[g];
const nbl=g==='idle'&&B.nb.length?'<p class="sub nbh">Chats without a branch</p><div class="nest" role="list" aria-label="Chats without a branch">'+B.nb.map(r=>psRow(r)).join('')+'</div>':'';
return '<section class="band ps wg g-'+g+'" aria-label="'+esc(t)+'"><h2 class="bh tg g-'+g+(open?' op':'')+'" role="heading" aria-level="2"><button type="button" class="ab" data-a="sec" data-s="g:'+g+'" aria-expanded="'+open+'" data-tip="'+esc((open?'Collapse ':'Expand ')+t)+'">'+esc(t)+'</button><span class="pill">'+n+'</span><span class="chv" aria-hidden="true"></span></h2>'+(open?'<div class="wk" role="table" aria-label="'+esc(t)+'">'+list.map(it=>psWrow(k,B,it)).join('')+'</div>'+nbl:'')+'</section>';}
/** The group a verdict lists under: unfinished work joins Your move. */
function psUi(g){return g==='finish'?'needs':g;}
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
const items=[],claim={};
/* A chat that relates to several rows (it created many worktrees) drives the state of ONE row: the row of its folder or branch, else the first row that lists it. The other rows still list it but do not repeat its question. */
Object.keys(byB).forEach(n=>byB[n].forEach(r=>{claim[r.id]='b:'+n;}));
M.wts.forEach(w=>(byW[w.k]||[]).forEach(r=>{if(!claim[r.id])claim[r.id]=w.detached||!w.branch?'w:'+w.k:'b:'+w.branch;}));
const ownRows=(rows,key)=>rows.filter(c=>{if(!claim[c.id])claim[c.id]=key;return claim[c.id]===key;});
const mk=(r,w,s)=>{const name=s?s.name:r?r.name:w.name,pr=r?r.pr:null,info=r?r.info:null,f=w?psWFacts(w):null,ok=!!(f&&f.ok),g=w?psWView(rp,w,pr):{ok:true,files:0,ahead:0,gone:!!(info&&info.gone),branch:name,pr:psPrFact(pr)};
const m=psJoin(w?mg('w',w.k,byW[w.k]||[]):s?mg('w',s.k,[]):null,r?mg('b',r.name,byB[r.name]||[]):null)||{rows:[],an:{},near:[],men:[],relN:0,crs:[]};
const mine=ownRows(m.rows,s?'s:'+s.k:r?'b:'+r.name:'w:'+w.k),cr=psCreator(m.crs),crr=cr?byId[cr.id]:null,chatSt=mine.some(c=>dotOf(c.id)==='waiting')?'waiting':mine.some(c=>dotOf(c.id)==='unread')?'unread':mine.some(c=>dotOf(c.id)==='running')?'running':mine.some(c=>dotOf(c.id)==='background')?'background':'';
const isDef=!!r&&r.name===def&&!(w&&w.detached);
const pickC=d=>mine.filter(c=>dotOf(c.id)===d).sort((a,b)=>(b.last||0)-(a.last||0))[0],cp=pickC('waiting')||pickC('unread'); /* the newest waiting session, else the newest unread one: what Open session opens */
const v=workVerdict({name:name,defName:def,isDef:isDef,local:!!(r&&r.local)||(!r&&!!w),remote:!!(r&&r.remote),stray:s?{git:!!s.git}:null,
wt:w?{missing:!!w.missing,main:!!w.main,locked:!!w.locked,ws:!!w.ws,known:ok,unread:ok?'':rp.st==='timeout'?'timed out':rp.st==='error'?'error':(rp.st==='running'||rp.st==='queued'||scanLive)?'still reading':'no answer',files:ok?f.fileTotal:0,unpushed:ok?f.ahead:0,behind:w.db||0,gone:ok?!!f.gone:false,merged:w.merged}:null,
a:isDef&&ok?f.ahead:w&&typeof w.da==='number'?w.da:info&&typeof info.a==='number'?info.a:undefined,bh:isDef&&ok?f.behind:w&&typeof w.db==='number'?w.db:info&&typeof info.b==='number'?info.b:undefined,
up:info?!!info.up:ok?!!f.upstream:false,gone:ok?!!f.gone:!!(info&&info.gone),merged:psIsMerged(rp,name),
pr:pr?{n:pr.n,checks:psPrFact(pr).checks,review:pr.review||'',draft:!!pr.draft}:null,chat:chatSt,chatTitle:cp?cp.title||'Untitled session':''});
const lastC=m.rows.reduce((a,c)=>Math.max(a,c.last||0),0);
const it={w:w,r:r,s:s||null,pr:pr,info:info,g:g,name:name,hk:hxKey(s?'s':w?'w':'b',s?s.k:w?w.k:name),chatsAll:m.rows,vis:m.rows,nr:m.near,mn:m.men,an:m.an,relN:m.relN,v:v,cr:cr,crTitle:cr?(crr?crr.title||'Untitled session':'an older session'):'',isDef:isDef,cs:chatSt,cid:cp?cp.id:'',cTitle:cp?cp.title||'Untitled session':'',
created:(info&&info.cr)||(cr&&cr.t&&cr.t!==Infinity?Math.round(cr.t/1000):0)||0,ts:Math.max(info?info.ts:0,lastC/1000),ready:!!(w&&!w.main&&g.ready),
va:isDef&&ok?f.ahead:w&&typeof w.da==='number'?w.da:info?info.a:undefined,vb:isDef&&ok?f.behind:w&&typeof w.db==='number'?w.db:info?info.b:undefined};
it.ev=psEvid(k,rp,info,w,m.near.length>0);
const hay=[name,w?w.name:'',w?w.path:'',w?w.branch:'',pr?'#'+pr.n+' '+pr.title:'',it.crTitle,info?info.au:'',s?s.path:''].join(' ');
const own=!filtering()||(psHit(hay)&&flagPass(g,flt));it.show=own||m.rows.length>0;items.push(it);};
M.list.forEach(r=>mk(r,r.wt,null));
M.wts.forEach(w=>{if(w.detached&&!w.main)mk(null,w,null);});
(rp.stray||[]).forEach(s=>mk(null,null,s));
/* Branches and worktrees that one chat created collapse into ONE row for that chat. A row with its own need (pull request, unpushed or dirty work, a need that is not the shared chat) stays on its own; fewer than two foldable rows stay as they are. */
const byCr={};items.forEach(it=>{const v=it.v;if(it.isDef||it.s||(it.w&&it.w.main)||!it.cr||!it.cr.id||it.pr||v.state==='Dirty'||v.state==='Unpushed'||(!it.cs&&(v.group==='needs'||v.group==='finish')))return;(byCr[it.cr.id]=byCr[it.cr.id]||[]).push(it);});
Object.keys(byCr).forEach(id=>{const l=byCr[id];if(l.length<2)return;l.sort(psSort);const par=l.find(x=>x.cs)||l[0];par.fold=l;par.show=l.some(x=>x.show);l.forEach(x=>{if(x!==par)x.folded=true;});});
const quiet=it=>it.isDef&&it.v.group==='idle',all=items.filter(it=>!quiet(it)&&!it.folded); /* the default branch is listed only when its verdict is outside idle; the chats of a hidden one move to the chats without a branch */
const shown=all.filter(it=>it.show),grp={needs:[],waiting:[],tidy:[],idle:[]};
shown.forEach(it=>grp[psUi(it.v.group)].push(it));BAND_RANK.forEach(g=>{grp[g].sort(g==='needs'?(a,b)=>a.v.rank-b.v.rank||psSort(a,b):psSort);});waitN=grp.waiting.length;
const nb2=nb.filter(r=>!used[r.id]),seenNb={};nb2.forEach(r=>{seenNb[r.id]=1;});items.filter(quiet).forEach(it=>it.chatsAll.forEach(r=>{if(!seenNb[r.id]&&(!filtering()||it.show)){seenNb[r.id]=1;nb2.push(r);}}));nb2.sort(srt);
return{M:M,rp:rp,p:M.p,all:all,shown:shown,grp:grp,nb:nb2,nbAll:nb2.length};}
function psOrder(B){const o=[],seen={},add=r=>{if(!seen[r.id]){seen[r.id]=1;o.push(r.id);}};BAND_RANK.forEach(g=>{if(secOpen('g:'+g))B.grp[g].forEach(it=>{if(hxOn(it))psList(it).l.forEach(add);if(it.fold&&fxOn(it))it.fold.forEach(m=>{if(m.show&&hxOn(m))psList(m).l.forEach(add);});});});if(secOpen('g:idle'))B.nb.forEach(add);return o;}
/** The state of the pull request lookup, in the repository line: looking up, or why it is unknown with a retry. */
function psPrState(k,M){if(!prsOn)return '';const p=M.p;if(!p||p.st==='queued'||p.st==='checking')return ' '+SPINP+' <span class="q">Looking up pull requests</span>';
if(p.st==='unavailable'){const rt=prRetryKey({p:p,rk:k});return ' '+prUnk(p.reason)+(rt?' '+ibtn('fretry','Retry the pull request lookup','retry','Look up the pull requests again',' data-k="'+esc(rt)+'"'):'');}return '';}
/** Rows per group, counted from B.shown (the rows psRepo lists in its groups): every number next to a group, and the headline, reads from here. */
function psCounts(B){const c={needs:0,finish:0,waiting:0,tidy:0,idle:0};B.shown.forEach(it=>{c[psUi(it.v.group)]++;});return c;}
function psHeadline(B,C,name){const top=B.grp.needs[0];return workHeadline(C,scanComplete(),name,top?top.v.todo||top.v.reason||top.v.state:'');}
function psRepo(k,B){const rp=B.rp,busy=rp.st==='running'||rp.st==='queued',bad=rp.st==='timeout'||rp.st==='error',M=B.M,C=psCounts(B),ready=M.wts.length>0||!busy;
let h='<div class="psl" data-rk="'+esc(k)+'">'+(ready?'<span class="hl" role="status">'+esc(psHeadline(B,C,rp.name))+'</span>':'<span class="pn psn">'+esc(rp.name)+'</span>')+(rp.gh?ibtn('repolink','Open '+rp.name+' on GitHub','open','Open the repository on GitHub',' data-k="'+esc(k)+'"'):'')
+(busy?' '+SPIN:'')+(bad?' <span class="q">'+esc(rp.st==='timeout'?'timed out':'error')+'</span> '+ibtn('fretry','Retry reading '+rp.name,'retry','Read this repository again',' data-k="'+esc(k)+'"'):'')+psPrState(k,M)+'</div>';
if(!ready)return h+'<p class="sub">Reading git...</p>';
let t='';BAND_RANK.forEach(g=>{if(B.grp[g].length||(g==='idle'&&B.nb.length))t+=psGroup(k,B,g,B.grp[g],C);});
if(t)h+='<div class="wtab">'+t+'</div>';
return h;}
function noRepoHtml(){return wsN===0||(ended&&!scanLive)||notes.gitMissing?'<p class="msg" role="status">Open a git repository folder.</p>':'<p class="msg" role="status">Reading git...</p>';}
`;
