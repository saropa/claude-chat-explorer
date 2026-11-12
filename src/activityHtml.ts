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
const C = 130, R = 80, NR = 18, ICON = 18; // view box center, ring radius, node radius, icon size

const icon = (name: string, cx: number, cy: number, size: number): string => {
  const i = ICONS[name];
  return `<svg x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" viewBox="0 0 ${i.size} ${i.size}" fill="currentColor">${i.body}</svg>`;
};

/** The diagram markup: per group a `<g data-g>` holding its line, node circle, icon and label. */
export function diagramSvg(): string {
  const groups = NODES.map((n, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a), x = C + R * c, y = C + R * s;
    return `<g class="grp" data-g="${n.g}"><line class="ln" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${C}" y2="${C}"/>`
      + `<circle class="nd" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NR}"/>${icon(n.icon, x, y, ICON)}`
      + `<text x="${(x + c * (NR + 4)).toFixed(1)}" y="${(y + s * (NR + 6) + 3).toFixed(1)}" text-anchor="${c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'}">${n.name}</text></g>`; // label on the outward side, away from the line
  }).join('');
  return `<svg viewBox="-25 0 310 260" role="img" aria-label="Claude activity: Chat, Memory, Files, Terminal, Web, Agents, Connect and Control">${groups}`
    + `<g class="grp" data-g="think"><circle class="core" cx="${C}" cy="${C}" r="30"/>${icon('lightbulb', C, C - 8, 20)}<text x="${C}" y="${C + 16}" text-anchor="middle">Claude</text></g></svg>`;
}

const CSS = `
body{margin:0;padding:8px 16px;background:var(--vscode-sideBar-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family);}
svg{display:block;width:100%;max-width:320px;height:auto;margin:0 auto;}
text{fill:currentColor;font-size:9px;opacity:.8;}
.ln{stroke:var(--vscode-foreground);stroke-opacity:.25;stroke-width:1;}
.nd,.core{fill:none;stroke:var(--vscode-foreground);stroke-opacity:.4;stroke-width:1;}
svg svg{color:var(--vscode-foreground);}
.hot .ln{animation:ln 4s ease-out;}
.hot .nd,.hot .core{animation:nd 4s ease-out;}
@keyframes ln{from{stroke:var(--vscode-textLink-foreground);stroke-opacity:1;stroke-width:2.5;}}
@keyframes nd{from{stroke:var(--vscode-textLink-foreground);stroke-opacity:1;stroke-width:2.5;}}
@media (prefers-reduced-motion:reduce){
.hot .ln,.hot .nd,.hot .core{animation:none;stroke:var(--vscode-textLink-foreground);stroke-opacity:1;stroke-width:2.5;}}`;

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
