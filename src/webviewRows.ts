import { T, tier } from './webviewLayout';

/** Webview CSS: the newest-match snippet, the "+N more" expander, the other-matches list and the subagent pill. */
const BASE = String.raw`
.sa{display:inline-flex;align-items:center;gap:3px;flex:0 1 auto;min-width:0;padding:0 6px 0 4px;border-radius:9px;line-height:14px;white-space:nowrap;color:var(--vscode-charts-purple);border:1px solid color-mix(in srgb,var(--vscode-charts-purple) 55%,transparent)}
.sa svg{width:11px;height:11px;flex:none}
.sa span{overflow:hidden;text-overflow:ellipsis}
.who{flex:none;font-weight:600}
.sx{min-width:0;padding-bottom:2px}
.s{padding:0 10px 0 24px;color:var(--vscode-descriptionForeground);word-break:break-word}
.mx{display:inline-flex;align-items:center;gap:2px;height:18px;margin:2px 0 0 20px;padding:0 6px 0 2px;border:none;border-radius:9px;background:transparent;color:var(--vscode-descriptionForeground);font:inherit;cursor:pointer;white-space:nowrap}
.mx .chev{width:14px;height:14px}
.mx:hover,.mx.on{color:var(--vscode-foreground)}
.mx:hover{background:var(--vscode-toolbar-hoverBackground)}
.mx:focus-visible,.ml .lnk:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.mx .lt,.mx.on .ls{display:none}
.mx.on .lt{display:inline}
.ml{margin:2px 8px 4px 24px;padding:0 0 0 8px;border-left:1px solid var(--vscode-widget-border);list-style:none}
.mi{padding:4px 0;cursor:pointer}
.mi+.mi{border-top:1px solid color-mix(in srgb,var(--vscode-widget-border) 70%,transparent)}
.mi:hover{background:var(--vscode-list-hoverBackground)}
.mih{display:flex;align-items:center;gap:6px;min-width:0}
.mih .d{flex:1;min-width:0;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mih .mp{margin-left:auto}
.mih .xn{flex:none;line-height:16px;padding:0 5px;border-radius:9px;border:1px solid var(--vscode-widget-border);color:var(--vscode-descriptionForeground)}
.mib{margin-top:1px;color:var(--vscode-descriptionForeground);word-break:break-word}
.mib.same{font-style:italic}
.ml .lnk{margin:4px 0 2px;}
.ml .ld{padding:4px 0;color:var(--vscode-descriptionForeground)}
.s,.mib{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.mib.same{-webkit-line-clamp:1}
`;

const COMPACT = String.raw`
.sa span,.mih .d{display:none}
.mih{flex-wrap:wrap;row-gap:2px}
.sa{padding:0 3px}
.s,.mib{-webkit-line-clamp:1}
.ml{margin-left:16px;margin-right:4px;padding-left:6px}
.s,.mt{padding-left:16px}
.s{word-break:break-all}
.mx{margin-left:12px}
`;

const MEDIUM = '.mih .sa span{display:none}.mih .sa{padding:0 3px}';

const XWIDE = String.raw`
.rh>.sx{grid-column:2;grid-row:1/4;padding-top:6px}
.sx>.s{padding:0 10px 0 0}
.sx>.mx{margin-left:-4px}
.sx>.ml{margin-left:0}`;

export const ROWS_CSS = BASE + tier(T.compact, COMPACT) + tier('(max-width:520px)', MEDIUM) + tier(T.xwide, XWIDE);

/** Webview script: snippet, expander, other-matches list (lazy, duplicates collapsed) and the subagent pill. Shares top-level scope with webviewJs. */
export const ROWS_JS = String.raw`
const SUBG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.400" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.500v6.500a3 3 0 0 0 3 3h5"/><path d="M10 9.500l2.500 2.500-2.500 2.500"/></svg>';
let mOpen=new Set();
function saPill(t,k){const n=t||'subagent';
return '<span class="sa" role="img" aria-label="Subagent: '+esc(n)+'"'+(k?' data-tip="'+k+'"':'')+'>'+SUBG+'<span>'+esc(n)+'</span></span>';}
function mkey(s){return s.replace(/^…/,'').replace(/\s+/g,' ').slice(0,96);}
function mgroups(r,e){const m=new Map(),out=[],lk=mkey(r.snippet||'');
e.items.forEach((it,i)=>{if(i===0)return;const k=mkey(it.snippet),g=m.get(k);
if(g){g.n.push(it);return;}const n={i:i,it:it,n:[it],same:k===lk};m.set(k,n);out.push(n);});return out;}
function whoHtml(it){return it.sub!==undefined?saPill(it.sub):'<span class="who">'+(it.role==='user'?'You':'Agent')+'</span>';}
function miHtml(g){const it=g.it,n=g.n.length,now=Date.now();
return '<li class="mi" data-i="'+g.i+'" data-tip="k:item"><div class="mih">'+whoHtml(it)+'<span class="d">'+esc(it.desc||'')+'</span>'
+(n>1?'<span class="xn" role="img" aria-label="'+n+' messages with this text">×'+n+'</span>':'')
+'<span class="mp" role="img" aria-label="'+agoLong(it.ts,now)+'">'+agoShort(it.ts,now)+'</span></div>'
+(g.same?'<div class="mib same">Same text as the latest match</div>':'<div class="mib">'+snip(it)+'</div>')+'</li>';}
function mlHtml(r){const e=ex[r.id],a=' id="ml-'+esc(r.id)+'" aria-label="Other matches in '+esc(r.title)+'"';
if(!e)return '<ul class="ml"'+a+'><li class="ld">Loading…</li></ul>';
const gs=mgroups(r,e),left=e.total-e.items.length;
return '<ul class="ml"'+a+'>'+(gs.length?gs.map(miHtml).join(''):'<li class="ld">No other matching messages</li>')
+(left>0?'<li class="lm"><button class="lnk" data-a="more">Show '+left+' more</button></li>':'')+'</ul>';}
function mxBtn(r,n,op){const w=n+' more matching message'+(n===1?'':'s');
return '<button class="mx'+(op?' on':'')+'" data-a="mx" aria-expanded="'+op+'" aria-controls="ml-'+esc(r.id)+'" aria-label="'+(op?'Hide ':'Show ')+w+'">'+CHEV+'<span class="ls">+'+n+' more</span><span class="lt">Show less</span></button>';}
function sxHtml(r){const op=mOpen.has(r.id),more=(r.mc||0)-1;
return '<div class="sx">'+(r.snippet?'<div class="s" data-tip="k:snip">'+snip(r)+'</div>':'')+(more>0?mxBtn(r,more,op):'')+(op&&more>0?mlHtml(r):'')+'</div>';}
function mxToggle(id){if(mOpen.has(id))mOpen.delete(id);else{mOpen.add(id);if(!ex[id])askExpand(id,0,true);}rerender();rowFocus(id,'.mx');}
function mxKey(e,t){const id=t.dataset.id,m=t.querySelector('.mx');if(!m)return false;
const op=mOpen.has(id);if((e.key==='ArrowRight'&&!op)||(e.key==='ArrowLeft'&&op)){e.preventDefault();mxToggle(id);return true;}return false;}
function mxEsc(e,t){const row=t.closest('.r');if(!row||!t.closest('.ml,.mx')||!mOpen.has(row.dataset.id))return false;
e.preventDefault();mOpen.delete(row.dataset.id);rerender();rowFocus(row.dataset.id,'.mx');return true;}
`;
