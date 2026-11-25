/**
 * Webview parts of chat digests: the list-row marker, the "Digest" snippet label of a digest-only hit, and the
 * card's Digest section (goal, decisions, files changed, references, left open, notes and the Build button).
 * Shares top-level scope with webviewJs; the host side is digestRun.ts.
 */
import { NOTE_TEXT } from './digestMd';

/** Digest CSS: theme variables only, so the section follows every color theme. */
export const DIGEST_CSS = String.raw`
.dgm{display:inline-flex;align-items:center;flex:none;padding:0 2px;color:var(--vscode-descriptionForeground);cursor:pointer;opacity:.8}
.dgm svg{width:12px;height:12px}
.dgm:hover,.dgm:focus-visible{opacity:1;color:var(--vscode-foreground)}
.dgm.st{color:var(--vscode-editorWarning-foreground)}
.dgsn{cursor:pointer}
.dgl{font-weight:600;color:var(--vscode-foreground)}
.dgk{margin:6px 0 2px;color:var(--vscode-descriptionForeground);font-weight:600}
.dgk:first-child{margin-top:0}
.dgn{margin:0 0 4px;color:var(--vscode-editorWarning-foreground)}
.dgd{margin:2px 0 6px;padding-left:6px;border-left:2px solid var(--vscode-widget-border)}
.dgs{display:inline-block;margin-right:4px;padding:0 5px;border-radius:9px;line-height:16px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.dgq{margin:2px 0;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}
.dga{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:6;overflow:hidden}
.dgr{display:flex;flex-wrap:wrap;gap:4px}
.dgo{margin:0;padding-left:16px}
.dgf{margin-top:6px;color:var(--vscode-descriptionForeground)}
`;

/** Digest script. NOTE_TEXT is injected from digestMd.ts, so the card and the exported Markdown say the same thing. */
export const DIGEST_JS = String.raw`
const DG_NOTES=` + JSON.stringify(NOTE_TEXT) + String.raw`;
const DG_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"><path d="M4 1.500h5.500L12.500 4.500V14.500H4z"/><path d="M9.500 1.500v3h3M6 8h4.500M6 10.500h4.500M6 13h2.500" stroke-linecap="round"/></svg>';
/* build state per chat for the card's button: busy while the host builds, done for 2 s after */
const dgs={};
/* the list-row marker: shown on every chat with a digest; its tooltip is the goal line; a click opens the card at the Digest section */
function dgMark(r){if(!r.dg)return '';const t='Digest'+(r.dgStale?' (out of date)':'')+(r.dgGoal?': '+r.dgGoal:'');
return '<span class="dgm'+(r.dgStale?' st':'')+'" data-a="dig" role="button" tabindex="0" aria-label="'+esc(t+'. Show the digest')+'" data-tip="'+esc(t)+'">'+DG_SVG+'</span>';}
/* the snippet of a digest-only hit: labeled Digest, and a click opens the Digest section instead of resuming the chat */
function dgSnip(r){return '<div class="s dgsn" data-a="dig" role="button" tabindex="0" aria-label="'+esc('Digest match: '+r.snippet+'. Show the digest')+'" data-tip="Matched the digest of this session: click to show it"><b class="dgl">Digest</b> '+snip(r)+'</div>';}
/* open the card (if closed) and its Digest section, then bring the section into view */
function digOpen(id){if(!open.has(id)){openCard(id);rerender();}col.delete('dig:'+id);rerender();
const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec==='dig:'+id);if(n){n.scrollIntoView({block:'nearest'});n.focus();}}
function dgBtn(id,label){const st=dgs[id];
return '<button class="xb'+(st==='busy'?' busy':'')+'" data-a="dgbuild"'+(st==='busy'?' aria-busy="true"':'')+' aria-label="'+esc(label)+'" data-tip="'+esc(label+' (asks the AI model when AI parts are on)')+'">'+XI.note+'<span>'+(st==='busy'?'Building...':st==='done'?'Built':esc(label))+'</span></button>';}
function dgNotes(d){const n=[];if(d.noClose)n.push(DG_NOTES.noClose);if(d.inputTrimmed)n.push(DG_NOTES.inputTrimmed);
if(d.ai==='failed')n.push(DG_NOTES.failed);else if(d.ai==='off')n.push(DG_NOTES.off);
if(d.capTrimmed&&d.capTrimmed.length)n.push(DG_NOTES.cap+' ('+d.capTrimmed.join(', ')+')');
return n.map(x=>'<div class="dgn">'+esc(x)+'</div>').join('');}
/* one decision: Dialog shows its question beside the answer; Message links to its message (opens the session file at that line) */
function dgDec(x){if(x.src==='dialog')return '<div class="dgd"><span class="dgs" data-tip="An answer given in the question dialog">Dialog</span><div class="dgq"'+(x.opts&&x.opts.length?' data-tip="'+esc('Options: '+x.opts.join(' | '))+'"':'')+'>'+esc(x.q||'')+'</div><div class="dga">'+esc(x.a)+'</div></div>';
return '<div class="dgd"><span class="dgs" data-tip="An owner message the AI marked as a decision">Message</span><span class="gp" data-a="dgmsg" data-i="'+x.i+'" role="button" tabindex="0" aria-label="'+esc('Open message '+x.i+' in the session file')+'" data-tip="'+esc('Open the session file at this message'+(x.line?' (line '+x.line+')':''))+'">Message '+x.i+'</span><div class="dga">'+esc(x.a)+'</div></div>';}
function dgRef(r){return '<span class="gp" data-a="dgref" data-r="'+esc(r)+'" role="button" tabindex="0" aria-label="'+esc('Open '+r)+'" data-tip="'+esc(r)+'">'+esc(r)+'</span>';}
function dgBody(id,g){const d=g.d,now=Date.now();let h=dgNotes(d);
if(g.stale)h+='<div class="dgn">This session changed after the digest was built.</div>';
h+='<div class="dgk">Goal</div>'+(d.goal?'<div>'+esc(d.goal)+'</div>':'<div class="none">Not generated</div>');
h+='<div class="dgk">Decisions ('+d.decisions.length+')</div>'+(d.decisions.length?d.decisions.map(dgDec).join(''):'<div class="none">None recorded</div>');
h+='<div class="dgk">Files changed ('+d.files.length+')</div>'+(d.files.length?'<div class="fps">'+d.files.map(fileChip).join('')+'</div>':'<div class="none">None</div>');
h+='<div class="dgk">References ('+d.refs.length+')</div>'+(d.refs.length?'<div class="dgr">'+d.refs.map(dgRef).join('')+'</div>':'<div class="none">None</div>');
h+='<div class="dgk">Left open</div>'+(d.open&&d.open.length?'<ul class="dgo">'+d.open.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'<div class="none">'+(d.ai==='ok'?'Nothing left open':'Not generated')+'</div>');
return h+'<div class="dgf">Built '+esc(agoLong(d.built,now))+' '+dgBtn(id,g.stale?'Rebuild digest':'Rebuild')+'</div>';}
/* the card section: absent while the full reply is loading, a Build button when the chat has no digest */
function digestHtml(r,e){if(!e||!e.full||e.digest===undefined)return '';const id=r.id,g=e.digest;
if(!g)return xsec('dig:'+id,'Digest','','<div class="none">No digest yet. '+dgBtn(id,'Build digest')+'</div>','xd');
return xsec('dig:'+id,'Digest',g.stale?'out of date':'',dgBody(id,g),'xd');}
/* clicks inside a row that belong to digests; true when handled */
function digClick(k,id,a){if(k==='dig'){digOpen(id);return true;}
if(k==='dgbuild'){if(dgs[id]!=='busy'){dgs[id]='busy';rerender();vs.postMessage({type:'digestBuild',id:id});}return true;}
if(k==='dgmsg'){vs.postMessage({type:'digestMsg',id:id,i:Number(a.dataset.i)});return true;}
if(k==='dgref'){vs.postMessage({type:'digestRef',id:id,ref:a.dataset.r});return true;}
return false;}
/* a digest was built: update the marker of every row of that chat, and reload an open card so its section shows the new digest */
function digChanged(d){const fix=r=>{if(r&&r.id===d.id){r.dg=true;if(d.goal)r.dgGoal=d.goal;else delete r.dgGoal;delete r.dgStale;}};
lastRs.forEach(fix);pinned.forEach(fix);acc.forEach(fix);if(sess){sess.rows.forEach(fix);(sess.arch||[]).forEach(fix);}
if(open.has(d.id))askExpand(d.id,0,false);rerender();}
function digState(d){if(d.state)dgs[d.id]=d.state;else delete dgs[d.id];rerender();
if(d.state==='done')setTimeout(()=>{if(dgs[d.id]==='done'){delete dgs[d.id];rerender();}},2000);}
`;
