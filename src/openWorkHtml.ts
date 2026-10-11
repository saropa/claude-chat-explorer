import { randomBytes } from 'crypto';
import { OW_CSS } from './openWorkCss';
import { OW_SCRIPT } from './openWorkJs';
import { POP_CSS, TIP_CSS } from './webviewPop';

export const OW_TITLE = 'Open Work';

/** The Open Work page: header, band chips, status lines, the list, the tooltip box and the script. */
export function openWorkHtml(): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${OW_TITLE}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${OW_CSS}${POP_CSS}${TIP_CSS}</style></head><body>
<div id="wrap">
<header id="hd">
<div class="hr"><h1 id="ttl">${OW_TITLE}</h1><span class="sp"></span>
<button type="button" class="gst g-off" id="ghs" data-a="ghs" data-g="off" data-tip="GitHub connection" aria-label="GitHub connection"><span class="gd" aria-hidden="true"></span><span id="ght">GitHub</span></button>
<div class="pw"><button type="button" class="gb" id="grb" data-tip="Group chats by" aria-label="Group chats by: By attention" aria-haspopup="true" aria-expanded="false" aria-controls="grm"><span id="grt">By attention</span></button>
<div id="grm" class="pop" role="group" aria-label="Group chats by" hidden></div></div>
<div class="pw"><button type="button" class="gb" id="srb" data-tip="Sort rows within each group" aria-label="Sort rows by: Recent activity" aria-haspopup="true" aria-expanded="false" aria-controls="srm"><span id="srt">Sort: Recent activity</span></button>
<div id="srm" class="pop" role="group" aria-label="Sort rows by" hidden></div></div>
<button type="button" class="chip" id="idl" data-a="idle" aria-pressed="true" data-tip="Show or hide chats with nothing open">Show idle</button>
<button type="button" class="chip" id="dnb" data-a="showdone" aria-pressed="false" data-tip="Show or hide chats you marked done" hidden>Show done</button>
<button type="button" class="chip" id="wsb" data-a="ws" aria-pressed="false" data-tip="Only chats in this workspace's repositories, including their other worktrees" hidden>This workspace only</button>
<button type="button" class="ab ib" id="smb" data-a="summary" title="Copy a summary of everything open as text" aria-label="Copy summary"><svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/></svg></button>
<div class="pw"><button type="button" class="gb" id="shb" data-tip="Keyboard shortcuts" aria-label="Keyboard shortcuts" aria-haspopup="true" aria-expanded="false" aria-controls="shm" title="Keyboard shortcuts"><svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M6.2 6.3a1.9 1.9 0 113 1.5c-.7.5-1.2.9-1.2 1.7M8 11.6v.1"/></svg></button>
<div id="shm" class="pop" role="group" aria-label="Keyboard shortcuts" hidden><div class="pt">Keyboard shortcuts</div><dl class="kb"><dt>j or Down</dt><dd>Next row</dd><dt>k or Up</dt><dd>Previous row</dd><dt>Home, End</dt><dd>First or last row</dd><dt>Enter</dt><dd>Open the chat</dd><dt>Space or Right</dt><dd>Expand the row</dd><dt>Left</dt><dd>Collapse the row</dd><dt>/</dt><dd>Go to the filter box</dd><dt>Esc</dt><dd>Close, collapse or clear</dd><dt>?</dt><dd>Show this list</dd></dl></div></div>
<button type="button" class="ab ib" id="rf" data-a="refresh" title="Refresh: read the chat list again" aria-label="Refresh"><svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8a5 5 0 11-1.6-3.7M13 2.5v3h-3"/></svg></button>
</div>
<div class="hr" id="fr" role="search" aria-label="Filter rows"><input type="search" id="fq" class="fx" placeholder="Filter by title, project, branch, file or PR" aria-label="Filter rows by title, project, branch, repository, file name or pull request" maxlength="80" autocomplete="off" spellcheck="false"><span id="fch" class="hr"></span></div>
<div id="cnt" role="group" aria-label="Chats by band"></div>
<div id="ixs" role="status" hidden><span>Indexing...</span><span>Index still building: list may be incomplete.</span><span class="ixp"><i></i></span><button type="button" class="ab ib" data-a="retry" aria-label="Retry reading the chat list" title="Retry reading the chat list"><svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8a5 5 0 11-1.6-3.7M13 2.5v3h-3"/></svg></button></div>
<div id="prog" class="sub" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="" hidden></div>
<div id="updw" class="sub" hidden><span id="upd"></span><span aria-hidden="true"> - </span><button type="button" class="ab ib" id="updr" data-a="refresh" aria-label="Refresh" title="Refresh: read the chat list and git state again"><svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8a5 5 0 11-1.6-3.7M13 2.5v3h-3"/></svg></button></div>
<div id="note" class="sub"></div>
</header>
<main id="body" aria-busy="true"></main>
</div>
<div id="live" class="vh" role="status" aria-live="polite"></div>
<div id="tip" role="tooltip" hidden></div>
<script nonce="${nonce}">${OW_SCRIPT}</script></body></html>`;
}
