import { randomBytes } from 'crypto';
import { CSS } from './webviewCss';
import { SCRIPT } from './webviewJs';
import { STATUS_CSS, STATUS_HTML } from './webviewStatus';

export const NAME = 'Saropa Chat Search';

export function html(): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${NAME}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${CSS}${STATUS_CSS}</style></head><body>
<div class="top">
<div id="ixb" hidden><div id="ixt"></div><div class="ixp"><i></i></div></div>
<div class="box">
<input type="text" id="q" placeholder="Search chats  (file: edited: cmd: tag:)" aria-label="Search chats" autofocus>
<div class="opts">
<button class="opt" id="cs" title="Match Case (Alt+C)" aria-label="Match Case" aria-pressed="false">Aa</button>
<button class="opt" id="ww" title="Match Whole Word (Alt+W)" aria-label="Match Whole Word" aria-pressed="false"><u>ab</u></button>
<button class="opt" id="re" title="Use Regular Expression (Alt+R)" aria-label="Use Regular Expression" aria-pressed="false">.*</button>
</div></div>
<div class="sel">
<label>When <select id="when"><option value="any">Any time</option><option value="1h">Last hour</option><option value="2h">Last 2 hours</option><option value="4h">Last 4 hours</option><option value="8h">Last 8 hours</option><option value="today">Today</option></select></label>
<label>Sort <select id="sort"><option value="score">Score</option><option value="time">Time</option><option value="title">Title</option><option value="length">Length</option></select></label>
${STATUS_HTML}
</div>
<div id="err"></div>
<div id="bar"><i></i></div>
<div class="alr"><label class="al"><input type="checkbox" id="all"> All projects</label><label class="al"><input type="checkbox" id="subs" checked> Include subagents</label></div>
<datalist id="tl"></datalist>
</div>
<div id="status" role="status" aria-live="polite"></div><div id="list"></div><div id="pin"></div><div id="hist"></div>
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
