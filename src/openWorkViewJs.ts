/** View layer of the Open Work page script: filter box, state filters, sort, copy summary, branches without a worktree, empty states.
 *  Shares the page's top-level scope (CORE runs after it); nothing here touches the page at load. */
export const OW_VIEW_JS = String.raw`
const SORTS=[['recent','Recent activity'],['name','Name'],['repo','Repository']],FLAGS=[['pr','Has open PR','Only rows with an open pull request',1],['fail','Failing checks','Only rows whose pull request has failing checks',1],['dirty','Uncommitted','Only rows with changed files that are not committed',0],['push','Unpushed','Only rows with commits that are not pushed',0]];
const Q_DEBOUNCE_MS=200,BR_WATCH_MS=15000,SUM_WATCH_MS=5000,SUM_DONE_MS=2000;
let winCmd=false,fq='',flt={pr:false,fail:false,dirty:false,push:false},sortMode='recent',sm={st:'',n:0},smT=0,smW=0,brs={},brOpen=false,brx={},bwatch={},qT=0,ended=false,refocus='';
function cw(){return winCmd?'PowerShell ':'';}
function filtering(){return fq!==''||flt.pr||flt.fail||flt.dirty||flt.push;}
function rowHay(r){const wt=r.kind==='wt',e=wt?null:fOf(r),f=wt?(r.w.facts&&r.w.facts.ok?r.w.facts:null):e&&e.f,rp=repos[wt?r.rk:f&&f.rk]||{};
const br=wt?(r.w.detached?'':r.w.branch||''):f?(f.detached?'':f.branch||''):'',p=prInfo(r),pr=p&&p.pr?'#'+p.pr.n+' pr '+p.pr.n+' '+(p.pr.title||''):'';
return [r.title,r.project,br,rp.name,f&&f.files?f.files.map(x=>x.p).join(' '):'',pr].join(' ');}
function filterOk(r){if(fq&&!filterMatch(rowHay(r),fq))return false;return flagPass(viewOf(r),flt);}
function filtered(v){return filtering()?v.filter(filterOk):v;}
function saveView(){vs.postMessage({type:'view',q:fq,f:{pr:flt.pr,fail:flt.fail,dirty:flt.dirty,push:flt.push},sort:sortMode});}
function applyQ(v){fq=String(v==null?'':v).trim().slice(0,80);saveView();render();}
function clearFilters(){fq='';$('fq').value='';flt={pr:false,fail:false,dirty:false,push:false};saveView();render();}
function toggleFlag(k){if(!(k in flt))return;flt[k]=!flt[k];refocus='[data-f="'+k+'"]';saveView();render();}
function setSort(v){if(!SORTS.some(s=>s[0]===v))return;sortMode=v;saveView();render();}
function sortLabel(){return SORTS.find(s=>s[0]===sortMode)[1];}
function applyView(v){v=v&&typeof v==='object'?v:{};fq=typeof v.q==='string'?v.q.slice(0,80):'';$('fq').value=fq;const f=v.f&&typeof v.f==='object'?v.f:{};flt={pr:f.pr===true,fail:f.fail===true,dirty:f.dirty===true,push:f.push===true};sortMode=SORTS.some(s=>s[0]===v.sort)?v.sort:'recent';}
function viewUi(){const ae=document.activeElement;if(ae&&ae.dataset&&ae.dataset.f&&(ae.dataset.f in flt)&&!refocus)refocus='[data-f="'+ae.dataset.f+'"]';const flags=FLAGS.filter(f=>!f[3]||prsOn);
$('fch').innerHTML=flags.map(f=>'<button type="button" class="chip" data-a="flt" data-f="'+f[0]+'" aria-pressed="'+flt[f[0]]+'" data-tip="'+esc(f[2])+'">'+esc(f[1])+'</button>').join('')+(filtering()?'<button type="button" class="ab" data-a="clearf" aria-label="Clear all filters" data-tip="Clear the filter box and the state filters">Clear filters</button>':'');
$('srm').querySelectorAll('input').forEach(i=>{i.checked=i.value===sortMode;});$('srt').textContent='Sort: '+sortLabel();$('srb').setAttribute('aria-label','Sort rows by: '+sortLabel());smUi();}
function smUi(){const b=$('smb');b.textContent=sm.st==='busy'?'Copying...':sm.st==='done'?'Copied '+countWord(sm.n,'item'):'Copy summary';b.setAttribute('aria-busy',String(sm.st==='busy'));}
function summaryItems(){const now=Date.now();return visibleRows().map(r=>{const g=viewOf(r),dot=dotOf(r.id),b=bandOf(dot,g,r.last,now);if(b==='idle')return null;
const wt=r.kind==='wt',e=wt?null:fOf(r),f=wt?(r.w.facts&&r.w.facts.ok?r.w.facts:null):e&&e.f,br=wt?(r.w.detached?'':r.w.branch||''):f?(f.detached?'':f.branch||''):'';
return{band:b,title:r.title||(wt?'Worktree':'Untitled chat'),project:r.project||'',branch:br,state:wt?'':({waiting:'waiting for you',unread:'unread',running:'running'})[dot]||'',files:g?g.files||0:0,ahead:g?g.ahead||0:0,pr:g&&g.pr?g.pr:null,wt:wt,ready:!!(g&&g.ready),locked:!!(g&&g.locked)};}).filter(Boolean);}
function copySummary(){if(sm.st==='busy')return;const s=summaryOf(summaryItems(),days);sm={st:'busy',n:s.n};smUi();clearTimeout(smW);smW=setTimeout(()=>{if(sm.st==='busy'){sm={st:'',n:0};smUi();say('Could not copy the summary.');}},SUM_WATCH_MS);vs.postMessage({type:'summary',text:s.text,n:s.n});}
function onSummaryState(d){clearTimeout(smW);clearTimeout(smT);if(d.state==='done'){sm={st:'done',n:Number(d.n)||0};say('Copied the summary of '+countWord(sm.n,'item')+'.');smT=setTimeout(()=>{sm={st:'',n:0};smUi();},SUM_DONE_MS);}else{sm={st:'',n:0};say('Could not copy the summary.');}smUi();}
function anyGit(){return Object.keys(gs).some(k=>gs[k].st==='ok');}
function gitSettled(){return Object.keys(gs).every(k=>gs[k].st==='ok'||gs[k].st==='none');}
function noRepoNote(){return loaded&&ended&&!scanLive&&!notes.gitMissing&&rows.length>0&&!anyGit()?'<p class="msg" role="status">No git repositories were found for these chats. Only chat state is shown.</p>':'';}
function scanComplete(){if(!loaded||!ended||scanLive||notes.gitMissing||notes.more>0||!gitSettled())return false;
if(Object.keys(repos).some(k=>repos[k].st!=='ok'))return false;
if(rows.some(r=>r.fk&&!gs[r.fk]))return false;
if(prsOn&&Object.keys(repos).some(k=>{const q=prs[k];return !q||(q.st==='unavailable'?q.reason!=='not a GitHub repository':q.st!=='ok');}))return false;return true;}
function allClear(vis){if(filtering()||!vis.length||!anyGit()||!scanComplete())return false;const by=bandRows(vis,dots,bandHeld);return!by.needs.length&&!by.finish.length&&!by.waiting.length&&!by.tidy.length;}
function clearHtml(){return '<div class="clear" role="status"><h2>All clear</h2><p>Nothing open. Every chat in the last '+days+' days is committed, pushed and closed.</p></div>';}
function toggleBr(k){if(!/^r\d+$/.test(k))return;if(brx[k])delete brx[k];else{brx[k]=1;if(!brs[k]||brs[k].st==='error')askBr(k);}refocus='[data-a="brx"][data-k="'+k+'"]';render();}
function askBr(k){brs[k]={st:'loading'};clearTimeout(bwatch[k]);bwatch[k]=setTimeout(()=>{delete bwatch[k];brs[k]={st:'error',reason:'timed out'};sched();},BR_WATCH_MS);vs.postMessage({type:'branches',key:k});}
function onBranchList(d){const k=d.key;if(typeof k!=='string'||!/^r\d+$/.test(k)||!brx[k])return;clearTimeout(bwatch[k]);delete bwatch[k];
brs[k]=Array.isArray(d.list)?{st:'ok',list:d.list.slice(0,50).map(x=>({name:String(x&&x.name||''),merged:!!(x&&x.merged),gone:!!(x&&x.gone)})),more:Number(d.more)||0}:{st:'error',reason:String(d.reason||'Could not read the branches')};sched();}
function resetBr(){Object.keys(bwatch).forEach(k=>clearTimeout(bwatch[k]));bwatch={};brs={};brx={};}
function brRepo(k){const rp=repos[k],b=brs[k],open=!!brx[k];let h='<div class="bre"><button type="button" class="ab" data-a="brx" data-k="'+k+'" aria-expanded="'+open+'" aria-label="'+esc('Branches without a worktree in '+rp.name)+'">'+esc(rp.name)+'</button>';
if(open){if(!b||b.st==='loading')h+='<div class="gw">Loading...</div>';
else if(b.st==='error')h+='<div class="gw">'+esc(b.reason)+' <button type="button" class="ab" data-a="brx2" data-k="'+k+'" aria-label="Read the branches again" data-tip="Read the branches again">Retry</button></div>';
else if(!b.list.length)h+='<div class="gw gmore">No leftover branches.</div>';
else h+=b.list.map((x,i)=>'<div class="gw"><code>'+esc(x.name)+'</code> <span class="q">'+(x.merged?'merged':'remote branch gone, not merged here')+'</span> <button type="button" class="ab" data-a="brcopy" data-k="'+k+'" data-i="'+i+'" aria-label="'+esc('Copy '+cw()+'delete command for branch '+x.name)+'" data-tip="Copy a '+cw()+'command that deletes this branch. Nothing is run.">Copy '+cw()+'delete command</button></div>').join('')+(b.more>0?'<div class="gw gmore">+'+b.more+' more</div>':'');}
return h+'</div>';}
function brHtml(){if(!loaded)return'';const ks=Object.keys(repos).filter(k=>{const rp=repos[k];return rp.st==='ok'&&rp.name&&(!wsOnly||!wsN||rp.ws);}).sort((a,b)=>repos[a].name.localeCompare(repos[b].name));if(!ks.length)return'';
return '<section class="band" aria-label="Branches without a worktree"><h2 class="bh" role="heading" aria-level="2"><button type="button" class="ab" data-a="brsec" aria-expanded="'+brOpen+'" aria-controls="brbody" data-tip="Local branches with no chat and no worktree, merged or with their remote branch gone. Read only: nothing is deleted.">Branches without a worktree</button></h2>'
+(brOpen?'<div id="brbody"><p class="sub">Local branches with no chat and no worktree that are merged or whose remote branch is gone. Nothing is deleted: copy a command and run it yourself.</p>'+ks.map(brRepo).join('')+'</div>':'')+'</section>';}
function viewKey(e){const t=e.target||{},typing=t.id==='fq'||/^(INPUT|TEXTAREA|SELECT)$/.test(String(t.tagName||''));if(e.ctrlKey||e.metaKey||e.altKey)return false;
if(typing){if(t.id==='fq'&&e.key==='Escape'){e.preventDefault();if($('fq').value){$('fq').value='';clearTimeout(qT);applyQ('');}else $('fq').blur();return true;}
if(t.id==='fq'&&e.key==='ArrowDown'){const b=document.querySelector('.rb');if(b){e.preventDefault();b.focus();}return true;}return true;}
if(e.key==='/'){e.preventDefault();$('fq').focus();if($('fq').select)$('fq').select();return true;}
if(e.key==='?'){e.preventDefault();pop.toggle('shb','shm');return true;}return false;}
`;
