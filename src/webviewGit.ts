/** Webview script part: status pill, git icon, Git section and query shortcuts. Shares top-level scope with webviewJs. */
export const GIT_CSS = String.raw`
.stp{flex:none;padding:0 6px;border-radius:9px;font-size:10.5px;line-height:15px;white-space:nowrap;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);opacity:.75}
.stp.active{background:transparent;color:var(--vscode-charts-green,#89d185);border:1px solid var(--vscode-charts-green,#89d185);line-height:13px;opacity:1}
.gi{display:inline-flex;align-items:center;gap:2px;flex:none;padding:0 3px;border:none;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:10.5px;line-height:16px;opacity:.75}
.gi:hover,.gi:focus-visible{opacity:1;color:var(--vscode-foreground);background:var(--vscode-toolbar-hoverBackground)}
.gi svg{width:12px;height:12px}
.gr{display:flex;margin:2px 0}
.gp{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;border-radius:9px;font-size:0.85em;line-height:16px;cursor:pointer;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.gp.cm{font-family:var(--vscode-editor-font-family,monospace);background:var(--vscode-editorWidget-background,var(--vscode-badge-background));color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,transparent)}
.gp:hover,.gp:focus-visible{outline:1px solid var(--vscode-focusBorder)}
`;

export const GIT_JS = String.raw`
const GIT_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8M12 7.6c0 2.4-3.4 2.4-8 4"/></svg>';
let gitFocus='';
function pillHtml(r){const ss=statusesOf(r,pins.has(r.id),Date.now()),k=pillOf(ss);if(!k)return '';
return '<span class="stp '+k+'" role="img" aria-label="'+esc('Status: '+STATUS_LABELS[k])+'" title="'+esc('Status: '+ss.map(x=>STATUS_LABELS[x]).join(', '))+'">'+STATUS_LABELS[k]+'</span>';}
function gitIcon(r){const n=(r.prs||0)+(r.commits||0);if(!n)return '';
const t=(r.prs?r.prs+(r.prs===1?' PR':' PRs'):'')+(r.prs&&r.commits?', ':'')+(r.commits?r.commits+(r.commits===1?' commit':' commits'):'');
return '<button class="gi" data-a="git" title="'+esc(t+' - show Git section')+'" aria-label="'+esc('Git activity: '+t)+'">'+GIT_SVG+'<span>'+n+'</span></button>';}
function gitPill(cls,a,k,v,label,tip){return '<div class="gr"><span class="gp'+cls+'" data-a="'+a+'" data-'+k+'="'+esc(v)+'" role="button" tabindex="0" title="'+esc(tip)+'">'+esc(label)+'</span></div>';}
function gitHtml(r,e){const g=e.git;if(!g||(!g.prs.length&&!g.commits.length))return '';
let b=g.prs.map(p=>gitPill('','pr','n',p.number,'#'+p.number+(p.repository?' '+p.repository:''),'Search chats that mention PR #'+p.number)).join('');
b+=g.commits.map(c=>gitPill(' cm','sha','s',c.sha.slice(0,7),c.sha.slice(0,7)+(c.branch?' on '+c.branch:''),'Search chats with commit '+c.sha.slice(0,7))).join('');
if(g.moreCommits>0)b+='<div class="m">+'+g.moreCommits+' more commits</div>';
return sec('git:'+r.id,'Git',g.prs.length+g.commits.length+g.moreCommits,b,'sl');}
function addTok(t){const re=new RegExp('(^|\\s)'+reEsc(t)+'(?=\\s|$)','i');
if(!re.test(q.value))q.value=(q.value.trim()+' '+t).trim();go();}
function gitScroll(id){const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec==='git:'+id);if(n)n.scrollIntoView({block:'nearest'});}
function gitOpen(id){col.delete('git:'+id);gitFocus=id;
if(!open.has(id)){open.add(id);delete ex[id];askExpand(id,0);}rerender();if(ex[id]){gitFocus='';gitScroll(id);}}
`;
