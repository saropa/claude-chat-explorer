/** Open Work page styles. Fonts and colors come only from VS Code variables; no hex colors. */
export const OW_CSS = String.raw`
*{box-sizing:border-box}
html{height:100%}
body{margin:0;padding:12px 16px 24px;line-height:normal;font-weight:normal;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
button,select,input{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);font-weight:normal;line-height:normal}
h1{margin:0;font-size:calc(var(--vscode-font-size) + 5px);font-weight:600}
h2{margin:0;font-size:inherit;font-weight:600}
#wrap{--acts:340px;max-width:1400px;margin:0 auto}
.hr{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.hr .sp{flex:1 1 auto}
.ab,.chip,.gb{padding:2px 8px;cursor:pointer;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:1px solid var(--vscode-contrastBorder,transparent);border-radius:2px}
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
#body{margin-top:12px}
.msg{margin:12px 0;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}
.msg.err{padding:4px 8px;color:var(--vscode-inputValidation-errorForeground,var(--vscode-foreground));background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder)}
.band{margin:0 0 12px}
.bh{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));color:var(--vscode-descriptionForeground)}
.pill{flex:none;min-width:18px;padding:0 6px;border-radius:9px;line-height:16px;text-align:center;font-weight:normal;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background)}
.th{display:none;padding:4px 0;color:var(--vscode-descriptionForeground)}
.row{border-bottom:1px solid var(--vscode-widget-border,transparent)}
.main{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.rb{flex:1 1 100%;min-width:0;display:grid;grid-template-columns:14px minmax(0,1fr);column-gap:8px;align-items:center;padding:4px 4px;text-align:start;cursor:pointer;color:inherit;background:transparent;border:0;border-radius:2px}
.rb:hover{background:var(--vscode-list-hoverBackground)}
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
.cx.l1{color:var(--vscode-charts-yellow,var(--vscode-editorWarning-foreground))}
.cx.l2{color:var(--vscode-charts-orange,var(--vscode-editorWarning-foreground))}
.cx.l3{color:var(--vscode-charts-red,var(--vscode-errorForeground));font-weight:600}
.acts{display:flex;flex-wrap:wrap;gap:4px;padding:0 4px 4px 26px}
.ex{margin:0 0 6px 26px;padding:6px 8px;border-left:2px solid var(--vscode-widget-border,var(--vscode-contrastBorder,transparent));color:var(--vscode-foreground)}
.ex dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0}
.ex dt{color:var(--vscode-descriptionForeground)}
.ex dd{margin:0;min-width:0;overflow-wrap:anywhere}
.wide .th{display:flex;align-items:center;gap:0 8px}
.wide .th span,.wide .meta>span{min-width:0}
.wide .main{flex-wrap:nowrap}
.wide .rb{flex:1 1 auto;grid-template-columns:14px minmax(0,3fr) minmax(0,1.5fr) 7ch 14ch 7ch;column-gap:8px}
.wide .meta{display:contents}
.wide .acts{flex:none;width:var(--acts);padding:0 4px}
.wide .th .a{flex:1 1 auto;display:grid;grid-template-columns:14px minmax(0,3fr) minmax(0,1.5fr) 7ch 14ch 7ch;column-gap:8px;padding:0 4px}
.wide .th .b{flex:none;width:var(--acts);padding:0 4px}
.meta>span:empty{display:none}
.wide .meta>span:empty{display:block}
.pj{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pn,.st,.cx,.tm,.pj{white-space:nowrap}
#grm{padding:4px 0;min-width:min(200px,calc(100vw - 16px))}
#grm .pt{padding:2px 10px 4px;color:var(--vscode-descriptionForeground)}
.pi{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 10px;cursor:pointer}
.pi:hover{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground)}
.pi input{margin:0}
@media (prefers-contrast:more){.chip,.ab,.gb{border-color:var(--vscode-contrastBorder,currentColor)}}
`;
