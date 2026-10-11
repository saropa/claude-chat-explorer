/** View layer of the Open Work page script: filter box, state filters, sort, copy summary, branches without a worktree, empty states.
 *  Shares the page's top-level scope (CORE runs after it); nothing here touches the page at load. */
export const OW_VIEW_JS = String.raw`
const SORTS=[['recent','Recent activity'],['name','Name'],['repo','Repository']],FLAGS=[['pr','Has open PR','Only rows with an open pull request',1],['fail','Failing checks','Only rows whose pull request has failing checks',1],['dirty','Uncommitted','Only rows with changed files that are not committed',0],['push','Unpushed','Only rows with commits that are not pushed',0]];
const IC={open:'<path d="M6.5 3H3v10h10V9.5M9 3h4v4M13 3L7.5 8.5"/>',copy:'<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M3 10.5V3h7.5"/>',find:'<circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/>',archive:'<rect x="2" y="3" width="12" height="3"/><path d="M3 6v7h10V6M6.5 9h3"/>',done:'<path d="M3 8.5l3.5 3.5L13 4.5"/>',undone:'<path d="M5 4L2.5 7 5 10M3 7h6.5a3.5 3.5 0 010 7H6"/>',retry:'<path d="M13 8a5 5 0 11-1.6-3.7M13 2.5v3h-3"/>',pr:'<circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6M12 11V6.5A2.5 2.5 0 009.5 4H8"/>',link:'<path d="M6.5 9.5l3-3M7.5 4.5l1-1a2.6 2.6 0 013.7 3.7l-1 1M8.5 11.5l-1 1a2.6 2.6 0 01-3.7-3.7l1-1"/>',trash:'<path d="M3 4h10M6 4V2.5h4V4M4.5 4l.5 9.5h6l.5-9.5"/>',help:'<circle cx="8" cy="8" r="6"/><path d="M6.2 6.3a1.9 1.9 0 113 1.5c-.7.5-1.2.9-1.2 1.7M8 11.6v.1"/>',summary:'<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>',check:'<path d="M3 8.5l3.5 3.5L13 4.5"/>',branch:'<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M4.5 5v6M11.5 7c0 2.5-3 2.5-7 4"/>'};
function ico(n){return '<svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(IC[n]||'')+'</svg>';}
function ibtn(a,label,icon,tip,extra){return '<button type="button" class="ab ib" data-a="'+a+'"'+(extra||'')+' aria-label="'+esc(label)+'" title="'+esc(tip||label)+'">'+ico(icon)+'</button>';}
function pctClass(p){return p>80?'cr':p>=50?'cy':'cg';}
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
function smUi(){const b=$('smb'),t=sm.st==='busy'?'Copying...':sm.st==='done'?'Copied '+countWord(sm.n,'item'):'Copy summary';b.innerHTML=ico(sm.st==='done'?'check':'summary');b.title=t==='Copy summary'?'Copy a summary of everything open as text':t;b.setAttribute('aria-label',t);b.setAttribute('aria-busy',String(sm.st==='busy'));}
function summaryItems(){const now=Date.now();return visibleRows().map(r=>{const g=viewOf(r),dot=dotOf(r.id),b=bandOf(dot,g,r.last,now);if(b==='idle')return null;
const wt=r.kind==='wt',e=wt?null:fOf(r),f=wt?(r.w.facts&&r.w.facts.ok?r.w.facts:null):e&&e.f,br=wt?(r.w.detached?'':r.w.branch||''):f?(f.detached?'':f.branch||''):'';
return{band:b,title:r.title||(wt?'Worktree':'Untitled chat'),project:r.project||'',branch:br,state:wt?'':({waiting:'waiting for you',unread:'unread',running:'running'})[dot]||'',files:g?g.files||0:0,ahead:g?g.ahead||0:0,pr:g&&g.pr?g.pr:null,wt:wt,prOnly:!!(wt&&r.w.prOnly),ready:!!(g&&g.ready),locked:!!(g&&g.locked)};}).filter(Boolean);}
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
else if(b.st==='error')h+='<div class="gw">'+esc(b.reason)+' '+ibtn('brx2','Read the branches again','retry','Read the branches again',' data-k="'+k+'"')+'</div>';
else if(!b.list.length)h+='<div class="gw gmore">No leftover branches.</div>';
else h+=b.list.map((x,i)=>'<div class="gw"><code title="'+esc(x.name)+'">'+esc(x.name)+'</code> <span class="q">'+(x.merged?'merged':'remote branch gone, not merged here')+'</span> '+ibtn('brcopy','Copy '+cw()+'delete command for branch '+x.name,'trash','Copy a '+cw()+'command that deletes this branch. Nothing is run.',' data-k="'+k+'" data-i="'+i+'"')+'</div>').join('')+(b.more>0?'<div class="gw gmore">+'+b.more+' more</div>':'');}
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
