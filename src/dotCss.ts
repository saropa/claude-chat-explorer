/** Dot animation shared by both webviews: a throb for active states, an alternating color cycle when a chat has two or three states at once (classes m2, m3; colors in --c1..--c3, set by the c1-, c2-, c3- state classes because the CSP forbids inline styles). The noanim class (the setting) and prefers-reduced-motion switch it all off, leaving the plain primary color. */
const KEYS = ['waiting', 'running', 'unread', 'background'];
const SLOTS = [1, 2, 3].map((n) => KEYS.map((k) => `.dot.c${n}-${k}{--c${n}:var(--k-${k})}`).join('')).join('\n');

export const DOT_ANIM_CSS = String.raw`
@keyframes dotThrob{50%{transform:scale(1.15);opacity:.8}}
@keyframes dotAlt2{0%,35%{background:var(--c1)}65%,100%{background:var(--c2)}}
@keyframes dotAlt3{0%,25%{background:var(--c1)}33%,58%{background:var(--c2)}66%,91%{background:var(--c3)}100%{background:var(--c1)}}
.dot.running,.dot.waiting,.dot.background{animation:dotThrob 2s ease-in-out infinite}
.dot.m2{animation:dotAlt2 2.4s ease-in-out infinite alternate,dotThrob 2s ease-in-out infinite}
.dot.m3{animation:dotAlt3 3.6s ease-in-out infinite,dotThrob 2s ease-in-out infinite}
.dot.idle,.dot.none{animation:none!important}
.noanim .dot{animation:none!important}
@media (prefers-reduced-motion:reduce){.dot{animation:none!important}}
` + SLOTS + '\n';
