/** Webview script part: status chip, git icon, Git section and query shortcuts. Shares top-level scope with webviewJs. */
export const GIT_CSS = String.raw`
.gi{display:inline-flex;align-items:center;gap:2px;flex:none;padding:0 3px;border:none;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:10.5px;line-height:16px;opacity:.75}
.gi:hover,.gi:focus-visible{opacity:1;color:var(--vscode-foreground);background:var(--vscode-toolbar-hoverBackground)}
.gi svg{width:12px;height:12px}
.gps{display:flex;flex-wrap:wrap;gap:4px}
.gp{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;padding:0 7px;border-radius:9px;font-size:0.85em;line-height:18px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.gp.cm{font-family:var(--vscode-editor-font-family);font-size:0.8em;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,transparent)}
.gp .br{opacity:.75}
.gr{display:flex;gap:8px;align-items:baseline;margin:2px 0;font-size:0.9em}
.gk{flex:none;width:84px;color:var(--vscode-descriptionForeground)}
.gv{min-width:0;overflow-wrap:anywhere}
.gm,.up,.dn,.gn{font-size:0.9em}
.up,.dn{font-weight:600}
.gn{color:var(--vscode-editorWarning-foreground)}
.gfs{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 4px 92px}
.gf{display:inline-flex;gap:4px;padding:0 6px;border-radius:3px;font-size:0.85em;line-height:18px;cursor:pointer;border:1px solid var(--vscode-widget-border,transparent);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gf:hover,.gf:focus-visible{outline:1px solid var(--vscode-focusBorder)}
.gp2{font-family:var(--vscode-editor-font-family);font-size:0.9em}
.gw{margin:1px 0}
.gw.here{font-weight:600}
.gp.pr{white-space:normal}
.gmore{align-self:center;font-size:0.85em;color:var(--vscode-descriptionForeground)}
.gp:hover,.gp:focus-visible{outline:1px solid var(--vscode-focusBorder)}
`;

export const GIT_JS = String.raw`
const GIT_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8M12 7.6c0 2.4-3.4 2.4-8 4"/></svg>';
let gitFocus='';
function pillHtml(r){const ss=statusesOf(r,pins.has(r.id),Date.now(),(dots[r.id]||{}).s),k=pillOf(ss);if(!k||k==='huge')return '';
return '<span class="mp st '+k+'" role="img" aria-label="'+esc('Status: '+STATUS_LABELS[k])+'" data-tip="'+esc('Status: '+ss.map(x=>STATUS_LABELS[x]).join(', '))+'">'+STATUS_LABELS[k]+'</span>';}
function gitIcon(r){const n=(r.prs||0)+(r.commits||0);if(!n)return '';
const t=(r.prs?r.prs+(r.prs===1?' PR':' PRs'):'')+(r.prs&&r.commits?', ':'')+(r.commits?r.commits+(r.commits===1?' commit':' commits'):'');
return '<button class="gi" data-a="git" data-tip="'+esc(t+' - show Git section')+'" aria-label="'+esc('Git activity: '+t)+'">'+GIT_SVG+'<span>'+n+'</span></button>';}
function gitPill(cls,a,k,v,label,tip,br){return '<span class="gp'+cls+'" data-a="'+a+'" data-'+k+'="'+esc(v)+'" role="button" tabindex="0" aria-label="'+esc(tip)+'" data-tip="'+esc(tip)+'">'+esc(label)+(br?' <span class="br">on '+esc(br)+'</span>':'')+'</span>';}
const gl={};
const glSeen=new Set();
function glRow(l,v,tip){return '<div class="gr" data-tip="'+esc(tip)+'"><span class="gk">'+esc(l)+'</span><span class="gv">'+v+'</span></div>';}
function glPart(r,d){let h='';
if(d.state!=='ok')return '<div class="none" data-tip="'+esc(d.reason||'')+'">'+esc(d.reason||'No git information')+'</div>';
const b=d.detached?'detached HEAD':(d.branch||'unknown');
const ab=(d.ahead?' <span class="up" data-tip="'+esc(plur(d.ahead,'commit')+' not pushed to '+(d.upstream||'the upstream branch'))+'">↑'+d.ahead+'</span>':'')+(d.behind?' <span class="dn" data-tip="'+esc(plur(d.behind,'commit')+' on '+(d.upstream||'the upstream branch')+' not in this branch')+'">↓'+d.behind+'</span>':'')+(d.gone?' <span class="gn" data-tip="The upstream branch no longer exists">upstream gone</span>':'');
h+=glRow('Branch','<span data-tip="'+esc('Branch checked out in the chat\'s folder'+(d.upstream?'\nUpstream: '+d.upstream:''))+'">'+esc(b)+'</span>'+ab,'Branch checked out in the chat\'s working folder');
h+=glRow('Folder','<span class="gp2" data-tip="'+esc('Worktree path used by this chat\n'+d.top)+'">'+esc(d.top)+'</span>','Worktree path used by this chat');
if(d.fileTotal){const t=[d.modified?d.modified+' modified':'',d.staged?d.staged+' staged':'',d.untracked?d.untracked+' new':''].filter(Boolean).join(', ');
h+=glRow('Uncommitted',plur(d.fileTotal,'file')+' <span class="gm">('+esc(t)+')</span>',plur(d.fileTotal,'file')+' not committed: '+t);
h+='<div class="gfs">'+d.files.map((f,i)=>'<span class="gf" data-a="gfile" data-i="'+i+'" role="button" tabindex="0" aria-label="'+esc('Open '+f.p)+'" data-tip="'+esc('Open '+f.p+' ('+({'M':'modified','A':'added','D':'deleted','R':'renamed','?':'new'}[f.s]||'changed')+')')+'"><b>'+esc(f.s)+'</b> '+esc(f.p.split(/[\\/]/).pop())+'</span>').join('')+(d.fileTotal>d.files.length?'<span class="gmore">+'+(d.fileTotal-d.files.length)+' more</span>':'')+'</div>';}
if(d.ahead)h+=glRow('Unpushed',plur(d.ahead,'commit'),plur(d.ahead,'commit')+' on this branch not pushed to '+(d.upstream||'the upstream branch'));
if(d.worktrees.length>1)h+=glRow('Worktrees','<div class="gws">'+d.worktrees.map(w=>'<div class="gw'+(w.here?' here':'')+'" data-tip="'+esc(w.path+(w.main?'\nMain checkout':'\nLinked worktree')+(w.missing?'\nFolder is missing':'')+(w.here?'\nUsed by this chat':''))+'">'+esc(w.path.split(/[\\/]/).pop()||w.path)+' <span class="br">'+esc(w.detached?'detached':w.branch)+(w.here?' · this chat':'')+(w.missing?' · missing':'')+'</span></div>').join('')+'</div>','Worktrees of this repository');
if(d.prs.length)h+=glRow('Pull request',d.prs.map(p=>'<span class="gp pr" data-a="gpr" data-n="'+p.number+'" role="button" tabindex="0" aria-label="'+esc('Open pull request #'+p.number)+'" data-tip="'+esc('Open pull request #'+p.number+' in the browser\n'+p.title+'\nState: open'+(p.draft?', draft':'')+(p.review?', '+p.review:''))+'">#'+p.number+' '+esc(p.title)+' <span class="br">open'+(p.draft?' · draft':'')+'</span></span>').join(''),'Open pull request for this branch');
else if(d.prNote)h+='<div class="none" data-tip="'+esc('Open pull requests could not be looked up: '+d.prNote)+'">Pull requests unavailable: '+esc(d.prNote)+'</div>';
return h;}
function glCount(d){return d&&d.state==='ok'?d.fileTotal+d.ahead+d.prs.length:0;}
function gitHtml(r,e){const g=e.git||{prs:[],commits:[],moreCommits:0},d=gl[r.id],key='git:'+r.id,sk='gs:'+r.id;
if(d&&!glSeen.has(sk)){glSeen.add(sk);if(glCount(d)||g.prs.length||g.commits.length)col.delete(key);else col.add(key);}
let body=d?glPart(r,d):'<div class="none">Loading...</div>';
let b=g.prs.map(p=>gitPill('','pr','n',p.number,'#'+p.number+(p.repository?' '+p.repository:''),'Search chats that mention PR #'+p.number)).join('');
b+=g.commits.map(c=>gitPill(' cm','sha','s',c.sha.slice(0,7),c.sha.slice(0,7),'Search chats with commit '+c.sha.slice(0,7),c.branch)).join('');
if(g.moreCommits>0)b+='<span class="gmore">+'+g.moreCommits+' more</span>';
if(b)body+=glRow('In this chat','<div class="gps">'+b+'</div>','Pull requests and commits mentioned in this chat; click to search for them');
const n=d?glCount(d)+g.prs.length+g.commits.length+g.moreCommits:'';
return xsec(key,'Git',n,body,'xg',true);}
function tokRewrite(v,t){const k=t.slice(0,t.indexOf(':')).toLowerCase();let r='',at=0;
const re=/(?:^|\s)(?:(file|edited|cmd|tag|sha|pr|branch):(?:"[^"]*"?|\S*)|last:\d+(?=\s|$))|"[^"]*(?:"|$)|\S+/gi;
for(const m of v.matchAll(re)){if(!m[1]||m[1].toLowerCase()!==k)continue;
const s=m.index+m[0].length-m[0].trimStart().length;let f=m.index+m[0].length;
while(f<v.length&&/\s/.test(v[f]))f++;r+=v.slice(at,s);at=f;}
r=(r+v.slice(at)).trimEnd();return r?r+' '+t:t;}
function addTok(t){q.value=tokRewrite(q.value,t);go();}
function gitScroll(id){const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec==='git:'+id);if(n)n.scrollIntoView({block:'nearest'});}
function gitOpen(id){col.delete('git:'+id);glSeen.add('gs:'+id);gitFocus=id;
if(!open.has(id))openCard(id);rerender();if(ex[id]&&ex[id].full){gitFocus='';gitScroll(id);}}
`;
