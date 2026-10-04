import { T, tier } from './webviewLayout';

/** Webview CSS: the open row card, action bar, stats, tags, section headers, messages, files and related chats. */
const BASE = String.raw`
.r.open{margin:4px 4px 6px;border:1px solid var(--vscode-widget-border);border-radius:4px;background:color-mix(in srgb,var(--vscode-foreground) 4%,transparent)}
.r.open>.rh>.hd{padding-left:9px;padding-right:7px}
.r.open .hd .ic.ar,.r.open .hd .ic.pn,.r.open .mt .gi,.r.open .rh>.chips{display:none}
.r.open .hd{align-items:flex-start}
.r.open .hd .t{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;padding:4px 0;-webkit-mask-image:none;mask-image:none}
.r.open .hd .dot{margin-top:10px}
.r.open .hd .ia{display:flex;position:static;transform:none;margin-top:5px}
.r.open .hd .ic[data-a=exp]{margin-top:2px}
.ex{display:flex;flex-direction:column;gap:12px;margin:0;padding:4px 8px 10px 23px;border:0;cursor:default}
.xca,.xcl,.xcb{display:contents}
.xa{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.xb{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px;border:1px solid transparent;border-radius:3px;background:transparent;color:var(--vscode-foreground);font:inherit;font-size:0.92em;cursor:pointer;white-space:nowrap}
.xb svg{width:14px;height:14px;flex:none}
.xb:hover{background:var(--vscode-toolbar-hoverBackground)}
.xb:focus-visible,.xin input:focus,.chip:focus-visible,.xh:focus-visible,.ex .rr:focus-visible,.gp:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
.xb.pri{padding:0 10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-weight:500}
.xb.pri:hover{background:var(--vscode-button-hoverBackground)}
.xb.on svg{color:var(--vscode-charts-yellow)}
.xa .sp{flex:1}
.xs{display:grid;grid-template-columns:repeat(auto-fill,minmax(6.5em,1fr));gap:4px 12px;margin:0}
.xs>div{display:flex;flex-direction:column;min-width:0}
.xs dt{font-size:0.82em;color:var(--vscode-descriptionForeground)}
.xs dd{margin:0;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xs .wide{grid-column:1/-1}
.xs .wide dd{white-space:normal}
.add{color:var(--vscode-charts-green)}
.rem{color:var(--vscode-charts-red)}
.xt{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.xt .chip{max-width:100%;font-size:0.85em;line-height:18px;padding:0 7px;border-radius:9px;gap:4px}
.xin{display:inline-flex;align-items:center;gap:6px;flex:1 1 10em;min-width:0}
.xin input{flex:1;min-width:0;max-width:16em;width:auto;height:20px;box-sizing:border-box;padding:0 6px;font:inherit;font-size:0.88em;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);border-radius:2px;outline:none}
.xin input::placeholder{color:var(--vscode-input-placeholderForeground)}
.xin .k{font-size:0.8em;color:var(--vscode-descriptionForeground);white-space:nowrap}
.xh{display:flex;align-items:center;gap:4px;min-height:22px;margin-left:-16px;cursor:pointer;user-select:none;color:var(--vscode-descriptionForeground);font-size:0.85em;font-weight:600;border-radius:3px}
.xh .chev{width:12px;height:12px}
.xh:hover{color:var(--vscode-foreground)}
.xc{margin-left:2px;font-weight:400;opacity:.85}
.xb2{margin-top:2px}
.fps{display:flex;flex-wrap:wrap;gap:4px;margin:0}
.fp{font-size:0.82em;line-height:18px;border-radius:3px}
.fi{font-size:0.82em;line-height:1.5}
.ex .rr{margin-left:-4px;padding:0 4px;min-height:24px;gap:6px;border-radius:3px}
.ex .rr:hover,.ex .rr:focus-visible{background:var(--vscode-list-hoverBackground);color:inherit}
.sh{flex:none;font-size:0.85em;color:var(--vscode-descriptionForeground);white-space:nowrap}
.none{font-size:0.9em;color:var(--vscode-descriptionForeground)}
`;

const COMPACT = String.raw`
.ex{padding-left:9px;padding-right:6px}
.xh{margin-left:-2px}
.xa .xl,.xa .sp,.xa [data-a=copyid]{display:none}
.xb:not(.pri){padding:0 4px}
.sh{display:none}
.xs{grid-template-columns:1fr}
.xs>div{flex-direction:row;justify-content:space-between;gap:8px}
.xs .wide{flex-direction:column}
.xin .k{display:none}`;

const MEDIUM = '.xa .xl.xo{display:none}.xa{gap:2px}.xa .xb:not(.pri){padding:0 4px}';

const WIDE = `
.xs{grid-template-columns:repeat(auto-fill,minmax(9em,1fr))}
.xs .wide{grid-column:span 2}`;

const XWIDE = `
.ex{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,2fr);gap:12px 24px;align-items:start}
.ex>.xa{grid-column:1/-1}
.xca,.xcl,.xcb{display:flex;flex-direction:column;gap:12px;min-width:0}
.xca{grid-column:2;grid-row:2}
.xcl{grid-column:1;grid-row:2/span 2}
.xcb{grid-column:2;grid-row:3}
.xs{grid-template-columns:repeat(2,minmax(0,1fr))}`;

export const EXPAND_CSS = BASE + tier(T.compact, COMPACT) + tier(T.medium, MEDIUM) + tier(T.wide, WIDE) + tier(T.xwide, XWIDE);
