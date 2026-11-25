import { randomBytes } from 'crypto';
import { CSS } from './webviewCss';
import { SORT_CSS } from './webviewSort';
import { LAYOUT_CSS } from './webviewLayout';
import { GIT_CSS } from './webviewGit';
import { SCRIPT } from './webviewJs';
import { STATUS_CSS } from './webviewStatus';
import { ARCH_CSS } from './webviewArchive';
import { EXPAND_CSS } from './webviewExpandCss';
import { CAP_CSS } from './webviewCap';
import { ADV_CSS, ADV_HTML } from './webviewAdv';
import { ROWS_CSS } from './webviewRows';
import { TIP_CSS } from './webviewTip';
import { POP_CSS } from './webviewPop';
import { CTX_CSS } from './webviewCtx';
import { TOUCH_CSS } from './webviewTouch';
import { SUM_CSS, SUM_HTML } from './webviewSum';
import { ACCT_CSS, ACCT_HTML } from './webviewAcct';
import { WEB_BODY, WEB_CSS, WEB_HTML } from './webviewWeb';
import { ACT_CSS, ACT_HTML, actScript } from './webviewActivity';
import { DIGEST_CSS } from './webviewDigest';

export const NAME = 'Saropa Chats';

/** `fadeMs`: how long an Activity flash fades (setting `activity.fadeMs`). */
export function html(fadeMs = 4000): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${NAME}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${CSS}${GIT_CSS}${STATUS_CSS}${SORT_CSS}${LAYOUT_CSS}${ARCH_CSS}${CAP_CSS}${ADV_CSS}${EXPAND_CSS}${ROWS_CSS}${TIP_CSS}${POP_CSS}${CTX_CSS}${TOUCH_CSS}${SUM_CSS}${WEB_CSS}${ACCT_CSS}${ACT_CSS}${DIGEST_CSS}</style></head><body>
<div id="hdr"><div class="top">
${ACCT_HTML}
${WEB_HTML}
</div></div>
<div id="sb"><div id="ixb" hidden><div id="ixt"></div><div class="ixp"><i></i></div></div><div id="bar"><i></i></div><div id="cap"></div><div id="dgw" role="status" hidden></div><div id="status" role="status" aria-live="polite"></div></div>
<div id="sm"><button type="button" id="smh" aria-expanded="true" aria-controls="smb" title="Collapse or expand the Session Manager"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Session Manager</button><div id="smb">
<div class="top prow"><button type="button" id="ns" class="pbtn" title="Start a new Claude Code session" aria-label="New session"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>New session</button><button type="button" id="cu" class="pbtn" title="Archive all sessions except the open and pinned ones" aria-label="Clean up sessions"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 4h12M6 4V2.5h4V4M4 4l.7 9h6.6L12 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Clean up</button></div>
<div class="top">
<div class="srow"><div class="box">
<input type="text" id="q" placeholder="Search" aria-label="Search sessions" title="Search the text of your sessions" autofocus>
<button type="button" class="clr" id="qx" title="Clear search" aria-label="Clear search"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/></svg></button>
<div class="opts">
<button class="opt" id="cs" title="Match Case (Alt+C)" aria-label="Match Case" aria-pressed="false">Aa</button>
<button class="opt" id="ww" title="Match Whole Word (Alt+W)" aria-label="Match Whole Word" aria-pressed="false"><u>ab</u></button>
<button class="opt" id="any" title="Match words in any order (Alt+O)" aria-label="Match any order" aria-pressed="false"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 4.5h2.5c3 0 4 7 7 7H13M2 11.5h2.5c1 0 1.800-1 2.500-2.200M9 6.700C9.700 5.600 10.400 4.500 11.500 4.500H13M11.500 2.800L13.200 4.500l-1.700 1.700M11.500 9.800l1.700 1.700-1.700 1.700" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<button class="opt" id="re" title="Use Regular Expression (Alt+R)" aria-label="Use Regular Expression" aria-pressed="false">.*</button>
</div></div>
</div>
<div id="ah" hidden title="Press Up or Down in the empty search box to recall previous searches">Up and Down arrows show previous searches</div>
${ADV_HTML}
<div id="err"></div>
<div id="hint" hidden>Type at least 2 characters</div>
${SUM_HTML}
<datalist id="tl"></datalist>
</div>
<div id="frow"></div>
<div id="res"><div id="pin"></div><div id="list"></div><div id="arch"></div></div>
</div></div>
${ACT_HTML}
${WEB_BODY}
<div id="tip" role="tooltip" hidden></div>
<div id="ctxp" class="pop tipc" role="dialog" aria-labelledby="ctxh" tabindex="-1" hidden></div>
<script nonce="${nonce}">${SCRIPT}</script>
<script nonce="${nonce}">${actScript(fadeMs)}</script></body></html>`;
}
