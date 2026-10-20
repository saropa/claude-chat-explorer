/** Dot animation shared by both webviews: a throb for active states, an alternating color cycle when a chat has two or three states at once (classes m2, m3; colors in --c1..--c3). The noanim class (the setting) and prefers-reduced-motion switch it all off, leaving the plain primary color. */
export const DOT_ANIM_CSS = String.raw`
@keyframes dotThrob{50%{transform:scale(1.4);opacity:.65}}
@keyframes dotAlt2{0%,35%{background:var(--c1)}65%,100%{background:var(--c2)}}
@keyframes dotAlt3{0%,25%{background:var(--c1)}33%,58%{background:var(--c2)}66%,91%{background:var(--c3)}100%{background:var(--c1)}}
.dot.running,.dot.waiting,.dot.background{animation:dotThrob 1.6s ease-in-out infinite}
.dot.m2{animation:dotAlt2 2.4s ease-in-out infinite alternate}
.dot.m3{animation:dotAlt3 3.6s ease-in-out infinite}
.noanim .dot{animation:none!important}
@media (prefers-reduced-motion:reduce){.dot{animation:none!important}}
`;
