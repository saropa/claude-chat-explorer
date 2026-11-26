/** Page of the Activity view: an SVG network, Claude in the center and eight groups around it. */
import { randomBytes } from 'crypto';
import { ICONS } from './activityIcons';
import { Group } from './activityMap';

const NODES: { g: Group; name: string; icon: string }[] = [
  { g: 'chat', name: 'Chat', icon: 'comment-discussion' }, { g: 'memory', name: 'Memory', icon: 'book' },
  { g: 'files', name: 'Files', icon: 'files' }, { g: 'terminal', name: 'Terminal', icon: 'terminal' },
  { g: 'web', name: 'Web', icon: 'globe' }, { g: 'agents', name: 'Agents', icon: 'hubot' },
  { g: 'connect', name: 'Connect', icon: 'plug' }, { g: 'control', name: 'Control', icon: 'settings-gear' },
];
const C = 100, R = 68, NR = 15, CR = 28, ICON = 16; // view box center, ring radius, node radius, core radius, icon size (Codicons are drawn at 16, so they stay crisp); lines run edge to edge

const icon = (name: string, cx: number, cy: number, size: number): string => {
  const i = ICONS[name];
  return `<svg class="ic" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" viewBox="0 0 ${i.size} ${i.size}" fill="currentColor">${i.body}</svg>`;
};

/** Connector between two nodes: an arc of the ring circle (radius R), the shorter way round (clockwise for opposite nodes), trimmed to the node edges. It never gets nearer the core than R. */
export function connectorPath(i: number, j: number): string {
  const lo = Math.min(i, j), hi = Math.max(i, j), d = hi - lo, cw = d <= 4;
  const start = cw ? lo : hi, span = cw ? d : 8 - d, trim = 2 * Math.asin(NR / (2 * R)) + 0.02;
  const a0 = -Math.PI / 2 + (start * Math.PI) / 4 + trim, a1 = -Math.PI / 2 + ((start + span) * Math.PI) / 4 - trim;
  const pt = (a: number): string => `${(C + R * Math.cos(a)).toFixed(1)} ${(C + R * Math.sin(a)).toFixed(1)}`;
  return `M${pt(a0)} A${R} ${R} 0 0 1 ${pt(a1)}`;
}

/** One hidden connector per pair of groups, keyed by the two group names in alphabetical order. */
function connectorsSvg(): string {
  const out: string[] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      out.push(`<path class="cn" data-c="${[NODES[i].g, NODES[j].g].sort().join('-')}" d="${connectorPath(i, j)}"/>`);
    }
  }
  return out.join('');
}

/** The diagram markup: per group a `<g data-g>` holding its line, node circle, icon and label. The view box is centered on the core so the layout is symmetric. */
export function diagramSvg(): string {
  const groups = NODES.map((n, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a), x = C + R * c, y = C + R * s, ly = y + (s < -0.3 ? -1 : 1) * (NR + 6) + (Math.abs(c) > 0.9 ? 2 : 0); // label above the node in the top half, below it elsewhere: no side labels, so the width never depends on label length
    return `<g class="grp" data-g="${n.g}"><line class="ln" x1="${(C + (R - NR) * c).toFixed(1)}" y1="${(C + (R - NR) * s).toFixed(1)}" x2="${(C + CR * c).toFixed(1)}" y2="${(C + CR * s).toFixed(1)}"/>`
      + `<circle class="bk" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NR}"/><circle class="br" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NR + 3}"/><circle class="nd" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NR}"/><circle class="sh" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NR}"/>${icon(n.icon, x, y, ICON)}`
      + `<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${n.name}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Claude activity: Chat, Memory, Files, Terminal, Web, Agents, Connect and Control"><defs><radialGradient id="sheen" cx=".3" cy=".25" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></radialGradient></defs>${connectorsSvg()}${groups}`
    + `<g class="grp" data-g="think"><circle class="rp" cx="${C}" cy="${C}" r="${CR}"/><circle class="core" cx="${C}" cy="${C}" r="${CR}"/><circle class="sh" cx="${C}" cy="${C}" r="${CR}"/>${icon('lightbulb', C, C - 6, 14)}<text x="${C}" y="${C + 8}" text-anchor="middle">Claude</text></g></svg>`;
}

/** Kinds of background task shown as pills: icon only (the tooltip names it), each hidden until a task of that kind runs. */
const PILLS: { k: string; icon: string; label: string }[] = [{ k: 'shell', icon: 'terminal', label: 'Background shell' }, { k: 'agent', icon: 'hubot', label: 'Background agent' }];

/** The pill row under the diagram. Pills glow while their task runs, so a long quiet stretch does not read as a locked-up diagram. */
export function pillsHtml(): string {
  return '<div id="bg">' + PILLS.map((p) => `<span class="pill" data-k="${p.k}" title="${p.label}" data-l="${p.label}" hidden>${icon(p.icon, 8, 8, 12)}<b></b><i class="tm"></i></span>`).join('') + '</div>';
}

/**
 * The caption row: the aria-live text and, beside it, the open button of the click-to-focus hint (hidden until the host offers it).
 * The button is outside the live region so screen readers announce the text as status and the button as a control; its glyph (a plain arrow, not the emoji-class ↗, which the no-emoji page check rejects) is
 * decorative (aria-hidden), the accessible name comes from the host's translated label.
 */
export function captionHtml(): string {
  return '<div id="caprow"><div id="cap" aria-live="polite"></div><button type="button" id="capgo" hidden aria-disabled="true"><span aria-hidden="true">→</span></button></div>';
}

const HOT = 'var(--hl)'; // the flash color: the link color, or the error color on a group marked .err
const CSS = `
:root{--hl:var(--vscode-textLink-foreground);}
.err{--hl:var(--vscode-editorError-foreground,var(--vscode-errorForeground));}
body{margin:0;padding:8px;background:var(--vscode-sideBar-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family);}
svg{display:block;width:100%;max-width:300px;height:auto;margin:0 auto;overflow:visible;}
text{paint-order:stroke;stroke:var(--vscode-sideBar-background,var(--vscode-editor-background));stroke-width:3px;stroke-opacity:.7;stroke-linejoin:round;fill:currentColor;font-size:8px;letter-spacing:.2px;dominant-baseline:central;fill-opacity:.6;}
.grp[data-g="think"] text{stroke:none;}
.ln{stroke:currentColor;stroke-opacity:.22;stroke-width:1;}
.bk{fill:var(--vscode-sideBar-background,var(--vscode-editor-background));}
.sh{fill:url(#sheen);stroke:none;pointer-events:none;}
#sheen stop:nth-child(1){stop-opacity:.07;}#sheen stop:nth-child(2){stop-opacity:.02;}#sheen stop:nth-child(3){stop-opacity:0;}
.vscode-light #sheen stop:nth-child(1){stop-opacity:.3;}.vscode-light #sheen stop:nth-child(2){stop-opacity:.1;}
.hot .sh,.hold .sh{opacity:0;}
.sb.hot .ln{animation:none;stroke:currentColor;stroke-opacity:.22;stroke-width:1;}
.vscode-high-contrast .sb.hot .ln,.vscode-high-contrast-light .sb.hot .ln{stroke-opacity:.6;}
.vscode-high-contrast .sh,.vscode-high-contrast-light .sh{display:none;}
.cn{fill:none;stroke:currentColor;stroke-opacity:0;stroke-width:1;}
.nd,.core{fill:currentColor;fill-opacity:.06;stroke:currentColor;stroke-opacity:.35;stroke-width:1;}
.ic{opacity:.85;}
.core~.ic{opacity:1;}
.core~text{fill-opacity:.75;}
.vscode-high-contrast .ln,.vscode-high-contrast-light .ln{stroke-opacity:.6;}
.vscode-high-contrast .nd,.vscode-high-contrast .core,.vscode-high-contrast-light .nd,.vscode-high-contrast-light .core{stroke-opacity:1;fill:none;}
.vscode-high-contrast .ic,.vscode-high-contrast-light .ic{opacity:1;}
.vscode-high-contrast text,.vscode-high-contrast-light text{fill-opacity:1;}
.hot{animation:glow var(--fade) cubic-bezier(.4,.5,.7,1);}
.hot .ln{animation:ln var(--fade) cubic-bezier(.4,.5,.7,1);}
.cn.hot{animation:cn var(--fade) cubic-bezier(.4,.5,.7,1);}
.err .nd,.err .core{stroke-dasharray:3 2;}
.br,.rp{fill:none;stroke:var(--hl);stroke-width:1.5;stroke-opacity:0;pointer-events:none;}
.busy .br{animation:breathe 3s ease-in-out infinite;}
.wait .nd,.wait .core{stroke:var(--hl);stroke-opacity:.7;}
.rip .rp{animation:rip 1.8s ease-out;transform-box:fill-box;transform-origin:center;}
.vscode-high-contrast .wait .nd,.vscode-high-contrast .wait .core,.vscode-high-contrast-light .wait .nd,.vscode-high-contrast-light .wait .core{stroke:var(--hl);stroke-opacity:1;stroke-width:2;}
#bg{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:6px auto 0;min-height:20px;}
.pill{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:10px;font-size:11px;border:1px solid var(--hl);color:var(--hl);background:color-mix(in srgb,var(--hl) 12%,transparent);animation:pill 2s ease-in-out infinite;}
.pill[hidden]{display:none;}
.pill .ic{position:static;width:12px;height:12px;opacity:1;}
.pill b{font-weight:normal;}
.pill .tm{font-style:normal;font-variant-numeric:tabular-nums;opacity:.8;}
.pill .tm:empty{display:none;}
@keyframes pill{0%,100%{box-shadow:0 0 0 0 transparent;opacity:.75;}50%{box-shadow:0 0 6px 1px var(--hl);opacity:1;}}
#caprow{display:flex;justify-content:center;align-items:center;gap:2px;max-width:300px;margin:6px auto 0;}
#cap{min-width:0;max-width:100%;height:1.4em;line-height:1.4em;margin:0;font-size:11px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.8;}
#cap.go{cursor:pointer;color:var(--vscode-textLink-foreground);opacity:1;}
#cap.go:hover{text-decoration:underline;}
#cap.bad{color:var(--vscode-errorForeground);opacity:1;}
#capgo{flex:none;padding:0 4px;margin:0;border:0;border-radius:2px;background:none;font:inherit;font-size:11px;line-height:1.4em;color:var(--vscode-textLink-foreground);cursor:pointer;}
#capgo[hidden]{display:none;}
#capgo[aria-disabled=true]{cursor:default;opacity:.5;}
#capgo:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px;}
.hold{filter:drop-shadow(0 0 4px ${HOT});}
.hold .core{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.4;}
.hold .ic{color:${HOT};opacity:1;}
.hold text{fill:${HOT};fill-opacity:1;}
.hot .nd,.hot .core{animation:nd var(--fade) cubic-bezier(.4,.5,.7,1);}
.hot .ic{animation:ic var(--fade) cubic-bezier(.4,.5,.7,1);}
.hot text{animation:tx var(--fade) cubic-bezier(.4,.5,.7,1);}
@keyframes breathe{0%,100%{stroke-opacity:.12;}50%{stroke-opacity:.5;}}
@keyframes rip{from{stroke-opacity:.6;transform:scale(1);}to{stroke-opacity:0;transform:scale(2.2);}}
@keyframes glow{from{filter:drop-shadow(0 0 4px ${HOT});}to{filter:drop-shadow(0 0 0 transparent);}}
@keyframes ln{from{stroke:${HOT};stroke-opacity:1;stroke-width:2;}}
@keyframes nd{from{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.4;}}
@keyframes cn{from{stroke:${HOT};stroke-opacity:1;stroke-width:2;}to{stroke-opacity:0;}}
@keyframes ic{from{color:${HOT};opacity:1;}}
@keyframes tx{from{fill:${HOT};fill-opacity:1;}}
@media (prefers-reduced-motion:reduce){
.busy .br,.rip .rp,.pill{animation:none;}
.busy .br{stroke-opacity:.4;}
.vscode-high-contrast .busy .br,.vscode-high-contrast-light .busy .br{stroke-opacity:1;}
.hot,.cn.hot,.hot .ln,.hot .nd,.hot .core,.hot .ic,.hot text{animation:none;}
.hot{filter:drop-shadow(0 0 3px ${HOT});}
.hot .ln,.cn.hot{stroke:${HOT};stroke-opacity:1;stroke-width:2;}
.hot .nd,.hot .core{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.4;}
.hot .ic{color:${HOT};opacity:1;}
.hot text{fill:${HOT};fill-opacity:1;}
.sb.hot .ln{stroke:currentColor;stroke-opacity:.22;stroke-width:1;}
.vscode-high-contrast .sb.hot .ln,.vscode-high-contrast-light .sb.hot .ln{stroke-opacity:.6;}}`;

// A flash restarts the animation; with reduced motion the bright state is simply held for 600 ms. Moving from one group to another within a turn (until your next message) flashes the connector between them, however long the tool took.
// A thinking flash with nothing else lit holds the center bright until the next group flash or 10 s, then fades as usual.
const SCRIPT = `
let fade = __FADE__;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const timers = new Map();
const pend = new Map(); // tool calls in flight: id -> { g, t }, t being the 10 minute safety timeout
const core = document.querySelector('.grp[data-g="think"]');
const cap = document.getElementById('cap');
const capGo = document.getElementById('capgo'); // the open button beside the caption (hidden unless the idle text names other working chats)
const grp = (g) => document.querySelector('.grp[data-g="' + g + '"]');
const lastOf = new Map(); // chat key -> group of its last flash, so the connector joins one chat's own consecutive groups (all-chats mode interleaves several)
let capText = '', capAt = 0, capTimer = 0;
let idleText = '', liveText = ''; // idleText: host-sent description of the followed chat; liveText: the last caption from real events
// idleGo: the click label of the idle caption, sent only while the caption has a target ('' keeps it plain text); idleLooking: what a click shows at once;
// idleKind: which chat the click opens ('self' or 'other'), sent back to the host so it opens what the label promised.
let idleGo = '', idleLooking = '', idleKind = '', capErr = false, noteTimer = 0;
// hostDrivesCore: some idle message carried the dot-based fields, so the core's waiting outline follows the dot ALONE. The log's end-of-turn
// event is not a real wait (the dot goes idle or unread there), and the two sources race (idle is sent before the tail events in a poll, and
// after a chat switch the reset and idle are followed by the old tail), so letting both draw it left the outline stuck or flickering.
// Not cleared by reset: it describes the host, not the chat. false = an older host: the event-driven outline stays as it was.
let hostDrivesCore = false;
let capPending = false; // a click was sent and its outcome is still on screen: further clicks are ignored, so one click posts once
// How the caption reaches the host. null here (the standalone and browser pages have no host to ask, and never get 'idle' anyway);
// activitySection swaps in the list page's VS Code API, so the caption can only become clickable inside the sidebar section.
const toHost = null;
// Background tasks: a glowing pill per running kind (shell, agent), with a count when there are several. They are separate from the flashes, which only mark calls as they happen.
// In the all-chats mode each chat has its own pills in its own colour; otherwise everything is under the one key ''.
const bgBy = new Map(); // chat key -> { shell, agent, shellAt, agentAt, col }
function pills(m) {
  const key = m.ch || '', shell = Number(m.shell) || 0, agent = Number(m.agent) || 0;
  if (shell || agent) { bgBy.set(key, { shell, agent, shellAt: Number(m.shellAt) || 0, agentAt: Number(m.agentAt) || 0, col: m.col || '' }); } else { bgBy.delete(key); }
  drawPills();
}
// The pills in the markup are hidden templates; the visible ones are clones, rebuilt from bgBy on every change (a handful at most).
function drawPills() {
  const bar = document.getElementById('bg');
  bar.querySelectorAll('.pill.live').forEach((p) => p.remove());
  for (const b of bgBy.values()) {
    for (const k of ['shell', 'agent']) {
      const n = b[k], t = bar.querySelector('.pill[data-k="' + k + '"]:not(.live)');
      if (!n || !t) { continue; }
      const p = t.cloneNode(true);
      p.classList.add('live'); p.hidden = false;
      p.querySelector('b').textContent = n > 1 ? String(n) : '';
      p.title = t.dataset.l + (n > 1 ? 's: ' + n : '');
      p.dataset.at = String(b[k + 'At'] || 0); // earliest launch of this kind, for the timer; 0 = unknown, no timer
      p.dataset.ch = key; // the chat it belongs to, so the browser view can reveal it on a click
      if (b.col) { p.style.setProperty('--hl', b.col); }
      bar.appendChild(p);
    }
  }
  tick();
  // The timer needs a tick only while a pill is shown, so an idle page runs no interval.
  if (bar.querySelector('.pill.live')) { if (!tickTimer) { tickTimer = setInterval(tick, 1000); } } else { clearInterval(tickTimer); tickTimer = 0; }
}
let tickTimer = 0;
// Elapsed time of a background task as 45s, 4m 12s or 1h 5m. The launch time is the log's clock and this is the page's clock; they are the same machine except in a remote window, where a skew only shifts the number, and a negative value is shown as 0s.
function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? h + 'h ' + m + 'm' : m ? m + 'm ' + (s % 60) + 's' : s + 's';
}
function tick() {
  document.querySelectorAll('.pill.live').forEach((p) => {
    const at = Number(p.dataset.at), tm = p.querySelector('.tm');
    tm.textContent = at > 0 ? elapsed(Date.now() - at) : '';
  });
}
// col: the chat's colour in the all-chats mode. It is set per element (CSSOM, which the page's CSP allows) and dropped for an error, so the error color still wins.
function pulse(el, key, err, col) {
  if (col && !err) { el.style.setProperty('--hl', col); } else { el.style.removeProperty('--hl'); }
  el.classList.remove('hot', 'hold', 'err', 'sb');
  void el.getBoundingClientRect();
  el.classList.add('hot');
  if (err) { el.classList.add('err'); }
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => el.classList.remove('hot', 'err'), calm.matches ? 600 : fade));
}
// The caption shows the newest text, at most twice a second. fromNote: the text is a click outcome (capNote), which keeps its timer.
function caption(text, fromNote) {
  // An empty live caption falls back to the idle text (which chat is followed and its state); a live caption always wins over it.
  capText = text || idleText;
  liveText = text;
  capErr = false; // any new caption ends a shown error outcome
  // Any other caption replaces a click outcome for good: its 4 s fallback timer must not later wipe this caption, and the click is over.
  if (!fromNote) { clearTimeout(noteTimer); noteTimer = 0; capPending = false; }
  // One paint per throttle window: a pending paint picks up the newest text when it runs.
  if (!capTimer) { capTimer = setTimeout(paint, Math.max(0, 500 - (Date.now() - capAt))); }
}
// Live events that end a spell of activity (end of the last call, wait, wake) fall back to the idle text, except while a click outcome
// is on screen: wiping "Opening <title>…" a moment after the click would leave the user without its result. The outcome's timer falls back later.
function settleCaption() { if (!noteTimer) { caption(''); } }
// Draws the pending caption and the open button beside it.
function paint() {
  capTimer = 0; capAt = Date.now(); cap.textContent = capText;
  cap.classList.toggle('bad', capErr);
  drawGo();
}
// The open button lives outside the aria-live caption (a live region that is also a button is announced badly) and is a real <button>,
// so Enter and Space work natively. It shows while the idle text has a click target (the followed chat or other working chats), and stays shown but aria-disabled while its
// click is in flight, so keyboard focus is not dropped to the page body. The caption text is also clickable with the mouse while enabled.
function drawGo() {
  // Pages without the button (none today) or without a host (standalone, browser view) never offer it.
  if (!capGo || !toHost) { return; }
  const show = !!(idleGo && (capPending || (!liveText && capText)));
  const on = show && !capPending && !liveText; // enabled only over the idle text itself, never over a live caption or an outcome
  capGo.hidden = !show;
  capGo.setAttribute('aria-disabled', on ? 'false' : 'true');
  capGo.title = idleGo; capGo.setAttribute('aria-label', idleGo);
  cap.classList.toggle('go', on);
}
// A one-off outcome of a click (finding, opening <title>, could not open <title>): held like a live caption, then the idle text returns
// after 4 s unless something newer replaced it. The chat switch that a successful open causes resets the page earlier.
function capNote(text, err) { // not "note": the browser page shell already has a const note (its status line) in the same scope
  caption(String(text || ''), true);
  capErr = !!err;
  clearTimeout(noteTimer);
  const shown = liveText;
  // The fallback clears only its own text: a newer caption has already cleared this timer (see caption), this guard is the backstop.
  noteTimer = setTimeout(() => { noteTimer = 0; if (liveText === shown) { caption(''); } }, 4000);
}
// A click on the open button (Enter / Space arrive as a click) or on the enabled caption text: show at once that it was heard, then let
// the host pick and open the busiest other chat.
function goOther() {
  // Not enabled (plain text, a live caption) or a click already in flight: nothing to do, so a double click posts once.
  if (!toHost || !cap.classList.contains('go') || capPending) { return; }
  // Disabled synchronously, before the throttled paint: a second click inside the 500 ms window must already see it.
  capPending = true; cap.classList.remove('go'); if (capGo) { capGo.setAttribute('aria-disabled', 'true'); }
  capNote(idleLooking);
  toHost({ type: 'actFocusOther', kind: idleKind }); // the host opens this kind, not whatever the dots say by now
}
// Listeners, not inline handlers: the page's CSP forbids inline script. Wired only where a host exists.
if (cap && toHost) {
  cap.addEventListener('click', goOther); // mouse convenience on the text itself
  if (capGo) { capGo.addEventListener('click', goOther); } // the focusable control
}
function endCall(id) {
  const p = pend.get(id);
  if (!p) { return; }
  clearTimeout(p.t); pend.delete(id);
  grp(p.g).classList.toggle('busy', [...pend.values()].some((q) => q.g === p.g));}
function startCall(id, g) {
  endCall(id);
  pend.set(id, { g, t: setTimeout(() => endCall(id), 600000) });
  grp(g).classList.add('busy');
}
// A chat switch clears every held state, the pending calls and the caption.
function reset(keepPills) {
  for (const p of pend.values()) { clearTimeout(p.t); }
  pend.clear();
  document.querySelectorAll('.busy, .wait, .rip, .err').forEach((el) => el.classList.remove('busy', 'wait', 'rip', 'err'));
  // Pills are cleared with the chat in the single-chat mode (the feed re-reports the new chat's tasks); the all-chats mode keeps them, since they belong to every chat.
  if (!keepPills) { bgBy.clear(); drawPills(); }
  clearTimeout(capTimer); capTimer = 0; capAt = 0; cap.textContent = ''; idleText = ''; liveText = ''; capText = ''; lastOf.clear(); // the idle text belonged to the old chat; the host sends the new one
  // The click state belonged to the old chat's caption too: back to plain text until the host sends the new chat's idle message.
  clearTimeout(noteTimer); noteTimer = 0; idleGo = ''; idleLooking = ''; idleKind = ''; capErr = false; capPending = false;
  cap.classList.remove('go', 'bad');
  if (capGo) { capGo.hidden = true; capGo.setAttribute('aria-disabled', 'true'); } // the old chat's button goes with its caption
}
// Waiting for you: one ripple from the core (none with reduced motion), then a quiet outline until the next message.
// ripT: the timer that ends the ripple. Bug fixed: it was never cancelled, so a second ripple started within 2 s of the first (the dot going
// waiting, not waiting, waiting again) was cut short by the first one's timer. A new ripple and setCore(false) now clear it first.
let ripT = 0;
function wait(g) {
  const el = grp(g);
  el.classList.add('wait');
  if (g === 'think') { clearTimeout(ripT); el.classList.remove('rip'); void el.getBoundingClientRect(); el.classList.add('rip'); ripT = setTimeout(() => el.classList.remove('rip'), 2000); }
}
// The core's outline from the dot: turning on (false to true) gives the one ripple of wait() (the CSS skips it with reduced motion); staying
// on changes nothing, so a repeated idle message does not ripple again; off clears the outline and any ripple still running.
function setCore(on) {
  if (on) { if (!core.classList.contains('wait')) { wait('think'); } } else { clearTimeout(ripT); core.classList.remove('wait', 'rip'); }
}
function flash(g, err, ch, col, cur) {
  const el = grp(g), key = ch || '', last = lastOf.get(key) || '';
  if (!el) { return; }
  // Only the current chat's work ends its own waiting state: another chat flashing says nothing about whether this one is still waiting for you.
  // Bug fixed: once the dot drives the core outline (hostDrivesCore), only setCore may touch it. The host sends idle waiting true and then the
  // tail events in the same poll, and the idle message is not re-sent while unchanged, so this clear wiped a real permission wait for good.
  if (cur !== false && !hostDrivesCore) { core.classList.remove('wait', 'rip'); }
  if (g === 'think' && !err) {
    if (document.querySelector('.grp.hot:not([data-g="think"]), .cn.hot')) { pulse(el, g, false, col); return; }
    el.classList.remove('hot', 'err');
    if (col) { el.style.setProperty('--hl', col); } else { el.style.removeProperty('--hl'); }
    el.classList.add('hold');
    clearTimeout(timers.get(g));
    timers.set(g, setTimeout(() => pulse(el, g, false, col), 10000));
    return;
  }
  if (core.classList.contains('hold')) { pulse(core, 'think', false, col); }
  if (g !== 'think' && last && last !== g) {
    const cn = document.querySelector('.cn[data-c="' + [last, g].sort().join('-') + '"]');
    if (cn) { pulse(cn, 'c:' + cn.dataset.c, false, col); }
  }
  if (g !== 'think') { lastOf.set(key, g); }
  pulse(el, g, err, col);
}
// A sub-agent's work: the Agents node lights, then a connector to the node it used and that node. The main chain (last) and the waiting state are left alone.
function sub(g, col) {
  const ag = grp('agents'), el = grp(g);
  if (!ag || !el) { return; }
  pulse(ag, 'agents', false, col); ag.classList.add('sb'); // sb: the spoke to the center stays at rest, so this does not read as Claude's own work
  if (g === 'agents') { return; }
  const cn = document.querySelector('.cn[data-c="' + ['agents', g].sort().join('-') + '"]');
  if (cn) { pulse(cn, 'c:' + cn.dataset.c, false, col); }
  pulse(el, g, false, col); el.classList.add('sb');
}
addEventListener('message', (e) => {
  const m = e.data;
  if (m && m.type === 'reset') { reset(m.keepPills === true); return; }
  // idle: the host's description of the followed chat. Shown only while no live caption is up; an absent message (browser view) leaves the caption as before.
  // go / looking / kind: the click label, click-time text and target kind, present only while the caption has a target (the host leaves them '' otherwise).
  // A missing kind (an older host) reads as 'other', the only click it offered.
  if (m && m.type === 'idle') { idleText = String(m.text || ''); idleGo = String(m.go || ''); idleLooking = String(m.looking || ''); idleKind = m.kind === 'self' ? 'self' : 'other';
    // The core's outline is the dot's: on while it is 'waiting' (a permission or a question), off otherwise. A host that sends the dot-based
    // fields is recognised by waiting (a boolean) or kind (a string, sent in every message). waiting is missing for a chat with no dot: that
    // reads as not waiting (no outline), because without a dot nothing says the chat needs the user. The Chat node's outline (a question
    // from the log) is deliberately left alone: it clears with its own result or the next message.
    if (typeof m.waiting === 'boolean' || typeof m.kind === 'string') { hostDrivesCore = true; }
    if (hostDrivesCore) { setCore(m.waiting === true); }
    if (!liveText) { caption(''); } return; }
  // note: the host's outcome of a click on the caption (opening <title>, nothing working, could not open).
  if (m && m.type === 'note') { capNote(m.text, m.err === true); return; }
  if (m && m.type === 'fade' && Number.isFinite(m.ms)) { fade = m.ms; document.documentElement.style.setProperty('--fade', m.ms + 'ms'); return; }
  if (!m || m.type !== 'events' || !Array.isArray(m.events)) { return; }
  for (const v of m.events) {
    if (v.t === 'flash') { flash(v.g, v.err, v.ch, v.col, v.cur); }
    else if (v.t === 'sub') { sub(v.g, v.col); }
    else if (v.t === 'caption') { caption(String(v.text)); }
    else if (v.t === 'busy' && grp(v.g)) { startCall(v.id, v.g); }
    else if (v.t === 'end') { endCall(v.id); if (v.g === 'chat') { grp('chat').classList.remove('wait'); } if (!pend.size) { settleCaption(); } }
    else if (v.t === 'wait' && grp(v.g)) {
      // The end-of-turn wait (g think) is not drawn once the host drives the core outline from the dot (see hostDrivesCore); it still settles the
      // caption and drops the unanswered calls below. The Chat node's question wait (g chat) is always drawn.
      if (!(v.g === 'think' && hostDrivesCore)) { wait(v.g); }
      // End of the turn (g 'think'): every call of this turn is over, so a call that never got its result (a dropped tool_result, an
      // interrupted run) would keep pend non-empty and its caption ("Running: tests") on screen forever, hiding the idle caption and its
      // click button. Drop the pending calls. A question to the user (g 'chat') is mid-turn, so there the in-flight calls stay.
      // Safe for sub-agents: pend holds only the main chat's own tool_use ids (busy events); sub-agent log lines produce 'sub' events only
      // (subEventsOf never emits busy or wait), and in the all-chats mode another chat's wait never reaches the page (tagEvents drops it).
      if (v.g === 'think') { for (const p of pend.values()) { clearTimeout(p.t); } pend.clear(); document.querySelectorAll('.busy').forEach((el) => el.classList.remove('busy')); }
      // The chat now waits for the user: the last live caption is stale and would hide the idle text, so drop it, but only once no call is
      // in flight (a question's sibling call keeps its caption) and no click outcome is showing.
      if (!pend.size) { settleCaption(); }
    }
    else if (v.t === 'wake') { lastOf.delete(v.ch || ''); document.querySelectorAll('.wait').forEach((el) => {
      // Same rule as flash: with the dot in charge of the core outline, a new user message does not clear it (the dot leaving waiting does).
      // The Chat node's question outline still clears here, as before.
      if (!(hostDrivesCore && el === core)) { el.classList.remove('wait', 'rip'); }
    }); settleCaption(); }
    // bg: the core breathes only for background tasks (no tool call is ever attributed to it)
    else if (v.t === 'bg') { pills(v); }
  }
});`;

/**
 * The diagram as a section of the session list page (the Activity pane no longer exists). It lives in a shadow root so its generic
 * selectors (svg, text, .ic, #cap, .hot ...) cannot clash with the page's own styles, and so the page's CSS cannot reach it.
 * The standalone CSS and script above stay the single source: they are rewritten here for the shadow root instead of being copied.
 */
export function activitySection(fadeMs: number): { css: string; script: string; hostId: string } {
  const css = CSS
    .replace(':root{', ':host{') // custom properties on the host element, inherited by the diagram
    .replace('body{', ':host{display:block;') // the page background and padding of the old standalone page now style the host
    // Theme classes sit on the page's body, outside the shadow root, so they are matched through the host's ancestors.
    .replace(/\.(vscode-[a-z-]+) /g, ':host-context(.$1) ');
  // The shadow root stands in for `document`, and the host element for `document.documentElement` (where --fade is kept).
  // Messages for this section are wrapped as { type: 'act', m: <original message> } so they cannot collide with the list page's own message types.
  const script = SCRIPT.replace('__FADE__', String(fadeMs))
    .replace(/document\.(querySelector|querySelectorAll|getElementById)\(/g, 'root.$1(')
    .replace('document.documentElement.style', 'host.style')
    .replace('const m = e.data;', 'const m = e.data && e.data.type === "act" ? e.data.m : null;')
    // The list page's script defines `vs` (its VS Code API) in the shared global scope; the guard keeps the section working without it.
    .replace('const toHost = null;', 'const toHost = typeof vs !== "undefined" ? (x) => vs.postMessage(x) : null;');
  return { css, script, hostId: 'actd' };
}

/** `fadeMs`: how long a flash takes to fade (setting `activity.fadeMs`), used by the CSS animations and the timers that end a flash. */
export function activityHtml(fadeMs = 4000): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Activity</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">:root{--fade:${fadeMs}ms;}${CSS}</style></head><body>${diagramSvg()}${pillsHtml()}${captionHtml()}<script nonce="${nonce}">${SCRIPT.replace('__FADE__', String(fadeMs))}</script></body></html>`;
}

/**
 * Stand-ins for the VS Code theme variables the diagram CSS reads, which do not exist in a browser. Defined once here (dark by default, light
 * through prefers-color-scheme) so the diagram CSS stays the single source and needs no browser-specific copy.
 */
const BROWSER_THEME = `
:root{--vscode-textLink-foreground:#3794ff;--vscode-sideBar-background:#181818;--vscode-editor-background:#1e1e1e;--vscode-foreground:#cccccc;--vscode-descriptionForeground:#9d9d9d;--vscode-editorError-foreground:#f14c4c;--vscode-errorForeground:#f14c4c;--vscode-font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color-scheme:dark;}
@media (prefers-color-scheme:light){:root{--vscode-textLink-foreground:#006ab1;--vscode-sideBar-background:#f3f3f3;--vscode-editor-background:#ffffff;--vscode-foreground:#3b3b3b;--vscode-descriptionForeground:#717171;--vscode-editorError-foreground:#e51400;--vscode-errorForeground:#e51400;color-scheme:light;}}
body{min-height:100vh;box-sizing:border-box;padding:24px 16px;}
svg{max-width:min(92vw,520px);}
#caprow,#bg{max-width:min(92vw,520px);}
#cap,#capgo{font-size:13px;}
header{max-width:min(92vw,520px);margin:0 auto 12px;text-align:center;}
h1{margin:0;font-size:20px;font-weight:600;overflow-wrap:anywhere;}
header p{margin:2px 0 0;font-size:12px;color:var(--vscode-descriptionForeground);}
#legend{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;max-width:min(92vw,520px);margin:14px auto 0;font-size:12px;}
.lg{display:inline-flex;align-items:center;gap:6px;max-width:220px;}
.lg i{flex:none;width:10px;height:10px;border-radius:50%;}
.lg span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#note{min-height:1.4em;margin-top:8px;text-align:center;font-size:12px;color:var(--vscode-descriptionForeground);}
.lg{background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.lg:hover span,.lg:focus-visible span{text-decoration:underline;}
#bg .pill.live[data-ch]:not([data-ch=""]){cursor:pointer;}
#conn{min-height:1.4em;margin-top:8px;text-align:center;font-size:12px;color:var(--vscode-errorForeground);}`;

/** Escapes text for HTML element content and attribute values: the project title comes from the user's folder name. */
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * The browser view: the standalone diagram under a project title, with a legend of live chats (filled by the live stream) and a connection line.
 * `connect-src 'self'` is the one addition to the CSP, needed for the EventSource; nothing else is loaded from anywhere.
 * `subtitle` and `lost` are the user-facing strings, passed in so they live with the other extension strings rather than in this file.
 */
export function browserPage(o: { title: string; fadeMs: number; subtitle: string; lost: string; focus: { sent: string; done: string; failed: string } }): string {
  const nonce = randomBytes(18).toString('base64url');
  // The stream carries the same messages the webview gets; they are re-dispatched as window messages so the diagram script runs unchanged.
  // A 'legend' message is the page's own: the live chats with their colours and titles.
  const shell = `
const mq = matchMedia('(prefers-color-scheme: light)');
const theme = () => document.body.classList.toggle('vscode-light', mq.matches);
theme(); mq.addEventListener('change', theme);
const legend = document.getElementById('legend'), conn = document.getElementById('conn'), note = document.getElementById('note');
const focusText = ${JSON.stringify(o.focus)};
// Legend entries are buttons (keyboard and screen-reader reachable); each carries its chat id for the reveal request.
function drawLegend(chats) {
  legend.textContent = '';
  for (const c of chats) {
    const item = document.createElement('button'), dot = document.createElement('i'), name = document.createElement('span');
    item.type = 'button'; item.className = 'lg'; item.dataset.ch = String(c.id); dot.style.background = String(c.col); name.textContent = String(c.title); item.title = String(c.title);
    item.append(dot, name); legend.append(item);
  }
}
// Reveal a chat in VS Code: POST /focus with the chat id. Every click shows its outcome in the status line (sent, done or failed), never silently.
async function focusChat(id) {
  note.textContent = focusText.sent;
  try {
    const r = await fetch('focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: id }) });
    note.textContent = r.ok ? focusText.done : focusText.failed;
  } catch { note.textContent = focusText.failed; }
}
// One delegated listener for the legend buttons and the live pills (both are rebuilt often); no inline handlers, which the page's CSP forbids.
document.addEventListener('click', (e) => {
  const t = e.target.closest ? e.target.closest('[data-ch]') : null;
  if (t && t.dataset.ch) { focusChat(t.dataset.ch); }
});
const es = new EventSource('events');
es.onmessage = (e) => {
  let m; try { m = JSON.parse(e.data); } catch { return; }
  if (m && m.type === 'legend') { drawLegend(Array.isArray(m.chats) ? m.chats : []); return; }
  window.dispatchEvent(new MessageEvent('message', { data: m }));
};
es.onopen = () => { conn.textContent = ''; };
es.onerror = () => { conn.textContent = ${JSON.stringify(o.lost)}; };`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)} - Activity</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self';">
<style nonce="${nonce}">:root{--fade:${o.fadeMs}ms;}${CSS}${BROWSER_THEME}</style></head><body><header><h1>${esc(o.title)}</h1><p>${esc(o.subtitle)}</p></header>${diagramSvg()}${pillsHtml()}${captionHtml()}<div id="legend"></div><div id="note" role="status" aria-live="polite"></div><div id="conn" role="status"></div><script nonce="${nonce}">${SCRIPT.replace('__FADE__', String(o.fadeMs))}${shell}</script></body></html>`;
}
