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

/** The diagram markup: per group a `<g data-g>` holding its line, node circle, icon and label. The view box is centered on the core so the layout is symmetric. */
export function diagramSvg(): string {
  const groups = NODES.map((n, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a), x = C + R * c, y = C + R * s, ly = y + (s < -0.3 ? -1 : 1) * (NR + 8); // label above the node in the top half, below it elsewhere: no side labels, so the width never depends on label length
    return `<g class="grp" data-g="${n.g}"><line class="ln" x1="${(C + (R - NR) * c).toFixed(1)}" y1="${(C + (R - NR) * s).toFixed(1)}" x2="${(C + CR * c).toFixed(1)}" y2="${(C + CR * s).toFixed(1)}"/>`
      + `<circle class="nd" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NR}"/>${icon(n.icon, x, y, ICON)}`
      + `<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${n.name}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Claude activity: Chat, Memory, Files, Terminal, Web, Agents, Connect and Control">${groups}`
    + `<g class="grp" data-g="think"><circle class="core" cx="${C}" cy="${C}" r="${CR}"/>${icon('lightbulb', C, C - 7, 16)}<text x="${C}" y="${C + 13}" text-anchor="middle">Claude</text></g></svg>`;
}

const HOT = 'var(--vscode-textLink-foreground)';
const CSS = `
body{margin:0;padding:8px;background:var(--vscode-sideBar-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family);}
svg{display:block;width:100%;max-width:300px;height:auto;margin:0 auto;overflow:visible;}
text{fill:currentColor;font-size:11px;letter-spacing:.2px;dominant-baseline:central;opacity:.75;}
.ln{stroke:currentColor;stroke-opacity:.22;stroke-width:1;}
.nd,.core{fill:currentColor;fill-opacity:.06;stroke:currentColor;stroke-opacity:.35;stroke-width:1;}
.core{fill-opacity:.1;}
.ic{opacity:.85;}
.core+.ic{opacity:1;}
.vscode-high-contrast .ln,.vscode-high-contrast-light .ln{stroke-opacity:.6;}
.vscode-high-contrast .nd,.vscode-high-contrast .core,.vscode-high-contrast-light .nd,.vscode-high-contrast-light .core{stroke-opacity:1;fill-opacity:0;}
.vscode-high-contrast text,.vscode-high-contrast-light text,.vscode-high-contrast .ic,.vscode-high-contrast-light .ic{opacity:1;}
.hot{animation:glow 4s cubic-bezier(.2,.6,.3,1);}
.hot .ln{animation:ln 4s cubic-bezier(.2,.6,.3,1);}
.hot .nd,.hot .core{animation:nd 4s cubic-bezier(.2,.6,.3,1);}
.hot .ic{animation:ic 4s cubic-bezier(.2,.6,.3,1);}
.hot text{animation:tx 4s cubic-bezier(.2,.6,.3,1);}
@keyframes glow{from{filter:drop-shadow(0 0 4px ${HOT});}to{filter:drop-shadow(0 0 0 transparent);}}
@keyframes ln{from{stroke:${HOT};stroke-opacity:1;stroke-width:2;}}
@keyframes nd{from{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.22;}}
@keyframes ic{from{color:${HOT};opacity:1;}}
@keyframes tx{from{fill:${HOT};opacity:1;}}
@media (prefers-reduced-motion:reduce){
.hot,.hot .ln,.hot .nd,.hot .core,.hot .ic,.hot text{animation:none;}
.hot{filter:drop-shadow(0 0 3px ${HOT});}
.hot .ln{stroke:${HOT};stroke-opacity:1;stroke-width:2;}
.hot .nd,.hot .core{stroke:${HOT};stroke-opacity:1;stroke-width:1.75;fill:${HOT};fill-opacity:.22;}
.hot .ic{color:${HOT};opacity:1;}
.hot text{fill:${HOT};opacity:1;}}`;

// A flash restarts the group's animation; with reduced motion the bright state is simply held for 600 ms.
const SCRIPT = `
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const timers = new Map();
addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.type !== 'flash' || !Array.isArray(m.groups)) { return; }
  for (const g of new Set(m.groups)) {
    const el = document.querySelector('.grp[data-g="' + g + '"]');
    if (!el) { continue; }
    el.classList.remove('hot');
    void el.getBoundingClientRect();
    el.classList.add('hot');
    clearTimeout(timers.get(g));
    timers.set(g, setTimeout(() => el.classList.remove('hot'), calm.matches ? 600 : 4000));
  }
});`;

export function activityHtml(): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Activity</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">${CSS}</style></head><body>${diagramSvg()}<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
