/** Dot animation shared by both webviews: a throb for active states (a waiting dot instead bounces once for 0.6s of an 8.6s cycle, so it stays quiet), an alternating color cycle when a chat has two or three states at once (classes m2, m3; colors in --c1..--c3, set by the c1-, c2-, c3- state classes because the CSP forbids inline styles). The noanim class (the setting) and prefers-reduced-motion switch it all off, leaving the plain primary color. */
const KEYS = ['waiting', 'running', 'unread', 'background'];
/* Separate .dot and .rs rules, not one combined selector: check_dots matches the exact .dot rule text, and the ring slot needs the same color slots so its segment tracks the dot. */
const SLOTS = [1, 2, 3].map((n) => KEYS.map((k) => `.dot.c${n}-${k}{--c${n}:var(--k-${k})}.rs.c${n}-${k}{--c${n}:var(--k-${k})}`).join('')).join('\n');

export const DOT_ANIM_CSS = String.raw`
@keyframes dotThrob{50%{transform:scale(1.15);opacity:.8}}
@keyframes dotAlt2{0%,35%{background:var(--c1)}65%,100%{background:var(--c2)}}
@keyframes dotAlt3{0%,25%{background:var(--c1)}33%,58%{background:var(--c2)}66%,91%{background:var(--c3)}100%{background:var(--c1)}}
@keyframes ringAlt2{0%,35%{stroke:var(--c1)}65%,100%{stroke:var(--c2)}}
@keyframes ringAlt3{0%,25%{stroke:var(--c1)}33%,58%{stroke:var(--c2)}66%,91%{stroke:var(--c3)}100%{stroke:var(--c1)}}
@keyframes dotBounce{0%,7%,100%{transform:translateY(0)}3.5%{transform:translateY(-3px)}}
.dot.running,.dot.background{animation:dotThrob 2s ease-in-out infinite}
.dot.waiting{animation:dotBounce 8.6s ease-in-out infinite}
/* Inside the ring the hole leaves under 2px above the dot, so a waiting dot there bounces 1px instead of 3px and never touches the stroke. Multi-state dots keep their own animation. */
@keyframes dotBounceSm{0%,7%,100%{transform:translateY(0)}3.5%{transform:translateY(-1px)}}
.rs .dot.waiting:not(.m2):not(.m3){animation-name:dotBounceSm}
.dot.m2{animation:dotAlt2 2.4s ease-in-out infinite alternate,dotThrob 2s ease-in-out infinite}
.dot.m3{animation:dotAlt3 3.6s ease-in-out infinite,dotThrob 2s ease-in-out infinite}
/* ring segment alternates colors in step with the dot (same duration and direction) */
.rs.m2 .rg .rf{animation:ringAlt2 2.4s ease-in-out infinite alternate}
.rs.m3 .rg .rf{animation:ringAlt3 3.6s ease-in-out infinite}
.dot.idle,.dot.none{animation:none!important}
/* .dot and ring rules kept separate so check_dots can match the exact .dot rule; the ring segment animation is switched off by the same setting and media query */
.noanim .dot{animation:none!important}
.noanim .rs .rf{animation:none!important}
@media (prefers-reduced-motion:reduce){.dot{animation:none!important}}
@media (prefers-reduced-motion:reduce){.rs .rf{animation:none!important}}
` + SLOTS + '\n';
