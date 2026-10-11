/** Git layer of the Open Work page script: per-folder and per-repository state from streamed host messages, cells, row placement, Mark done.
 *  Shares the page's top-level scope (CORE runs after it); nothing here touches the page at load. */
export const OW_GIT_JS = String.raw`
const WATCH_FOLDER_MS=15000,WATCH_SCAN_MS=45000,WATCH_DETAIL_MS=15000,HOLD_MS=2000,SPIN='<span class="spin" role="img" aria-label="Reading git"></span>';
let gs={},repos={},prog=null,scanLive=false,notes={},wsOnly=false,wsN=0,donemap={},showDone=false,gotDots=false,placed={},hoverId='',settleT=0,moving=false,detail={},asked={},staleDone={},staleT=0,fwatch={},swatch=0;
function fOf(r){return r&&r.fk?gs[r.fk]:undefined;}
function gitView(r){const e=fOf(r);if(!e||!e.f)return undefined;const f=e.f,rp=repos[f.rk]||{},def=rp.defLocal||'';
return{ok:true,files:f.fileTotal||0,ahead:f.ahead||0,behind:f.behind||0,gone:!!f.gone,branch:f.branch||'',detached:!!f.detached,up:!!f.upstream,merged:!!(f.branch&&rp.mset&&rp.mset[f.branch]&&f.branch!==def),isDef:!!def&&f.branch===def,pr:prFact(r)};}
function wtOf(r){const e=fOf(r);if(!e||!e.f)return null;const rp=repos[e.f.rk];if(!rp||!rp.worktrees)return null;return rp.worktrees.find(w=>w.fks.indexOf(r.fk)>=0)||null;}
function wtOpen(w){return rows.some(r=>w.fks.indexOf(r.fk)>=0&&!!dots[r.id]);}
function wtFacts(w,pr){const f=w.facts;return f&&f.ok?{ok:true,files:f.fileTotal,ahead:f.ahead,gone:!!f.gone,pr:pr}:undefined;}
function wtView(r){const w=r.w,pr=prFact(r);if(w.prOnly)return{wt:true,prOnly:true,ok:true,files:0,ahead:0,gone:false,locked:false,pr:pr,ready:false};const g=wtFacts(w,pr)||{ok:false,files:0,ahead:0,gone:false};return{wt:true,ok:g.ok,files:g.files,ahead:g.ahead,gone:g.gone,locked:!!w.locked,pr:pr,ready:wtReady(w,wtFacts(w,pr),wtOpen(w))};}
function viewOf(r){if(r.kind==='wt')return wtView(r);const g=gitView(r);if(!g)return g;const w=wtOf(r);if(w&&wtReady(w,g,wtOpen(w)))g.ready=true;return g;}
function wtRows(){const out=[];Object.keys(repos).forEach(k=>{const rp=repos[k];(rp.worktrees||[]).forEach(w=>{if(w.main||!w.fks||w.fks.length)return;if(wsOnly&&wsN&&!rp.ws)return;out.push({id:w.k,kind:'wt',title:w.name,project:rp.name||'',last:0,w:w,rk:k});});});return out.concat(prOnlyRows());}
/** Open pull requests on a local branch that has no chat row and no worktree: one row each in the repository, from the pull request layer's list. */
function prOnlyRows(){const out=[];if(!prsOn)return out;Object.keys(prs).forEach(rk=>{const p=prs[rk],rp=repos[rk];if(!p||p.st!=='ok'||!rp||!rp.worktrees||!rp.worktrees.length)return;if(wsOnly&&wsN&&!rp.ws)return;
const used={};rp.worktrees.forEach(w=>{if(!w.detached&&w.branch)used[w.branch]=1;});rows.forEach(c=>{const e=c.fk&&gs[c.fk];if(e&&e.f&&e.f.rk===rk&&e.f.branch)used[e.f.branch]=1;});
Object.keys(p.by).forEach(b=>{if(used[b]||b===rp.defLocal)return;const x=p.by[b];out.push({id:'pb:'+rk+':'+encodeURIComponent(b),kind:'wt',title:x.title||b,project:rp.name||'',last:0,rk:rk,w:{k:'pb:'+rk,name:b,branch:b,detached:false,main:false,missing:false,locked:false,prOnly:true,fks:[],facts:null}});});});return out;}
function doneOf(r){const s=donemap[r.id];if(s===undefined||r.kind==='wt')return false;if(!gotDots||doneHidden(s,dotOf(r.id),r.last,gitView(r)))return true;
staleDone[r.id]=1;if(!staleT)staleT=setTimeout(flushDone,0);return false;}
function flushDone(){staleT=0;const ids=Object.keys(staleDone);staleDone={};ids.forEach(id=>{if(donemap[id]===undefined)return;delete donemap[id];vs.postMessage({type:'done',id:id,on:false});});sched();}
function wsOk(r){if(!wsOnly||!wsN||r.kind==='wt')return true;const e=fOf(r);if(!e)return true;const v=e.f?e.f.ws:e.ws;return v!==false;}
function holding(){const a=document.activeElement;return hoverId!==''||!!(a&&a.closest&&a.closest('.row'));}
function bandHeld(r,dot){const t=bandOf(dot,viewOf(r),r.last,Date.now()),p=placed[r.id];
if(p!==undefined&&p!==t&&holding()){moving=true;return p;}placed[r.id]=t;return t;}
function settle(ms){clearTimeout(settleT);settleT=setTimeout(()=>{settleT=0;placed={};render();},ms);}
function touch(){clearTimeout(swatch);if(scanLive)swatch=setTimeout(()=>{scanLive=false;Object.keys(gs).forEach(k=>{const e=gs[k];if(e.st==='queued'||e.st==='running'){e.st='timeout';e.reason='timed out';}});
Object.keys(repos).forEach(k=>{if(repos[k].st==='running'||repos[k].st==='queued')repos[k].st='timeout';});pruneRepos();prSilence();progUi();sched();},WATCH_SCAN_MS);}
function watchKey(k,ms){clearTimeout(fwatch[k]);fwatch[k]=setTimeout(()=>{delete fwatch[k];const e=gs[k];if(e&&(e.st==='running'||e.st==='queued')){e.st='timeout';e.reason='timed out';}const r=repos[k];if(r&&r.st==='running')r.st='timeout';sched();},ms);}
function onFolder(d){if(d.scan!==scan||typeof d.key!=='string')return;touch();const k=d.key,e=gs[k]||(gs[k]={});e.st=d.state;e.reason=d.reason||'';e.age=d.age;e.ws=d.ws;
if(d.state==='ok'&&d.facts)e.f=d.facts;else if(d.state==='none')e.f=undefined;
clearTimeout(fwatch[k]);delete fwatch[k];if(d.state==='running')watchKey(k,WATCH_FOLDER_MS);askOpen();sched();}
function onRepo(d){if(d.scan!==scan||typeof d.key!=='string')return;touch();const k=d.key,r=repos[k]||(repos[k]={});r.sc=scan;r.st=d.state;r.reason=d.reason||'';
if(Array.isArray(d.worktrees)&&((d.state!=='running'&&d.state!=='queued')||d.worktrees.length)){r.worktrees=d.worktrees;r.name=d.name||r.name||'';r.def=d.def||'';r.defLocal=d.defLocal||'';r.ws=!!d.ws;r.mset={};(d.merged||[]).forEach(b=>{r.mset[b]=1;});}
clearTimeout(fwatch[k]);delete fwatch[k];if(d.state==='running')watchKey(k,WATCH_FOLDER_MS);askOpen();sched();}
function progUi(){const p=$('prog');if(!scanLive||!prog||!prog.total){p.hidden=true;return;}
const q=prsOn&&prog.pr&&prog.pr.total?prog.pr:null,parts=[];
if(!q||prog.done<prog.total)parts.push('Checking git: '+prog.done+' of '+prog.total+(prog.total===1?' folder':' folders'));
if(q&&q.done<q.total)parts.push('Checking pull requests: '+q.done+' of '+q.total+(q.total===1?' repository':' repositories'));
if(!parts.length)parts.push('Checking git: '+prog.done+' of '+prog.total+(prog.total===1?' folder':' folders'));
const t=parts.join(' · '),tot=prog.total+(q?q.total:0),dn=prog.done+(q?q.done:0);p.hidden=false;p.textContent=t;
p.setAttribute('aria-valuemax',String(tot));p.setAttribute('aria-valuenow',String(dn));p.setAttribute('aria-valuetext',t);p.style.setProperty('--pct',Math.round(100*dn/Math.max(1,tot))+'%');}
function onProgress(d){if(d.scan!==scan||!d.git)return;touch();prog={done:Number(d.git.done)||0,total:Number(d.git.total)||0,pr:d.prs&&typeof d.prs==='object'?{done:Number(d.prs.done)||0,total:Number(d.prs.total)||0}:null};progUi();}
function onEnd(d){if(d.scan!==scan)return;ended=true;notes.gitMissing=!!d.gitMissing;noteUi();scanLive=false;clearTimeout(swatch);(Array.isArray(d.open)?d.open:[]).forEach(k=>{if(/^p\d+$/.test(k)){prTimeout('r'+k.slice(1));return;}const e=gs[k];if(e&&(e.st==='queued'||e.st==='running')){e.st='timeout';e.reason='timed out';}const r=repos[k];if(r&&(r.st==='running'||r.st==='queued'))r.st='timeout';});
pruneRepos();progUi();lastAt=Date.now();askOpen();render();const n=visibleRows().filter(r=>{const b=bandHeld(r,dotOf(r.id));return b==='needs'||b==='finish'||b==='waiting';}).length;say(scanComplete()?'Scan finished: '+n+(n===1?' item open.':' items open.'):'Scan finished, but some parts were not read: '+n+(n===1?' item open so far.':' items open so far.'));}
function onNotes(d){if(d.scan!==scan)return;notes={gitMissing:d.gitMissing===undefined?!!notes.gitMissing:!!d.gitMissing,more:Number(d.more)||0};if(d.prsOn!==undefined)setPrsOn(d.prsOn);noteUi();}
function onDetail(d){if(typeof d.id!=='string')return;const a=asked[d.id];if(a){clearTimeout(a.t);delete asked[d.id];}
detail[d.id]={commits:Array.isArray(d.commits)?d.commits:null,reason:d.reason||'Could not read the commits',ahead:a?a.ahead:-1};sched();}
function askDetail(id,force){if(asked[id])return;const r=visibleRows().find(x=>x.id===id),g=r&&viewOf(r);if(!g||!(g.ahead>0))return;
const d=detail[id];if(!force&&d&&d.ahead===g.ahead)return;
asked[id]={ahead:g.ahead,t:setTimeout(()=>{delete asked[id];detail[id]={commits:null,reason:'timed out',ahead:g.ahead};sched();},WATCH_DETAIL_MS)};vs.postMessage({type:'expand',id:id});}
function askOpen(){open.forEach(id=>askDetail(id,false));}
function retryDetail(id){delete detail[id];askDetail(id,true);sched();}
function resetDetail(){Object.keys(asked).forEach(k=>clearTimeout(asked[k].t));asked={};detail={};}
function pruneRepos(){Object.keys(repos).forEach(k=>{if(repos[k].sc!==scan){clearTimeout(fwatch[k]);delete fwatch[k];delete repos[k];}});}
function noteUi(){let h=esc(notes.gitMissing?'Git was not found on this computer. Only chat state is shown.':prNote());
if(notes.more>0)h+=' '+esc(notes.more+' more folders not scanned.')+' <button type="button" class="ab" data-a="more">Scan more</button>';$('note').innerHTML=h;}
function retryKey(k){if(/^p\d+$/.test(k)){const p=prs['r'+k.slice(1)];if(p){p.st='queued';p.reason='';}pwatchKey('r'+k.slice(1));vs.postMessage({type:'retry',key:k});sched();return;}if(!/^[fr]\d+$/.test(k))return;const e=gs[k];if(e){e.st='queued';e.reason='';}const r=repos[k];if(r){r.st='queued';r.reason='';}if(!r)watchKey(k,WATCH_FOLDER_MS+5000);vs.postMessage({type:'retry',key:k});sched();}
function cellsOf(r){
if(r.kind==='wt'){const w=r.w,rp=repos[r.rk]||{},f=w.facts;let fl='',busy=false,retry='';
if(w.prOnly)return{br:esc(w.branch),fl:'',ah:'',busy:false,retry:''};
if(w.missing)fl='folder missing';else if(f&&f.ok){if(f.fileTotal>0)fl=countWord(f.fileTotal,'file');}else if(f){fl='error';retry=r.rk;}
else if(rp.st==='timeout'||rp.st==='error'){fl=rp.st==='timeout'?'timed out':'error';retry=r.rk;}else if(rp.st==='running'||rp.st==='queued'){fl=rp.st==='running'?SPIN:'…';busy=true;}else fl='—';
return{br:esc(w.detached?'detached '+(w.sha||''):w.branch||''),fl:fl,ah:f&&f.ok?aheadText(f):'',busy:busy,retry:retry};}
if(!r.fk)return{br:'',fl:'',ah:'',busy:false,retry:''};
const e=fOf(r);if(!e)return{br:'',fl:'',ah:'',busy:false,retry:''};
const f=e.f,live=e.st==='queued'||e.st==='running';let fl='',retry='';
if(e.st==='queued')fl='<span class="q" data-tip="Waiting to read git">…</span>';else if(e.st==='running')fl=SPIN;
else if(e.st==='timeout'){fl='timed out';retry=r.fk;}else if(e.st==='error'){fl='error';retry=r.fk;}else if(e.st==='none')fl='—';
else if(f&&f.fileTotal>0)fl=countWord(f.fileTotal,'file');
const show=f&&(e.st==='ok'||live);
return{br:show?esc(f.detached?'detached '+(f.sha||''):f.branch||''):'',fl:fl,ah:show?aheadText(f):'',busy:live,retry:retry};}
function aheadText(f){return (f.ahead>0?'↑'+f.ahead:'')+(f.behind>0?(f.ahead>0?' ':'')+'↓'+f.behind:'')+(f.gone?(f.ahead>0||f.behind>0?' ':'')+'gone':'');}
function retryTip(e){return e&&e.reason?e.reason:'';}
function exGit(r){if(r.kind==='wt')return exWt(r);const e=fOf(r);if(!r.fk)return[['Git','No working folder is recorded for this chat.']];
if(!e||e.st==='queued'||e.st==='running'){const f0=e&&e.f;if(!f0)return[['Git','Reading git...']];}
if(e.st==='none')return[['Git',esc(e.reason||'Not a git folder')]];
if(!e.f)return[['Git',esc((e.st==='timeout'?'Timed out':'Could not read git')+(e.reason&&e.st!=='timeout'?': '+e.reason:''))]];
const f=e.f,g=gitView(r),kv=[['Branch',esc(f.detached?'detached at '+(f.sha||''):f.branch||'(none)')]];
const sync=[];if(f.ahead>0)sync.push(countWord(f.ahead,'commit')+' not pushed');if(f.behind>0)sync.push(countWord(f.behind,'commit')+' behind');if(f.gone)sync.push('the remote branch is gone');if(!f.upstream&&!f.gone&&!f.detached&&!f.noCommits)sync.push('no remote branch set');
kv.push(['Remote',esc(sync.length?sync.join(', '):'in step')]);
kv.push(['Changes',esc(f.fileTotal>0?countWord(f.fileTotal,'file')+' ('+f.staged+' staged, '+f.modified+' changed, '+f.untracked+' new)':'none')]);
if(e.age>=1)kv.push(['Checked',esc(e.age>=60?Math.floor(e.age/60)+' min ago (kept from an earlier scan)':e.age+' s ago (kept from an earlier scan)')]);
const w=wtOf(r);if(w&&wtReady(w,g,wtOpen(w)))kv.push(['Worktree','Ready to remove. The extension never removes anything: use Copy remove command.']);
exPr(r).forEach(x=>kv.push(x));
return kv;}
function exWt(r){if(r.w.prOnly){const k=[['Branch',esc(r.w.branch)],['State','Open pull request on a local branch with no chat and no worktree.']];exPr(r).forEach(x=>k.push(x));return k;}const w=r.w,f=w.facts,kv=[['Branch',esc(w.detached?'detached at '+(w.sha||''):w.branch||'(none)')],['Folder',esc(w.path||w.name)]];
if(w.locked)kv.push(['State',esc('Locked'+(w.lockReason?': '+w.lockReason:'')+'. Not removable until unlocked.')]);else if(w.missing)kv.push(['State','The folder is missing. Prune the worktree record.']);
else if(f&&f.ok){const s=[];if(f.fileTotal>0)s.push(countWord(f.fileTotal,'changed file'));if(f.ahead>0)s.push(countWord(f.ahead,'commit')+' not pushed');if(f.gone)s.push('remote branch gone');if(w.merged===true)s.push('merged');kv.push(['State',esc(s.length?s.join(', '):'clean')]);}
else kv.push(['State',esc((repos[r.rk]||{}).st==='running'?'Reading git...':(repos[r.rk]||{}).st==='queued'?'Waiting to read git':'Not read')]);
exPr(r).forEach(x=>kv.push(x));
return kv;}
function exLists(r){let h='';const e=r.kind==='wt'?{f:r.w.facts&&r.w.facts.ok?{files:r.w.facts.files,fileTotal:r.w.facts.fileTotal,ahead:r.w.facts.ahead}:null,key:r.id}:{f:(fOf(r)||{}).f,key:r.fk};
const f=e.f;if(f&&f.files&&f.files.length){h+='<div class="xh">Uncommitted files ('+f.fileTotal+')</div><div class="gfs">'+f.files.map((x,i)=>'<button type="button" class="gf" data-a="file" data-k="'+esc(e.key)+'" data-i="'+i+'" aria-label="'+esc('Open file '+x.p)+'" data-tip="'+esc(x.p)+'"><span class="fs">'+esc(x.s)+'</span> '+esc(x.p)+'</button>').join('')+(f.fileTotal>f.files.length?'<span class="gmore">+'+(f.fileTotal-f.files.length)+' more</span>':'')+'</div>';}
if(f&&f.ahead>0){const d=detail[r.id];h+='<div class="xh">Unpushed commits ('+f.ahead+')</div>';
if(!d)h+='<div class="gw">Loading...</div>';else if(!d.commits)h+='<div class="gw">'+esc(d.reason||'Could not read the commits')+' '+ibtn('dretry','Retry reading the unpushed commits','retry','Read the commits again')+'</div>';
else h+=d.commits.map(c=>'<div class="gw"><code>'+esc(c.sha)+'</code> '+esc(c.subject)+'</div>').join('')+(f.ahead>d.commits.length?'<div class="gw gmore">+'+(f.ahead-d.commits.length)+' more</div>':'');}
const rk=r.kind==='wt'?r.rk:(f&&f.rk),rp=rk?repos[rk]:null;
if(rp&&rp.worktrees&&rp.worktrees.length>1){const mine=r.kind==='wt'?r.w.k:(wtOf(r)||{}).k;h+='<div class="xh">Worktrees ('+rp.worktrees.length+')</div>'+rp.worktrees.map(w=>'<div class="gw'+(w.k===mine?' here':'')+'">'+esc(w.name)+' <span class="br">'+esc(w.detached?'detached':w.branch||'')+'</span>'+(w.main?' main':'')+(w.locked?' locked':'')+(w.missing?' missing':'')+(w.k===mine?' (this one)':'')+'</div>').join('');}
if(r.kind!=='wt'&&r.fk){const same=rows.filter(x=>x.fk===r.fk&&x.id!==r.id).slice(0,5);if(same.length)h+='<div class="xh">Other chats in this folder</div>'+same.map(x=>'<div class="gw">'+esc(x.title||'Untitled chat')+'</div>').join('');}
return h;}
`;
