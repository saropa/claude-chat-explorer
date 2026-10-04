import { TIP_KINDS_JS } from './webviewTipKinds';

/** Webview CSS: the one shared tooltip popover. */
export const TIP_CSS = String.raw`
#tip{position:fixed;z-index:30;box-sizing:border-box;padding:5px 8px 6px;border-radius:4px;font-size:0.92em;line-height:1.4;pointer-events:none;background:var(--vscode-editorHoverWidget-background);color:var(--vscode-editorHoverWidget-foreground);border:1px solid var(--vscode-editorHoverWidget-border);box-shadow:0 2px 8px var(--vscode-widget-shadow);overflow-wrap:anywhere}
#tip[hidden]{display:none}
#tip b{display:block;font-weight:600}
#tip p{margin:3px 0 0}
#tip .tsm,#tip .nt,#tip dt{color:var(--vscode-descriptionForeground)}
#tip .nt{font-size:0.92em;font-style:italic}
#tip .q{padding-top:3px;border-top:1px solid var(--vscode-editorHoverWidget-border)}
#tip dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:3px 0 0}
#tip dd{margin:0;min-width:0}
`;

/** Webview script: one #tip element, delegated listeners, content built at show time (data-tip="k:kind" or plain text). */
const TIP_ENGINE = String.raw`
const tipEl=$('tip');
let tipFor=null,tipT=0,tipOff=0;
function tipPlace(el){const pr=res.getBoundingClientRect(),a=el.getBoundingClientRect(),M=4,G=6;
tipEl.style.maxWidth=Math.min(280,Math.floor(pr.width*0.9))+'px';tipEl.style.left='0px';tipEl.style.top='0px';
const w=tipEl.offsetWidth,h=tipEl.offsetHeight,vh=window.innerHeight;
let x=a.left+a.width/2-w/2;x=Math.max(pr.left+M,Math.min(x,pr.right-M-w));
let y=a.bottom+G;if(y+h>vh-M&&a.top-G-h>=M)y=a.top-G-h;
tipEl.style.left=Math.round(x)+'px';tipEl.style.top=Math.round(y)+'px';}
function tipShow(el){const k=el.dataset.tip,h=k.slice(0,2)==='k:'?tipKind(k.slice(2),el):tipStatic(k);if(!h)return;
tipFor=el;tipEl.innerHTML=h;tipEl.hidden=false;tipPlace(el);el.setAttribute('aria-describedby','tip');}
function tipHide(){clearTimeout(tipT);if(tipFor){tipOff=Date.now();tipFor.removeAttribute('aria-describedby');}tipFor=null;tipEl.hidden=true;}
function tipSync(){if(tipFor&&!tipFor.isConnected)tipHide();}
document.addEventListener('mouseover',e=>{const el=e.target.closest('[data-tip]');if(el===tipFor)return;tipHide();
if(el)tipT=setTimeout(()=>tipShow(el),Date.now()-tipOff<300?0:400);});
document.addEventListener('mouseout',e=>{const el=e.target.closest('[data-tip]');if(el&&!el.contains(e.relatedTarget))tipHide();});
document.addEventListener('focusin',e=>{const t=e.target,el=t.closest('[data-tip]')||(t.classList.contains('r')?t.querySelector('.t[data-tip]'):null);tipHide();if(el&&t.matches(':focus-visible'))tipShow(el);});
document.addEventListener('focusout',tipHide);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tipFor){e.stopPropagation();tipHide();}},true);
document.addEventListener('scroll',tipHide,true);
document.addEventListener('pointerdown',tipHide,true);
window.addEventListener('blur',tipHide);
`;

export const TIP_JS = TIP_KINDS_JS + TIP_ENGINE;
