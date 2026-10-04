/** Webview: the edited or read pill on result rows of file: and edited: searches. Shares top-level scope with webviewJs. */
export const TOUCH_CSS = String.raw`
.mp.tc{padding:0 6px;line-height:14px;background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,var(--vscode-descriptionForeground))}
.mp.tc.ed{--c:var(--vscode-charts-green,#89d185);color:var(--c);border-color:color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent)}
`;

export const TOUCH_JS = String.raw`
function touchPill(r){if(!r.touch)return '';const t=r.touch==='edited'?'Edited this file':'Only read this file';
return '<span class="mp tc '+(r.touch==='edited'?'ed':'rd')+'" role="img" aria-label="'+t+'" data-tip="'+t+'">'+r.touch+'</span>';}
`;
