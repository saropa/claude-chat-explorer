/** Webview layout: fills the panel, one scroll region, and width tiers for rows and controls. */
const T = {
  compact: '(max-width:259px)',
  medium: '(min-width:260px) and (max-width:520px)',
  wide: '(min-width:521px)',
  xwide: '(min-width:901px)',
};

const COMPACT = `
.hd .stp,.hd .pj,.hd .gi{display:none}
.s{display:none}
.qa .s{display:block;white-space:nowrap;text-overflow:ellipsis}
.ic.pn{display:inline-flex}`;

const WIDE = `
.mt{display:none}
.hp{display:inline-block}
.hd>.tm{display:block;flex:none;width:56px}
.s{-webkit-line-clamp:3}`;

const XWIDE = `
.rh{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);column-gap:8px}
.rh>*{grid-column:1/-1}
.rh>.hd{grid-column:1;grid-row:1}
.rh>.s{grid-column:2;grid-row:1;align-self:center;padding:0 10px 0 0}`;

/** One tier rule set as a container query on the results region, plus a media-query fallback. */
function tier(cond: string, css: string): string {
  return `@container res ${cond}{${css}}\n@supports not (container-type:inline-size){@media ${cond}{${css}}}\n`;
}

const BASE = String.raw`
html{height:100%;overflow:hidden}
body{box-sizing:border-box;height:100%;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto}
#hdr{flex:none;min-width:0}
#res{flex:1 1 auto;min-height:80px;overflow-x:hidden;overflow-y:auto;container-type:inline-size;container-name:res;overflow-wrap:anywhere}
.sel label:not(.al){min-width:0;max-width:100%}
.sel select{flex:1 1 0;width:0;min-width:0;max-width:100%;text-overflow:ellipsis}
.sel .ls{order:2;flex:1 1 84px}
.sfw{order:3}
.exw{order:4}
.sel .al{order:6}
@media (min-width:521px){.sfw{order:8}.exw{order:9}}
.sel .lb{flex:none}
.sfw,.exw{flex:none}
#sfm,#exm{min-width:min(170px,calc(100vw - 16px));max-width:calc(100vw - 16px)}
.sl,.gh{min-width:0}
.sl>span:not(.pill),.gh>span:not(.pill){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill,.sub{white-space:nowrap}
.r,.rh,.hd,.ex,.mm,.gr,.s,.mt{min-width:0}
.mt{padding:0 8px 2px 24px;font-size:0.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--vscode-descriptionForeground)}
.mt .ms,.hp{display:none}
.hp{flex:none;padding:0 6px;border-radius:9px;font-size:11px;line-height:16px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.rh>.chips{display:flex;flex-wrap:wrap;max-width:none;overflow:visible;padding:0 8px 3px 24px}
.rh>.chips:empty{display:none}
.chip{max-width:100%;min-width:0;white-space:normal;overflow-wrap:anywhere}
.s{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.fi{overflow-wrap:anywhere}
.gp{min-width:0}
@media (max-width:259px){
.sel .lb{display:none}
.sel label:not(.al){flex-basis:100%}
.sfw,.exw{position:static}
.sel{position:relative}
#sfm,#exm{left:0;right:0;min-width:0}
}
@media (max-width:199px){
.opts{right:1px}
.opts .opt{width:16px}
input[type=text]{padding-right:72px}
}
`;

const MEDIUM_FIX = `
.mt .ml{display:inline}`;

export const LAYOUT_CSS = BASE + tier(T.compact, COMPACT + '\n.mt .ml{display:none}\n.mt .ms{display:inline}')
  + tier(T.medium, MEDIUM_FIX) + tier(T.wide, WIDE) + tier(T.xwide, XWIDE);

/** Webview script: relative time text, meta line, hit pill and the active-query body flag. */
export const LAYOUT_JS = String.raw`
function agoLong(ms,now){const m=Math.floor(Math.max(0,now-ms)/60000);
if(m<1)return 'just now';
const u=m<60?[m,'minute']:m<1440?[Math.floor(m/60),'hour']:m<43200?[Math.floor(m/1440),'day']:m<525600?[Math.floor(m/43200),'month']:[Math.floor(m/525600),'year'];
return u[0]+' '+u[1]+(u[0]===1?'':'s')+' ago';}
function hitN(r){return r.hits>9999?nf(9999)+'+':nf(r.hits);}
function hitTxt(r){return r.hits?hitN(r)+(r.hits===1?' hit':' hits'):'';}
function msgTxt(r){return r.msgs?r.msgs+(r.msgs===1?' message':' messages'):'';}
function metaHtml(r,now){const h=hitTxt(r)||msgTxt(r);
return '<div class="mt" title="'+esc(full(r.last))+'">'+(h?'<span>'+h+'</span> · ':'')+'<span class="ml">'+agoLong(r.last,now)+'</span><span class="ms">'+shortAgo(r.last,now)+'</span></div>';}
function hitPill(r){return r.hits?'<span class="hp" title="'+esc(hitTxt(r))+'">'+hitN(r)+'</span>':'';}
function qSync(){document.body.classList.toggle('qa',!!q.value.trim());}
q.addEventListener('input',qSync);window.addEventListener('message',qSync);qSync();
`;
