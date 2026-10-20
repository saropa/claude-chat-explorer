import { DOT_ANIM_CSS } from './dotCss';
/** Open Work page styles. Fonts and colors come only from VS Code variables; no hex colors. */
export const OW_CSS = String.raw`
*{box-sizing:border-box}
html{height:100%}
body{margin:0;padding:8px 12px 12px;line-height:normal;font-weight:normal;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
button,select,input{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);font-weight:normal;line-height:normal}
h1 .ver{margin-left:6px;font-size:calc(var(--vscode-font-size) - 1px);font-weight:normal;opacity:.6}
h1{margin:0;font-size:calc(var(--vscode-font-size) + 5px);font-weight:600}
h2{margin:0;font-size:inherit;font-weight:600}
:root{--rp:11px;--rg:7px;--gg:24px;--lh:1.5;--hp:8px;--cp:5px}
:root.dense .bh{font-size:inherit}
:root.dense{--rp:5px;--rg:2px;--gg:10px;--lh:1.3;--hp:2px;--cp:2px}
#wrap{line-height:var(--lh);--acts:260px;--gc:14px minmax(150px,3fr) minmax(90px,1.4fr) minmax(120px,1.8fr) 9ch 8ch 5ch 15ch 7ch;max-width:none;margin:0;--c-need:var(--vscode-charts-red,var(--vscode-errorForeground));--c-fin:var(--vscode-charts-blue,var(--vscode-textLink-foreground));--c-wait:var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground));--c-tidy:var(--vscode-charts-green,var(--vscode-testing-iconPassed));--c-acc:var(--vscode-focusBorder)}
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
.bh{position:relative;isolation:isolate;display:flex;align-items:center;gap:6px;padding:var(--hp) 8px;font-size:calc(var(--vscode-font-size) + 2px);margin-bottom:0;border-left:3px solid var(--bac,var(--c-acc));border-bottom:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));color:var(--vscode-foreground)}
.bh::before,.st::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;background:var(--tint,currentColor);opacity:.1}
.bh::before{--tint:var(--bac,var(--c-acc))}
.g-needs{--bac:var(--c-need)}.g-finish{--bac:var(--c-fin)}.g-waiting{--bac:var(--c-wait)}.g-tidy{--bac:var(--c-tidy)}.g-idle{--bac:var(--vscode-descriptionForeground)}
.pill{flex:none;min-width:18px;padding:0 6px;border-radius:9px;line-height:16px;text-align:center;font-weight:normal;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background)}
.row{border-bottom:1px solid var(--vscode-widget-border,transparent)}
.main{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.rb{flex:1 1 100%;min-width:0;display:grid;grid-template-columns:14px minmax(0,1fr);column-gap:8px;align-items:center;padding:var(--cp) 4px;text-align:start;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:2px}
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
.dot{--k-running:var(--vscode-saropaChatExplorer-dotRunning,var(--vscode-testing-iconPassed));--k-waiting:var(--vscode-saropaChatExplorer-dotWaiting,var(--vscode-focusBorder));--k-unread:var(--vscode-saropaChatExplorer-dotUnread,var(--vscode-editorWarning-foreground));--k-background:var(--vscode-saropaChatExplorer-dotBackground,var(--vscode-charts-purple))}
.dot.running{--dc:var(--k-running)}
.dot.waiting{--dc:var(--k-waiting)}
.dot.unread{--dc:var(--k-unread)}
.dot.background{--dc:var(--k-background)}
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
#ctl{gap:8px}
#fr{flex:1 1 280px;flex-wrap:nowrap}
#fch{display:flex;flex-direction:column}
#flc{margin-left:6px}
#vwm,#mom{padding:4px 0;min-width:min(220px,calc(100vw - 16px))}
#vwm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
#vwm button,#mom button{display:flex;align-items:center;gap:6px;width:100%;min-height:24px;padding:0 10px;text-align:start;color:inherit;background:transparent;border:0;border-radius:0;opacity:1;cursor:pointer}
#vwm button:hover,#mom button:hover{color:var(--vscode-menu-selectionForeground);background:var(--vscode-menu-selectionBackground)}
#vwm button:focus-visible,#mom button:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
#vwm button[hidden],#mom button[hidden]{display:none}
#vwm .chip[aria-pressed=true]::after,#mom .chip[aria-pressed=true]::after{content:'\2713';margin-left:auto}
#mom .gst{--gc:var(--vscode-descriptionForeground)}
.lk{padding:0;cursor:pointer;color:var(--vscode-textLink-foreground);background:none;border:0;text-decoration:underline}
.lk:hover{color:var(--vscode-textLink-activeForeground)}
.lk:focus-visible{outline:1px solid var(--vscode-focusBorder)}
#shm{padding:4px 0}
#shm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
.kb{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0;padding:0 10px}
.kb dt{color:var(--vscode-descriptionForeground)}
.kb dd{margin:0}
#vwm{padding:4px 0;min-width:min(220px,calc(100vw - 16px))}
#srm .pt,#vwm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
#srm .pi,#dnm .pi{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;cursor:pointer}
.clear{margin:12px 0;padding:8px 12px;color:var(--vscode-foreground);border-left:2px solid var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}
.clear h2{margin:0 0 2px}
.clear p{margin:0;color:var(--vscode-descriptionForeground)}
.bh .ab{color:inherit;background:transparent;border-color:transparent}
.g-ps{--bac:var(--c-acc)}
.ps{margin-bottom:12px}
.psl{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:10px 0 8px}
.psn{font-weight:600;color:var(--vscode-foreground)}
.psb{padding:4px 4px 0}
.pst-w{overflow-x:auto}
.pst{width:100%;border-collapse:collapse;font-size:calc(var(--vscode-font-size) - 1px)}
.pst th{vertical-align:bottom;padding:2px 8px 2px 0;text-align:start;font-weight:normal;white-space:nowrap;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-widget-border,transparent)}
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
.pst tr.hxr td{max-width:0;overflow:hidden;padding:0 0 4px 12px;white-space:normal;border-bottom:1px solid var(--vscode-widget-border,transparent)}
.pst tr.hxr:hover td,.pst tr:hover+tr.hxr td{background:transparent}
.row[data-rel="p"] .t,.row[data-rel="p"] .tm{opacity:.7}
.mnl .row .t,.mnl .row .tm{opacity:.55}.mnp{margin:2px 0 0}
.row[data-rel] .t .bd{margin-right:4px}
.nest{margin:2px 0 2px 8px;border-left:2px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent))}
.nest .meta>.pj,.nest .meta>.br,.nest .meta>.fl,.nest .meta>.ah,.nest .meta>.pr,.nest .meta>.kc,.nest .meta>.cx,.nest .meta>.st{display:none}
.nest .rb,.wide .nest .rb{grid-template-columns:14px minmax(0,1fr) auto}
.nest .meta{display:contents}
.nest .meta>.tm{grid-column:3;color:var(--vscode-descriptionForeground)}
.nest .rb .dot{grid-column:1}.nest .rb .t{grid-column:2}
.nest .row{position:relative}
.nest .acts,.wide .nest .acts{width:auto;padding:0 4px;gap:2px;flex-wrap:nowrap;align-items:center}
.av{opacity:0}.av.on,.row:hover .av,.row:focus-within .av{opacity:1}
.ovb{opacity:0}.row:hover .ovb,.row:focus-within .ovb,.ovb[aria-expanded=true],.wr:hover .ovb,.wr:focus-within .ovb{opacity:1}
.ovp{position:absolute;right:4px;z-index:5;min-width:200px;max-width:min(420px,calc(100vw - 24px));padding:6px 8px;color:var(--vscode-menu-foreground,var(--vscode-foreground));background:var(--vscode-menu-background,var(--vscode-editorWidget-background));border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,var(--vscode-contrastBorder,transparent)));border-radius:4px;box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.3))}
.cm{display:flex;flex-direction:column;align-items:stretch;padding:4px 0;top:100%}
.cm .mi{width:100%;text-align:start;border-radius:0;border-color:transparent}
.cmx{display:flex;flex-wrap:wrap;gap:2px;padding:2px 8px}
.bh.tg{cursor:pointer}
.bh.tg .ab{flex:none}
.bh .chv{margin-left:auto;flex:none;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;opacity:.4;transform:rotate(45deg) translate(-2px,-2px);transition:transform .12s}
.bh.tg:hover .chv{opacity:.7}
.bh.op .chv{transform:rotate(-135deg) translate(-2px,-2px)}

.hl{font-size:calc(var(--vscode-font-size) + 3px);font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.wg{margin-bottom:var(--gg)}
.wr{position:relative;display:flex;flex-direction:column;gap:var(--rg);padding:var(--rp) 4px;border-bottom:1px solid var(--vscode-widget-border,transparent)}
.wr:hover{background:var(--vscode-list-hoverBackground)}
.wl1{display:flex;align-items:center;gap:8px;min-width:0}
.wl2{margin-left:16px;align-items:baseline}
.sep{opacity:.6}
.dt{flex:none;width:8px;height:8px;border-radius:50%;background:var(--vscode-descriptionForeground)}
.dt-needs{background:var(--c-need)}.dt-finish{background:var(--c-fin)}.dt-waiting{background:var(--c-wait)}.dt-tidy{background:var(--c-tidy)}.dt-idle{opacity:.6}
.todo{flex:1 1 auto;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nbh{margin:8px 0 2px 4px}
.wr>.ovp{top:30px}
.c-cr{min-width:0;overflow-wrap:anywhere}
.nl{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}
.bn,.bn .lk,.bn code,.bn-t{font-size:calc(var(--vscode-font-size) + 2px);font-weight:600}
.bn code{font-family:var(--vscode-editor-font-family)}
.wtn{font-size:calc(var(--vscode-font-size) - 1px);color:var(--vscode-descriptionForeground)}
.rs{cursor:default}
.dflt{font-weight:normal}
.pb{white-space:nowrap}
.wd{min-width:260px}
.wd dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0}
.wd dt{color:var(--vscode-descriptionForeground)}
.wd dd{margin:0;min-width:0;overflow-wrap:anywhere}
.wda{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.c-cr,.cby{color:var(--vscode-descriptionForeground)}
.cby .lk{color:inherit}
.c-ac{display:flex;flex-wrap:wrap;gap:4px 6px;justify-content:flex-end;align-items:center}
.hxr{padding:0 0 4px 12px;border-bottom:1px solid var(--vscode-widget-border,transparent)}
@media (max-width:760px){.wl2{margin-left:0}.ovp{left:4px;right:4px;max-width:none}}
` + DOT_ANIM_CSS;
