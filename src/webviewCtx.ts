/** Webview: the context pill on the pill line, its tooltip, and the Context sort key. Shares top-level scope with webviewJs. */
export const CTX_CSS = String.raw`
.cp{flex:none;box-sizing:border-box;padding:0 6px;border-radius:9px;font-size:11px;line-height:14px;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent)}
.cp.l1{--c:var(--vscode-charts-yellow,#cca700)}
.cp.l2{--c:var(--vscode-charts-orange,#d18616)}
.cp.l3{--c:var(--vscode-charts-red,#f14c4c);font-weight:600}
`;

export const CTX_JS = String.raw`
function ctxKey(r){return r.ctx?r.ctx.pct*1e9+r.ctx.tokens:-1;}
function tipCtx(r){const c=r.ctx;if(!c)return '';
return '<b>Context '+c.pct+'% full</b>'+kv([['Used',tokText(c.tokens)+' of '+tokText(c.window)+' tokens'],['Model',esc(c.model)],['Compactions',c.comp>0?c.comp:'']])
+(c.pend?'<p class="nt">Lags one turn: the latest reply is not counted yet.</p>':'')+(c.approx?'<p class="nt">approximate: model window inferred</p>':'');}
function ctxPill(r){const c=r.ctx,l=c?ctxLevel(c.pct):0;if(!l)return '';
return '<span class="cp l'+l+'" role="img" aria-label="Context '+c.pct+' percent full" data-tip="k:ctx">'+c.pct+'% full</span>';}
`;
