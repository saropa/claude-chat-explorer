export const CSS = String.raw`
body{padding:6px 8px;color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
.box{position:relative}
input[type=text]{width:100%;box-sizing:border-box;padding:4px 74px 4px 6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none;font-family:inherit;font-size:inherit}
input[type=text]:focus{border-color:var(--vscode-focusBorder)}
input.bad{border-color:var(--vscode-inputValidation-errorBorder)}
.opts{position:absolute;right:2px;top:2px;display:flex;gap:1px}
.opt{width:22px;height:20px;padding:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;color:var(--vscode-foreground);border:1px solid transparent;border-radius:3px;font-size:12px;font-family:var(--vscode-editor-font-family,monospace)}
.opt:hover{background:var(--vscode-toolbar-hoverBackground)}
.opt.on{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent);color:var(--vscode-inputOption-activeForeground)}
.opt u{text-decoration:underline}
#err{display:none;margin-top:-1px;padding:4px 6px;font-size:0.9em;background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);color:var(--vscode-inputValidation-errorForeground,var(--vscode-foreground))}
#bar{position:relative;height:2px;margin-top:2px;overflow:hidden;visibility:hidden}
#bar.on{visibility:visible}
#bar i{position:absolute;top:0;bottom:0;width:30%;background:var(--vscode-progressBar-background);animation:slide 1.2s linear infinite}
@keyframes slide{0%{left:-30%}100%{left:100%}}
label{display:block;margin:6px 0;cursor:pointer}
#status{margin:6px 0;color:var(--vscode-descriptionForeground)}
.r{padding:5px 4px;cursor:pointer}
.r:hover{background:var(--vscode-list-hoverBackground)}
.hd{display:flex;align-items:center;gap:2px}
.t{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ic{border:none;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;padding:0 3px;font-size:13px;line-height:1}
.ic:hover,.ic.on{color:var(--vscode-foreground)}
.ic.on{color:var(--vscode-charts-yellow,var(--vscode-foreground))}
.m{color:var(--vscode-descriptionForeground);font-size:0.9em}
.s{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--vscode-descriptionForeground)}
.chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.chips:empty{display:none}
.chip{display:inline-flex;align-items:center;gap:3px;padding:0 6px;border-radius:8px;font-size:0.85em;cursor:pointer;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.chip.on{outline:1px solid var(--vscode-focusBorder)}
.cx{font-weight:normal;opacity:.7;cursor:pointer}
.cx:hover{opacity:1}
.ex{margin:4px 0 2px 14px;padding-left:6px;border-left:1px solid var(--vscode-widget-border,var(--vscode-descriptionForeground));cursor:default}
.tgs{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin-bottom:4px}
.tin{width:80px;box-sizing:border-box;padding:1px 4px;font-size:0.85em;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none;font-family:inherit}
.mm{margin:4px 0}
.who{font-weight:600}
.mm .b{white-space:normal;word-break:break-word;color:var(--vscode-descriptionForeground)}
.fi{font-family:var(--vscode-editor-font-family,monospace);font-size:0.85em;word-break:break-all;color:var(--vscode-descriptionForeground)}
mark{background:var(--vscode-editor-findMatchHighlightBackground);color:inherit}
.h{display:flex;align-items:center;padding:3px 4px;cursor:pointer}
.h:hover{background:var(--vscode-list-hoverBackground)}
.h span.q{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h .fl{color:var(--vscode-descriptionForeground);font-size:0.85em;margin-left:6px}
.x{border:none;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;padding:0 4px;font-size:14px;line-height:1}
.x:hover{color:var(--vscode-foreground)}
.cap{margin:4px 0;color:var(--vscode-descriptionForeground);font-size:0.9em}
.sel{display:flex;gap:8px;margin-top:6px}
.sel label{display:flex;align-items:center;gap:4px;margin:0;flex:1;min-width:0;cursor:default}
.sel select{flex:1;min-width:0;padding:2px 4px;color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border);font-family:inherit;font-size:inherit;outline:none}
.sel select:focus{border-color:var(--vscode-focusBorder)}
.sel select option{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-listBackground,var(--vscode-dropdown-background))}
a{color:var(--vscode-textLink-foreground);cursor:pointer}
`;
