/** Webview: the context ring and pill on the pill line, its tooltip, and the Context sort key. Shares top-level scope with webviewJs. */
export const CTX_CSS = String.raw`
.cp{flex:none;box-sizing:border-box;padding:0 6px;border-radius:9px;line-height:14px;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent)}
.cp.l1{--c:var(--vscode-charts-yellow,#cca700)}
.cp.l2{--c:var(--vscode-charts-orange,#d18616)}
/* Ring slot: a --rs square (16px, set once on :root in webviewCss), same on every row. Ring r=6 of a 16-unit viewBox with a 2.5 stroke leaves a ~9.5px hole at 16px, so the 6px dot sits clear of the stroke. */
.rs{position:relative;display:inline-flex;flex:none;align-items:center;justify-content:center;width:var(--rs);height:var(--rs)}
.rs .dot{position:absolute;inset:0;margin:auto;width:6px;height:6px}
.rg{display:inline-flex;flex:none;color:var(--vscode-descriptionForeground)}
/* the ring fills the slot: same --rs size, so the dot stays centered in its hole if the slot size changes */
.rg svg{width:var(--rs);height:var(--rs);display:block}
.rg .rt{stroke:currentColor;opacity:.3}
/* --rc: the fill color of a context meter. One set of steps (normal, warning from 80%, error from 100%) shared by the row ring and the popover bar, so both always agree. */
.rg,.cxb{--rc:var(--vscode-charts-blue,#3794ff)}
.rg.rw,.cxb.rw{--rc:var(--vscode-editorWarning-foreground,#cca700)}
.rg.re,.cxb.re{--rc:var(--vscode-editorError-foreground,#f14c4c)}
.rg .rf{stroke:var(--rc)}
/* Live dot states tint the ring segment with the dot's color. Selector has one more class than .rg.rw/.re so the live color wins over warn/error; idle keeps blue/warn/error. */
.rs.running .rg .rf{stroke:var(--k-running)}
.rs.waiting .rg .rf{stroke:var(--k-waiting)}
.rs.unread .rg .rf{stroke:var(--k-unread)}
.rs.background .rg .rf{stroke:var(--k-background)}
.cp.l3{--c:var(--vscode-charts-red,#f14c4c);font-weight:600}
/* A slot with context data is a button that opens the context popover: pointer cursor, a round hover wash behind the ring, and the theme focus ring for keyboard users. */
.rs[data-a=ctx]{cursor:pointer;border-radius:50%}
.rs[data-a=ctx]:hover{background:var(--vscode-toolbar-hoverBackground)}
.rs[data-a=ctx]:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
/* Context popover: the shared .pop box (webviewPop) with a fixed width instead of max-content so the bar has room, capped by the panel width. */
#ctxp{width:min(260px,calc(100vw - 16px));min-width:0;padding:6px 8px 8px}
/* Token bar: track in the muted foreground, fill in --rc (same steps as the ring). The fill width is an svg attribute, not an inline style, because the CSP is nonce-only. */
.cxb{color:var(--vscode-descriptionForeground)}
.cxb svg{display:block;width:100%;height:6px;margin:5px 0 2px;border-radius:3px}
.cxb .rt{fill:currentColor;opacity:.3}
.cxb .rf{fill:var(--rc)}
/* Popover actions sit at the bottom right, like a dialog. */
.cxa{display:flex;justify-content:flex-end;margin-top:8px}
`;

export const CTX_JS = String.raw`
let ringMax=300000;
/* ctxId: the chat whose context popover is open ('' when closed). slotHtml reads it so a re-rendered slot keeps aria-expanded right. */
let ctxId='';
/* The color step of a context meter for fraction f of the ring limit: one source for the ring and the popover bar. */
function ringCls(f){return f>=1?' re':f>=0.8?' rw':'';}
function ringTok(n){return n>=1e6?(+(n/1e6).toFixed(1))+'M':n>=1000?(+(n/1000).toFixed(1))+'k':String(n);}
function ringHtml(r){const t=r.ctx?r.ctx.tokens:0;if(!(t>0)||!(ringMax>0))return '';
const f=t/ringMax,cl=ringCls(f),tip=ringTok(t)+' of '+ringTok(ringMax)+' tokens',C=37.7,d=(Math.min(f,1)*C).toFixed(1);
return '<span class="rg'+cl+'" role="img" aria-label="'+tip+'" data-tip="'+tip+(r.tok?esc('\nTotal used so far (not reset by /compact): '+tokTotalText(r.tok)):'')+'"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke-width="2.5"><circle class="rt" cx="8" cy="8" r="6"/><circle class="rf" cx="8" cy="8" r="6" transform="rotate(-90 8 8)" stroke-dasharray="'+d+' '+C+'"/></svg></span>';}
/* The fixed-width slot at the right end of every row header: ring (when the chat has context data) with the status dot centered in its hole. The slot always renders, empty or dot-only, so the column stays aligned. The slot copies the dot's state classes (state, m2/m3, c1-..) so CSS can color the ring segment exactly like the dot; the replace turns the dot's 'dot' class into 'rs'. */
/* A slot that shows a ring (the chat has context data) is also a keyboard-reachable button (role, tabindex, data-a="ctx") that opens the context popover; the shared click handler stops data-a clicks from opening the row. A slot without a ring stays inert: there is nothing to show. */
function slotHtml(r){const dc=decorated(r),a=dc?dotAttrs(dots[r.id]||{s:'idle'}).replace('class="dot ','class="rs '):'class="rs"',rg=ringHtml(r);
const b=rg?' role="button" tabindex="0" data-a="ctx" aria-haspopup="dialog" aria-expanded="'+(ctxId===r.id)+'" aria-label="'+esc('Context '+(r.ctx.pct!=null?r.ctx.pct+'% full':ringTok(r.ctx.tokens)+' tokens')+': show details')+'"':'';
return '<span '+a+b+'>'+rg+(dc?dotHtml(r.id):'')+'</span>';}
/* Horizontal token bar for the popover: tokens used of the ring limit, filled and colored with the same steps as the ring (ringCls), plus the same "136.8k of 300k tokens" text. */
function ctxBar(t){const f=t/ringMax,w=(Math.min(f,1)*100).toFixed(1),lab=ringTok(t)+' of '+ringTok(ringMax)+' tokens';
return '<div class="cxb'+ringCls(f)+'" role="img" aria-label="'+lab+'"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="rt" width="100" height="6"/><rect class="rf" width="'+w+'" height="6"/></svg></div><p class="tsm">'+lab+' (ring limit)</p>';}
/* Popover body: the Context tooltip (tipCtx, the single source of the details) with the bar placed under its heading, then a Resume button. Resume is the one existing safe action on a chat; the extension has no way to run /compact in a session, so none is offered. Empty when the chat has no context data. */
function ctxPopHtml(r){const h=r&&r.ctx&&r.ctx.tokens>0?tipCtx(r):'';if(!h)return '';const i=h.indexOf('</b>')+4;
return h.slice(0,i)+ctxBar(r.ctx.tokens)+h.slice(i)+'<div class="cxa"><button class="xb pri" data-a="resume" aria-label="Resume session">'+XI.play+'<span>Resume</span></button></div>';}
function ctxKey(r){return r.ctx?r.ctx.pct*1e9+r.ctx.tokens:-1;}
function tipCtx(r){const c=r.ctx;if(!c)return '';
return '<b>Context '+c.pct+'% full</b>'+kv([['Used',tokText(c.tokens)+' of '+tokText(c.window)+' tokens'],['Model',esc(c.model)],['Compactions',c.comp>0?c.comp:'']])
+(c.pend?'<p class="nt">Lags one turn: the latest reply is not counted yet.</p>':'')+(c.approx?'<p class="nt">approximate: model window inferred</p>':'');}
function ctxPill(r){const c=r.ctx,l=c?ctxLevel(c.pct):0;if(!l)return '';
return '<span class="cp l'+l+'" role="img" aria-label="Context '+c.pct+' percent full" data-tip="k:ctx">'+c.pct+'% full</span>';}
`;

/**
 * Webview script: opening, placing and closing the context popover. Kept apart from CTX_JS because it wires page listeners at load,
 * while CTX_JS must stay pure so check_ring can evaluate its functions without a DOM. Needs POP_JS (makePop) and the CORE helpers ($, resOf, openId).
 */
export const CTX_POP_JS = String.raw`
const ctxEl=$('ctxp'),ctxPop=makePop([]); /* makePop with no pairs: only its place() is used, so the popover sits under its slot exactly like the page menus */
let ctxHtml='';
/* The slot the popover hangs from: rows re-render often, so it is looked up again by chat id instead of kept as a node. */
function ctxAnchor(){return ctxId?Array.from(document.querySelectorAll('[data-a=ctx]')).find(x=>{const r=x.closest('.r');return !!r&&r.dataset.id===ctxId;})||null:null;}
/* Click (or Enter/Space) on a slot: a second activation of the same slot closes the popover; otherwise it shows that chat and moves focus to its first button so the keyboard can act on it. */
function ctxOpen(id,anchor){if(ctxId===id){ctxClose(true);return;}
const r=resOf(id),h=ctxPopHtml(r);if(!h)return; /* no context data (stale slot): nothing to show */
if(ctxId)ctxClose(false);
ctxId=id;ctxHtml=h;ctxEl.innerHTML=h;ctxEl.hidden=false;tipHide();anchor.setAttribute('aria-expanded','true');ctxPop.place(anchor,ctxEl);
const b=ctxEl.querySelector('button');if(b)b.focus();}
/* Close; back=true returns focus to the slot (Escape, second click), so keyboard users land where they started. ctxId is cleared first so the focus move does not count as focus leaving. */
function ctxClose(back){if(!ctxId)return;const a=ctxAnchor();ctxId='';ctxHtml='';ctxEl.hidden=true;ctxEl.innerHTML='';
if(a){a.setAttribute('aria-expanded','false');if(back)a.focus();}}
/* Called after every render: refresh the content only when the chat's numbers changed (so focus inside is not lost) and re-place it under the new slot; close when the row or its context data is gone. */
function ctxSync(){if(!ctxId)return;const a=ctxAnchor(),h=ctxPopHtml(resOf(ctxId));if(!a||!h){ctxClose(false);return;}
if(h!==ctxHtml){ctxHtml=h;ctxEl.innerHTML=h;}ctxPop.place(a,ctxEl);}
/* Popover buttons: Resume opens the chat, as the card's Resume does. The popover sits outside the results list, so it needs its own click handler. */
ctxEl.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b||!ctxId)return;const id=ctxId;
if(b.dataset.a==='resume'){ctxClose(false);openId(id);}});
/* A press outside the popover and outside any ring slot closes it; presses on a slot are left to its click, which toggles or switches chats. */
document.addEventListener('pointerdown',e=>{if(ctxId&&!e.target.closest('#ctxp')&&!e.target.closest('[data-a=ctx]'))ctxClose(false);},true);
/* Escape closes the popover before any other Escape handler (capture phase) and stops there, so it does not also collapse a card or clear the search. */
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ctxId){e.preventDefault();e.stopPropagation();ctxClose(true);}},true);
/* Focus moving anywhere except into the popover or back to its slot closes it (Tab past the last button, a click elsewhere). */
document.addEventListener('focusin',e=>{if(ctxId&&!e.target.closest('#ctxp')&&e.target!==ctxAnchor())ctxClose(false);});
/* Scrolling the list moves the slot away from the fixed popover, so close it, as the page menus do; scrolling inside the popover is allowed. */
document.addEventListener('scroll',e=>{if(ctxId&&!(e.target&&e.target.closest&&e.target.closest('#ctxp')))ctxClose(false);},true);
/* A resize can move the slot: keep the popover under it. */
window.addEventListener('resize',()=>{const a=ctxAnchor();if(a)ctxPop.place(a,ctxEl);});
`;
