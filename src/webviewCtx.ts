/** Webview: the context ring and pill on the pill line, its tooltip, and the Context sort key. Shares top-level scope with webviewJs. */
export const CTX_CSS = String.raw`
.cp{flex:none;box-sizing:border-box;padding:0 6px;border-radius:9px;line-height:14px;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent)}
.cp.l1{--c:var(--vscode-charts-yellow,#cca700)}
.cp.l2{--c:var(--vscode-charts-orange,#d18616)}
/* Ring slot: 16px square, same on every row. Ring r=6 with a 2.5 stroke leaves a ~9.5px hole, so the 6px dot sits clear of the stroke. */
.rs{position:relative;display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px}
.rs .dot{position:absolute;inset:0;margin:auto;width:6px;height:6px}
.rg{display:inline-flex;flex:none;color:var(--vscode-descriptionForeground)}
.rg svg{width:16px;height:16px;display:block}
.rg .rt{stroke:currentColor;opacity:.3}
.rg .rf{stroke:var(--vscode-charts-blue,#3794ff)}
.rg.rw .rf{stroke:var(--vscode-editorWarning-foreground,#cca700)}
.rg.re .rf{stroke:var(--vscode-editorError-foreground,#f14c4c)}
/* Live dot states tint the ring segment with the dot's color. Selector has one more class than .rg.rw/.re so the live color wins over warn/error; idle keeps blue/warn/error. */
.rs.running .rg .rf{stroke:var(--k-running)}
.rs.waiting .rg .rf{stroke:var(--k-waiting)}
.rs.unread .rg .rf{stroke:var(--k-unread)}
.rs.background .rg .rf{stroke:var(--k-background)}
.cp.l3{--c:var(--vscode-charts-red,#f14c4c);font-weight:600}
`;

export const CTX_JS = String.raw`
let ringMax=300000;
function ringTok(n){return n>=1e6?(+(n/1e6).toFixed(1))+'M':n>=1000?(+(n/1000).toFixed(1))+'k':String(n);}
function ringHtml(r){const t=r.ctx?r.ctx.tokens:0;if(!(t>0)||!(ringMax>0))return '';
const f=t/ringMax,cl=f>=1?' re':f>=0.8?' rw':'',tip=ringTok(t)+' of '+ringTok(ringMax)+' tokens',C=37.7,d=(Math.min(f,1)*C).toFixed(1);
return '<span class="rg'+cl+'" role="img" aria-label="'+tip+'" data-tip="'+tip+(r.tok?esc('\nTotal used so far (not reset by /compact): '+tokTotalText(r.tok)):'')+'"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke-width="2.5"><circle class="rt" cx="8" cy="8" r="6"/><circle class="rf" cx="8" cy="8" r="6" transform="rotate(-90 8 8)" stroke-dasharray="'+d+' '+C+'"/></svg></span>';}
/* The fixed-width slot at the right end of every row header: ring (when the chat has context data) with the status dot centered in its hole. The slot always renders, empty or dot-only, so the column stays aligned. The slot copies the dot's state classes (state, m2/m3, c1-..) so CSS can color the ring segment exactly like the dot; the replace turns the dot's 'dot' class into 'rs'. */
function slotHtml(r){const dc=decorated(r),a=dc?dotAttrs(dots[r.id]||{s:'idle'}).replace('class="dot ','class="rs '):'class="rs"';
return '<span '+a+'>'+ringHtml(r)+(dc?dotHtml(r.id):'')+'</span>';}
function ctxKey(r){return r.ctx?r.ctx.pct*1e9+r.ctx.tokens:-1;}
function tipCtx(r){const c=r.ctx;if(!c)return '';
return '<b>Context '+c.pct+'% full</b>'+kv([['Used',tokText(c.tokens)+' of '+tokText(c.window)+' tokens'],['Model',esc(c.model)],['Compactions',c.comp>0?c.comp:'']])
+(c.pend?'<p class="nt">Lags one turn: the latest reply is not counted yet.</p>':'')+(c.approx?'<p class="nt">approximate: model window inferred</p>':'');}
function ctxPill(r){const c=r.ctx,l=c?ctxLevel(c.pct):0;if(!l)return '';
return '<span class="cp l'+l+'" role="img" aria-label="Context '+c.pct+' percent full" data-tip="k:ctx">'+c.pct+'% full</span>';}
`;
