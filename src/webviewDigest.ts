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
#dgw{padding:2px 10px 3px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-widget-border,transparent)}
#dgw[hidden]{display:none}
`;

/**
 * Every user-facing string of the digest webview parts, in one place: the single source of truth for the card, the row
 * marker and the snippet label. This is the ONE English source: the host passes each entry through vscode.l10n.t and posts
 * the table (digestText message), which replaces these defaults in the page; the English is the fallback until it arrives.
 * {0} and {1} are placeholders filled by dgF in the page, so word order can change per language without touching the script.
 */
export const DIGEST_TEXT = {
  mark: 'Digest',
  markStale: 'Digest (out of date)',
  withGoal: '{0}: {1}',
  showDigest: '{0}. Show the digest',
  snipLabel: 'Digest',
  snipAria: 'Digest match: {0}. Show the digest',
  snipTip: 'Matched the digest of this session: click to show it',
  btnTip: '{0} (asks the AI model when AI parts are on)',
  building: 'Building...',
  built: 'Built',
  dialog: 'Dialog',
  dialogTip: 'An answer given in the question dialog',
  options: 'Options: {0}',
  message: 'Message',
  messageTip: 'An owner message the AI marked as a decision',
  msgLabel: 'Message {0}',
  msgAria: 'Open message {0} in the session file',
  msgTip: 'Open the session file at this message',
  msgTipLine: 'Open the session file at this message (line {0})',
  refAria: 'Open {0}',
  changed: 'This session changed after the digest was built.',
  goal: 'Goal',
  notGenerated: 'Not generated',
  decisions: 'Decisions ({0})',
  noneRecorded: 'None recorded',
  files: 'Files changed ({0})',
  none: 'None',
  refs: 'References ({0})',
  leftOpen: 'Left open',
  nothingOpen: 'Nothing left open',
  builtAgo: 'Built {0}',
  rebuild: 'Rebuild',
  rebuildDigest: 'Rebuild digest',
  noDigest: 'No digest yet.',
  buildDigest: 'Build digest',
  section: 'Digest',
  outOfDate: 'out of date',
} as const;

/** The digest strings as the host sends them: the same keys as DIGEST_TEXT, each value localized. */
export type DigestTextTable = { [K in keyof typeof DIGEST_TEXT]: string };

/** Digest script. NOTE_TEXT is injected from digestMd.ts, so the card and the exported Markdown say the same thing; DIGEST_TEXT holds every other string. */
export const DIGEST_JS = String.raw`
const DG_NOTES=` + JSON.stringify(NOTE_TEXT) + String.raw`;
const DG_T=` + JSON.stringify(DIGEST_TEXT) + String.raw`;
/* the host's localized strings replace the English defaults key by key; only known keys with string values are taken, so a bad message cannot add or break entries */
function digText(d){const t=d&&d.text;if(!t||typeof t!=='object')return;for(const k of Object.keys(DG_T)){if(typeof t[k]==='string')DG_T[k]=t[k];}rerender();}
/* fill the {0}, {1} placeholders of a DG_T string with the given values, in order */
function dgF(s){const a=arguments;return s.replace(/\{(\d+)\}/g,(m,k)=>String(a[Number(k)+1]));}
const DG_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"><path d="M4 1.500h5.500L12.500 4.500V14.500H4z"/><path d="M9.500 1.500v3h3M6 8h4.500M6 10.500h4.500M6 13h2.500" stroke-linecap="round"/></svg>';
/* build state per chat for the card's button: busy while the host builds, done for 2 s after */
const dgs={};
/* the list-row marker: shown on every chat with a digest; its tooltip is the goal line; a click opens the card at the Digest section */
function dgMark(r){if(!r.dg)return '';const k=r.dgStale?DG_T.markStale:DG_T.mark,t=r.dgGoal?dgF(DG_T.withGoal,k,r.dgGoal):k;
return '<span class="dgm'+(r.dgStale?' st':'')+'" data-a="dig" role="button" tabindex="0" aria-label="'+esc(dgF(DG_T.showDigest,t))+'" data-tip="'+esc(t)+'">'+DG_SVG+'</span>';}
/* the snippet of a digest-only hit: labeled Digest, and a click opens the Digest section instead of resuming the chat */
function dgSnip(r){return '<div class="s dgsn" data-a="dig" role="button" tabindex="0" aria-label="'+esc(dgF(DG_T.snipAria,r.snippet))+'" data-tip="'+esc(DG_T.snipTip)+'"><b class="dgl">'+esc(DG_T.snipLabel)+'</b> '+snip(r)+'</div>';}
/* chat whose Digest section must be scrolled to as soon as it exists: a closed card renders it only when the expand reply arrives, so a lookup right after openCard finds nothing */
let dgPend='';
/* bring the pending Digest section into view; stays pending (returns) while the section is not rendered yet */
function dgScroll(){if(!dgPend)return;const id=dgPend;
const n=Array.from(document.querySelectorAll('[data-sec]')).find(x=>x.dataset.sec==='dig:'+id);if(n){dgPend='';n.scrollIntoView({block:'nearest'});n.focus();}}
/* open the card (if closed) and its Digest section, then bring the section into view; for a closed card the scroll waits for the expand reply (digestHtml schedules it) */
function digOpen(id){if(!open.has(id)){openCard(id);}col.delete('dig:'+id);dgPend=id;rerender();dgScroll();}
/* the Build or Rebuild button of the card: label is the idle text; busy and done come from dgs so a click shows an outcome at once */
function dgBtn(id,label){const st=dgs[id];
return '<button class="xb'+(st==='busy'?' busy':'')+'" data-a="dgbuild"'+(st==='busy'?' aria-busy="true"':'')+' aria-label="'+esc(label)+'" data-tip="'+esc(dgF(DG_T.btnTip,label))+'">'+XI.note+'<span>'+(st==='busy'?esc(DG_T.building):st==='done'?esc(DG_T.built):esc(label))+'</span></button>';}
/* the warnings of a digest (no close, unreadable dialog answers, trimmed input, AI failed or off, size cap), one line each, from the same texts as the exported Markdown */
function dgNotes(d){const n=[];if(d.noClose)n.push(DG_NOTES.noClose);if(d.dialogUnread)n.push(DG_NOTES.dialogUnread);if(d.inputTrimmed)n.push(DG_NOTES.inputTrimmed);
if(d.ai==='failed')n.push(DG_NOTES.failed);else if(d.ai==='off')n.push(DG_NOTES.off);
if(d.capTrimmed&&d.capTrimmed.length)n.push(DG_NOTES.cap+' ('+d.capTrimmed.join(', ')+')');
return n.map(x=>'<div class="dgn">'+esc(x)+'</div>').join('');}
/* one decision: Dialog shows its question beside the answer; Message links to its message (opens the session file at that line) */
function dgDec(x){if(x.src==='dialog')return '<div class="dgd"><span class="dgs" data-tip="'+esc(DG_T.dialogTip)+'">'+esc(DG_T.dialog)+'</span><div class="dgq"'+(x.opts&&x.opts.length?' data-tip="'+esc(dgF(DG_T.options,x.opts.join(' | ')))+'"':'')+'>'+esc(x.q||'')+'</div><div class="dga">'+esc(x.a)+'</div></div>';
return '<div class="dgd"><span class="dgs" data-tip="'+esc(DG_T.messageTip)+'">'+esc(DG_T.message)+'</span><span class="gp" data-a="dgmsg" data-i="'+x.i+'" role="button" tabindex="0" aria-label="'+esc(dgF(DG_T.msgAria,x.i))+'" data-tip="'+esc(x.line?dgF(DG_T.msgTipLine,x.line):DG_T.msgTip)+'">'+esc(dgF(DG_T.msgLabel,x.i))+'</span><div class="dga">'+esc(x.a)+'</div></div>';}
/* one reference chip: the host decides what a click does (URL, PR or commit search, file) and only for references stored in the digest */
function dgRef(r){return '<span class="gp" data-a="dgref" data-r="'+esc(r)+'" role="button" tabindex="0" aria-label="'+esc(dgF(DG_T.refAria,r))+'" data-tip="'+esc(r)+'">'+esc(r)+'</span>';}
/* the card section body: notes, then Goal, Decisions, Files changed, References and Left open, each with an explicit empty state so a missing part is never silent */
function dgBody(id,g){const d=g.d,now=Date.now();let h=dgNotes(d);
if(g.stale)h+='<div class="dgn">'+esc(DG_T.changed)+'</div>';
h+='<div class="dgk">'+esc(DG_T.goal)+'</div>'+(d.goal?'<div>'+esc(d.goal)+'</div>':'<div class="none">'+esc(DG_T.notGenerated)+'</div>');
h+='<div class="dgk">'+esc(dgF(DG_T.decisions,d.decisions.length))+'</div>'+(d.decisions.length?d.decisions.map(dgDec).join(''):'<div class="none">'+esc(DG_T.noneRecorded)+'</div>');
h+='<div class="dgk">'+esc(dgF(DG_T.files,d.files.length))+'</div>'+(d.files.length?'<div class="fps">'+d.files.map(fileChip).join('')+'</div>':'<div class="none">'+esc(DG_T.none)+'</div>');
h+='<div class="dgk">'+esc(dgF(DG_T.refs,d.refs.length))+'</div>'+(d.refs.length?'<div class="dgr">'+d.refs.map(dgRef).join('')+'</div>':'<div class="none">'+esc(DG_T.none)+'</div>');
/* Left open: "nothing left open" only when the AI ran; otherwise the part was not generated */
h+='<div class="dgk">'+esc(DG_T.leftOpen)+'</div>'+(d.open&&d.open.length?'<ul class="dgo">'+d.open.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'<div class="none">'+esc(d.ai==='ok'?DG_T.nothingOpen:DG_T.notGenerated)+'</div>');
return h+'<div class="dgf">'+esc(dgF(DG_T.builtAgo,agoLong(d.built,now)))+' '+dgBtn(id,g.stale?DG_T.rebuildDigest:DG_T.rebuild)+'</div>';}
/* the card section: absent while the full reply is loading, a Build button when the chat has no digest */
function digestHtml(r,e){if(!e||!e.full||e.digest===undefined)return '';const id=r.id,g=e.digest;
/* the section is built from the full expand reply: if a click on the marker is waiting for it, scroll once this render is in the DOM */
if(dgPend===id)setTimeout(dgScroll,0);
if(!g)return xsec('dig:'+id,DG_T.section,'','<div class="none">'+esc(DG_T.noDigest)+' '+dgBtn(id,DG_T.buildDigest)+'</div>','xd');
return xsec('dig:'+id,DG_T.section,g.stale?DG_T.outOfDate:'',dgBody(id,g),'xd');}
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
/* the layout-drift line of the status area: the host sends the text (localized) and the action label; an empty text hides it.
   It reuses the cap notice's warning row (cw, WARN_SVG) so both warnings look the same */
function digDrift(d){const w=document.getElementById('dgw');if(!w)return;const t=d&&typeof d.text==='string'?d.text:'';
if(!t){w.hidden=true;w.innerHTML='';return;}
w.hidden=false;w.innerHTML='<div class="cw">'+WARN_SVG+'<span>'+esc(t)+' <button type="button" class="lnk" data-a="dgout">'+esc(d.action||'')+'</button></span></div>';}
/* Show Output opens the output channel (a visible outcome in the host); the listener sits on the line itself, outside the row click handler */
const dgwEl=document.getElementById('dgw');if(dgwEl)dgwEl.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-a="dgout"]');if(b)vs.postMessage({type:'digestOutput'});});
/* build state of the card's button from the host: busy and done show on the button, anything else clears it; done also clears itself after 2 s */
function digState(d){if(d.state)dgs[d.id]=d.state;else delete dgs[d.id];rerender();
if(d.state==='done')setTimeout(()=>{if(dgs[d.id]==='done'){delete dgs[d.id];rerender();}},2000);}
`;
