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
#tip b{display:block;font-weight:600}
#tip p{margin:3px 0 0}
#tip .tsm,#tip .nt,#tip dt{color:var(--vscode-descriptionForeground)}
#tip .nt{font-style:italic}
#tip .q{padding-top:3px;border-top:1px solid var(--vscode-editorHoverWidget-border)}
#tip dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:3px 0 0}
#tip dd{margin:0;min-width:0}
`;

/** makePop(pairs): pairs are [buttonId, menuId]; one menu open at a time; Escape, outside click, focus leaving and scroll close it. Returns {close, place, toggle}. */
export const POP_JS = String.raw`
function makePop(pairs){
const el=id=>document.getElementById(id);
const openPair=()=>pairs.find(p=>{const m=el(p[1]);return m&&!m.hidden;});
function close(except){pairs.forEach(p=>{if(p[1]===except)return;const m=el(p[1]),b=el(p[0]);if(m)m.hidden=true;if(b)b.setAttribute('aria-expanded','false');});}
function place(b,m){const r=b.getBoundingClientRect(),vw=document.documentElement.clientWidth||window.innerWidth||300,vh=window.innerHeight||600,M=8,top=r.bottom+2;
m.style.top=top+'px';m.style.maxHeight=Math.max(80,vh-top-M)+'px';
const w=Math.min(m.offsetWidth||0,vw-2*M);m.style.left=Math.max(M,Math.min(r.right-w,vw-M-w))+'px';}
function toggle(bid,mid){const m=el(mid),open=m.hidden;close(open?mid:'');m.hidden=!open;el(bid).setAttribute('aria-expanded',open?'true':'false');if(open)place(el(bid),m);}
window.addEventListener('resize',()=>{const o=openPair();if(o)place(el(o[0]),el(o[1]));});
document.addEventListener('scroll',e=>{if(!(e.target&&e.target.closest&&e.target.closest('.pop')))close('');},true);
document.addEventListener('click',e=>{if(!e.target.closest('.pw'))close('');});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const o=openPair();if(o){e.stopPropagation();close('');el(o[0]).focus();}});
document.addEventListener('focusin',e=>{if(e.target.closest&&!e.target.closest('.pw'))close('');});
return{close:close,place:place,toggle:toggle};}
`;

/**
 * makeTip(cfg): cfg.html(el) returns the tooltip html of an element with data-tip (empty string shows nothing);
 * cfg.bounds() returns {left,right,width} of the area the tip must stay inside; cfg.focusTarget(t) optionally maps a focused element to the one carrying data-tip.
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
tipEl.style.left=Math.round(x)+'px';tipEl.style.top=Math.round(y)+'px';}
function show(el){const h=cfg.html(el);if(!h)return;
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
