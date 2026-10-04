import { CSS } from './webviewCss';
import { SCRIPT } from './webviewJs';

export const NAME = 'Saropa Chat Search';

export function html(): string {
  const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${NAME}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${CSS}</style></head><body>
<div class="top">
<div class="box">
<input type="text" id="q" placeholder="Search chats  (file: edited: cmd: tag:)" autofocus>
<div class="opts">
<button class="opt" id="cs" title="Match Case (Alt+C)">Aa</button>
<button class="opt" id="ww" title="Match Whole Word (Alt+W)"><u>ab</u></button>
<button class="opt" id="re" title="Use Regular Expression (Alt+R)">.*</button>
</div></div>
<div class="sel">
<label>When <select id="when"><option value="any">Any time</option><option value="1h">Last hour</option><option value="2h">Last 2 hours</option><option value="4h">Last 4 hours</option><option value="8h">Last 8 hours</option><option value="today">Today</option></select></label>
<label>Sort <select id="sort"><option value="score">Score</option><option value="time">Time</option><option value="title">Title</option><option value="length">Length</option></select></label>
</div>
<div id="err"></div>
<div id="bar"><i></i></div>
<label class="al"><input type="checkbox" id="all"> All projects</label>
<datalist id="tl"></datalist>
</div>
<div id="status"></div><div id="list"></div><div id="pin"></div><div id="hist"></div>
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
