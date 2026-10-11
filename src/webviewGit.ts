/** Webview script part: status chip, git icon, Git section and query shortcuts. Shares top-level scope with webviewJs. */
export const GIT_CSS = String.raw`
.gi{display:inline-flex;align-items:center;gap:2px;flex:none;padding:0 3px;border:none;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;line-height:16px;opacity:.75}
.gi:hover,.gi:focus-visible{opacity:1;color:var(--vscode-foreground);background:var(--vscode-toolbar-hoverBackground)}
.gi svg{width:12px;height:12px}
.gps{display:flex;flex-wrap:wrap;gap:4px}
.gp{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;padding:0 7px;border-radius:9px;line-height:18px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.gp.cm{font-family:var(--vscode-editor-font-family);border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,transparent)}
.gp .br{opacity:.75}
.gr{display:flex;gap:8px;align-items:baseline;margin:2px 0;}
.gk{flex:none;width:84px;color:var(--vscode-descriptionForeground)}
.gv{min-width:0;overflow-wrap:anywhere}
.gm,.up,.dn,.gn{}
.up,.dn{font-weight:600}
.gn{color:var(--vscode-editorWarning-foreground)}
.gfs{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 4px 92px}
.gf{display:inline-flex;gap:4px;padding:0 6px;border-radius:3px;line-height:18px;cursor:pointer;border:1px solid var(--vscode-widget-border,transparent);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gf:hover,.gf:focus-visible{outline:1px solid var(--vscode-focusBorder)}
.gp2{font-family:var(--vscode-editor-font-family);}
.gw{margin:1px 0}
.gw.here{font-weight:600}
.gp.pr{white-space:normal}
.gmore{align-self:center;color:var(--vscode-descriptionForeground)}
.gw.gone{opacity:.75}
.wk{margin:2px 0 4px}
.wk .gp{margin-left:4px}
.gp:hover,.gp:focus-visible{outline:1px solid var(--vscode-focusBorder)}
.ex .xh .pill{min-width:16px;padding:0 4px;font-size:calc(var(--vscode-font-size) - 2px);line-height:1.3}
.ex .xh .pill.z{opacity:.45;background:transparent;color:var(--vscode-descriptionForeground)}
.ex .xh .pill.w{background:transparent;color:var(--vscode-descriptionForeground);opacity:.6}
`;

export const GIT_JS = String.raw`
const GIT_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8M12 7.6c0 2.4-3.4 2.4-8 4"/></svg>';
function pillHtml(r){const ss=statusesOf(r,pins.has(r.id),Date.now(),(dots[r.id]||{}).s),k=pillOf(ss);if(!k||k==='huge')return '';
return '<span class="mp st '+k+'" role="img" aria-label="'+esc('Status: '+STATUS_LABELS[k])+'" data-tip="'+esc('Status: '+ss.map(x=>STATUS_LABELS[x]).join(', '))+'">'+STATUS_LABELS[k]+'</span>';}
function gitIcon(r){const n=(r.prs||0)+(r.commits||0);if(!n)return '';
const t=(r.prs?r.prs+(r.prs===1?' PR':' PRs'):'')+(r.prs&&r.commits?', ':'')+(r.commits?r.commits+(r.commits===1?' commit':' commits'):'');
return '<button class="gi" data-a="git" data-tip="'+esc(t+' - show Git section')+'" aria-label="'+esc('Git activity: '+t)+'">'+GIT_SVG+'<span>'+n+'</span></button>';}
function gitPill(cls,a,k,v,label,tip,br){return '<span class="gp'+cls+'" data-a="'+a+'" data-'+k+'="'+esc(v)+'" role="button" tabindex="0" aria-label="'+esc(tip)+'" data-tip="'+esc(tip)+'">'+esc(label)+(br?' <span class="br">on '+esc(br)+'</span>':'')+'</span>';}
const LAZY=/^(git|unc|unp|wt|rel):/;
const xo=new Set(),lz={},cnt={};let cq=0;
function cntAsk(id){cnt[id]={rq:++cq,v:{}};vs.postMessage({type:'counts',id:id,rq:cnt[id].rq});}
function cnOf(part,id,exact){if(exact!==''&&exact!==undefined&&exact!==null)return exact;const c=cnt[id];if(!c)return part==='rel'?0:'';const v=c.v[part];return v===undefined?'\u2026':v===null?(part==='rel'?0:''):v;}
function cntSet(d){const c=cnt[d.id];if(!c||c.rq!==d.rq||!open.has(d.id)||!(d.part in {rel:1,unc:1,unp:1,wt:1,git:1}))return;
c.v[d.part]=typeof d.n==='number'&&d.n>=0?d.n:null;cntPatch(d.part,d.id);}
function cntPatch(part,id){const h=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec===part+':'+id);if(!h)return;
const k=part+':'+id,e=(lz[k]&&lz[k].s==='done')?cntExact(part,lz[k].data):'',n=cnOf(part,id,e),old=h.querySelector('.pill');
if(old)old.remove();h.insertAdjacentHTML('beforeend',pillBit(n));
const l=h.querySelector('.sn');h.setAttribute('aria-label',(l?l.textContent:'')+(n===''||n==='\u2026'?'':', '+n));}
function cntExact(part,d){if(part==='rel')return Array.isArray(d)?d.length:'';if(!d||(d.state&&d.state!=='ok'))return '';
return part==='unc'?d.fileTotal:part==='unp'?d.ahead:part==='wt'?d.worktrees.length:'';}
function lzLoad(key){const i=key.indexOf(':'),part=key.slice(0,i),id=key.slice(i+1);
if(lz[key])return;lz[key]={s:'loading'};
vs.postMessage(part==='rel'?{type:'related',id:id}:{type:'gitLive',id:id,part:part});}
function lzToggle(key){if(xo.has(key))xo.delete(key);else{xo.add(key);lzLoad(key);}}
function lzReset(id){delete cnt[id];wx.delete('wc:'+id);wx.delete('wm:'+id);['git','unc','unp','wt','rel'].forEach(p=>{const k=p+':'+id;xo.delete(k);delete lz[k];});}
function lzClear(){Object.keys(cnt).forEach(k=>{delete cnt[k];});xo.clear();Object.keys(lz).forEach(k=>{delete lz[k];});}
function lzData(key){const s=lz[key];return s&&s.s==='done'?s.data:null;}
function lzFail(key,why,retry){return '<div class="none">'+esc(why||'Could not load')+(retry?'. <span class="gp" data-a="lretry" data-key="'+esc(key)+'" role="button" tabindex="0" aria-label="Retry loading" data-tip="Load this section again">Retry</span>':'')+'</div>';}
function lzBody(key,fn){const s=lz[key];
if(!s||s.s==='loading')return '<div class="m">Loading...</div>';
if(s.s==='fail')return lzFail(key,s.reason,true);
const d=s.data;
if(d&&d.state&&d.state!=='ok')return (d.state==='none'?'<div class="none">'+esc(d.reason||'No git information')+'</div>':lzFail(key,d.reason,true))+(d.work?workBody(d.work,key.slice(key.indexOf(':')+1)):'');
return fn(d);}
function lzSec(key,label,n,fn){return xsec(key,label,n,xo.has(key)?lzBody(key,fn):'','x'+key.slice(0,key.indexOf(':')),true,xo.has(key));}
function glRow(l,v,tip){return '<div class="gr" data-tip="'+esc(tip)+'"><span class="gk">'+esc(l)+'</span><span class="gv">'+v+'</span></div>';}
const wx=new Set();
function wkWhen(x){return x.state==='removed'?'created, now removed':x.state==='exists'?'created':x.state;}
function wkPr(p){return p?' <span class="gp pr" data-a="gpr" data-n="'+p.number+'" role="button" tabindex="0" aria-label="'+esc('Open pull request #'+p.number)+'" data-tip="'+esc('Open pull request #'+p.number+' in the browser\n'+p.title+'\nState: open'+(p.draft?', draft':'')+(p.review?', '+p.review:''))+'">#'+p.number+(p.draft?' draft':'')+'</span>':'';}
function wkRow(x){return '<div class="gw'+(x.state==='removed'?' gone':'')+'" data-tip="'+esc((x.tip||'')+(x.tip?'\n':'')+(x.kind==='wt'?'Worktree ':'Branch ')+x.name+(x.branch&&x.branch!==x.name?'\nBranch '+x.branch:''))+'">'+esc(x.branch||x.name)+(x.kind==='wt'&&x.branch?' <span class="br">in '+esc(x.name)+'</span>':x.kind==='wt'?' <span class="br">worktree</span>':' <span class="br">branch</span>')+' <span class="br">'+esc(wkWhen(x)+(x.at?' '+x.at:''))+'</span>'+wkPr(x.pr)+'</div>';}
function wkMore(key,n,open,label){return '<span class="gp" data-a="wmore" data-key="'+esc(key)+'" role="button" tabindex="0" aria-expanded="'+open+'" aria-label="'+esc(label)+'" data-tip="'+esc(label)+'">'+(open?'Hide':label)+'</span>';}
function workBody(w,id){let h='';
if(w.badge)h+=glRow('Created by','<span data-tip="'+esc((w.created[0]&&w.created[0].tip)||w.badge)+'">'+esc(w.badge)+'</span>','The chat, or a subagent of it, ran the command that made this (hover a row below for the command, tool_use id and transcript line)');
if(w.created.length){const ck='wc:'+id,all=wx.has(ck),cap=6,rows=(all?w.created:w.created.slice(0,cap)).map(wkRow).join('');
const more=w.createdTotal>cap?'<div class="gmore">'+wkMore(ck,w.createdTotal-cap,all,'+'+(w.createdTotal-cap)+' more created')+(w.createdTotal>w.created.length&&all?' <span class="gmore">(newest '+w.created.length+' of '+w.createdTotal+' shown)</span>':'')+'</div>':'';
h+=glRow('Made here ('+w.createdTotal+')','<div class="wk">'+rows+more+'</div>',w.createdTotal+' worktrees and branches created by this chat'+(w.createdGone?', '+w.createdGone+' now removed':''));}
if(w.worked.length)h+=glRow('Also used','<div class="wk">'+w.worked.map(x=>'<div class="gw'+(x.state==='removed'?' gone':'')+'" data-tip="'+esc(x.how==='cwd'?'The chat ran in this worktree':'The chat\'s rows record this branch')+'">'+esc(x.branch||x.name)+' <span class="br">'+esc((x.how==='cwd'?'ran in ':x.how==='subagent'?'subagent ran in ':'rows name it')+(x.state==='removed'?' (now removed)':''))+'</span>'+wkPr(x.pr)+'</div>').join('')+'</div>','Worktrees and branches this chat worked in without creating them');
if(w.mentionsTotal){const mk='wm:'+id,o=wx.has(mk);
h+=glRow('Mentions only','<div class="wk">'+wkMore(mk,w.mentionsTotal,o,'Mentions only ('+w.mentionsTotal+')')+(o?w.mentions.map(m=>'<div class="gw gone" data-tip="'+esc(m.note)+'">'+esc(m.name)+' <span class="br">'+esc(m.note)+'</span></div>').join('')+(w.mentionsTotal>w.mentions.length?'<div class="gmore">+'+(w.mentionsTotal-w.mentions.length)+' more</div>':''):'')+'</div>','Named in this chat only: it did not create them and did not work in them');}
return h;}
function wkPrN(d){const s=new Set((d.prs||[]).map(p=>p.number));if(d.work){d.work.created.concat(d.work.worked).forEach(x=>{if(x.pr)s.add(x.pr.number);});}return s.size;}
function gitBody(d,e,id){let h='';const g=(e&&e.full&&e.git)||{prs:[],commits:[],moreCommits:0};
const b=d.detached?'detached at '+(d.sha||'HEAD'):(d.branch||'unknown')+(d.noCommits?' (No commits yet)':'');
const ab=(d.ahead?' <span class="up" data-tip="'+esc(plur(d.ahead,'commit')+' not pushed to '+(d.upstream||'the upstream branch'))+'">↑'+d.ahead+'</span>':'')+(d.behind?' <span class="dn" data-tip="'+esc(plur(d.behind,'commit')+' on '+(d.upstream||'the upstream branch')+' not in this branch')+'">↓'+d.behind+'</span>':'')+(d.gone?' <span class="gn" data-tip="The upstream branch no longer exists">upstream gone</span>':'');
h+=glRow('Branch','<span data-tip="'+esc('Branch checked out in the chat\'s folder'+(d.upstream?'\nUpstream: '+d.upstream:''))+'">'+esc(b)+'</span>'+ab,'Branch checked out in the chat\'s working folder');
h+=glRow('Folder','<span class="gp2" data-tip="'+esc('Worktree path used by this chat\n'+d.top)+'">'+esc(d.top)+'</span>','Worktree path used by this chat');
if(d.work&&d.work.how==='created')h+=glRow('Resolved','<span data-tip="Shown from the worktree this chat created">created by this chat</span>','The Branch and Folder above are the worktree this chat created');
if(d.prs.length)h+=glRow('Pull request',d.prs.map(p=>'<span class="gp pr" data-a="gpr" data-n="'+p.number+'" role="button" tabindex="0" aria-label="'+esc('Open pull request #'+p.number)+'" data-tip="'+esc('Open pull request #'+p.number+' in the browser\n'+p.title+'\nState: open'+(p.draft?', draft':'')+(p.review?', '+p.review:''))+'">#'+p.number+' '+esc(p.title)+' <span class="br">open'+(p.draft?' · draft':'')+'</span></span>').join(''),'Open pull request for this branch');
else if(d.prPending)h+='<div class="none">Looking up pull requests...</div>';
else if(d.prNote)h+='<div class="none" data-tip="'+esc('Open pull requests could not be looked up: '+d.prNote)+'">Pull requests unavailable: '+esc(d.prNote)+'</div>';
if(d.work)h+=workBody(d.work,id);
let m=g.prs.map(p=>gitPill('','pr','n',p.number,'#'+p.number+(p.repository?' '+p.repository:''),'Search chats that mention PR #'+p.number)).join('');
m+=g.commits.map(c=>gitPill(' cm','sha','s',c.sha.slice(0,7),c.sha.slice(0,7),'Search chats with commit '+c.sha.slice(0,7),c.branch)).join('');
if(g.moreCommits>0)m+='<span class="gmore">+'+g.moreCommits+' more</span>';
if(m)h+=glRow('In this chat','<div class="gps">'+m+'</div>','Pull requests and commits mentioned in this chat; click to search for them');
return h;}
function uncBody(d){if(!d.fileTotal)return '<div class="none">No uncommitted files</div>';
const t=[d.modified?d.modified+' modified':'',d.staged?d.staged+' staged':'',d.untracked?d.untracked+' new':''].filter(Boolean).join(', ');
return glRow('Files',plur(d.fileTotal,'file')+' <span class="gm">('+esc(t)+')</span>',plur(d.fileTotal,'file')+' not committed: '+t)
+'<div class="gfs">'+d.files.map((f,i)=>'<span class="gf" data-a="gfile" data-i="'+i+'" role="button" tabindex="0" aria-label="'+esc('Open '+f.p)+'" data-tip="'+esc('Open '+f.p+' ('+({'M':'modified','A':'added','D':'deleted','R':'renamed','?':'new'}[f.s]||'changed')+')')+'"><b>'+esc(f.s)+'</b> '+esc(f.p.split(/[\\/]/).pop())+'</span>').join('')+(d.fileTotal>d.files.length?'<span class="gmore">+'+(d.fileTotal-d.files.length)+' more</span>':'')+'</div>';}
function unpBody(d){if(!d.ahead)return '<div class="none">'+(d.detached?'Detached HEAD: no branch to push':d.noCommits?'No commits yet':d.gone?'The upstream branch no longer exists':d.upstream?'Nothing to push':'This branch has no upstream branch')+'</div>';
return d.commits.map(c=>'<div class="gw" data-tip="'+esc(c.sha+' '+c.subject)+'"><span class="gp2">'+esc(c.sha)+'</span> '+esc(c.subject)+'</div>').join('')+(d.ahead>d.commits.length?'<div class="gmore">+'+(d.ahead-d.commits.length)+' more</div>':'');}
function wtBody(d){return d.worktrees.length?'<div class="gws">'+d.worktrees.map(w=>'<div class="gw'+(w.here?' here':'')+(w.removed?' gone':'')+'" data-tip="'+esc(w.path+(w.main?'\nMain checkout':'\nLinked worktree')+(w.removed?'\nCreated by this chat, now removed':w.missing?'\nFolder is missing':'')+(w.here?'\nUsed by this chat':''))+'">'+esc(w.path.split(/[\\/]/).pop()||w.path)+' <span class="br">'+esc(w.detached?'detached':w.branch)+(w.removed?' · created, now removed':w.created?' · created by this chat':w.here?' · this chat':'')+(w.missing&&!w.removed?' · missing':'')+'</span></div>').join('')+'</div>':'<div class="none">No worktrees found</div>';}
function okN(key,fn){const d=lzData(key);return d&&(!d.state||d.state==='ok')?fn(d):'';}
function relBody(rel){return rel.length?rel.map(relHtml).join(''):'<div class="none">No other chat touched the same files</div>';}
function lazyHtml(r,e){const id=r.id;
return safeSec('git',()=>{const k='git:'+id,g=(e&&e.full&&e.git)||{prs:[],commits:[],moreCommits:0};
return lzSec(k,'Git',cnOf('git',id,okN(k,d=>wkPrN(d)+g.prs.length+g.commits.length+g.moreCommits)),d=>gitBody(d,e,id));})
+safeSec('uncommitted',()=>lzSec('unc:'+id,'Uncommitted files',cnOf('unc',id,okN('unc:'+id,d=>d.fileTotal)),uncBody))
+safeSec('unpushed',()=>lzSec('unp:'+id,'Unpushed commits',cnOf('unp',id,okN('unp:'+id,d=>d.ahead)),unpBody))
+safeSec('worktrees',()=>lzSec('wt:'+id,'Worktrees',cnOf('wt',id,okN('wt:'+id,d=>d.worktrees.length)),wtBody))
+safeSec('related',()=>{const k='rel:'+id,rel=lzData(k);return lzSec(k,'Related chats',cnOf('rel',id,Array.isArray(rel)?rel.length:''),relBody);});}
function tokRewrite(v,t){const k=t.slice(0,t.indexOf(':')).toLowerCase();let r='',at=0;
const re=/(?:^|\s)(?:(file|edited|cmd|tag|sha|pr|branch):(?:"[^"]*"?|\S*)|last:\d+(?=\s|$))|"[^"]*(?:"|$)|\S+/gi;
for(const m of v.matchAll(re)){if(!m[1]||m[1].toLowerCase()!==k)continue;
const s=m.index+m[0].length-m[0].trimStart().length;let f=m.index+m[0].length;
while(f<v.length&&/\s/.test(v[f]))f++;r+=v.slice(at,s);at=f;}
r=(r+v.slice(at)).trimEnd();return r?r+' '+t:t;}
function addTok(t){q.value=tokRewrite(q.value,t);go();}
function gitScroll(id){const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec==='git:'+id);if(n)n.scrollIntoView({block:'nearest'});}
function gitOpen(id){if(!open.has(id))openCard(id);xo.add('git:'+id);lzLoad('git:'+id);rerender();gitScroll(id);}
`;
