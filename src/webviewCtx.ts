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
/* The popover itself takes focus (tabindex=-1) when it has no button (the empty-data message), so keyboard users still land inside the dialog; show the theme focus ring only for keyboard focus. */
#ctxp:focus{outline:none}
#ctxp:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
/* Token bar: track in the muted foreground, fill in --rc (same steps as the ring). The fill width is an svg attribute, not an inline style, because the CSP is nonce-only. */
.cxb{color:var(--vscode-descriptionForeground)}
.cxb svg{display:block;width:100%;height:6px;margin:5px 0 2px;border-radius:3px}
.cxb .rt{fill:currentColor;opacity:.3}
.cxb .rf{fill:var(--rc)}
/* High-contrast themes: the 30%-opacity track and the hover wash (often transparent in HC) disappear against the HC background, and a track and fill in similar colors read as one ring. The track turns fully opaque but thin in the HC border color, so the thicker fill segment is told apart by width, not by color alone; the token bar's track is replaced by an outlined box; the popover and the slot use the HC border tokens, which every HC theme defines. */
body.vscode-high-contrast .rg .rt,body.vscode-high-contrast-light .rg .rt{stroke:var(--vscode-contrastBorder,currentColor);opacity:1;stroke-width:1}
body.vscode-high-contrast .cxb .rt,body.vscode-high-contrast-light .cxb .rt{opacity:0}
body.vscode-high-contrast .cxb svg,body.vscode-high-contrast-light .cxb svg{outline:1px solid var(--vscode-contrastBorder,currentColor);outline-offset:0;border-radius:0}
body.vscode-high-contrast #ctxp,body.vscode-high-contrast-light #ctxp{border-color:var(--vscode-contrastBorder,var(--vscode-focusBorder))}
body.vscode-high-contrast .rs[data-a=ctx]:hover,body.vscode-high-contrast-light .rs[data-a=ctx]:hover{outline:1px dashed var(--vscode-contrastActiveBorder,var(--vscode-focusBorder));outline-offset:1px}
body.vscode-high-contrast .rs[data-a=ctx]:focus-visible,body.vscode-high-contrast-light .rs[data-a=ctx]:focus-visible{outline:1px solid var(--vscode-contrastActiveBorder,var(--vscode-focusBorder))}
/* Forced colors (OS high contrast outside VS Code's own HC themes): theme variables are overridden by the system palette, so system colors keep the track, fill, bar outline and popover border visible. The fill uses !important because the live-state tints (.rs.running .rg .rf, 4 classes) would otherwise outrank it with a theme color the system palette ignores. */
@media (forced-colors:active){.rg .rt{stroke:CanvasText;opacity:1;stroke-width:1}.rg .rf{stroke:Highlight!important}.cxb .rt{opacity:0}.cxb .rf{fill:Highlight}.cxb svg{outline:1px solid CanvasText}#ctxp{border:1px solid CanvasText}.rs[data-a=ctx]:focus-visible{outline:1px solid Highlight}}
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
/* Accessibility: a button's children are presentational, so the ring's and dot's own role=img names would be dropped or announced as nested images inside the button. When the slot is a button, its name carries both the status (the dot's words) and the context percent, and the ring and dot are hidden from assistive tech (aria-hidden replaces their role=img name; data-tip stays for mouse users). An inert slot (no ring) keeps the dot's role=img name untouched. */
function slotAh(h){return h.replace(/ role="img" aria-label="[^"]*"/,' aria-hidden="true"');}
function slotHtml(r){const dc=decorated(r),d=dots[r.id]||{s:'idle'},a=dc?dotAttrs(d).replace('class="dot ','class="rs '):'class="rs"',rg=ringHtml(r),dh=dc?dotHtml(r.id):'';
if(!rg)return '<span '+a+'>'+dh+'</span>';
/* the status words lead only when the row shows a dot; an undecorated row has no status to announce */
const nm=(dc?dotText(d)+'. ':'')+'Context '+(r.ctx.pct!=null?r.ctx.pct+'% full':ringTok(r.ctx.tokens)+' tokens')+': show details';
return '<span '+a+' role="button" tabindex="0" data-a="ctx" aria-haspopup="dialog" aria-expanded="'+(ctxId===r.id)+'" aria-label="'+esc(nm)+'">'+slotAh(rg)+slotAh(dh)+'</span>';}
/* Horizontal token bar for the popover: tokens used of the ring limit, filled and colored with the same steps as the ring (ringCls), plus the same "136.8k of 300k tokens" text. */
function ctxBar(t){const f=t/ringMax,w=(Math.min(f,1)*100).toFixed(1),lab=ringTok(t)+' of '+ringTok(ringMax)+' tokens';
return '<div class="cxb'+ringCls(f)+'" role="img" aria-label="'+lab+'"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="rt" width="100" height="6"/><rect class="rf" width="'+w+'" height="6"/></svg></div><p class="tsm">'+lab+' (ring limit)</p>';}
/* Popover details: the Context tooltip (tipCtx, the single source of the details) with the bar placed under its heading. Empty when the chat has no context data. Split from the actions so a live update can rewrite only this part. */
/* The heading gets id="ctxh" here (not in tipCtx, which the tooltip also renders) so the dialog's aria-labelledby names it without a duplicate id in the tooltip. */
function ctxDetails(r){const h=r&&r.ctx&&r.ctx.tokens>0?tipCtx(r):'';if(!h)return '';const i=h.indexOf('</b>')+4;
return h.slice(0,i).replace('<b>','<b id="ctxh">')+ctxBar(r.ctx.tokens)+h.slice(i);}
/* Shown when a slot is activated for a chat with no context data (stale slot): a visible outcome instead of a silent no-op. */
/* id="ctxh": the message is the dialog's name too, so aria-labelledby never points at a missing element. */
const CTX_EMPTY='<p class="nt" id="ctxh">No context data for this chat.</p>';
/* Popover body: a details container (.cxd, rewritten in place on live updates) and a static action row (.cxa, written once so a focused Resume button is never destroyed by an update). Resume is the one existing safe action on a chat; the extension has no way to run /compact in a session, so none is offered. Empty when the chat has no context data. */
function ctxPopHtml(r){const d=ctxDetails(r);if(!d)return '';
return '<div class="cxd">'+d+'</div><div class="cxa"><button class="xb pri" data-a="resume" aria-label="Resume session">'+XI.play+'<span>Resume</span></button></div>';}
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
const ctxEl=$('ctxp'),ctxPop=makePop([]); /* makePop with no pairs: only its place() is used; the popover passes flip=true so it opens above a slot near the bottom edge */
let ctxHtml=''; /* the details html currently shown ('' when the empty message shows): compared so only a real change rewrites .cxd */
/* The slot the popover hangs from: rows re-render often, so it is looked up again by chat id instead of kept as a node. */
function ctxSlot(id){return id?Array.from(document.querySelectorAll('[data-a=ctx]')).find(x=>{const r=x.closest('.r');return !!r&&r.dataset.id===id;})||null:null;}
function ctxAnchor(){return ctxSlot(ctxId);}
/* True while the slot is inside the viewport and the results area; the popover follows it then and closes only once the slot scrolled out of view. Takes no node from the caller: the slot is resolved by chat id on every call, because a re-render can replace it and a stale node keeps returning its last (or an all-zero) rectangle. A node a render detached (isConnected false) counts as gone; stubs without isConnected are treated as attached. */
function ctxVisible(){const a=ctxAnchor();if(!a||a.isConnected===false)return false;const r=a.getBoundingClientRect(),b=res.getBoundingClientRect();return r.bottom>Math.max(0,b.top)&&r.top<Math.min(window.innerHeight,b.bottom);}
/* One follow step for every event that can move the slot (scroll, window resize, results-area resize): re-place under the slot while it is visible, otherwise close. Bug fixed: resize used to re-place under whatever slot it found, even one out of view, and never closed when the row was gone. */
function ctxFollow(){if(!ctxId)return;if(ctxVisible())ctxPop.place(ctxAnchor(),ctxEl,true);else ctxClose(false);}
/* Click (or Enter/Space) on a slot: a second activation of the same slot closes the popover; otherwise it shows that chat and moves focus into the dialog (its first button, or the dialog itself when the empty-data message has no button) so the keyboard can act on it. A chat without context data (stale slot) still opens the popover with a short message, so the tap always has a visible outcome. */
function ctxOpen(id,anchor){if(ctxId===id){ctxClose(true);return;}
const r=resOf(id),h=ctxPopHtml(r);
if(ctxId)ctxClose(false);
ctxRefocus=''; /* a new open supersedes any pending focus return */
ctxId=id;ctxHtml=h?ctxDetails(r):'';ctxEl.innerHTML=h||CTX_EMPTY;ctxEl.hidden=false;tipHide();anchor.setAttribute('aria-expanded','true');ctxPop.place(anchor,ctxEl,true);
const b=ctxEl.querySelector('button');(b||ctxEl).focus();}
/* Close; back=true returns focus to the slot (Escape, second click), so keyboard users land where they started. ctxId is cleared first so the focus move does not count as focus leaving. The id is remembered in ctxRefocus because the slot may be replaced by the next render (pinned section or main list alike, since ctxSlot searches the whole document); ctxSync focuses the new slot then. ctxRefocus is set after a.focus() so that focus's own focusin does not clear it. */
let ctxRefocus='';
function ctxClose(back){if(!ctxId)return;const a=ctxAnchor(),id=ctxId;ctxId='';ctxHtml='';ctxEl.hidden=true;ctxEl.innerHTML='';
if(a){a.setAttribute('aria-expanded','false');if(back){a.focus();ctxRefocus=id;}}}
/* True when no element holds focus any more: the browser falls back to body (or null) after the focused node was removed by a render. Only then may ctxSync move focus. */
function ctxFocusLost(){const f=document.activeElement;return !f||f===document.body||f.isConnected===false;}
/* Called after every render: first restores focus to a slot whose popover was just closed with focus return, but only if that render dropped focus (bug fixed: the pending id was honored on whatever render came next, so focus could be stolen from wherever the user had moved to); the id is cleared either way, also when the row is gone, so it can never fire later. Then rewrites only the details container when the chat's numbers changed (the Resume button is a static sibling, so it keeps its node and focus), keeps aria-expanded on the new slot, re-places the popover under it, and closes when the row is gone or out of view. */
function ctxSync(){if(ctxRefocus){const s=ctxId?null:ctxSlot(ctxRefocus);ctxRefocus='';if(s&&document.activeElement!==s&&ctxFocusLost())s.focus();}
if(!ctxId)return;const a=ctxAnchor();if(!a){ctxClose(false);return;}
const r=resOf(ctxId),d=ctxDetails(r),box=ctxEl.querySelector('.cxd');
if(d){if(!box){ctxEl.innerHTML=ctxPopHtml(r);}else if(d!==ctxHtml){box.innerHTML=d;}ctxHtml=d;} /* data returned after the empty message: build the full body once */
else if(ctxHtml!==''){ctxHtml='';ctxEl.innerHTML=CTX_EMPTY;} /* data vanished: say so instead of leaving stale numbers */
a.setAttribute('aria-expanded','true'); /* slotHtml already renders it from ctxId; set again so a slot built by another path cannot disagree */
ctxFollow();}
/* Popover buttons: Resume opens the chat, as the card's Resume does. The popover sits outside the results list, so it needs its own click handler. */
ctxEl.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b||!ctxId)return;const id=ctxId;
if(b.dataset.a==='resume'){ctxClose(false);openId(id);}});
/* A press outside the popover and outside any ring slot closes it; presses on a slot are left to its click, which toggles or switches chats. */
document.addEventListener('pointerdown',e=>{if(ctxId&&!e.target.closest('#ctxp')&&!e.target.closest('[data-a=ctx]'))ctxClose(false);},true);
/* Escape closes the popover before any other Escape handler (capture phase) and stops there, so it does not also collapse a card or clear the search. */
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ctxId){e.preventDefault();e.stopPropagation();ctxClose(true);}},true);
/* Focus moving anywhere except into the popover or back to its slot closes it (Tab past the last button, a click elsewhere). Any focus move also cancels a pending focus return: the user has chosen where focus goes. */
document.addEventListener('focusin',e=>{ctxRefocus='';if(ctxId&&!e.target.closest('#ctxp')&&e.target!==ctxAnchor())ctxClose(false);});
/* Bug fixed: closing on every scroll also fired for scrolls the user never made (scroll anchoring after a re-render). Now the popover follows its slot while the slot is still in view and closes only when it scrolled out; scrolling inside the popover is ignored. */
document.addEventListener('scroll',e=>{if(!ctxId||(e.target&&e.target.closest&&e.target.closest('#ctxp')))return;ctxFollow();},true);
/* A window resize (narrowing the sidebar) moves and narrows the slot's row: follow it, or close when it left the view. */
window.addEventListener('resize',ctxFollow);
/* The results area can change size without a window resize (a card expanding, the status line or a section appearing): a ResizeObserver on it follows too. Engines without ResizeObserver keep the window resize and scroll paths. */
if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(ctxId)ctxFollow();}).observe(res);
`;
