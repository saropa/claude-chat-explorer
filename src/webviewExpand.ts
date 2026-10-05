/** Webview script part: the expanded row (action bar, stats, tags, messages, files, related). Shares top-level scope with webviewJs. */
export const EXPAND_JS = String.raw`
const XI={
play:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.500v9l7-4.500z" fill="currentColor"/></svg>',
copy:'<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.200"><rect x="5.500" y="5.500" width="8" height="8" rx="1.500"/><path d="M10.500 3.500v-.500a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.500"/></svg>',
star:'<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"><path d="M8 2l1.800 3.800 4.200.500-3.100 2.900.800 4.100L8 11.300 4.300 13.300l.800-4.100L2 6.300l4.200-.500z"/></svg>',
starOn:'<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 2l1.800 3.800 4.200.500-3.100 2.900.800 4.100L8 11.300 4.300 13.300l.800-4.100L2 6.300l4.200-.500z"/></svg>',
note:'<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"><rect x="3" y="2.500" width="10" height="11.500" rx="1.500"/><path d="M5.500 6h5M5.500 8.500h5M5.500 11h3" stroke-linecap="round"/></svg>',
read:'<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.400" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.500l3 3 7-7"/></svg>'};
let tagIn=null;
const hv={};
function handoverState(d){if(d.state)hv[d.id]=d.state;else delete hv[d.id];rerender();
if(d.state==='done')setTimeout(()=>{if(hv[d.id]==='done'){delete hv[d.id];rerender();}},2000);}
function plur(n,w){return n+' '+w+(n===1?'':'s');}
function pillBit(n){return n===''?'':n==='\u2026'?'<span class="pill w" aria-hidden="true">\u2026</span>':'<span class="pill'+(n===0?' z':'')+'" role="img" aria-label="'+n+'" data-tip="'+n+'">'+n+'</span>';}
function xsec(key,label,n,body,k,pill,ov){const o=ov===undefined?!col.has(key):ov,c=n===''?'':pill?pillBit(n):'<span class="xc">'+n+'</span>',cn=n===''||n==='\u2026'?'':', '+n;
return '<section class="'+k+'"><div class="xh'+(o?' open':'')+'" data-sec="'+esc(key)+'" role="button" tabindex="0" aria-expanded="'+o+'" aria-label="'+esc(label+cn)+'">'+CHEV+'<span class="sn">'+esc(label)+'</span>'+c+'</div>'+(o?'<div class="xb2">'+body+'</div>':'')+'</section>';}
function xbtn(a,ic,label,txt,cls,extra,tip){return '<button class="xb'+(cls||'')+'" data-a="'+a+'"'+(extra||'')+' aria-label="'+label+'" data-tip="'+(tip||label)+'">'+ic+'<span class="xl'+(a==='read'||a==='copyid'||a==='handover'?' xo':'')+'">'+txt+'</span></button>';}
function actHtml(r){const p=pins.has(r.id),ia=arch.has(r.id);
return '<div class="xa" role="toolbar" aria-label="Chat actions"><button class="xb pri" data-a="resume" aria-label="Resume chat">'+XI.play+'<span>Resume</span></button>'
+xbtn('pin',p?XI.starOn:XI.star,p?'Unpin':'Pin',p?'Pinned':'Pin',p?' on':'',' aria-pressed="'+p+'"')
+xbtn('arch',ARCH_SVG,ia?'Unarchive':'Archive',ia?'Unarchive':'Archive','')
+((dots[r.id]||{}).s==='unread'?xbtn('read',XI.read,'Mark as read','Mark read',''):'')
+'<span class="sp"></span>'+xbtn('handover',hv[r.id]==='done'?XI.read:XI.note,'Copy hand-over note',hv[r.id]==='busy'?'Copying...':hv[r.id]==='done'?'Copied':'Copy hand-over note',hv[r.id]==='busy'?' busy':'',hv[r.id]==='busy'?' aria-busy="true"':'')+xbtn('copyid',XI.copy,'Copy session ID','Copy ID','','','Copy session ID '+esc(r.id))+'</div>';}
function statCell(l,v,tip,a){return '<div data-tip="'+esc(tip)+'"><dt>'+l+'</dt><dd'+(a?' aria-label="'+a+'"':'')+'>'+v+'</dd></div>';}
function statsHtml(r){let h='';const now=Date.now();
if(r.msgs)h+=statCell('Messages',r.msgs,plur(r.msgs,'message')+' in this chat');
h+=statCell('Last active',esc(agoLong(r.last,now)),'Last active '+agoLong(r.last,now)+'\n'+full(r.last));
if(r.last>r.first)h+=statCell('Active for',esc(durText(r.first,r.last)),'Active for '+durText(r.first,r.last)+'\nFirst message to last message');
if(r.edited>0)h+=statCell('Files edited',r.edited,plur(r.edited,'file')+' edited in this chat');
h+=statCell('Size',sizeText(r.size),'Transcript size on disk: '+sizeText(r.size));
if(r.ctx)h+=statCell('Context',esc(ctxStat(r.ctx)),'Context window use\n'+ctxStat(r.ctx));
if(r.cost>0){const c=r.cost<0.01?'<$0.01':'$'+r.cost.toFixed(2);h+=statCell('Cost',esc(c),'Estimated cost of this chat: '+c);}
if(r.add||r.rem)h+=statCell('Lines','<span class="add">+'+(r.add||0)+'</span> <span class="rem">\u2212'+(r.rem||0)+'</span>','+'+plur(r.add||0,'line')+' added, -'+plur(r.rem||0,'line')+' removed in this chat\'s edits',plur(r.add||0,'line')+' added, '+(r.rem||0)+' removed');
if(r.models&&r.models.length)h+='<div class="wide" data-tip="'+esc('Models used\n'+r.models.join(', '))+'"><dt>Models</dt><dd>'+esc(r.models.join(', '))+'</dd></div>';
return '<dl class="xs" aria-label="Chat stats">'+h+'</dl>';}
function tagInput(id){return tagIn&&tagIn.id===id
?'<span class="xin"><input class="tin" list="tl" placeholder="Add tag" maxlength="40" aria-label="New tag. Enter adds, Escape cancels" aria-description="Enter to add, Escape to cancel" data-tip="Enter to add · Esc to cancel" value="'+esc(tagIn.v)+'"></span>':'';}
function tagLine(id){return chips(id)+tagInput(id);}
function tagsHtml(r){return (tags[r.id]||[]).length||tagInput(r.id)?'<div class="xt" role="group" aria-label="Tags">'+tagLine(r.id)+'</div>':'';}
function filesHtml(r,e){let h='';
if(e.files.length)h+=xsec('fil:'+r.id,'Matched files',e.files.length,'<div class="fps">'+e.files.map(fileChip).join('')+'</div>','xf');
if(e.commands.length)h+=xsec('cmd:'+r.id,'Matched commands',e.commands.length,e.commands.map(c=>'<div class="fi">'+esc(c)+'</div>').join(''),'xf');
return h;}
function relHtml(x){const n=plur(x.shared,'shared file'),now=Date.now();
return '<div class="rr" data-id="'+esc(x.id)+'" tabindex="0" role="button" aria-label="'+esc(x.title+', '+n+', active '+agoLong(x.last,now)+'. Resume')+'" data-tip="'+esc(x.title+'\n'+full(x.last))+'">'+dotHtml(x.id)+'<span class="t">'+esc(x.title)+'</span><span class="sh">'+n+'</span>'+timeText(x.last,now)+'</div>';}
function safeSec(name,fn){try{return fn();}catch(err){console.error('section '+name,err);return '<div class="none">Could not show this section ('+name+')</div>';}}
function loadHtml(e){return e&&e.failed?'<div class="none">'+esc(e.reason||'Could not load details')+'. <span class="gp" data-a="xretry" role="button" tabindex="0" aria-label="Retry loading details" data-tip="Load the details again">Retry</span></div>':'<div class="m">Loading...</div>';}
function exHtml(r){const e=ex[r.id],f=e&&e.full,t=r.title;
const left=safeSec('stats',()=>statsHtml(r))+safeSec('tags',()=>tagsHtml(r));
const mid=f?safeSec('files',()=>filesHtml(r,e)):loadHtml(e);
return '<div class="ex" role="region" aria-label="Details: '+esc(t)+'">'+safeSec('actions',()=>actHtml(r))+'<div class="xca">'+mid+'</div><div class="xcl">'+left+'</div>'+'<div class="xcb">'+lazyHtml(r,e)+'</div></div>';}
function rowFocus(id,sel){const n=Array.from(document.querySelectorAll('.r')).find(x=>x.dataset.id===id);if(!n)return;n.focus();const f=n.querySelector(sel);if(f)f.focus();}
function tagOpen(id){tagIn={id:id,v:''};rerender();rowFocus(id,'.tin');}
function tagClose(id,back){tagIn=null;rerender();if(back)rowFocus(id,'[data-a=addtag]');}
function tagToggle(id){if(tagIn&&tagIn.id===id)tagClose(id,true);else tagOpen(id);}
function tagKey(e,t){const id=t.closest('.r').dataset.id;
if(e.key==='Escape'){e.preventDefault();e.stopPropagation();tagClose(id,true);return;}
if(e.key!=='Enter')return;const v=t.value.trim();if(!v)return;
vs.postMessage({type:'tagAdd',id:id,tag:v});t.value='';tagIn.v='';}
document.addEventListener('input',e=>{if(tagIn&&e.target.classList.contains('tin'))tagIn.v=e.target.value;});
document.addEventListener('focusout',e=>{const t=e.target;if(!tagIn||!t.classList||!t.classList.contains('tin'))return;
setTimeout(()=>{if(tagIn&&t.isConnected&&!t.value.trim()&&document.activeElement!==t)tagClose(tagIn.id,false);},0);});
`;
