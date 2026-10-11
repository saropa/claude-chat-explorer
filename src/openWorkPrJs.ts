/** Pull request layer of the Open Work page script: per-repository PR state and per-PR check results from streamed host messages.
 *  Shares the page's top-level scope (GIT_JS and CORE run with it); nothing here touches the page at load. */
export const OW_PR_JS = String.raw`
const WATCH_PR_MS=25000,SPINP='<span class="spin" role="img" aria-label="Checking pull request"></span>',PERM={'gh not installed':1,'not a GitHub repository':1,'not signed in to gh':1},CHK=['passing','failing','pending','none','unavailable'],PRS_OFF='Pull requests are off (setting Look Up Pull Requests).';
let prs={},prsOn=true,pwatch={},ghs=null;
function revWord(v){const m={APPROVED:'approved',CHANGES_REQUESTED:'changes requested',REVIEW_REQUIRED:'review requested'};return m[v]||(/^(approved|changes requested|review requested)$/.test(v)?v:'');}
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
p.st=String(d.state||'');p.reason=d.reason?String(d.reason):'';if(d.state==='ok')p.at=Date.now();
if(d.state==='ok'&&d.by&&typeof d.by==='object'){p.by={};Object.keys(d.by).forEach(b=>{const x=d.by[b];if(x&&x.n>0)p.by[b]={n:Number(x.n),title:String(x.title||''),draft:!!x.draft,review:revWord(String(x.review||'')),link:!!x.link};});}
prDone(d.repo);if(d.state==='checking'||d.state==='ok')pwatchKey(d.repo);sched();}
function onChecks(d){if(d.scan!==scan||typeof d.repo!=='string'||!prsOn||!(d.n>0))return;touch();const p=prs[d.repo]||(prs[d.repo]={chk:{},by:{},st:'',reason:''}),n=Number(d.n),o=p.chk[n];
if(d.state==='checking'){if(o&&o.st!=='checking'&&o.st!=='unavailable')o.re=true;else p.chk[n]={st:'checking'};}
else p.chk[n]={st:CHK.indexOf(d.state)>=0?d.state:'unavailable',total:Number(d.total)||0,failing:Number(d.failing)||0,pending:Number(d.pending)||0,names:Array.isArray(d.names)?d.names.slice(0,5).map(String):[],reason:d.reason?String(d.reason):''};
pwatchKey(d.repo);sched();}
function setPrsOn(v){const on=v!==false;if(on===prsOn&&prsSet)return;prsSet=true;prsOn=on;if(!on){prs={};ghs=null;Object.keys(pwatch).forEach(k=>clearTimeout(pwatch[k]));pwatch={};}prsUi();sched();}
let prsSet=false;
function onGh(d){if(d.scan!==scan||!prsOn)return;ghs={st:/^(ok|missing|unauth|error)$/.test(String(d.state))?String(d.state):'error',reason:d.reason?String(d.reason):''};ghUi();sched();}
function ghUi(){const b=$('ghs');if(!b)return;const s=ghStatus({on:prsOn,gh:ghs,repos:Object.keys(prs).map(k=>({st:prs[k].st,reason:prs[k].reason,at:prs[k].at||0})),now:Date.now()});
b.className='gst g-'+s.cls;b.dataset.g=s.kind;b.dataset.tip=s.tip;$('ght').textContent=s.text;b.setAttribute('aria-label','GitHub connection: '+s.text+'. '+s.tip);}
function ghClick(){const b=$('ghs');if(b&&b.dataset.g==='off')vs.postMessage({type:'prsSetting'});else refresh();}
const UNK={'not a GitHub repository':'not on GitHub','gh not installed':'gh missing','not signed in to gh':'gh signed out','timed out':'timed out','GitHub not reachable':'offline','GitHub rate limit reached':'rate limited','canceled':'canceled'};
function prUnk(why){return '<span class="q unk" data-tip="'+esc('Pull request status unknown: '+(why||'lookup failed'))+'">'+esc(UNK[why]||'lookup failed')+'</span>';}
function brSite(r){const s=prSite(r);if(!s)return null;const p=prsOn?prs[s.rk]:null;return p&&p.st==='unavailable'&&p.reason==='not a GitHub repository'?null:s;}
function brCell(r,c){if(!c.br)return'<span class="nb">\u2014</span>';const s=brSite(r);if(!s)return c.br;const q=prInfo(r),n=q&&q.pr&&q.pr.link?q.pr.n:0;
return '<span class="lk" role="link" data-a="brl" data-k="'+esc(s.rk)+'" data-b="'+esc(s.b)+'" data-n="'+n+'" data-tip="'+esc(n?'Open pull request #'+n+' on GitHub':'Open the branch on GitHub')+'">'+c.br+'</span>';}
function brAct(r,t){const s=brSite(r);if(!s)return'';const q=prInfo(r),n=q&&q.pr&&q.pr.link?q.pr.n:0;
return ibtn('brl',(n?'Open pull request #'+n+' on GitHub: ':'Open branch on GitHub: ')+t,'branch',n?'Open the pull request on GitHub':'Open the branch on GitHub',' data-k="'+esc(s.rk)+'" data-b="'+esc(s.b)+'" data-n="'+n+'"');}
function prsUi(){const t=$('ttl');if(!t)return;ghUi();$('wrap').classList.toggle('wpr',prsOn);if(prsOn){t.removeAttribute('data-tip');delete t.dataset.tip;}else{t.setAttribute('data-tip',PRS_OFF);t.dataset.tip=PRS_OFF;}}
function prB(x,t){return '<span class="prb '+(x.merged?'pm':x.draft?'pd':'po')+'">'+esc(t)+'</span>';}
function prRetryKey(q){return q&&q.p&&q.p.st==='unavailable'&&!PERM[q.p.reason]?'p'+q.rk.slice(1):'';}
function ckText(c){if(c.st==='failing')return'✗ checks failing ('+c.failing+' of '+c.total+')';if(c.st==='pending')return'◔ checks pending';if(c.st==='passing')return'✓ checks passing';return'';}
function ckTip(c){return c.st==='failing'&&c.names&&c.names.length?'Failing: '+c.names.join(', '):c.st==='pending'?c.pending+' of '+c.total+' checks still running':c.st==='passing'?c.total+' checks passed':'';}
function prCells(r){const none={pr:'',ck:'',busy:false,retry:''};if(!prsOn)return none;const q=prInfo(r);if(!q||!q.p)return none;const p=q.p;
if(p.st==='queued')return{pr:'<span class="q" data-tip="Waiting to look up pull requests">…</span>',ck:'',busy:true,retry:''};
if(p.st==='checking')return{pr:SPINP+' checking',ck:'',busy:true,retry:''};
if(p.st==='unavailable'){const rt=prRetryKey(q);return{pr:prUnk(p.reason),ck:'',busy:false,retry:rt};}
if(!q.pr)return{pr:p.st==='ok'?'<span class="q" data-tip="Looked up: no open pull request on this branch">no PR</span>':'',ck:'',busy:false,retry:''};
const x=q.pr,c=q.c,pr='#'+x.n+(x.draft?' draft':'')+(x.review?' '+x.review:'');
if(!c||c.st==='checking')return{pr:prB(x,pr),ck:SPINP+' checking',busy:true,retry:''};
if(c.st==='unavailable'){const rt=PERM[c.reason]?'':'p'+q.rk.slice(1);return{pr:prB(x,pr),ck:'<span class="q" data-tip="'+esc(c.reason||'')+'">PR info unavailable</span>',busy:false,retry:rt};}
const cls=c.st==='failing'?'fail':c.st==='pending'?'pend':c.st==='passing'?'pass':'';
return{pr:prB(x,pr),ck:c.st==='none'?'':'<span class="ck '+cls+'" data-tip="'+esc(ckTip(c))+'">'+esc(ckText(c))+'</span>'+(c.re?' '+SPINP:''),busy:!!c.re,retry:''};}
function exPr(r){const q=prInfo(r);if(!q||!q.pr)return[];const x=q.pr,c=q.c,kv=[['Pull request',esc('#'+x.n+' '+(x.title||'')+(x.draft?' (draft)':'')+(x.review?' ('+x.review+')':''))]];
if(c&&(c.st==='failing'||c.st==='pending'||c.st==='passing'))kv.push(['Checks',esc(ckText(c).slice(2)+(c.st==='failing'&&c.names&&c.names.length?': '+c.names.join(', '):''))]);
else if(c&&c.st==='unavailable')kv.push(['Checks',esc('PR info unavailable ('+(c.reason||'unknown')+')')]);return kv;}
function prActs(r,t){const q=prInfo(r);if(!q||!q.pr||!q.pr.link)return'';const n=q.pr.n,k=esc(q.rk);
return ibtn('pr','Open pull request #'+n+': '+t,'pr','Open pull request #'+n,' data-k="'+k+'" data-n="'+n+'"')
+ibtn('prc','Copy PR link: '+t,'link','Copy the pull request link',' data-k="'+k+'" data-n="'+n+'"');}
function prNote(){let n=0,why='';Object.keys(prs).forEach(k=>{const p=prs[k];if(p.st==='unavailable'){n++;if(!why)why=p.reason||'';}});
return prsOn&&n?'Pull requests unavailable for '+n+(n===1?' repository':' repositories')+(why?': '+why:'')+'.':'';}
`;
