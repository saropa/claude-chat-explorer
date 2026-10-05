import { randomBytes } from 'crypto';
import { CSS } from './webviewCss';
import { EXPORT_CSS, EXPORT_HTML } from './webviewExport';
import { LAYOUT_CSS } from './webviewLayout';
import { GIT_CSS } from './webviewGit';
import { SCRIPT } from './webviewJs';
import { STATUS_CSS, STATUS_HTML } from './webviewStatus';
import { ARCH_CSS } from './webviewArchive';
import { EXPAND_CSS } from './webviewExpandCss';
import { CAP_CSS } from './webviewCap';
import { ADV_CSS, ADV_HTML } from './webviewAdv';
import { ROWS_CSS } from './webviewRows';
import { TIP_CSS } from './webviewTip';
import { CTX_CSS } from './webviewCtx';
import { TOUCH_CSS } from './webviewTouch';
import { SUM_CSS, SUM_HTML } from './webviewSum';

export const NAME = 'Saropa Chat Explorer';

export function html(): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${NAME}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${CSS}${GIT_CSS}${STATUS_CSS}${EXPORT_CSS}${LAYOUT_CSS}${ARCH_CSS}${CAP_CSS}${ADV_CSS}${EXPAND_CSS}${ROWS_CSS}${TIP_CSS}${CTX_CSS}${TOUCH_CSS}${SUM_CSS}</style></head><body>
<div id="hdr"><div class="top">
<div id="ixb" hidden><div id="ixt"></div><div class="ixp"><i></i></div></div>
<div class="box">
<input type="text" id="q" placeholder="Search chats  (file: edited: cmd: tag: sha: pr: branch:)" aria-label="Search chats" autofocus>
<div class="opts">
<button class="opt" id="cs" title="Match Case (Alt+C)" aria-label="Match Case" aria-pressed="false">Aa</button>
<button class="opt" id="ww" title="Match Whole Word (Alt+W)" aria-label="Match Whole Word" aria-pressed="false"><u>ab</u></button>
<button class="opt" id="any" title="Match words in any order (Alt+O)" aria-label="Match any order" aria-pressed="false"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 4.5h2.5c3 0 4 7 7 7H13M2 11.5h2.5c1 0 1.800-1 2.500-2.200M9 6.700C9.700 5.600 10.400 4.500 11.500 4.500H13M11.500 2.800L13.200 4.500l-1.700 1.700M11.500 9.800l1.700 1.700-1.700 1.700" fill="none" stroke="currentColor" stroke-width="1.300" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<button class="opt" id="re" title="Use Regular Expression (Alt+R)" aria-label="Use Regular Expression" aria-pressed="false">.*</button>
</div></div>
<div id="ah" hidden>Up and Down arrows show previous searches</div>
${ADV_HTML}
<div class="sel">
${STATUS_HTML}${EXPORT_HTML}
</div>
<div id="exn" role="status" aria-live="polite"></div>
<div id="err"></div>
<div id="hint" hidden>Type at least 2 characters</div>
${SUM_HTML}
<div id="bar"><i></i></div>
<datalist id="tl"></datalist>
</div></div>
<div id="res"><div id="cap"></div><div id="status" role="status" aria-live="polite"></div><div id="pin"></div><div id="list"></div><div id="arch"></div></div>
<div id="tip" role="tooltip" hidden></div>
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
