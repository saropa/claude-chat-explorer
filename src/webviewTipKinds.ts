/** Webview script: the content of each tooltip kind, built only when a tooltip is shown. Shares top-level scope with webviewJs. */
export const TIP_KINDS_JS = String.raw`
const TIP_CAP=600;
function tcap(s){return s.length>TIP_CAP?s.slice(0,TIP_CAP)+'…':s;}
function tmark(s,rg){const c=s.length>TIP_CAP,t=c?s.slice(0,TIP_CAP):s;return marked(t,rg.filter(g=>g[1]<=t.length))+(c?'…':'');}
function kv(rows){return '<dl>'+rows.filter(x=>x[1]!==''&&x[1]!=null).map(x=>'<dt>'+esc(x[0])+'</dt><dd>'+x[1]+'</dd>').join('')+'</dl>';}
function tipStatic(t){const a=tcap(t).split('\n');return '<b>'+esc(a[0])+'</b>'+a.slice(1).map(x=>'<p class="tsm">'+esc(x)+'</p>').join('');}
function dotTip(d){const w=d.win==='this'?'Open in this window':d.win==='other'?'Open in another window':'';
const h={running:'Running',waiting:'Waiting for you',unread:'Unread',idle:d.ring?(w||'Open elsewhere'):'Idle'}[d.s]||'Idle';
const m={running:'Claude is working in this chat now.',waiting:'Claude is waiting for your answer.',unread:'Finished while you were away (approximate).',idle:d.ring?'A live Claude process has this chat open.':'Not open anywhere.'}[d.s]||'';
return h+'\n'+m+(w&&d.s!=='idle'?'\n'+w:'');}
function tipTitle(r){const now=Date.now(),c=r.cost>0?(r.cost<0.01?'<$0.01':'$'+r.cost.toFixed(2)):'';
return '<b>'+esc(tcap(r.title))+'</b>'+kv([['Project',esc(r.project||'')],['Active',agoLong(r.last,now)],['Date',esc(full(r.last))],['Messages',r.msgs],['Active for',r.last>r.first?esc(durText(r.first,r.last)):''],['Files edited',r.edited||''],['Size',sizeText(r.size)],['Cost',c],['Models',esc((r.models||[]).join(', '))]])
+(r.title.length>TIP_CAP?'<p class="nt">Title cut at '+TIP_CAP+' characters.</p>':'');}
function tipHits(r){return '<b>'+hitN(r)+(r.hits===1?' occurrence':' occurrences')+'</b>'+kv([['Messages',r.mc?r.mc+' matching':''],['Subagents',r.subTotal?r.subTotal+' matched':(subs.checked?'none':'')]]);}
function tipTime(r){const now=Date.now();return '<b>Latest match '+agoLong(r.snipAt,now)+'</b>'+kv([['Match at',esc(full(r.snipAt))],['Chat active',agoLong(r.last,now)]]);}
function srcOf(x){return x.sub!==undefined?'Subagent '+(x.sub||'agent'):(x.role==='user'?'You':'Claude');}
function tipSnip(r){const now=Date.now(),src=r.snipSub!==undefined?'Subagent '+(r.snipSub||'agent')+(r.snipDesc?' · '+r.snipDesc:''):(r.snipRole==='user'?'You':r.snipRole?'Claude':'Latest match');
return '<b>'+esc(tcap(src))+'</b>'+(r.snipAt?'<p class="tsm">'+agoLong(r.snipAt,now)+' · '+esc(full(r.snipAt))+'</p>':'')+'<p class="q">'+tmark(r.snippet,r.ranges)+'</p>';}
function tipItem(r,el){const e=ex[r.id],g=e&&mgroups(r,e).find(x=>x.i===+el.dataset.i);if(!g)return '';const now=Date.now(),it=g.it;
const lab=x=>srcOf(x)+(x.desc?' · '+x.desc:'');
const head=g.n.length>1?'<b>'+g.n.length+' messages with this text</b>'+kv(g.n.map(x=>[agoShort(x.ts,now),esc(lab(x))])):'<b>'+esc(tcap(lab(it)))+'</b><p class="tsm">'+agoLong(it.ts,now)+' · '+esc(full(it.ts))+'</p>';
return head+'<p class="q">'+tmark(it.snippet,it.ranges)+'</p><p class="nt">Click to resume the chat.</p>';}
function tipKind(k,el){const row=el.closest('.r'),r=row&&resOf(row.dataset.id);if(!r)return '';
if(k==='title')return tipTitle(r);if(k==='hits')return tipHits(r);if(k==='count')return '<b>'+plur(r.msgs,'message')+'</b>';
if(k==='time')return tipTime(r);if(k==='snipsub')return '<b>Subagent: '+esc(r.snipSub||'agent')+'</b><p class="tsm">'+esc(r.snipDesc||'')+'</p>';
if(k==='snip')return tipSnip(r);if(k==='item')return tipItem(r,el);return '';}
`;
