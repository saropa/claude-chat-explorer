/** Webview layout: fills the panel, one scroll region, and width tiers for rows and controls. */
export const T = {
  compact: '(max-width:259px)',
  medium: '(min-width:260px) and (max-width:520px)',
  wide: '(min-width:521px)',
  xwide: '(min-width:901px)',
};

const COMPACT = `
.mt .stp,.mt .gi,.mt .pj,.mt .mp.n{display:none}`;

const WIDE = `
.mp.n.sq{display:inline-block}`;

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
#sfm,#exm{min-width:min(170px,100%);max-width:100%}
.sl,.gh{min-width:0}
.sl>span:not(.pill),.gh>span:not(.pill){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{white-space:nowrap}
.mp.n.sq{display:none}
.r,.rh,.hd,.ex,.s,.mt{min-width:0}
.mt{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;padding:1px 8px 4px 24px;overflow:hidden}
.pst{flex:none;font-size:12px;line-height:16px;color:var(--vscode-charts-yellow,var(--vscode-foreground))}
.mp{flex:none;min-width:18px;box-sizing:border-box;padding:0 6px;border-radius:9px;font-size:11px;line-height:16px;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.mp.hit{background:var(--vscode-editor-findMatchHighlightBackground);color:var(--vscode-foreground)}
.mt .pj{flex:0 1 auto;min-width:0;max-width:40%;font-size:11px;line-height:16px}
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

export const LAYOUT_CSS = BASE + tier(T.compact, COMPACT) + tier(T.wide, WIDE) + tier(T.xwide, XWIDE);

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
function timePill(ms,now,latest){const a=agoLong(ms,now);
return '<span class="mp tp" role="img" aria-label="'+(latest?'latest match ':'active ')+a+'" data-tip="'+(latest?'k:time':esc(a+'\n'+full(ms)))+'">'+agoShort(ms,now)+'</span>';}
function hitsPill(r){const m=r.mc?' in '+r.mc+(r.mc===1?' matching message':' matching messages'):'';
return '<span class="mp hit" role="img" aria-label="'+hitN(r)+(r.hits===1?' occurrence':' occurrences')+m+'" data-tip="k:hits">'+hitTxt(r)+'</span>';}
function pinStar(r){return pins.has(r.id)?'<span class="pst" role="img" aria-label="Pinned" data-tip="Pinned">★</span>':'';}
function metaHtml(r,now){const q=r.hits>0,mt=msgTxt(r),dc=decorated(r);
if(!q&&!dc)return '';
return '<div class="mt">'+pinStar(r)+(all.checked&&r.project?'<span class="pj" data-tip="Project folder">'+esc(r.project)+'</span>':'')
+(q?hitsPill(r):'')+(mt&&(dc||!q)?'<span class="mp n'+(q?' sq':'')+'" role="img" aria-label="'+mt+'" data-tip="k:count">'+r.msgs+'</span>':'')
+timePill(stamp(r),now,q&&!!r.snipAt)+touchPill(r)+(q&&r.snipSub!==undefined?saPill(r.snipSub,'k:snipsub'):'')+(dc?pillHtml(r)+ctxPill(r)+gitIcon(r):'')+'</div>';}
function qSync(){document.body.classList.toggle('qa',!!q.value.trim());}
q.addEventListener('input',qSync);window.addEventListener('message',qSync);qSync();
`;
