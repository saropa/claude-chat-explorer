/** Pull request layer of the Open Work page script: per-repository PR state and per-PR check results from streamed host messages.
 *  Shares the page's top-level scope (GIT_JS and CORE run with it); nothing here touches the page at load. */
export const OW_PR_JS = String.raw`
const WATCH_PR_MS=25000,SPINP='<span class="spin" role="img" aria-label="Checking pull request"></span>',PERM={'gh not installed':1,'not a GitHub repository':1,'not signed in to gh':1},CHK=['passing','failing','pending','none','unavailable'],PRS_OFF='Pull requests are off (setting Look Up Pull Requests).';
let prs={},prsOn=true,pwatch={};
function prSite(r){let rk='',b='';if(r.kind==='wt'){rk=r.rk||'';b=r.w&&!r.w.detached?r.w.branch||'':'';}else{const e=fOf(r),f=e&&e.f;if(f){rk=f.rk||'';b=f.detached?'':f.branch||'';}}return rk&&b?{rk:rk,b:b}:null;}
function prInfo(r){if(!prsOn)return null;const s=prSite(r);if(!s)return null;const p=prs[s.rk];if(!p)return{rk:s.rk,p:null,pr:null,c:null};
const pr=p.by&&p.by[s.b]?p.by[s.b]:null;return{rk:s.rk,p:p,pr:pr,c:pr?p.chk[pr.n]||null:null};}
function prFact(r){const q=prInfo(r);if(!q||!q.pr)return undefined;const c=q.c;return{n:q.pr.n,review:q.pr.review||'',draft:!!q.pr.draft,checks:c&&c.st!=='checking'?c.st:'unknown'};}
function prTimeout(rk){const p=prs[rk];if(!p)return;if(p.st==='queued'||p.st==='checking'){p.st='unavailable';p.reason='timed out';}
Object.keys(p.chk).forEach(n=>{const c=p.chk[n];if(c.st==='checking'){c.st='unavailable';c.reason='timed out';}c.re=false;});}
function prSilence(){Object.keys(prs).forEach(prTimeout);}
function pwatchKey(rk){clearTimeout(pwatch[rk]);pwatch[rk]=setTimeout(()=>{delete pwatch[rk];prTimeout(rk);sched();},WATCH_PR_MS);}
function prDone(rk){clearTimeout(pwatch[rk]);delete pwatch[rk];}
function onPrs(d){if(d.scan!==scan||typeof d.repo!=='string'||!prsOn)return;touch();const p=prs[d.repo]||(prs[d.repo]={chk:{},by:{},st:'',reason:''});
p.st=String(d.state||'');p.reason=d.reason?String(d.reason):'';
if(d.state==='ok'&&d.by&&typeof d.by==='object'){p.by={};Object.keys(d.by).forEach(b=>{const x=d.by[b];if(x&&x.n>0)p.by[b]={n:Number(x.n),title:String(x.title||''),draft:!!x.draft,review:String(x.review||''),link:!!x.link};});}
prDone(d.repo);if(d.state==='checking'||d.state==='ok')pwatchKey(d.repo);sched();}
function onChecks(d){if(d.scan!==scan||typeof d.repo!=='string'||!prsOn||!(d.n>0))return;touch();const p=prs[d.repo]||(prs[d.repo]={chk:{},by:{},st:'',reason:''}),n=Number(d.n),o=p.chk[n];
if(d.state==='checking'){if(o&&o.st!=='checking'&&o.st!=='unavailable')o.re=true;else p.chk[n]={st:'checking'};}
else p.chk[n]={st:CHK.indexOf(d.state)>=0?d.state:'unavailable',total:Number(d.total)||0,failing:Number(d.failing)||0,pending:Number(d.pending)||0,names:Array.isArray(d.names)?d.names.slice(0,5).map(String):[],reason:d.reason?String(d.reason):''};
pwatchKey(d.repo);sched();}
function setPrsOn(v){const on=v!==false;if(on===prsOn&&prsSet)return;prsSet=true;prsOn=on;if(!on){prs={};Object.keys(pwatch).forEach(k=>clearTimeout(pwatch[k]));pwatch={};}prsUi();sched();}
let prsSet=false;
function prsUi(){const t=$('ttl');if(!t)return;$('wrap').classList.toggle('wpr',prsOn);if(prsOn){t.removeAttribute('data-tip');delete t.dataset.tip;}else{t.setAttribute('data-tip',PRS_OFF);t.dataset.tip=PRS_OFF;}}
function prRetryKey(q){return q&&q.p&&q.p.st==='unavailable'&&!PERM[q.p.reason]?'p'+q.rk.slice(1):'';}
function ckText(c){if(c.st==='failing')return'✗ checks failing ('+c.failing+' of '+c.total+')';if(c.st==='pending')return'◔ checks pending';if(c.st==='passing')return'✓ checks passing';return'';}
function ckTip(c){return c.st==='failing'&&c.names&&c.names.length?'Failing: '+c.names.join(', '):c.st==='pending'?c.pending+' of '+c.total+' checks still running':c.st==='passing'?c.total+' checks passed':'';}
function prCells(r){const none={pr:'',ck:'',busy:false,retry:''};if(!prsOn)return none;const q=prInfo(r);if(!q||!q.p)return none;const p=q.p;
if(p.st==='queued')return{pr:'<span class="q" data-tip="Waiting to look up pull requests">…</span>',ck:'',busy:true,retry:''};
if(p.st==='checking')return{pr:SPINP+' checking',ck:'',busy:true,retry:''};
if(p.st==='unavailable'){const rt=prRetryKey(q);return{pr:rt?'<span class="q" data-tip="'+esc(p.reason||'')+'">PR info unavailable</span>':'',ck:'',busy:false,retry:rt};}
if(!q.pr)return{pr:'<span class="q">no PR</span>',ck:'',busy:false,retry:''};
const x=q.pr,c=q.c,pr='#'+x.n+(x.draft?' draft':'')+(x.review?' '+x.review:'');
if(!c||c.st==='checking')return{pr:esc(pr),ck:SPINP+' checking',busy:true,retry:''};
if(c.st==='unavailable'){const rt=PERM[c.reason]?'':'p'+q.rk.slice(1);return{pr:esc(pr),ck:'<span class="q" data-tip="'+esc(c.reason||'')+'">PR info unavailable</span>',busy:false,retry:rt};}
const cls=c.st==='failing'?'fail':c.st==='pending'?'pend':c.st==='passing'?'pass':'';
return{pr:esc(pr),ck:c.st==='none'?'':'<span class="ck '+cls+'" data-tip="'+esc(ckTip(c))+'">'+esc(ckText(c))+'</span>'+(c.re?' '+SPINP:''),busy:!!c.re,retry:''};}
function exPr(r){const q=prInfo(r);if(!q||!q.pr)return[];const x=q.pr,c=q.c,kv=[['Pull request',esc('#'+x.n+' '+(x.title||'')+(x.draft?' (draft)':'')+(x.review?' ('+x.review+')':''))]];
if(c&&(c.st==='failing'||c.st==='pending'||c.st==='passing'))kv.push(['Checks',esc(ckText(c).slice(2)+(c.st==='failing'&&c.names&&c.names.length?': '+c.names.join(', '):''))]);
else if(c&&c.st==='unavailable')kv.push(['Checks',esc('PR info unavailable ('+(c.reason||'unknown')+')')]);return kv;}
function prActs(r,t){const q=prInfo(r);if(!q||!q.pr||!q.pr.link)return'';const n=q.pr.n,k=esc(q.rk);
return '<button type="button" class="ab" data-a="pr" data-k="'+k+'" data-n="'+n+'" aria-label="'+esc('Open pull request #'+n+': '+t)+'" data-tip="Open the pull request page">PR #'+n+'</button>'
+'<button type="button" class="ab" data-a="prc" data-k="'+k+'" data-n="'+n+'" aria-label="'+esc('Copy PR link: '+t)+'" data-tip="Copy the pull request link">Copy PR link</button>';}
function prNote(){let n=0,why='';Object.keys(prs).forEach(k=>{const p=prs[k];if(p.st==='unavailable'){n++;if(!why)why=p.reason||'';}});
return prsOn&&n?'Pull requests unavailable for '+n+(n===1?' repository':' repositories')+(why?': '+why:'')+'.':'';}
`;
