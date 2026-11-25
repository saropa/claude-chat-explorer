/**
 * Standalone popover and tooltip module used by both pages (sidebar and Open Work).
 * Its scripts read no page element id or global at load: the page passes ids and callbacks to makePop and makeTip.
 */

/** Menu popover and the icon-button wrapper it hangs from. */
export const POP_CSS = String.raw`
.pw{position:relative;display:flex}
.pop{position:fixed;left:8px;top:0;z-index:20;width:max-content;min-width:min(170px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere;padding:4px 0;box-sizing:border-box;background:var(--vscode-menu-background);color:var(--vscode-menu-foreground);border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,transparent));box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
.pop[hidden]{display:none}
`;

/** The one tooltip box. */
export const TIP_CSS = String.raw`
#tip{position:fixed;z-index:30;box-sizing:border-box;padding:5px 8px 6px;border-radius:4px;pointer-events:none;background:var(--vscode-editorHoverWidget-background);color:var(--vscode-editorHoverWidget-foreground);border:1px solid var(--vscode-editorHoverWidget-border);box-shadow:0 2px 8px var(--vscode-widget-shadow);overflow-wrap:anywhere}
#tip[hidden]{display:none}
/* Content rules also apply to .tipc, a popover that shows tooltip content (the sidebar's context popover), so both read alike from one set of rules. */
#tip b,.tipc b{display:block;font-weight:600}
#tip p,.tipc p{margin:3px 0 0}
#tip .tsm,#tip .nt,#tip dt,.tipc .tsm,.tipc .nt,.tipc dt{color:var(--vscode-descriptionForeground)}
#tip .nt,.tipc .nt{font-style:italic}
#tip .q{padding-top:3px;border-top:1px solid var(--vscode-editorHoverWidget-border)}
#tip dl,.tipc dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:3px 0 0}
#tip dd,.tipc dd{margin:0;min-width:0}
`;

/** makePop(pairs): pairs are [buttonId, menuId]; one menu open at a time; Escape, outside click, focus leaving and scroll close it. Returns {close, place, toggle}. */
export const POP_JS = String.raw`
function makePop(pairs){
const el=id=>document.getElementById(id);
const openPair=()=>pairs.find(p=>{const m=el(p[1]);return m&&!m.hidden;});
function close(except){pairs.forEach(p=>{if(p[1]===except)return;const m=el(p[1]),b=el(p[0]);if(m)m.hidden=true;if(b)b.setAttribute('aria-expanded','false');});}
/* place(b,m,flip): opens m under b. flip=true (the context popover, which hangs from rows that can sit at the bottom edge) instead opens it above b when it does not fit below and there is more room above; header menus never pass it, so they keep opening downward. */
function place(b,m,flip){const r=b.getBoundingClientRect(),vw=document.documentElement.clientWidth||window.innerWidth||300,vh=window.innerHeight||600,M=8;let top=r.bottom+2,mh=Math.max(80,vh-top-M);
/* Width cap from the measured viewport (clientWidth, which excludes a scrollbar that 100vw in the CSS cap includes): in a narrow sidebar the box can never be wider than the viewport minus both margins. Set before measuring, so the flip height below is taken at the capped width. */
m.style.maxWidth=Math.max(0,vw-2*M)+'px';
if(flip){/* Bug fixed: place() always used top=r.bottom+2, so a popover opened from a bottom row was clipped by the viewport. The natural height is measured with the previous cap removed, then the box flips above the slot when below is too small and above is larger. */
m.style.maxHeight='';const h=m.offsetHeight||0,below=vh-top-M,above=r.top-2-M;
if(h>below&&above>below){top=Math.max(M,r.top-2-Math.min(h,above));mh=r.top-2-top;}}
m.style.top=top+'px';m.style.maxHeight=mh+'px';
/* Horizontal clamp: right-align with the anchor, then keep both edges inside the margins (left wins when even the capped box cannot fit). */
const w=Math.min(m.offsetWidth||0,vw-2*M);m.style.left=Math.max(M,Math.min(r.right-w,vw-M-w))+'px';}
function toggle(bid,mid){const m=el(mid),open=m.hidden;close(open?mid:'');m.hidden=!open;el(bid).setAttribute('aria-expanded',open?'true':'false');if(open)place(el(bid),m);}
window.addEventListener('resize',()=>{const o=openPair();if(o)place(el(o[0]),el(o[1]));});
document.addEventListener('scroll',e=>{if(!(e.target&&e.target.closest&&e.target.closest('.pop')))close('');},true);
document.addEventListener('click',e=>{if(!e.target.closest('.pw'))close('');});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const o=openPair();if(o){e.stopPropagation();e.popClosed=true;close('');el(o[0]).focus();}});
document.addEventListener('focusin',e=>{if(e.target.closest&&!e.target.closest('.pw'))close('');});
return{close:close,place:place,toggle:toggle,isOpen:()=>!!openPair()};}
`;

/**
 * makeTip(cfg): cfg.html(el) returns the tooltip html of an element with data-tip (empty string shows nothing);
 * cfg.bounds() returns {left,right,width} of the area the tip must stay inside; cfg.skip(el) optionally vetoes showing a tooltip for el; cfg.focusTarget(t) optionally maps a focused element to the one carrying data-tip.
 * cfg.above(el) optionally returns an element (such as a table row) the tip opens above instead of below el, falling back to below it at the top edge; without it the tip sits below el.
 * Needs a hidden element with id "tip" (or cfg.id). Returns {show, hide, sync}.
 */
export const TIP_ENGINE_JS = String.raw`
function tipPlain(t){const esc1=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const a=(t.length>600?t.slice(0,600)+'…':t).split('\n');return '<b>'+esc1(a[0])+'</b>'+a.slice(1).map(x=>'<p class="tsm">'+esc1(x)+'</p>').join('');}
function makeTip(cfg){
const tipEl=document.getElementById(cfg.id||'tip');
let tipFor=null,tipT=0,tipOff=0;
function place(el){const pr=cfg.bounds(),a=el.getBoundingClientRect(),M=4,G=6;
tipEl.style.maxWidth=Math.min(280,Math.floor(pr.width*0.9))+'px';tipEl.style.left='0px';tipEl.style.top='0px';
const w=tipEl.offsetWidth,h=tipEl.offsetHeight,vh=window.innerHeight;
let x=a.left+a.width/2-w/2;x=Math.max(pr.left+M,Math.min(x,pr.right-M-w));
let y=a.bottom+G;if(y+h>vh-M&&a.top-G-h>=M)y=a.top-G-h;
const up=cfg.above?cfg.above(el):null;
if(up){const u=up.getBoundingClientRect();y=u.top-G-h;if(y<M)y=Math.min(u.bottom+G,Math.max(M,vh-M-h));}
tipEl.style.left=Math.round(x)+'px';tipEl.style.top=Math.round(y)+'px';}
function show(el){if(cfg.skip&&cfg.skip(el))return; /* cfg.skip(el): the page vetoes a tooltip (e.g. over its own open popover); checked here so hover, focus and the delay timer all honor it */
const h=cfg.html(el);if(!h)return;
tipFor=el;tipEl.innerHTML=h;tipEl.hidden=false;place(el);el.setAttribute('aria-describedby',tipEl.id||'tip');}
function hide(){clearTimeout(tipT);if(tipFor){tipOff=Date.now();tipFor.removeAttribute('aria-describedby');}tipFor=null;tipEl.hidden=true;}
function sync(){if(tipFor&&!tipFor.isConnected)hide();}
document.addEventListener('mouseover',e=>{const el=e.target.closest('[data-tip]');if(el===tipFor)return;hide();
if(el)tipT=setTimeout(()=>show(el),Date.now()-tipOff<300?0:400);});
document.addEventListener('mouseout',e=>{const el=e.target.closest('[data-tip]');if(el&&!el.contains(e.relatedTarget))hide();});
document.addEventListener('focusin',e=>{const t=e.target,el=t.closest('[data-tip]')||(cfg.focusTarget?cfg.focusTarget(t):null);hide();if(el&&t.matches(':focus-visible'))show(el);});
document.addEventListener('focusout',hide);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tipFor)hide();},true);
document.addEventListener('scroll',hide,true);
document.addEventListener('pointerdown',hide,true);
window.addEventListener('blur',hide);
return{show:show,hide:hide,sync:sync};}
`;
