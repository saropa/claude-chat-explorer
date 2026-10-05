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
<div class="hr"><h1>${OW_TITLE}</h1><span class="sp"></span>
<div class="pw"><button type="button" class="gb" id="grb" data-tip="Group chats by" aria-label="Group chats by: By attention" aria-haspopup="true" aria-expanded="false" aria-controls="grm"><span id="grt">By attention</span></button>
<div id="grm" class="pop" role="group" aria-label="Group chats by" hidden></div></div>
<button type="button" class="chip" id="idl" data-a="idle" aria-pressed="true" data-tip="Show or hide chats with nothing open">Show idle</button>
<button type="button" class="chip" id="dnb" data-a="showdone" aria-pressed="false" data-tip="Show or hide chats you marked done" hidden>Show done</button>
<button type="button" class="chip" id="wsb" data-a="ws" aria-pressed="false" data-tip="Only chats in this workspace's repositories, including their other worktrees" hidden>This workspace only</button>
<button type="button" class="ab" id="rf" data-a="refresh" data-tip="Read the chat list again" aria-label="Refresh">Refresh</button>
</div>
<div id="cnt" role="group" aria-label="Chats by band"></div>
<div id="ixs" role="status" hidden><span>Indexing...</span><span>Index still building: list may be incomplete.</span><span class="ixp"><i></i></span><button type="button" class="ab" data-a="retry" aria-label="Retry reading the chat list">Retry</button></div>
<div id="prog" class="sub" role="progressbar" aria-label="Git progress" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="" hidden></div>
<div id="upd" class="sub"></div>
<div id="note" class="sub"></div>
</header>
<main id="body" aria-busy="true"></main>
</div>
<div id="live" class="vh" role="status" aria-live="polite"></div>
<div id="tip" role="tooltip" hidden></div>
<script nonce="${nonce}">${OW_SCRIPT}</script></body></html>`;
}
