/** Project status layer of the page script: the one repository of the workspace as three tables (worktrees, branches, pull requests) with the chats
 *  inside the row they belong to, and "Chats without a branch" at the bottom. A branch with a worktree and a pull request keeps all three facts.
 *  Shares the page's top-level scope (GIT_JS, PR_JS and VIEW_JS run before it, CORE after); nothing here touches the page at load. */
export const OW_STATUS_JS = String.raw`
const BAND_RANK=['needs','finish','waiting','tidy','idle'];
let hx={},nbAuto=false;
function attn(r){return bandHeld(r,dotOf(r.id))!=='idle';}
function hxOn(it){return hx[it.hk]!==undefined?hx[it.hk]:it.vis.some(attn);}
function psKey(){return Object.keys(repos).filter(k=>{const rp=repos[k];return rp&&rp.name&&rp.ws;}).sort()[0]||'';}
function psHit(hay){return !fq||filterMatch(hay,fq);}
function hxKey(p,n){return p+':'+String(n).replace(/[^A-Za-z0-9_-]/g,'_');}
function psModel(k){const rp=repos[k],p=prsOn?prs[k]:null,m=new Map();
const get=n=>{let r=m.get(n);if(!r){r={name:n,local:false,wt:null,pr:null,info:null};m.set(n,r);}return r;};
(rp.branches||[]).forEach(b=>{const r=get(b.n);r.local=true;r.info=b;});
(rp.worktrees||[]).forEach(w=>{if(!w.detached&&w.branch){const r=get(w.branch);r.local=true;r.wt=w;}});
if(p)psPrList(p).forEach(x=>{const r=get(x.b);r.pr={n:x.n,title:x.title,draft:x.draft,review:x.review,link:x.link,c:p.chk[x.n]||null};});
return{rp:rp,p:p,list:Array.from(m.values()),wts:rp.worktrees||[],byName:m};}
function psPrList(p){const l=(p.all||[]).slice();Object.keys(p.by||{}).forEach(b=>{if(!l.some(x=>x.b===b))l.push(Object.assign({b:b},p.by[b]));});return l;}
function psWFacts(w){if(w.facts&&w.facts.ok)return w.facts;for(let i=0;i<(w.fks||[]).length;i++){const e=gs[w.fks[i]];if(e&&e.st==='ok'&&e.f)return{ok:true,fileTotal:e.f.fileTotal||0,ahead:e.f.ahead||0,behind:e.f.behind||0,gone:!!e.f.gone,files:e.f.files||[]};}return w.facts||null;}
function psPrFact(pr){return pr?{n:pr.n,review:pr.review||'',draft:!!pr.draft,checks:pr.c&&pr.c.st!=='checking'?pr.c.st:'unknown'}:undefined;}
function psIsMerged(rp,name){return !!(name&&name!==rp.defLocal&&rp.mset&&rp.mset[name]);}
function psWView(rp,w,pr){const f=psWFacts(w),ok=!!(f&&f.ok),q=psPrFact(pr),g={wt:true,ok:ok,files:ok?f.fileTotal:0,ahead:ok?f.ahead:0,gone:ok?!!f.gone:false,locked:!!w.locked&&!w.main,pr:q};
g.ready=wtReady(w,ok?{ok:true,files:g.files,ahead:g.ahead,gone:g.gone,pr:q}:undefined,wtOpen(w));return g;}
function psBView(rp,r){const i=r.info,q=psPrFact(r.pr);if(r.pr&&!r.wt)return{wt:true,prOnly:true,ok:true,files:0,ahead:0,gone:false,locked:false,pr:q,ready:false};
return{ok:true,files:0,ahead:0,gone:!!(i&&i.gone),branch:r.name,pr:q};}
function psOwnBand(rp,g,name){if(!g)return 'idle';if(g.wt)return bandOf('idle',g);if(g.pr)return bandOf('idle',g);return g.gone||psIsMerged(rp,name)?'tidy':'idle';}
function psBest(a,b){return BAND_RANK.indexOf(a)<=BAND_RANK.indexOf(b)?a:b;}
function psBd(cls,t,tip){return '<span class="bd bd-'+cls+'"'+(tip?' data-tip="'+esc(tip)+'"':'')+'>'+esc(t)+'</span>';}
function psPrBd(pr){const o=[];if(!pr)return o;const c=pr.c;
if(c&&c.st==='failing')o.push(psBd('bad','checks failing',ckTip(c)||'A check is failing on the pull request'));else if(c&&c.st==='pending')o.push(psBd('warn','checks pending',ckTip(c)));
if(pr.review==='changes requested')o.push(psBd('bad','changes requested','Changes were requested on the pull request'));else if(pr.review==='review requested')o.push(psBd('warn','needs review','A review is requested on the pull request'));else if(pr.review==='approved')o.push(psBd('ok','approved','The pull request is approved'));
if(pr.draft)o.push(psBd('muted','draft','The pull request is a draft'));return o;}
function psBadges(rp,it){const o=[],r=it.r,w=it.w||(r?r.wt:null),i=r&&r.info,f=w?psWFacts(w):null,name=it.name;
if(w){if(w.missing)o.push(psBd('bad','folder missing','The worktree folder is gone. Prune the worktree record.'));if(w.locked&&!w.main)o.push(psBd('info','locked','Locked: not removable until unlocked'));
if(f&&f.ok){if(f.fileTotal>0)o.push(psBd('warn','dirty: '+f.fileTotal+(f.fileTotal===1?' file':' files'),'Uncommitted changes'));if(f.ahead>0)o.push(psBd('warn',f.ahead+' unpushed','Commits that are not pushed'));if(f.gone)o.push(psBd('warn','remote gone','The remote branch no longer exists'));}
if(w.db>0)o.push(psBd('info','behind '+w.db,countWord(w.db,'commit')+' behind the default branch'));}
else if(i){if(!i.up&&!i.gone&&i.a>0&&name!==rp.defLocal)o.push(psBd('warn','unpushed','This branch has no remote branch yet'));if(i.gone)o.push(psBd('warn','remote gone','The remote branch no longer exists'));if(i.b>0&&name!==rp.defLocal)o.push(psBd('info','behind '+i.b,countWord(i.b,'commit')+' behind the default branch'));}
psPrBd(it.pr).forEach(x=>o.push(x));
const merged=psIsMerged(rp,name)||(w&&w.merged===true&&!w.main);
if(w?(it.w?it.g:psWView(rp,w,it.pr)).ready:(merged&&!it.pr&&!it.chatsAll.length))o.push(psBd('ok','safe to remove',w?'Merged and clean with nothing unpushed: the worktree can be removed. Nothing is run.':'Merged into the default branch: the branch can be deleted. Nothing is run.'));
else if(merged)o.push(psBd('muted','merged','Merged into the default branch'));
return o.length?o.join(' '):'<span class="nb">—</span>';}
function psBr(k,rp,b,n){if(!b)return '<span class="nb">—</span>';if(!rp.gh)return '<code>'+esc(b)+'</code>';
return '<button type="button" class="lk" data-a="brl" data-k="'+esc(k)+'" data-b="'+esc(b)+'" data-n="'+(n||0)+'" data-tip="'+esc(n?'Open pull request #'+n+' on GitHub':'Open the branch on GitHub')+'">'+esc(b)+'</button>';}
function psAb(a,b){if(typeof a!=='number'||typeof b!=='number')return '<span class="nb" data-tip="Not read">—</span>';return a>0||b>0?'<span class="ah" data-tip="'+esc(countWord(a,'commit')+' ahead of and '+countWord(b,'commit')+' behind the default branch')+'">'+(a>0?'↑'+a:'')+(a>0&&b>0?' ':'')+(b>0?'↓'+b:'')+'</span>':'<span class="q" data-tip="Level with the default branch">level</span>';}
function psWhen(ts){return ts?'<span data-tip="'+esc(new Date(ts*1000).toLocaleString())+'">'+esc(shortAgo(ts*1000,Date.now()))+'</span>':'<span class="nb">—</span>';}
function psRv(v){return v?'<span class="rv rv-'+esc(v.replace(/ /g,'-'))+'">'+esc(v)+'</span>':'<span class="nb">—</span>';}
function psCk(c,p){if(!c)return p&&p.st==='ok'?'<span class="q" data-tip="Checks are looked up for the first pull requests only">—</span>':'';if(c.st==='checking')return SPINP;if(c.st==='unavailable')return '<span class="q" data-tip="'+esc(c.reason||'')+'">unavailable</span>';if(c.st==='none')return '<span class="nb">none</span>';return '<span class="ck '+(c.st==='failing'?'fail':c.st==='pending'?'pend':'pass')+'" data-tip="'+esc(ckTip(c))+'">'+esc(ckText(c))+'</span>';}
function psTable(cls,head,body,empty){return body.length?'<div class="pst-w"><table class="pst '+cls+'"><thead><tr>'+head.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+body.join('')+'</tbody></table></div>':'<p class="sub">'+esc(empty)+'</p>';}
function psChatsCell(it){const n=it.vis.length,x=it.hk;if(!n&&!it.other)return '';if(!n)return '<span class="pill" data-tip="'+esc(countWord(it.other,'chat')+' on this branch, listed under its worktree')+'">'+it.other+'</span>';
const on=hxOn(it);return '<button type="button" class="ab hxb" data-a="hx" data-x="'+esc(x)+'" data-on="'+(on?1:0)+'" aria-expanded="'+on+'" aria-label="'+esc(countWord(n,'chat')+' in '+it.name)+'" data-tip="'+esc((on?'Hide ':'Show ')+countWord(n,'chat')+' in '+it.name)+'"><span class="car" aria-hidden="true"></span>'+n+'</button>';}
function psChatRow(it,cols){return it.vis.length&&hxOn(it)?'<tr class="hxr"><td colspan="'+cols+'"><div class="nest" role="list" aria-label="'+esc('Chats in '+it.name)+'">'+it.vis.map(r=>rowHtml(r,r.id===tabId)).join('')+'</div></td></tr>':'';}
function psWtRows(k,B){const rp=B.rp;let out=[];B.wl.forEach(it=>{const w=it.w,f=psWFacts(w);
const files=w.missing?'<span class="q">folder missing</span>':f&&f.ok?(f.fileTotal>0?'<span class="ah">'+f.fileTotal+'</span>':'0'):f?'<span class="q">error</span>':rp.st==='timeout'||rp.st==='error'?'<span class="q">'+(rp.st==='timeout'?'timed out':'error')+'</span>':rp.st==='running'?SPIN:'<span class="nb">—</span>';
const ready=it.g.ready;
out.push('<tr data-w="'+esc(w.k)+'"><td><span class="pn" data-tip="'+esc(w.path||w.name)+'">'+esc(w.name)+'</span>'+(w.main?' <span class="q">main</span>':'')+'</td><td>'+(w.detached?'<span class="q">detached '+esc(w.sha||'')+'</span>':psBr(k,rp,w.branch,it.pr&&it.pr.link?it.pr.n:0))+'</td><td>'+files+'</td><td>'+(w.detached?'<span class="nb">—</span>':psAb(w.da,w.db))+'</td>'+(prsOn?'<td>'+(it.pr?prB({draft:it.pr.draft},'#'+it.pr.n):'<span class="nb">—</span>')+'</td>':'')+'<td>'+psBadges(rp,it)+'</td><td>'+psChatsCell(it)+'</td><td class="acts2">'+(ready&&!w.main?ibtn('rm','Copy '+cw()+'remove command: '+w.name,'trash','Copy a '+cw()+'command that removes this finished worktree. Nothing is run.',' data-k="'+esc(w.k)+'"'):'')+'</td></tr>'+psChatRow(it,prsOn?8:7));});return out;}
function psBrRows(k,B){const rp=B.rp,out=[];B.bl.forEach(it=>{const r=it.r,i=r.info,pr=r.pr;
const where=r.wt?'<span class="pn" data-tip="'+esc(r.wt.path||'')+'">'+esc(r.wt.name)+'</span>':r.local?'<span class="q">no worktree</span>':'<span class="q" data-tip="No local branch: only on the remote">remote only</span>';
out.push('<tr data-b="'+esc(r.name)+'"><td>'+psBr(k,rp,r.name,pr&&pr.link?pr.n:0)+(r.name===rp.defLocal?' <span class="q">default</span>':'')+'</td><td>'+where+'</td><td>'+(r.local&&r.name!==rp.defLocal?psAb(i?i.a:undefined,i?i.b:undefined):'<span class="nb">—</span>')+'</td><td>'+(i?psWhen(i.ts):'<span class="nb">—</span>')+'</td><td>'+(i&&i.au?esc(i.au):'<span class="nb">—</span>')+'</td>'+(prsOn?'<td>'+(pr?prB({draft:pr.draft},'#'+pr.n):'<span class="nb">—</span>')+'</td>':'')+'<td>'+psBadges(rp,it)+'</td><td>'+psChatsCell(it)+'</td></tr>'+psChatRow(it,prsOn?8:7));});return out;}
function psPrRows(k,B){const rp=B.rp,p=B.p;return B.pl.map(it=>{const x=it.pr,r=it.r;
return '<tr data-n="'+x.n+'"><td>'+prB({draft:x.draft},'#'+x.n+(x.draft?' draft':''))+'</td><td class="ttl" data-tip="'+esc(x.title)+'">'+esc(x.title)+'</td><td>'+psBr(k,rp,r.name,x.link?x.n:0)+'</td><td>'+psRv(x.review)+'</td><td>'+psCk(x.c,p)+'</td><td>'+psPrBd(x).join(' ')+'</td><td>'+(r.wt?'<span class="pn">'+esc(r.wt.name)+'</span>':r.local?'<span class="q">local branch</span>':'<span class="q">no local branch</span>')+'</td><td class="acts2">'+(x.link?ibtn('pr','Open pull request #'+x.n,'pr','Open pull request #'+x.n,' data-k="'+esc(k)+'" data-n="'+x.n+'"')+ibtn('prc','Copy the link of pull request #'+x.n,'link','Copy the pull request link',' data-k="'+esc(k)+'" data-n="'+x.n+'"'):'')+'</td></tr>';});}
function psPrNote(k,M){if(!prsOn)return '<p class="sub">'+esc(PRS_OFF)+'</p>';const p=M.p;if(!p||p.st==='queued'||p.st==='checking')return '<p class="sub">'+SPINP+' Looking up pull requests...</p>';
if(p.st==='unavailable'){const rt=prRetryKey({p:p,rk:k});return '<p class="sub">'+prUnk(p.reason)+(rt?' '+ibtn('fretry','Retry the pull request lookup','retry','Look up the pull requests again',' data-k="'+esc(rt)+'"'):'')+'</p>';}return '';}
function psBand(rp,it){let b=it.own;it.chatsAll.forEach(r=>{const c=bandHeld(r,dotOf(r.id));if(hidden.indexOf(c)<0)b=psBest(b,c);});return b;}
function psSort(a,b){if(sortMode==='name')return a.name.localeCompare(b.name);return b.ts-a.ts||a.name.localeCompare(b.name);}
/** Everything the three tables and the bottom section show, from the repository, the pull requests and the chats that passed the filter box and state filters. */
function psBuild(k,vis){const M=psModel(k),rp=M.rp,chats=vis.filter(r=>r.kind!=='wt'),byW={},byB={},nb=[];
chats.slice().sort(rowCmp(sortMode)).forEach(r=>{const e=fOf(r),f=e&&e.f,w=(r.fk&&M.wts.find(x=>x.fks&&x.fks.indexOf(r.fk)>=0))||null;
if(w){(byW[w.k]=byW[w.k]||[]).push(r);}else if(f&&f.rk===k&&f.branch&&!f.detached&&M.byName.get(f.branch)){(byB[f.branch]=byB[f.branch]||[]).push(r);}else nb.push(r);});
const shown=r=>hidden.indexOf(bandHeld(r,dotOf(r.id)))<0,own=(g,hay,name,w)=>{const o=psOwnBand(rp,g,name,w);return{o:o,ok:!filtering()||(psHit(hay)&&flagPass(g,flt))};};
const wl=[],bl=[],pl=[],def=rp.defLocal||'';
M.wts.forEach(w=>{const br=w.detached?null:M.byName.get(w.branch),pr=br?br.pr:null,g=psWView(rp,w,pr),o=own(g,[w.name,w.branch,w.path,pr?'#'+pr.n+' '+pr.title:''].join(' '),w.branch),ca=byW[w.k]||[];
const it={w:w,r:br,pr:pr,g:g,name:w.name,hk:hxKey('w',w.k),chatsAll:ca,vis:ca.filter(shown),other:0,own:o.o,ts:(br&&br.info?br.info.ts:0)};
it.band=psBand(rp,it);if((hidden.indexOf(it.band)<0&&o.ok)||it.vis.length)wl.push(it);});
wl.sort((a,b)=>(a.w.main?-1:0)-(b.w.main?-1:0)||psSort(a,b));
M.list.forEach(r=>{const g=psBView(rp,r),o=own(g,[r.name,r.info?r.info.au:'',r.pr?'#'+r.pr.n+' '+r.pr.title:'',r.wt?r.wt.name:''].join(' '),r.name);
const ca=byB[r.name]||[],oth=r.wt?(byW[r.wt.k]||[]).filter(c=>{const e=fOf(c),f=e&&e.f;return f&&f.branch===r.name;}).filter(shown).length:0;
const it={w:null,r:r,pr:r.pr,g:g,name:r.name,hk:hxKey('b',r.name),chatsAll:ca,vis:ca.filter(shown),other:oth,own:o.o,ts:r.info?r.info.ts:0};
it.band=psBand(rp,it);if((hidden.indexOf(it.band)<0&&o.ok)||it.vis.length)bl.push(it);});
bl.sort((a,b)=>(a.name===def?-1:0)-(b.name===def?-1:0)||psSort(a,b));
M.list.filter(r=>r.pr).forEach(r=>{const g=psBView(rp,r),o=own(g,[r.name,'#'+r.pr.n,r.pr.n,r.pr.title].join(' '),r.name);const b=psOwnBand(rp,{wt:true,prOnly:true,ok:true,pr:psPrFact(r.pr)},r.name);
if(hidden.indexOf(b)<0&&o.ok)pl.push({r:r,pr:r.pr,name:r.pr.title||r.name,ts:r.pr.n});});
pl.sort((a,b)=>sortMode==='name'?a.name.localeCompare(b.name):b.pr.n-a.pr.n);
return{M:M,rp:rp,p:M.p,wl:wl,bl:bl,pl:pl,nb:nb.filter(shown)};}
function psOrder(B){nbAuto=B.nb.some(attn);const o=[];[B.wl,B.bl].forEach(l=>l.forEach(it=>{if(hxOn(it))it.vis.forEach(r=>o.push(r.id));}));if(secOpen('nb'))B.nb.forEach(r=>o.push(r.id));return o;}
function psRepo(k,B){const rp=B.rp,busy=rp.st==='running'||rp.st==='queued',bad=rp.st==='timeout'||rp.st==='error',M=B.M;
let h='<div class="psl" data-rk="'+esc(k)+'"><span class="pn psn">'+esc(rp.name)+'</span>'+(rp.gh?ibtn('repolink','Open '+rp.name+' on GitHub','open','Open the repository on GitHub',' data-k="'+esc(k)+'"'):'')
+'<span class="pill" data-tip="Worktrees, including the main checkout">'+esc(countWord(M.wts.length,'worktree'))+'</span><span class="pill">'+esc(countWord(M.list.length,'branch','branches'))+'</span><span class="pill">'+esc(countWord(M.list.filter(r=>r.pr).length,'pull request'))+'</span>'
+(busy?' '+SPIN:'')+(bad?' <span class="q">'+esc(rp.st==='timeout'?'timed out':'error')+'</span> '+ibtn('fretry','Retry reading '+rp.name,'retry','Read this repository again',' data-k="'+esc(k)+'"'):'')+'</div>';
if(!M.wts.length&&busy)return h+'<p class="sub">Reading git...</p>';
const sec=(s,t,tip,body)=>'<section class="band ps" aria-label="'+esc(t)+'"><h2 class="bh g-ps" role="heading" aria-level="2"><button type="button" class="ab" data-a="sec" data-s="'+s+'" aria-expanded="'+secOpen(s)+'" data-tip="'+esc((secOpen(s)?'Collapse ':'Expand ')+t+'. '+tip)+'">'+esc(t)+'</button></h2>'+(secOpen(s)?'<div class="psb">'+body+'</div>':'')+'</section>';
h+=sec('wt','Worktrees','Every worktree of the repository, with its state and its chats.',psTable('pw',['Worktree','Branch','Files','vs default'].concat(prsOn?['PR']:[],['Health','Chats','']),psWtRows(k,B),'No worktrees match.'));
h+=sec('bs','Branches','Every local branch, and any branch with an open pull request.',psTable('pb',['Branch','Worktree','vs default','Last commit','Author'].concat(prsOn?['PR']:[],['Health','Chats']),psBrRows(k,B),'No branches match.')+(rp.bmore>0?'<p class="sub">+'+rp.bmore+' older branches not listed.</p>':''));
h+=sec('prs','Pull requests','Open pull requests with review and check state.',psPrNote(k,M)+psTable('pp',['PR','Title','Branch','Review','Checks','Health','Local',''],psPrRows(k,B),prsOn&&M.p&&M.p.st==='ok'?'No open pull requests match.':'')+'<p class="sub">Pull request author is not shown: the read-only pull request list does not return it.</p>');
if(B.nb.length)h+='<section class="band ps" aria-label="Chats without a branch"><h2 class="bh g-ps" role="heading" aria-level="2"><button type="button" class="ab" data-a="sec" data-s="nb" aria-expanded="'+secOpen('nb')+'" data-tip="'+(secOpen('nb')?'Collapse':'Expand')+' Chats without a branch. Chats whose folder is not in this repository, is not a git folder, or whose branch was not found.">Chats without a branch</button> <span class="pill">'+B.nb.length+'</span></h2>'+(secOpen('nb')?'<div class="nest" role="list">'+B.nb.map(r=>rowHtml(r,r.id===tabId)).join('')+'</div>':'')+'</section>';
return h;}
function noRepoHtml(){return wsN===0||(ended&&!scanLive)||notes.gitMissing?'<p class="msg" role="status">Open a git repository folder.</p>':'<p class="msg" role="status">Reading git...</p>';}
`;
