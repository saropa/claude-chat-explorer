/** Webview layout: fills the panel, one scroll region, and width tiers for rows and controls. */
export const T = {
  compact: '(max-width:259px)',
  medium: '(min-width:260px) and (max-width:520px)',
  wide: '(min-width:521px)',
  xwide: '(min-width:901px)',
};

const COMPACT = `
.rc .mp.st,.rc .gi,.rc .pj,.rc .cp{display:none}`;

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
#res{flex:1 1 auto;min-height:80px;overflow-x:hidden;overflow-y:auto;container-type:inline-size;container-name:res;overflow-wrap:anywhere}
.sl,.gh{min-width:0}
.sl>span:not(.pill),.gh>span:not(.pill){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{white-space:nowrap}
.r,.rh,.hd,.ex,.s,.mt{min-width:0}
.mt{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;padding:1px 8px 4px 24px;overflow:hidden}
.pst{flex:none;line-height:16px;color:var(--vscode-charts-yellow,var(--vscode-foreground))}
.mp{flex:none;min-width:18px;box-sizing:border-box;padding:0 6px;border-radius:9px;line-height:16px;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.rc{display:flex;align-items:center;flex:none;gap:6px;max-width:60%}
.hg{display:inline-flex;flex:none;color:var(--vscode-descriptionForeground)}
.hg svg{width:12px;height:12px}
.mp.hit{background:var(--vscode-editor-findMatchHighlightBackground);color:var(--vscode-foreground)}
.mt .pj{flex:0 1 auto;min-width:0;max-width:40%;line-height:16px}
.rh>.chips{display:flex;flex-wrap:wrap;max-width:none;overflow:visible;padding:0 8px 3px 24px}
.rh>.chips:empty{display:none}
.chip{max-width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere}
.fi{overflow-wrap:anywhere}
.gp{min-width:0}
@media (max-width:199px){
.opts{right:1px}
.opts .opt{width:16px}
input[type=text]{padding-right:72px}
}
`;

export const LAYOUT_CSS = BASE + tier(T.compact, COMPACT) + tier(T.xwide, XWIDE);

/** Webview script: relative time text, meta line, hit pill and the active-query body flag. */
export const LAYOUT_JS = String.raw`
function agoLong(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);
if(m<1)return 'just now';
const u=m<60?[m,'minute']:m<1440?[Math.floor(m/60),'hour']:m<43200?[Math.floor(m/1440),'day']:m<525600?[Math.floor(m/43200),'month']:[Math.floor(m/525600),'year'];
return u[0]+' '+u[1]+(u[0]===1?'':'s')+' ago';}
function hitN(r){return r.hits>9999?nf(9999)+'+':nf(r.hits);}
function hitTxt(r){return r.hits?hitN(r)+(r.hits===1?' hit':' hits'):'';}
function msgTxt(r){return r.msgs?r.msgs+(r.msgs===1?' message':' messages'):'';}
function agoShort(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);if(m<1)return 'now';const d=Math.floor(m/1440);
const u=m<60?[m,'min']:m<1440?[Math.floor(m/60),'hr']:d<7?[d,'day']:d<30?[Math.floor(d/7),'wk']:d<365?[Math.floor(d/30),'mo']:[Math.floor(d/365),'yr'];
return u[0]+' '+u[1]+(u[0]===1?'':'s');}
function agoCompact(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);if(m<1)return 'now';const d=Math.floor(m/1440);
return m<60?m+'m':m<1440?Math.floor(m/60)+'h':d<7?d+'d':d<30?Math.floor(d/7)+'w':d<365?Math.floor(d/30)+'mo':Math.floor(d/365)+'y';}
function timeText(ms,now,latest){const a=agoLong(ms,now);
return '<span class="tm" role="img" aria-label="'+(latest?'latest match ':'active ')+a+'" data-tip="'+(latest?'k:time':esc(a+'\n'+full(ms)))+'">'+agoCompact(ms,now)+'</span>';}
const CHART_SVG='<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M3 13V8M8 13V3M13 13V6"/></svg>';
function hugeIcon(r){return statusesOf(r,pins.has(r.id),Date.now(),(dots[r.id]||{}).s).includes('huge')?'<span class="hg" role="img" aria-label="Huge chat" data-tip="Huge chat">'+CHART_SVG+'</span>':'';}
function rcHtml(r,op,now){if(op)return '';const q=r.hits>0,dc=decorated(r);
return '<span class="rc">'+(all.checked&&r.project?'<span class="pj" data-tip="Project folder">'+esc(r.project)+'</span>':'')+pinStar(r)
+(dc?ctxPill(r)+pillHtml(r)+gitIcon(r)+hugeIcon(r):'')+timeText(stamp(r),now,q&&!!r.snipAt)+'</span>';}
function hitsPill(r){const m=r.mc?' in '+r.mc+(r.mc===1?' matching message':' matching messages'):'';
return '<span class="mp hit" role="img" aria-label="'+hitN(r)+(r.hits===1?' occurrence':' occurrences')+m+'" data-tip="k:hits">'+hitTxt(r)+'</span>';}
function pinStar(r){return pins.has(r.id)?'<span class="pst" role="img" aria-label="Pinned" data-tip="Pinned">★</span>':'';}
function metaHtml(r,now){const q=r.hits>0;
if(!q&&!(decorated(r)&&r.touch))return '';
return '<div class="mt">'+(q?hitsPill(r):'')+touchPill(r)+(q&&r.snipSub!==undefined?saPill(r.snipSub,'k:snipsub'):'')+'</div>';}
function qSync(){document.body.classList.toggle('qa',!!q.value.trim());}
q.addEventListener('input',qSync);window.addEventListener('message',qSync);qSync();
`;
