/** Open Work page styles. Fonts and colors come only from VS Code variables; no hex colors. */
export const OW_CSS = String.raw`
*{box-sizing:border-box}
html{height:100%}
body{margin:0;padding:8px 12px 12px;line-height:normal;font-weight:normal;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
button,select,input{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);font-weight:normal;line-height:normal}
h1{margin:0;font-size:calc(var(--vscode-font-size) + 5px);font-weight:600}
h2{margin:0;font-size:inherit;font-weight:600}
#wrap{--acts:260px;--gc:14px minmax(150px,3fr) minmax(90px,1.4fr) minmax(120px,1.8fr) 9ch 8ch 5ch 15ch 7ch;max-width:none;margin:0;--c-need:var(--vscode-charts-red,var(--vscode-errorForeground));--c-fin:var(--vscode-charts-blue,var(--vscode-textLink-foreground));--c-wait:var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground));--c-tidy:var(--vscode-charts-green,var(--vscode-testing-iconPassed));--c-acc:var(--vscode-focusBorder)}
.hr{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.hr .sp{flex:1 1 auto}
.ab,.chip,.gb{padding:2px 8px;cursor:pointer;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:1px solid var(--vscode-contrastBorder,transparent);border-radius:2px}
.gst{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;cursor:pointer;color:var(--vscode-foreground);background:transparent;border:1px solid var(--vscode-widget-border,transparent);border-radius:2px;--gc:var(--vscode-descriptionForeground)}
.gst:hover{background:var(--vscode-toolbar-hoverBackground,var(--vscode-button-secondaryHoverBackground))}
.gst:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.gd{width:8px;height:8px;border-radius:50%;background:var(--gc)}
.gst.g-ok{--gc:var(--vscode-testing-iconPassed,var(--vscode-charts-green))}
.gst.g-warn{--gc:var(--vscode-editorWarning-foreground,var(--vscode-charts-yellow))}
.gst.g-bad{--gc:var(--vscode-testing-iconFailed,var(--vscode-errorForeground))}
.gst.g-off .gd{opacity:.6}
.lk{cursor:pointer;text-decoration:underline dotted}.lk:hover{text-decoration:underline}
.ab:hover,.chip:hover,.gb:hover{background:var(--vscode-button-secondaryHoverBackground)}
.ab:focus-visible,.chip:focus-visible,.gb:focus-visible,.rb:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.chip[aria-pressed=true],.gb[aria-expanded=true]{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}
.chip[aria-pressed=false]{opacity:.6}
#cnt{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
.sub{margin:6px 0 0;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}
.sub[hidden]{display:none}
#ixs{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0 0;padding:4px 8px;color:var(--vscode-foreground);background:var(--vscode-inputValidation-infoBackground);border:1px solid var(--vscode-inputValidation-infoBorder,transparent)}
#ixs[hidden]{display:none}
.ixp{position:relative;flex:1 1 80px;height:2px;min-width:60px;overflow:hidden;background:var(--vscode-widget-border,transparent)}
.ixp i{position:absolute;top:0;bottom:0;width:30%;background:var(--vscode-progressBar-background);animation:slide 1.2s linear infinite}
@keyframes slide{0%{left:-30%}100%{left:100%}}
@media (prefers-reduced-motion:reduce){.ixp i{animation:none;width:100%}}
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#body{margin-top:6px}
.msg{margin:12px 0;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}
.msg.err{padding:4px 8px;color:var(--vscode-inputValidation-errorForeground,var(--vscode-foreground));background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder)}
.band{margin:0 0 6px}
.bh{position:relative;isolation:isolate;display:flex;align-items:center;gap:6px;padding:2px 8px;margin-bottom:0;border-left:3px solid var(--bac,var(--c-acc));border-bottom:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));color:var(--vscode-foreground)}
.bh::before,.st::before,.chip.bc::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;background:var(--tint,currentColor);opacity:.1}
.bh::before{--tint:var(--bac,var(--c-acc))}
.g-needs{--bac:var(--c-need)}.g-finish{--bac:var(--c-fin)}.g-waiting{--bac:var(--c-wait)}.g-tidy{--bac:var(--c-tidy)}.g-idle{--bac:var(--vscode-descriptionForeground)}
.pill{flex:none;min-width:18px;padding:0 6px;border-radius:9px;line-height:16px;text-align:center;font-weight:normal;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background)}
.row{border-bottom:1px solid var(--vscode-widget-border,transparent)}
.main{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.rb{flex:1 1 100%;min-width:0;display:grid;grid-template-columns:14px minmax(0,1fr);column-gap:8px;align-items:center;padding:2px 4px;text-align:start;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:2px}
.rb:hover,.row:hover>.main{background:var(--vscode-list-hoverBackground)}
.row:hover>.main .rb:hover{background:transparent}
.row{padding:0}
.row:hover{background:var(--vscode-list-hoverBackground)}
.rb[aria-expanded=true]{background:var(--vscode-list-inactiveSelectionBackground)}
.rb .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{grid-column:2;display:flex;flex-wrap:wrap;gap:2px 10px;color:var(--vscode-descriptionForeground)}
.dot{--dc:var(--vscode-descriptionForeground);width:8px;height:8px;border-radius:50%;background:var(--dc)}
.dot.idle{--dc:var(--vscode-saropaChatExplorer-dotIdle,var(--vscode-descriptionForeground));opacity:.6}
.dot.none{visibility:hidden}
.dot.running{--dc:var(--vscode-saropaChatExplorer-dotRunning,var(--vscode-testing-iconPassed))}
.dot.waiting{--dc:var(--vscode-saropaChatExplorer-dotWaiting,var(--vscode-focusBorder))}
.dot.unread{--dc:var(--vscode-saropaChatExplorer-dotUnread,var(--vscode-editorWarning-foreground))}
.st{color:var(--vscode-foreground)}
.cx.cg{color:var(--c-tidy)}
.cx.cy{color:var(--c-wait)}
.cx.cr{color:var(--c-need);font-weight:600}
.st{position:relative;isolation:isolate;display:inline-block;max-width:100%;padding:0 8px;border-radius:9px;line-height:18px;overflow:hidden;text-overflow:ellipsis;font-size:calc(var(--vscode-font-size) - 1px)}
.st::before{opacity:.18}
.st:empty{display:none}
.st.b-needs{color:var(--c-need)}
.st.b-finish{color:var(--c-fin)}
.st.b-waiting{color:var(--c-wait)}
.st.b-tidy{color:var(--c-tidy)}
.chip.bc{position:relative;isolation:isolate}
.chip.bc::after{--tint:var(--bcc);opacity:0}
.chip.bc::before{content:'';display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;background:var(--bcc)}
.chip.b-needs{--bcc:var(--c-need)}.chip.b-finish{--bcc:var(--c-fin)}.chip.b-waiting{--bcc:var(--c-wait)}.chip.b-tidy{--bcc:var(--c-tidy)}
.chip.bc[aria-pressed=true]{color:var(--vscode-foreground);background:transparent;border-color:var(--bcc)}
.chip.bc[aria-pressed=true]::after{opacity:.22}
.chip.bc[aria-pressed=false]::before{opacity:.6}
.prb{font-weight:600}
.prb.po{color:var(--c-tidy)}.prb.pm{color:var(--vscode-charts-purple,var(--c-fin))}.prb.pd{color:var(--vscode-descriptionForeground)}
.ib{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;color:var(--vscode-icon-foreground,var(--vscode-foreground));background:transparent;border-color:transparent}
.ib:hover{background:var(--vscode-toolbar-hoverBackground,var(--vscode-button-secondaryHoverBackground))}
.ic{display:block;flex:none}
.hr>.ib,.pw>.gb.ib{border-color:var(--vscode-widget-border,transparent)}
.acts{display:flex;flex-wrap:wrap;gap:2px;padding:0 4px 2px 26px}
.ex{margin:0 0 6px 26px;padding:6px 8px;border-left:2px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));color:var(--vscode-foreground)}
.ex dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0}
.ex dt{color:var(--vscode-descriptionForeground)}
.ex dd{margin:0;min-width:0;overflow-wrap:anywhere}
.wide .main{flex-wrap:nowrap}
.wide .rb{min-width:0}
.wide.wpr{--gc:14px minmax(150px,3fr) minmax(90px,1.4fr) minmax(120px,1.8fr) 9ch 8ch 12ch 22ch 5ch 15ch 7ch}
.wide .rb{flex:1 1 auto;grid-template-columns:var(--gc);column-gap:8px}
.wide .meta{display:contents}
.wide .acts{flex:none;width:var(--acts);padding:0 4px;flex-wrap:nowrap;justify-content:flex-end}
.meta>span:empty{display:none}
.wide .meta>span:empty{display:block}
.pj{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pn,.st,.cx,.tm,.pj,.br,.fl,.ah,.pr,.kc{white-space:nowrap}
.ck{font-weight:600}
.ck.fail{color:var(--vscode-testing-iconFailed,var(--vscode-errorForeground))}
.ck.pend{color:var(--vscode-testing-iconQueued,var(--vscode-editorWarning-foreground))}
.ck.pass{color:var(--vscode-testing-iconPassed,var(--c-tidy))}
.wide .meta>span{overflow:hidden;text-overflow:ellipsis}
.wide .rb .t{font-weight:500}
.br{color:var(--vscode-gitDecoration-modifiedResourceForeground,var(--c-fin));font-family:var(--vscode-editor-font-family);font-size:calc(var(--vscode-font-size) - 1px);overflow:hidden;text-overflow:ellipsis}
.pj{color:var(--vscode-descriptionForeground)}
.ah{font-weight:600}
.q,.nb{opacity:.6}
.spin{display:inline-block;width:10px;height:10px;vertical-align:-1px;border:2px solid var(--vscode-widget-border,var(--vscode-descriptionForeground));border-top-color:var(--vscode-progressBar-background,var(--vscode-focusBorder));border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none;border-radius:0;border-width:0;width:auto;height:auto}.spin::after{content:'\2026'}}
#prog{padding-bottom:4px;background-image:linear-gradient(var(--vscode-progressBar-background),var(--vscode-progressBar-background));background-repeat:no-repeat;background-size:var(--pct,0%) 2px;background-position:left bottom}
.ex .xh{margin:8px 0 2px;color:var(--vscode-descriptionForeground)}
.gfs{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0}
.gf{display:inline-flex;gap:4px;max-width:100%;padding:0 6px;line-height:18px;cursor:pointer;color:inherit;background:transparent;border:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));border-radius:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gf:hover{background:var(--vscode-list-hoverBackground)}
.gf:focus-visible{outline:1px solid var(--vscode-focusBorder)}
.gw{margin:1px 0;overflow-wrap:anywhere}
.gw.here{font-weight:600}
.gw code{font-family:var(--vscode-editor-font-family)}
.gmore{color:var(--vscode-descriptionForeground)}
#grm{padding:4px 0;min-width:min(200px,calc(100vw - 16px))}
#grm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
.pi{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;cursor:pointer}
.pi:hover{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground)}
.pi input{margin:0}
.fx{flex:1 1 220px;min-width:140px;max-width:420px;padding:3px 6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-contrastBorder,transparent));border-radius:2px}
.fx::placeholder{color:var(--vscode-input-placeholderForeground)}
.fx:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#fr{margin:8px 0 0}
#fch{flex:1 1 auto}
.lk{padding:0;cursor:pointer;color:var(--vscode-textLink-foreground);background:none;border:0;text-decoration:underline}
.lk:hover{color:var(--vscode-textLink-activeForeground)}
.lk:focus-visible{outline:1px solid var(--vscode-focusBorder)}
#updw[hidden]{display:none}
#shm{padding:4px 0}
#shm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
.kb{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0;padding:0 10px}
.kb dt{color:var(--vscode-descriptionForeground)}
.kb dd{margin:0}
#srm{padding:4px 0;min-width:min(200px,calc(100vw - 16px))}
#srm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
.clear{margin:12px 0;padding:8px 12px;color:var(--vscode-foreground);border-left:2px solid var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}
.clear h2{margin:0 0 2px}
.clear p{margin:0;color:var(--vscode-descriptionForeground)}
.bh .ab{color:inherit;background:transparent;border-color:transparent}
.g-ps{--bac:var(--c-acc)}
.ps{margin-bottom:12px}
.psl{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:4px 0 8px}
.psn{font-weight:600;color:var(--vscode-foreground)}
.psb{padding:4px 4px 0}
.pst-w{overflow-x:auto}
.pst{width:100%;border-collapse:collapse;font-size:calc(var(--vscode-font-size) - 1px)}
.pst th{padding:2px 8px 2px 0;text-align:start;font-weight:normal;white-space:nowrap;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-widget-border,transparent)}
.pst td{padding:2px 8px 2px 0;white-space:nowrap;vertical-align:middle;border-bottom:1px solid var(--vscode-widget-border,transparent)}
.pst tr:hover td{background:var(--vscode-list-hoverBackground)}
.pst td.ttl{max-width:260px;overflow:hidden;text-overflow:ellipsis}
.pst td.acts2{padding-right:0;text-align:end}
.pst .lk{font-family:var(--vscode-editor-font-family);font-size:inherit;text-align:start}
.ps-y{color:var(--c-tidy)}
.ps-n{color:var(--vscode-descriptionForeground)}
.rv-approved{color:var(--c-tidy)}.rv-changes-requested{color:var(--c-need)}.rv-review-requested{color:var(--c-wait)}
@media (min-width:560px){.main{flex-wrap:nowrap}.rb{flex:1 1 0}.acts{flex:none;max-width:50%;padding:0 4px;justify-content:flex-end}}

@media (prefers-contrast:more){.chip,.ab,.gb{border-color:var(--vscode-contrastBorder,currentColor)}}

.bd{position:relative;isolation:isolate;display:inline-block;padding:0 8px;border-radius:9px;line-height:18px;font-size:calc(var(--vscode-font-size) - 1px);color:var(--bdc,var(--vscode-foreground))}
.bd::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--bdc,currentColor);opacity:.18}
.bd-bad{--bdc:var(--c-need)}.bd-warn{--bdc:var(--c-wait)}.bd-ok{--bdc:var(--c-tidy)}.bd-info{--bdc:var(--c-fin)}.bd-muted{--bdc:var(--vscode-descriptionForeground)}
.hxb{display:inline-flex;align-items:center;gap:4px;padding:0 6px;line-height:18px}
.car{display:inline-block;width:0;height:0;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent currentColor}
.hxb[aria-expanded=true] .car{border-width:6px 4px 0 4px;border-color:currentColor transparent transparent transparent}
.pst tr.hxr td{padding:0 0 4px 12px;white-space:normal;border-bottom:1px solid var(--vscode-widget-border,transparent)}
.pst tr.hxr:hover td,.pst tr:hover+tr.hxr td{background:transparent}
.nest{margin:2px 0 2px 8px;border-left:2px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent))}
.nest .meta>.pj,.nest .meta>.br,.nest .meta>.fl,.nest .meta>.ah,.nest .meta>.pr,.nest .meta>.kc{display:none}
.wide .nest .rb{grid-template-columns:14px minmax(0,1fr) 6ch 15ch 7ch}
.wide .nest .rb .dot{grid-column:1}
.wide .nest .meta{display:contents}
.wide .nest .meta>.cx{grid-column:3}.wide .nest .meta>.st{grid-column:4}.wide .nest .meta>.tm{grid-column:5}
.wide .nest .rb .t{grid-column:2}
`;
