/** Info icon button in the header row and its "Search tips" popover: the query prefixes parseQuery understands, one example each. */
const INFO_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.200" fill="none" stroke="currentColor" stroke-width="1.300"/><path d="M8 7.300v4M8 4.800v.1" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round"/></svg>';

export const TIPS_HTML = `<div class="pw">
<button type="button" class="opt hb" id="tpb" data-tip="Search tips" aria-label="Search tips" aria-haspopup="true" aria-expanded="false" aria-controls="tpm">${INFO_SVG}</button>
<div id="tpm" class="pop" role="group" aria-label="Search tips" hidden></div>
</div>`;

export const TIPS_CSS = String.raw`
#tpm{min-width:min(260px,calc(100vw - 16px))}
.tpx{display:block;width:100%;box-sizing:border-box;padding:3px 10px;border:none;background:transparent;color:inherit;text-align:start;cursor:pointer}
.tpx:hover,.tpx:focus-visible{background:var(--vscode-menu-selectionBackground);color:var(--vscode-menu-selectionForeground);outline:none}
.tpx b{font-weight:600}
.tpx code{display:block;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);color:var(--vscode-textLink-foreground)}
.tpx:hover code,.tpx:focus-visible code{color:inherit}
.tpn{padding:4px 10px 2px;color:var(--vscode-descriptionForeground)}
`;

/** Webview script: the tips list (prefix, meaning, example) and the click that fills the search box. Loaded after the sort script, which owns popover open/close. */
export const TIPS_JS = String.raw`
const TIPS=[['file:','chats that touched a file','file:extension.ts'],['edited:','chats that edited a file','edited:query.ts'],
['cmd:','a command Claude ran','cmd:"npm test"'],['tag:','chats with a tag','tag:review'],['sha:','a commit hash','sha:3028413'],
['pr:','a pull request number','pr:123'],['branch:','a branch name','branch:main'],['last:','only the last N messages','last:25'],
['from:','who wrote the message: you or claude','from:claude']];
const tpm=$('tpm');
tpm.innerHTML='<div class="pt">Search tips: click one to try it</div>'+TIPS.map(t=>'<button type="button" class="tpx" data-ex="'+esc(t[2])+'"><b>'+t[0]+'</b> '+t[1]+'<code>'+esc(t[2])+'</code></button>').join('')+'<div class="tpn">Put a value in quotes to include spaces.</div>';
tpm.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-ex]');if(!b)return;
q.value=b.dataset.ex;popClose('');q.focus();histIdx=-1;go();});
$('tpb').addEventListener('click',()=>popToggle('tpb','tpm'));
`;
