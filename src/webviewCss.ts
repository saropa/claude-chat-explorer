export const CSS = String.raw`
body{padding:6px 0;color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
.top{padding:0 8px}
.box{position:relative}
input[type=text]{width:100%;box-sizing:border-box;padding:3px 98px 3px 6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none;font-family:inherit;font-size:inherit}
input[type=text]:focus{border-color:var(--vscode-focusBorder)}
input.bad{border-color:var(--vscode-inputValidation-errorBorder)}
.opts{position:absolute;right:2px;top:2px;display:flex;gap:1px}
.opt{width:22px;height:18px;padding:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;color:var(--vscode-foreground);border:1px solid transparent;border-radius:3px;font-size:12px;font-family:var(--vscode-editor-font-family,monospace)}
.opt:hover{background:var(--vscode-toolbar-hoverBackground)}
.opt.on{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent);color:var(--vscode-inputOption-activeForeground)}
.opt u{text-decoration:underline}
.opt:disabled{opacity:.4;cursor:default}
.opt:disabled:hover{background:transparent}
#err{display:none;margin-top:-1px;padding:3px 6px;font-size:0.9em;background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);color:var(--vscode-inputValidation-errorForeground,var(--vscode-foreground))}
#ixb{margin:0 0 6px;font-size:0.9em;color:var(--vscode-descriptionForeground)}
#ixb[hidden]{display:none}
.ixp{position:relative;height:2px;margin-top:3px;overflow:hidden;background:var(--vscode-widget-border,transparent)}
.ixp i{position:absolute;top:0;bottom:0;width:30%;background:var(--vscode-progressBar-background);animation:slide 1.2s linear infinite}
#bar{position:relative;height:2px;margin-top:2px;overflow:hidden;visibility:hidden}
#bar.on{visibility:visible}
#bar i{position:absolute;top:0;bottom:0;width:30%;background:var(--vscode-progressBar-background);animation:slide 1.2s linear infinite}
@keyframes slide{0%{left:-30%}100%{left:100%}}
#status{margin:2px 0;padding:0 10px;color:var(--vscode-descriptionForeground);font-size:0.92em}
#status:empty{display:none}
#status.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#ah{margin:2px 0 0;font-size:0.85em;color:var(--vscode-descriptionForeground)}
#ah[hidden]{display:none}
.sel{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px;margin-top:3px}
.sel label.al{display:inline-flex;align-items:center;gap:3px;flex:none;cursor:pointer}
.sel label.al input{margin:0;width:13px;height:13px}
.nm{padding:4px 10px;color:var(--vscode-descriptionForeground);font-size:0.92em}
.nm b{font-weight:600;color:var(--vscode-foreground)}
.sm{flex:1;min-width:0;text-align:right;text-transform:none;letter-spacing:0;font-weight:400;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#res.stale{opacity:.4;pointer-events:none}
#pin:empty+#list>.sl:first-child,#pin>.sl:first-child{margin-top:0;border-top:none}
.sel label{display:flex;align-items:center;gap:4px;margin:0;flex:1 1 110px;min-width:0;cursor:default;font-size:0.92em}
.sel select{flex:1;min-width:0;padding:1px 3px;color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border);font-family:inherit;font-size:inherit;outline:none}
.sel select:focus{border-color:var(--vscode-focusBorder)}
.sel select option{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-listBackground,var(--vscode-dropdown-background))}
.sl,.gh{display:flex;align-items:center;gap:4px;padding:4px 8px 4px 6px;cursor:pointer;user-select:none;color:var(--vscode-descriptionForeground)}
.sl{margin-top:6px;border-top:1px solid var(--vscode-widget-border,transparent);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.gh{font-weight:500}
.sl:hover,.gh:hover,.sl:focus-visible,.gh:focus-visible{color:var(--vscode-foreground);outline:none}
.chev{width:16px;height:16px;flex:none;transition:transform .12s}
.open>.chev,.on>.chev{transform:rotate(90deg)}
.pill{margin-left:auto;flex:none;min-width:18px;box-sizing:border-box;padding:0 6px;border-radius:9px;font-size:11px;font-weight:400;line-height:16px;letter-spacing:0;text-align:center;text-transform:none;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.r{outline:none}
.rh:hover{background:var(--vscode-list-hoverBackground)}
.r:focus-visible>.rh,.rr:focus-visible{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.hd,.rr{display:flex;align-items:center;gap:6px;min-height:28px;padding:0 8px 0 10px;cursor:pointer;box-sizing:border-box}
.rr{min-height:24px;padding-left:2px;font-size:0.95em}
.dot{--dc:var(--vscode-descriptionForeground,#9d9d9d);width:8px;height:8px;border-radius:50%;flex:none;box-sizing:border-box;background:var(--dc)}
.dot.idle{opacity:.4}
.dot.running{--dc:#89d185}
.dot.waiting{--dc:#3b82f6}
.dot.unread{--dc:#d97757}
.dot.ring{background:transparent;border:2px solid var(--dc)}
.t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pj{flex:none;max-width:25%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.85em;color:var(--vscode-descriptionForeground)}
.tm{flex:none;min-width:28px;text-align:right;font-size:0.92em;color:var(--vscode-descriptionForeground)}
.r:focus-visible>.rh .tm,.r:focus-visible>.rh .s,.r:focus-visible>.rh .pj,.rr:focus-visible .tm{color:inherit;opacity:.85}
.s{padding:0 10px 0 24px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.9em;color:var(--vscode-descriptionForeground)}
.ic{display:none;align-items:center;justify-content:center;flex:none;width:18px;height:18px;padding:0;border:none;border-radius:3px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:13px;line-height:1}
.ic[data-a=exp],.rh:hover .ic,.r:focus-within .ic,.ic.on{display:inline-flex}
.ic:hover{color:var(--vscode-foreground);background:var(--vscode-toolbar-hoverBackground)}
.ic.pn.on{color:var(--vscode-charts-yellow,var(--vscode-foreground))}
.chips{display:flex;gap:3px;flex:none;max-width:45%;overflow:hidden}
.chips:empty{display:none}
.chip,.fp{display:inline-flex;align-items:center;gap:3px;padding:0 6px;border-radius:8px;font-size:0.82em;line-height:15px;white-space:nowrap;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.chip{cursor:pointer}
.chip.on{outline:1px solid var(--vscode-focusBorder)}
.cx{font-weight:normal;opacity:.7;cursor:pointer}
.cx:hover{opacity:1}
.fp{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-family:var(--vscode-editor-font-family,monospace);background:var(--vscode-editorWidget-background,var(--vscode-badge-background));color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,transparent)}
.fp.ed{color:var(--vscode-foreground)}
.m{color:var(--vscode-descriptionForeground);font-size:0.9em}
.mm .b{white-space:normal;word-break:break-word;color:var(--vscode-descriptionForeground)}
.fi{font-family:var(--vscode-editor-font-family,monospace);font-size:0.85em;word-break:break-all;color:var(--vscode-descriptionForeground)}
mark{background:var(--vscode-editor-findMatchHighlightBackground);color:inherit}
a{color:var(--vscode-textLink-foreground);cursor:pointer}
.sub{flex:none;margin-left:0;padding:0 6px;border-radius:9px;font-size:11px;line-height:16px;white-space:nowrap;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.sr{padding-left:22px;align-items:flex-start;flex-wrap:wrap}
.sr .t{flex:1;min-width:0}
.sr .s{flex-basis:100%;margin-left:0}
.msub{font-size:0.85em;color:var(--vscode-charts-purple)}
`;
