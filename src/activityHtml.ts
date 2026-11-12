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
.hot{animation:glow 4s cubic-bezier(.4,.5,.7,1);}
.hot .ln{animation:ln 4s cubic-bezier(.4,.5,.7,1);}
.cn.hot{animation:cn 4s cubic-bezier(.4,.5,.7,1);}
.err .nd,.err .core{stroke-dasharray:3 2;}
.br,.rp{fill:none;stroke:var(--hl);stroke-width:1.5;stroke-opacity:0;pointer-events:none;}
.busy .br{animation:breathe 3s ease-in-out infinite;}
.wait .nd,.wait .core{stroke:var(--hl);stroke-opacity:.7;}
.rip .rp{animation:rip 1.8s ease-out;transform-box:fill-box;transform-origin:center;}
.vscode-high-contrast .wait .nd,.vscode-high-contrast .wait .core,.vscode-high-contrast-light .wait .nd,.vscode-high-contrast-light .wait .core{stroke:var(--hl);stroke-opacity:1;stroke-width:2;}
#cap{max-width:300px;height:1.4em;line-height:1.4em;margin:6px auto 0;font-size:11px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.8;}
.hold{filter:drop-shadow(0 0 4px ${HOT});}
.hold .core{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.4;}
.hold .ic{color:${HOT};opacity:1;}
.hold text{fill:${HOT};fill-opacity:1;}
.hot .nd,.hot .core{animation:nd 4s cubic-bezier(.4,.5,.7,1);}
.hot .ic{animation:ic 4s cubic-bezier(.4,.5,.7,1);}
.hot text{animation:tx 4s cubic-bezier(.4,.5,.7,1);}
@keyframes breathe{0%,100%{stroke-opacity:.12;}50%{stroke-opacity:.5;}}
@keyframes rip{from{stroke-opacity:.6;transform:scale(1);}to{stroke-opacity:0;transform:scale(2.2);}}
@keyframes glow{from{filter:drop-shadow(0 0 4px ${HOT});}to{filter:drop-shadow(0 0 0 transparent);}}
@keyframes ln{from{stroke:${HOT};stroke-opacity:1;stroke-width:2;}}
@keyframes nd{from{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.4;}}
@keyframes cn{from{stroke:${HOT};stroke-opacity:1;stroke-width:2;}to{stroke-opacity:0;}}
@keyframes ic{from{color:${HOT};opacity:1;}}
@keyframes tx{from{fill:${HOT};fill-opacity:1;}}
@media (prefers-reduced-motion:reduce){
.busy .br,.rip .rp{animation:none;}
.busy .br{stroke-opacity:.4;}
.vscode-high-contrast .busy .br,.vscode-high-contrast-light .busy .br{stroke-opacity:1;}
.hot,.cn.hot,.hot .ln,.hot .nd,.hot .core,.hot .ic,.hot text{animation:none;}
.hot{filter:drop-shadow(0 0 3px ${HOT});}
.hot .ln,.cn.hot{stroke:${HOT};stroke-opacity:1;stroke-width:2;}
.hot .nd,.hot .core{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.4;}
.hot .ic{color:${HOT};opacity:1;}
.hot text{fill:${HOT};fill-opacity:1;}}`;

// A flash restarts the animation; with reduced motion the bright state is simply held for 600 ms. Moving from one group to another within a turn (until your next message) flashes the connector between them, however long the tool took.
// A thinking flash with nothing else lit holds the center bright until the next group flash or 10 s, then fades as usual.
const SCRIPT = `
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const timers = new Map();
const pend = new Map(); // tool calls in flight: id -> { g, t }, t being the 10 minute safety timeout
const core = document.querySelector('.grp[data-g="think"]');
const cap = document.getElementById('cap');
const grp = (g) => document.querySelector('.grp[data-g="' + g + '"]');
let last = '', capText = '', capAt = 0, capTimer = 0;
function pulse(el, key, err) {
  el.classList.remove('hot', 'hold', 'err');
  void el.getBoundingClientRect();
  el.classList.add('hot');
  if (err) { el.classList.add('err'); }
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => el.classList.remove('hot', 'err'), calm.matches ? 600 : 4000));
}
// The caption shows the newest text, at most twice a second.
function caption(text) {
  capText = text;
  if (!capTimer) { capTimer = setTimeout(() => { capTimer = 0; capAt = Date.now(); cap.textContent = capText; }, Math.max(0, 500 - (Date.now() - capAt))); }
}
function endCall(id) {
  const p = pend.get(id);
  if (!p) { return; }
  clearTimeout(p.t); pend.delete(id);
  grp(p.g).classList.toggle('busy', [...pend.values()].some((q) => q.g === p.g));
}
function startCall(id, g) {
  endCall(id);
  pend.set(id, { g, t: setTimeout(() => endCall(id), 600000) });
  grp(g).classList.add('busy');
}
// A chat switch clears every held state, the pending calls and the caption.
function reset() {
  for (const p of pend.values()) { clearTimeout(p.t); }
  pend.clear();
  document.querySelectorAll('.busy, .wait, .rip, .err').forEach((el) => el.classList.remove('busy', 'wait', 'rip', 'err'));
  clearTimeout(capTimer); capTimer = 0; capAt = 0; cap.textContent = ''; last = '';
}
// Waiting for you: one ripple from the core (none with reduced motion), then a quiet outline until the next message.
function wait(g) {
  const el = grp(g);
  el.classList.add('wait');
  if (g === 'think') { el.classList.remove('rip'); void el.getBoundingClientRect(); el.classList.add('rip'); setTimeout(() => el.classList.remove('rip'), 2000); }
}
function flash(g, err) {
  const el = grp(g);
  if (!el) { return; }
  core.classList.remove('wait', 'rip');
  if (g === 'think' && !err) {
    if (document.querySelector('.grp.hot:not([data-g="think"]), .cn.hot')) { pulse(el, g); return; }
    el.classList.remove('hot', 'err');
    el.classList.add('hold');
    clearTimeout(timers.get(g));
    timers.set(g, setTimeout(() => pulse(el, g), 10000));
    return;
  }
  if (core.classList.contains('hold')) { pulse(core, 'think'); }
  if (g !== 'think' && last && last !== g) {
    const cn = document.querySelector('.cn[data-c="' + [last, g].sort().join('-') + '"]');
    if (cn) { pulse(cn, 'c:' + cn.dataset.c); }
  }
  if (g !== 'think') { last = g; }
  pulse(el, g, err);
}
addEventListener('message', (e) => {
  const m = e.data;
  if (m && m.type === 'reset') { reset(); return; }
  if (!m || m.type !== 'events' || !Array.isArray(m.events)) { return; }
  for (const v of m.events) {
    if (v.t === 'flash') { flash(v.g, v.err); }
    else if (v.t === 'caption') { caption(String(v.text)); }
    else if (v.t === 'busy' && grp(v.g)) { startCall(v.id, v.g); }
    else if (v.t === 'end') { endCall(v.id); if (v.g === 'chat') { grp('chat').classList.remove('wait'); } if (!pend.size) { caption(''); } }
    else if (v.t === 'wait' && grp(v.g)) { wait(v.g); }
    else if (v.t === 'wake') { last = ''; document.querySelectorAll('.wait').forEach((el) => el.classList.remove('wait', 'rip')); caption(''); }
  }
});`;

export function activityHtml(): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Activity</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${CSS}</style></head><body>${diagramSvg()}<div id="cap" aria-live="polite"></div><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
