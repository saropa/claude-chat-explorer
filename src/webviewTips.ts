/** Info icon button in the header row and its "Search tips" popover: the query prefixes parseQuery understands, one example each. */
const INFO_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.200" fill="none" stroke="currentColor" stroke-width="1.300"/><path d="M8 7.300v4M8 4.800v.1" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round"/></svg>';

export const TIPS_HTML = `<div class="pw">
<button type="button" class="opt hb" id="tpb" data-tip="Search tips" aria-label="Search tips" aria-haspopup="true" aria-expanded="false" aria-controls="tpm">${INFO_SVG}</button>
<div id="tpm" class="pop" role="group" aria-label="Search tips" hidden></div>
</div>`;

export const TIPS_CSS = String.raw`
#tpm{min-width:min(260px,calc(100vw - 16px));padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
.tph{color:var(--vscode-descriptionForeground);font-weight:normal;font-size:inherit;margin:0}
.tph{grid-column:1/-1}
.tph:not(:first-child){margin-top:8px}
.tpg{display:grid;grid-template-columns:max-content 1fr;column-gap:12px;row-gap:8px}
.tpx{grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:center;padding:0;margin:0;border:none;background:transparent;color:var(--vscode-foreground);font:inherit;text-align:start;cursor:pointer}
.tpx:hover{background:var(--vscode-list-hoverBackground)}
.tpx code{justify-self:start;font-family:var(--vscode-editor-font-family);font-size:inherit;background:var(--vscode-textCodeBlock-background);color:var(--vscode-textLink-foreground);border-radius:2px;padding:2px 6px;white-space:nowrap}
.tpx:focus-visible{outline:none}
.tpx:focus-visible code{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
@media (max-width:259px){.tpg{grid-template-columns:1fr}.tpx{grid-template-columns:1fr;row-gap:2px}}
`;

/** Webview script: tips grouped under quiet subheadings; each row is a button whose click fills the search box. Loaded after the sort script, which owns popover open/close. */
export const TIPS_JS = String.raw`
const TIPS=[['Find in files and git',[['Chats that touched a file','file:app.ts'],['Chats that edited a file','edited:app.ts'],['A command the agent ran','cmd:"npm test"'],['A commit hash','sha:3028413'],['A pull request number','pr:123'],['A branch name','branch:main']]],
['Narrow the search',[['Chats with a tag','tag:review'],['Only the last N messages','last:25'],['Who wrote it: you or the agent','from:agent']]]];
const tpm=$('tpm');
tpm.innerHTML='<div class="tpg"><div class="tph">Click an example to try it</div>'+TIPS.map(g=>'<div class="tph">'+g[0]+'</div>'+g[1].map(t=>'<button type="button" class="tpx" data-ex="'+esc(t[1])+'" aria-label="'+esc(t[0]+': '+t[1])+'"><code>'+esc(t[1])+'</code><span>'+t[0]+'</span></button>').join('')).join('')+'<div class="tph">Put a value in quotes to include spaces</div></div>';
tpm.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-ex]');if(!b)return;
q.value=b.dataset.ex;popClose('');q.focus();histIdx=-1;go();});
$('tpb').addEventListener('click',()=>popToggle('tpb','tpm'));
`;
