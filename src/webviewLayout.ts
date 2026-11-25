/** Webview layout: fills the panel, one scroll region, and width tiers for rows and controls. */
export const T = {
  compact: '(max-width:259px)',
  medium: '(min-width:260px) and (max-width:520px)',
  wide: '(min-width:521px)',
  xwide: '(min-width:901px)',
};

const COMPACT = `
.rc .gi,.rc .pj,.rc .cp{display:none}`;

const XWIDE = `
.rh{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);grid-template-rows:auto auto 1fr;column-gap:8px}
.rh>*{grid-column:1/-1}
.rh>.hd{grid-column:1;grid-row:1}
.rh>.mt{grid-column:1;grid-row:2;align-self:start}
.rh>.chips{grid-column:1;grid-row:3}`;

/** One tier rule set as a container query on the results region, plus a media-query fallback. */
export function tier(cond: string, css: string): string {
  return `@container res ${cond}{${css}}\n@supports not (container-type:inline-size){@media ${cond}{${css}}}\n`;
}

const BASE = String.raw`
html{height:100%;overflow:hidden}
body{box-sizing:border-box;height:100%;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto}
#hdr{flex:none;min-width:0}
#sm,#smb{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
#sm.shut{flex:none}
#sb{flex:none;padding:0 8px}
#smb>.top{flex:none}
#frow{flex:none}
.clr:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#smb[hidden]{display:none}
#smh{display:flex;align-items:center;gap:4px;width:100%;text-align:left;padding:2px 8px;margin:4px 0 6px;font:inherit;border:none;background:transparent;cursor:pointer;color:var(--vscode-descriptionForeground)} /* margin and font match the Account & Usage header so all three section headers look alike */
#smh[aria-expanded=true]>.chev{transform:rotate(90deg)}
#smh:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#res{flex:1 1 auto;min-height:80px;overflow-x:hidden;overflow-y:auto;container-type:inline-size;container-name:res;overflow-wrap:anywhere}
.sl,.gh{min-width:0}
.sl>span:not(.pill),.gh>span:not(.pill){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{white-space:nowrap}
.r,.rh,.hd,.ex,.s,.mt{min-width:0}
.mt{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;padding:1px 8px 4px 24px;overflow:hidden}
.pst{flex:none;line-height:16px;font-size:14px;color:var(--vscode-charts-yellow,var(--vscode-foreground))}
.mp{flex:none;min-width:18px;box-sizing:border-box;padding:0 6px;border-radius:9px;line-height:16px;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.rc{display:flex;align-items:center;flex:none;gap:6px;max-width:60%}
.hg{display:inline-flex;flex:none;color:var(--vscode-descriptionForeground)}
.hg svg{width:12px;height:12px}
.mt .pj{flex:0 1 auto;min-width:0;max-width:40%;line-height:16px}
.rh>.chips{display:flex;flex-wrap:wrap;max-width:none;overflow:visible;padding:0 8px 3px 24px}
.rh>.chips:empty{display:none}
.chip{max-width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere}
.fi{overflow-wrap:anywhere}
.gp{min-width:0}
@media (max-width:199px){
.opts{right:1px}
.clr{right:70px}
.opts .opt{width:16px}
input[type=text]{padding-right:90px}
}
`;

export const LAYOUT_CSS = BASE + tier(T.compact, COMPACT) + tier(T.xwide, XWIDE);

/** Webview script: relative time text, meta line and the active-query body flag. */
export const LAYOUT_JS = String.raw`
function agoLong(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);
if(m<1)return 'just now';
const u=m<60?[m,'minute']:m<1440?[Math.floor(m/60),'hour']:m<43200?[Math.floor(m/1440),'day']:m<525600?[Math.floor(m/43200),'month']:[Math.floor(m/525600),'year'];
return u[0]+' '+u[1]+(u[0]===1?'':'s')+' ago';}
function hitN(r){return r.hits>9999?nf(9999)+'+':nf(r.hits);}
function msgTxt(r){return r.msgs?r.msgs+(r.msgs===1?' message':' messages'):'';}
function agoShort(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);if(m<1)return 'now';const d=Math.floor(m/1440);
const u=m<60?[m,'min']:m<1440?[Math.floor(m/60),'hr']:d<7?[d,'day']:d<30?[Math.floor(d/7),'wk']:d<365?[Math.floor(d/30),'mo']:[Math.floor(d/365),'yr'];
return u[0]+' '+u[1]+(u[0]===1?'':'s');}
function agoCompact(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);if(m<1)return 'now';const d=Math.floor(m/1440);
return m<60?m+'m':m<1440?Math.floor(m/60)+'h':d<7?d+'d':d<30?Math.floor(d/7)+'w':d<365?Math.floor(d/30)+'mo':Math.floor(d/365)+'y';}
function timeText(ms,now,latest){const a=agoLong(ms,now);
return '<span class="tm" role="img" aria-label="'+(latest?'latest match ':'active ')+a+'" data-tip="'+(latest?'k:time':esc(a+'\n'+full(ms)))+'">'+agoCompact(ms,now)+'</span>';}
const CHART_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M3 13V8M8 13V3M13 13V6"/></svg>';
function hugeIcon(r){return statusesOf(r,pins.has(r.id),Date.now(),(dots[r.id]||{}).s).includes('huge')?'<span class="hg" role="img" aria-label="Huge session" data-tip="Huge session">'+CHART_SVG+'</span>':'';}
function rcHtml(r,op,now){if(op)return '';const q=r.hits>0,dc=decorated(r);
return '<span class="rc">'+(all.checked&&r.project?'<span class="pj" data-tip="Project folder">'+esc(r.project)+'</span>':'')+pinStar(r)
+ringHtml(r)+(dc?ctxPill(r)+gitIcon(r)+hugeIcon(r):'')+dgMark(r)+timeText(stamp(r),now,q&&!!r.snipAt)+'</span>';} /* dgMark: the digest marker shows on every row that has a digest, decorated or not */
function pinStar(r){return pins.has(r.id)?'<span class="pst" role="img" aria-label="Pinned" data-tip="Pinned">★</span>':'';}
function metaHtml(r,now){const q=r.hits>0,t=touchPill(r),sp=q&&r.snipSub!==undefined?saPill(r.snipSub,'k:snipsub'):'';
if(!t&&!sp)return '';
return '<div class="mt">'+t+sp+'</div>';}
function qSync(){document.body.classList.toggle('qa',!!q.value.trim());}
/* Collapsible section headers (Account & Usage is a <details>, the other two are buttons). The extension saves each state per workspace and sends it back with 'restore'. */
const SECS={sm:{h:'smh',b:'smb'},act:{h:'acth',b:'actb'}};
function secSet(n,o,save){const s=SECS[n],h=$(s.h);h.setAttribute('aria-expanded',String(o));$(s.b).hidden=!o;if(n==='sm')$('sm').classList.toggle('shut',!o);
if(n==='act')vs.postMessage({type:'actOpen',open:o}); /* also stops/starts the chat-log polling, and is saved */
else if(save)vs.postMessage({type:'secOpen',name:n,open:o});}
$('smh').addEventListener('click',()=>secSet('sm',$('smh').getAttribute('aria-expanded')!=='true',true));
$('acth').addEventListener('click',()=>secSet('act',$('acth').getAttribute('aria-expanded')!=='true',true));
/* Vertical resize of the Activity section: dragging the splitter up grows it (Session Manager is the flexible section above and shrinks). Height is saved per workspace; double-click resets to content height. */
const SPL=$('spl'),ACTB=$('actb'),ACTW=$('act');
function actH(px,save){if(px==null){ACTW.classList.remove('sized');ACTW.style.removeProperty('--ah');}
else{px=Math.max(40,Math.min(Math.round(px),Math.max(80,window.innerHeight-120))); /* clamp so the splitter can never be dragged out of reach */
ACTW.style.setProperty('--ah',px+'px');ACTW.classList.add('sized');}
if(save)vs.postMessage({type:'secSize',name:'act',px:px==null?0:px});}
SPL.addEventListener('pointerdown',e=>{e.preventDefault();SPL.setPointerCapture(e.pointerId);
const y0=e.clientY,h0=ACTB.getBoundingClientRect().height;SPL.classList.add('drag');document.body.classList.add('dragging');
const mv=m=>actH(h0+(y0-m.clientY),false);
const up=()=>{SPL.removeEventListener('pointermove',mv);SPL.removeEventListener('pointerup',up);SPL.removeEventListener('pointercancel',up);
SPL.classList.remove('drag');document.body.classList.remove('dragging');
if(ACTW.classList.contains('sized'))actH(parseFloat(ACTW.style.getPropertyValue('--ah')),true); /* persist once, on release */};
SPL.addEventListener('pointermove',mv);SPL.addEventListener('pointerup',up);SPL.addEventListener('pointercancel',up);});
SPL.addEventListener('dblclick',()=>actH(null,true));
SPL.addEventListener('keydown',e=>{if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault(); /* keyboard parity with the mouse */
actH(ACTB.getBoundingClientRect().height+(e.key==='ArrowUp'?16:-16),true);});
window.addEventListener('message',e=>{const d=e.data;if(!d||d.type!=='restore'||!d.secs)return;
if(typeof d.secs.actH==='number'&&d.secs.actH>0)actH(d.secs.actH,false);
if(typeof d.secs.acct==='boolean')$('acct').open=d.secs.acct;
if(typeof d.secs.sm==='boolean')secSet('sm',d.secs.sm,false);
if(typeof d.secs.act==='boolean')secSet('act',d.secs.act,false);});
$('qx').addEventListener('click',()=>{q.value='';q.dispatchEvent(new Event('input'));q.focus();});
q.addEventListener('input',qSync);window.addEventListener('message',qSync);qSync();
`;
