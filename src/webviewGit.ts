/** Webview script part: status pill, git icon, Git section and query shortcuts. Shares top-level scope with webviewJs. */
export const GIT_CSS = String.raw`
.stp{flex:none;padding:0 6px;border-radius:9px;font-size:10.5px;line-height:15px;white-space:nowrap;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);opacity:.75}
.stp.active{background:transparent;color:var(--vscode-charts-green,#89d185);border:1px solid var(--vscode-charts-green,#89d185);line-height:13px;opacity:1}
.gi{display:inline-flex;align-items:center;gap:2px;flex:none;padding:0 3px;border:none;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:10.5px;line-height:16px;opacity:.75}
.gi:hover,.gi:focus-visible{opacity:1;color:var(--vscode-foreground);background:var(--vscode-toolbar-hoverBackground)}
.gi svg{width:12px;height:12px}
.gps{display:flex;flex-wrap:wrap;gap:4px}
.gp{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;padding:0 7px;border-radius:9px;font-size:0.85em;line-height:18px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.gp.cm{font-family:var(--vscode-editor-font-family,monospace);font-size:0.8em;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,transparent)}
.gp .br{opacity:.75}
.gmore{align-self:center;font-size:0.85em;color:var(--vscode-descriptionForeground)}
.gp:hover,.gp:focus-visible{outline:1px solid var(--vscode-focusBorder)}
`;

export const GIT_JS = String.raw`
const GIT_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8M12 7.6c0 2.4-3.4 2.4-8 4"/></svg>';
let gitFocus='';
function pillHtml(r){const ss=statusesOf(r,pins.has(r.id),Date.now(),(dots[r.id]||{}).s),k=pillOf(ss);if(!k)return '';
return '<span class="stp '+k+'" role="img" aria-label="'+esc('Status: '+STATUS_LABELS[k])+'" title="'+esc('Status: '+ss.map(x=>STATUS_LABELS[x]).join(', '))+'">'+STATUS_LABELS[k]+'</span>';}
function gitIcon(r){const n=(r.prs||0)+(r.commits||0);if(!n)return '';
const t=(r.prs?r.prs+(r.prs===1?' PR':' PRs'):'')+(r.prs&&r.commits?', ':'')+(r.commits?r.commits+(r.commits===1?' commit':' commits'):'');
return '<button class="gi" data-a="git" title="'+esc(t+' - show Git section')+'" aria-label="'+esc('Git activity: '+t)+'">'+GIT_SVG+'<span>'+n+'</span></button>';}
function gitPill(cls,a,k,v,label,tip,br){return '<span class="gp'+cls+'" data-a="'+a+'" data-'+k+'="'+esc(v)+'" role="button" tabindex="0" aria-label="'+esc(tip)+'" title="'+esc(tip)+'">'+esc(label)+(br?' <span class="br">on '+esc(br)+'</span>':'')+'</span>';}
function gitHtml(r,e){const g=e.git;if(!g||(!g.prs.length&&!g.commits.length))return '';
let b=g.prs.map(p=>gitPill('','pr','n',p.number,'#'+p.number+(p.repository?' '+p.repository:''),'Search chats that mention PR #'+p.number)).join('');
b+=g.commits.map(c=>gitPill(' cm','sha','s',c.sha.slice(0,7),c.sha.slice(0,7),'Search chats with commit '+c.sha.slice(0,7),c.branch)).join('');
if(g.moreCommits>0)b+='<span class="gmore">+'+g.moreCommits+' more</span>';
return xsec('git:'+r.id,'Git',g.prs.length+g.commits.length+g.moreCommits,'<div class="gps">'+b+'</div>','xg');}
function tokRewrite(v,t){const k=t.slice(0,t.indexOf(':')).toLowerCase();let r='',at=0;
const re=/(?:^|\s)(?:(file|edited|cmd|tag|sha|pr|branch):(?:"[^"]*"?|\S*)|last:\d+(?=\s|$))|"[^"]*(?:"|$)|\S+/gi;
for(const m of v.matchAll(re)){if(!m[1]||m[1].toLowerCase()!==k)continue;
const s=m.index+m[0].length-m[0].trimStart().length;let f=m.index+m[0].length;
while(f<v.length&&/\s/.test(v[f]))f++;r+=v.slice(at,s);at=f;}
r=(r+v.slice(at)).trimEnd();return r?r+' '+t:t;}
function addTok(t){q.value=tokRewrite(q.value,t);go();}
function gitScroll(id){const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec==='git:'+id);if(n)n.scrollIntoView({block:'nearest'});}
function gitOpen(id){col.delete('git:'+id);gitFocus=id;
if(!open.has(id)){open.add(id);delete ex[id];askExpand(id,0);}rerender();if(ex[id]){gitFocus='';gitScroll(id);}}
`;
