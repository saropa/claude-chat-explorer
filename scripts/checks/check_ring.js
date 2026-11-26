// Fails the build when the row context ring breaks its promises: no ring without token data, fill and color steps at 80% and 100%,
// the "136.8k of 300k tokens" tooltip, no inline style (CSP is nonce-only), and the setting reaching the webview live.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { CTX_JS, CTX_CSS } = require(path.join(OUT, 'webviewCtx.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

const make = new Function('esc', 'tokTotalText', 'return (function(){' + CTX_JS + '\nreturn {ringHtml, setMax(n){ringMax=n;}};})()');
const ring = make((x) => String(x), (t) => 'in ' + t.input);
const html = (tokens, max) => { if (max) { ring.setMax(max); } return ring.ringHtml(tokens === undefined ? {} : { ctx: { tokens } }); };

check('no ring without context data', html(undefined, 300000) === '' && ring.ringHtml({ ctx: { tokens: 0 } }) === '');
const a = html(136800, 300000);
check('tooltip reads "136.8k of 300k tokens"', /data-tip="136\.8k of 300k tokens"/.test(a) && /aria-label="136\.8k of 300k tokens"/.test(a));
check('half-full ring has the normal color and a proportional dash', !/ rw| re/.test(a.match(/class="rg[^"]*"/)[0]) && /stroke-dasharray="17\.2 37\.7"/.test(a));
check('warning from 80 percent', / rw"/.test(html(240000, 300000)) && !/ rw"/.test(html(239000, 300000)));
check('error from 100 percent, dash capped at the full circle', / re"/.test(html(300000, 300000)) && / re"/.test(html(900000, 300000)) && /stroke-dasharray="37\.7 37\.7"/.test(html(900000, 300000)));
check('the limit setting moves the steps (1M limit)', !/ rw| re/.test(html(500000, 1000000).match(/class="rg[^"]*"/)[0]) && /500k of 1M tokens/.test(html(500000, 1000000)));
const withTok = ring.ringHtml({ ctx: { tokens: 1000 }, tok: { input: 5, output: 1, cacheRead: 0, cacheWrite: 0 } });
check('tooltip adds the cumulative total line only when r.tok exists', /\nTotal used so far \(not reset by \/compact\): in 5"/.test(withTok) && !/Total used/.test(a) && /aria-label="1k of 1M tokens"|aria-label="1k of /.test(withTok));
check('no inline style attribute in the ring', !/style=/.test(a));
check('ring CSS uses theme variables and has warning and error colors', /\.rg\.rw/.test(CTX_CSS) && /\.rg\.re/.test(CTX_CSS) && /--vscode-editorWarning-foreground/.test(CTX_CSS) && /--vscode-editorError-foreground/.test(CTX_CSS));

// Ring slot: the status dot sits inside the ring at the right end of the row. slotHtml needs dots/decorated/dotAttrs/dotHtml from
// the shared webview scope, so they are stubbed here with the real dotAttrs from group.js.
const { dotAttrs } = require(path.join(OUT, 'group.js'));
const { dotText } = require(path.join(OUT, 'group.js'));
const makeSlot = new Function('esc', 'tokTotalText', 'dots', 'decorated', 'dotAttrs', 'dotHtml', 'dotText',
  'return (function(){' + CTX_JS + '\nreturn {slotHtml, setMax(n){ringMax=n;}};})()');
const dots = { live: { s: 'running' }, multi: { s: 'waiting', also: ['running'] } };
// dotHtml stub mirrors the real one (role=img with the status words) so the slot's aria-hidden rewrite is exercised on the real attribute shape.
const slot = makeSlot((x) => String(x), () => '', dots, (r) => !!dots[r.id], dotAttrs, (id) => '<span ' + dotAttrs(dots[id]) + ' role="img" aria-label="' + dotText(dots[id]) + '" data-tip="t"></span>', dotText);
slot.setMax(300000);
const live = slot.slotHtml({ id: 'live', ctx: { tokens: 150000 } });
// Before: the dot rendered at the row's left and the ring had no state. After: one slot holds the ring then the dot, carrying the dot's state classes.
check('slot copies the live dot state and holds the ring before the dot', /^<span class="rs running"/.test(live) && live.indexOf('class="rg') < live.indexOf('class="dot running'));
check('slot copies multi-state classes so the ring alternates with the dot', /^<span class="rs waiting m2 [^"]*c1-waiting[^"]*c2-running/.test(slot.slotHtml({ id: 'multi' })));
check('an undecorated row with no context data still renders an empty slot (keeps the column aligned)', slot.slotHtml({ id: 'none' }) === '<span class="rs"></span>');
// The slot of a row with context data is the context popover's button; a slot without a ring stays inert (no role, no tab stop).
const btnSlot = slot.slotHtml({ id: 'live', ctx: { tokens: 150000, pct: 50 } });
// Accessibility: the button's name carries both the status words and the context percent (before: only "Context 50% full"), and its
// ring and dot drop role=img for aria-hidden so no image role is nested in the button. An inert slot keeps the dot's role=img name.
check('a slot with a ring is a keyboard-reachable button named with the status and the context percent', /^<span class="rs running" role="button" tabindex="0" data-a="ctx" aria-haspopup="dialog" aria-expanded="false" aria-label="Running\. Context 50% full: show details">/.test(btnSlot));
check('the button slot hides its ring and dot from assistive tech (no nested role=img)', !/role="img"/.test(btnSlot) && (btnSlot.match(/aria-hidden="true"/g) || []).length >= 3 && /class="dot running" aria-hidden="true" data-tip="t"/.test(btnSlot));
check('an undecorated row with a ring is named by context alone (no status to announce)', /aria-label="Context 50% full: show details"/.test(slot.slotHtml({ id: 'none', ctx: { tokens: 150000, pct: 50 } })));
check('a slot without a ring is not a button and keeps the dot role=img name', !/role="button"|data-a=/.test(slot.slotHtml({ id: 'live' })) && /class="dot running" role="img" aria-label="Running"/.test(slot.slotHtml({ id: 'live' })));
// Popover body: tipCtx (stubbed kv/tokText from the shared scope) with the token bar under its heading, colored by the ring's steps.
const makePopBody = new Function('esc', 'tokTotalText', 'kv', 'tokText', 'XI',
  'return (function(){' + CTX_JS + '\nreturn {ctxPopHtml, tipCtx, setMax(n){ringMax=n;}};})()');
const pb = makePopBody((x) => String(x), () => '', (rows) => '<dl>' + rows.filter((x) => x[1] !== '').map((x) => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>').join('') + '</dl>', (n) => String(n), { play: '' });
pb.setMax(300000);
const pr = { ctx: { tokens: 240000, pct: 24, window: 1000000, model: 'opus', comp: 2, pend: true, approx: false } };
const body = pb.ctxPopHtml(pr), tc = pb.tipCtx(pr);
check('popover shows the token bar (warning step at 80% of the ring limit, proportional fill) and its text', /<div class="cxb rw" role="img" aria-label="240k of 300k tokens"><svg[^>]*><rect class="rt" width="100" height="6"\/><rect class="rf" width="80\.0" height="6"\/>/.test(body) && /240k of 300k tokens \(ring limit\)/.test(body));
check('popover includes every part of the Context tooltip (heading, used, model, compactions, lag note)', body.startsWith('<div class="cxd"><b id="ctxh">Context 24% full</b><div class="cxb') && body.includes(tc.slice(tc.indexOf('</b>') + 4)) && /Lags one turn/.test(body));
check('popover offers Resume and no compact action', /data-a="resume"/.test(body) && !/data-a="compact"|\/compact/.test(body));
check('popover is empty for a chat without context data, and has no inline style', pb.ctxPopHtml({}) === '' && !/style=/.test(body));
// Popover behavior (placement, scroll, live update, empty tap, focus restore): the real POP_JS + CTX_JS + CTX_POP_JS run against a small fake DOM.
// The fake popover replaces its child nodes whenever innerHTML is assigned (as a real DOM does), so node identity proves what a live update rewrites.
const { POP_JS } = require(path.join(OUT, 'webviewPop.js'));
const { CTX_POP_JS } = require(path.join(OUT, 'webviewCtx.js'));
function ctxRig() {
  const L = {}, WL = {}, RO = [], rows = {}, rect = { top: 100, bottom: 116, right: 380, left: 364 };
  const popEl = {
    hidden: true, style: {}, offsetHeight: 300, offsetWidth: 260, _h: '', cxd: null, btn: null,
    get innerHTML() { return this._h; },
    set innerHTML(v) { this._h = v; this.cxd = /class="cxd"/.test(v) ? { innerHTML: v } : null; this.btn = /<button/.test(v) ? { focus() {} } : null; },
    focused: 0, focus() { this.focused++; doc.activeElement = this; },
    addEventListener() {}, querySelector(s) { return s === '.cxd' ? this.cxd : s === 'button' ? this.btn : null; }, closest: () => null
  };
  // mkSlot: a row's ring slot. Focus updates document.activeElement, as a real focus() does, so the focus-return logic sees where focus is.
  // rig.cur is the slot the document currently holds (null when the row is gone); a re-render swaps it for a new node and detaches the old one.
  const mkSlot = (rc) => ({ focused: 0, isConnected: true, attrs: {}, closest: (s) => (s === '.r' ? { dataset: { id: 'a' } } : null), getBoundingClientRect: () => rc, setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused++; doc.activeElement = this; } });
  const slot = mkSlot(rect);
  const rig = { cur: slot };
  const doc = { addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); }, querySelectorAll: () => (rig.cur ? [rig.cur] : []), documentElement: { clientWidth: 400 }, activeElement: null, body: { isConnected: true } };
  const win = { innerHeight: 800, innerWidth: 400, addEventListener: (t, f) => { (WL[t] = WL[t] || []).push(f); } };
  // ResizeObserver stub: records each callback so the check can fire a results-area resize.
  function RObs(cb) { RO.push(cb); this.observe = () => {}; }
  const f = new Function('document', 'window', '$', 'resOf', 'openId', 'tipHide', 'res', 'XI', 'esc', 'tokTotalText', 'kv', 'tokText', 'ResizeObserver',
    POP_JS + '\n' + CTX_JS + '\n' + CTX_POP_JS + '\nringMax=300000;return {ctxOpen, ctxSync, ctxClose, makePop, ctxId:()=>ctxId, ctxRefocus:()=>ctxRefocus};');
  const api = f(doc, win, () => popEl, (id) => rows[id], () => {}, () => {}, { getBoundingClientRect: () => ({ top: 0, bottom: 800 }) }, { play: '' }, (x) => String(x), () => '',
    (r) => '<dl>' + r.filter((x) => x[1] !== '').map((x) => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>').join('') + '</dl>', (n) => String(n), RObs);
  return Object.assign(rig, { api, L, WL, RO, rows, rect, popEl, slot, doc, mkSlot });
}
const cx = ctxRig();
cx.rows.a = { ctx: { tokens: 100000, pct: 10, window: 1000000, model: 'm', comp: 0, pend: false, approx: false } };
cx.rect.top = 760; cx.rect.bottom = 776;
cx.api.ctxOpen('a', cx.slot);
// Before: place() always used top=bottom+2, so a bottom row's popover ran off the viewport. After: flips above the slot (760-2-300=458).
check('popover flips above a slot near the bottom edge when it does not fit below', cx.popEl.style.top === '458px' && !cx.popEl.hidden);
cx.api.ctxClose(false); cx.rect.top = 100; cx.rect.bottom = 116; cx.api.ctxOpen('a', cx.slot);
check('popover opens below a slot with room under it', cx.popEl.style.top === '118px');
check('page menus (no flip argument) still open below even at the bottom edge', (() => { cx.rect.top = 760; cx.rect.bottom = 776; cx.api.makePop([]).place(cx.slot, cx.popEl); return cx.popEl.style.top === '778px'; })());
// Scroll: re-place while the slot is in view, close once it scrolled out.
cx.rect.top = 200; cx.rect.bottom = 216;
const fireScroll = () => (cx.L.scroll || []).forEach((fn) => fn({ target: { closest: () => null } }));
fireScroll();
check('scroll keeps the popover open and re-places it while the slot is still visible', cx.api.ctxId() === 'a' && !cx.popEl.hidden && cx.popEl.style.top === '218px');
cx.rect.top = -50; cx.rect.bottom = -34; fireScroll();
check('scroll closes the popover once the slot scrolled out of view', cx.api.ctxId() === '' && cx.popEl.hidden === true);
// Live update: the Resume button node must survive (it was destroyed by innerHTML replacement before), while the numbers change.
cx.rect.top = 100; cx.rect.bottom = 116; cx.api.ctxOpen('a', cx.slot);
const btn0 = cx.popEl.btn;
cx.rows.a = { ctx: { tokens: 120000, pct: 12, window: 1000000, model: 'm', comp: 0, pend: false, approx: false } };
cx.api.ctxSync();
check('a live update keeps the same Resume button node and rewrites the details in place', !!btn0 && cx.popEl.btn === btn0 && /Context 12% full/.test(cx.popEl.cxd.innerHTML) && /120k of 300k tokens/.test(cx.popEl.cxd.innerHTML));
// Focus restore for a re-rendered slot (pinned section or main list: ctxSlot searches the whole document). Before: the pending id was
// honored on whatever render came next, even after the user moved focus elsewhere, and stole it back.
const f0 = cx.slot.focused; cx.api.ctxClose(true);
const rep1 = cx.mkSlot(cx.rect); cx.slot.isConnected = false; cx.cur = rep1; // the render replaced the focused slot: focus fell back to a detached node
cx.api.ctxSync();
check('after a close with focus return, a render that replaced the slot focuses the new slot', cx.slot.focused === f0 + 1 && rep1.focused === 1 && cx.doc.activeElement === rep1 && cx.api.ctxRefocus() === '');
cx.api.ctxOpen('a', rep1); cx.api.ctxClose(true);
const other = { closest: () => null, isConnected: true }; cx.doc.activeElement = other; (cx.L.focusin || []).forEach((fn) => fn({ target: other }));
const rep2 = cx.mkSlot(cx.rect); rep1.isConnected = false; cx.cur = rep2; cx.api.ctxSync();
check('a focus move elsewhere cancels the pending focus return (no focus thief on a later render)', rep2.focused === 0 && cx.doc.activeElement === other && cx.api.ctxRefocus() === '');
cx.api.ctxOpen('a', rep2); cx.api.ctxClose(true); cx.doc.activeElement = null;
cx.cur = null; cx.api.ctxSync(); // the row disappeared before the render
const rep3 = cx.mkSlot(cx.rect); cx.cur = rep3; cx.api.ctxSync(); // ...and came back on a later render
check('a pending focus return is cleared when the row is gone, so the row coming back later does not take focus', cx.api.ctxRefocus() === '' && rep3.focused === 0);
const f1r = rep3.focused; cx.api.ctxOpen('a', rep3); cx.doc.activeElement = rep3; cx.api.ctxClose(true); cx.api.ctxSync();
check('a render that kept the focused slot does not move focus again', rep3.focused === f1r + 1 && cx.api.ctxRefocus() === '');
cx.cur = cx.slot; cx.slot.isConnected = true; cx.doc.activeElement = null;
// Empty data: a tap on a stale slot shows a message instead of doing nothing.
cx.api.ctxOpen('none', cx.slot);
check('a tap on a chat with no context data opens the popover with a visible message', !cx.popEl.hidden && /No context data for this chat/.test(cx.popEl.innerHTML) && cx.api.ctxId() === 'none');
cx.api.ctxClose(false);
// Horizontal clamp: the popover stays inside both margins and is capped to the viewport (before: only the CSS 100vw cap, which counts a scrollbar).
cx.rect.top = 100; cx.rect.bottom = 116; cx.rect.right = 380; cx.api.ctxOpen('a', cx.slot);
check('popover is right-aligned with the slot in a wide panel and capped to the viewport width', cx.popEl.style.left === '120px' && cx.popEl.style.maxWidth === '384px');
cx.api.ctxClose(false); cx.rect.right = 50; cx.api.ctxOpen('a', cx.slot);
check('a slot near the left edge keeps the popover inside the left margin', cx.popEl.style.left === '8px');
cx.api.ctxClose(false); cx.doc.documentElement.clientWidth = 200; cx.rect.right = 190; cx.api.ctxOpen('a', cx.slot);
check('a 200px sidebar caps the 260px popover to 184px and pins it to the left margin (no overflow on either side)', cx.popEl.style.maxWidth === '184px' && cx.popEl.style.left === '8px');
cx.api.ctxClose(false); cx.doc.documentElement.clientWidth = 400; cx.rect.right = 380;
// Resize follow: window resize and results-area resize (ResizeObserver) re-place under the slot, and close when the row is gone.
cx.api.ctxOpen('a', cx.slot); cx.rect.top = 300; cx.rect.bottom = 316; (cx.WL.resize || []).forEach((fn) => fn());
check('a window resize re-places the popover under the moved slot', cx.api.ctxId() === 'a' && cx.popEl.style.top === '318px');
cx.rect.top = 400; cx.rect.bottom = 416; cx.RO.forEach((fn) => fn());
check('a results-area resize (ResizeObserver) re-places the popover too', cx.RO.length === 1 && cx.api.ctxId() === 'a' && cx.popEl.style.top === '418px');
cx.cur = null; (cx.WL.resize || []).forEach((fn) => fn());
check('a resize after the row is gone closes the popover', cx.api.ctxId() === '' && cx.popEl.hidden === true);
cx.cur = cx.slot; cx.api.ctxOpen('a', cx.slot); cx.cur = null; cx.RO.forEach((fn) => fn());
check('a results-area resize after the row is gone closes the popover', cx.api.ctxId() === '' && cx.popEl.hidden === true);
// Anchor replacement: a re-render swaps the slot node; scroll must follow the new node, never the stale one.
cx.cur = cx.slot; cx.rect.top = 100; cx.rect.bottom = 116; cx.api.ctxOpen('a', cx.slot);
const nr = { top: 200, bottom: 216, right: 380, left: 364 }, fresh = cx.mkSlot(nr); cx.slot.isConnected = false; cx.cur = fresh; fireScroll();
check('scroll after a re-render follows the new slot node (stale node ignored)', cx.api.ctxId() === 'a' && cx.popEl.style.top === '218px');
cx.api.ctxSync();
check('a sync after a re-render keeps aria-expanded true on the new slot', fresh.attrs['aria-expanded'] === 'true');
const detached = cx.mkSlot({ top: 100, bottom: 116, right: 380, left: 364 }); detached.isConnected = false; cx.cur = detached; fireScroll();
check('a slot node that a render detached counts as gone: scroll closes the popover', cx.api.ctxId() === '' && cx.popEl.hidden === true);
cx.cur = cx.slot; cx.slot.isConnected = true;
// The empty popover has no button, so focus goes to the dialog itself.
const pf0 = cx.popEl.focused; cx.api.ctxOpen('none', cx.slot);
check('keyboard open of an empty popover focuses the dialog itself', cx.popEl.focused === pf0 + 1);
cx.api.ctxClose(false);
// Static source assertions for items the fake DOM cannot render: dialog naming, open-row fallback, high-contrast and forced-colors rules.
const webSrc = fs.readFileSync(path.join(ROOT, 'src', 'webview.ts'), 'utf8');
check('the popover is a dialog labelled by its heading id, and both the details and the empty message carry that id', /id="ctxp" class="pop tipc" role="dialog" aria-labelledby="ctxh" tabindex="-1"/.test(webSrc) && /id="ctxh">No context data/.test(CTX_JS) && CTX_JS.includes(`replace('<b>','<b id="ctxh">')`));
const xCss = require(path.join(OUT, 'webviewExpandCss.js')).EXPAND_CSS;
check('open rows have a fallback for engines without the lh unit, using an explicit title line height', xCss.includes('@supports not (height:1lh){.r.open .hd{--tlh:1.25}.r.open .hd .t{line-height:var(--tlh)}.r.open .hd .rc{margin-top:calc((var(--tlh) * 1em + 2 * var(--tpy) - var(--rs)) / 2)}}') && xCss.includes('.r.open .hd{align-items:flex-start'));
const hc = (sel) => CTX_CSS.includes('body.vscode-high-contrast ' + sel) && CTX_CSS.includes('body.vscode-high-contrast-light ' + sel);
check('high-contrast themes get an opaque thin ring track, an outlined bar, and HC border tokens on the popover, hover and focus ring', hc('.rg .rt') && hc('.cxb svg') && hc('#ctxp') && hc('.rs[data-a=ctx]:hover') && hc('.rs[data-a=ctx]:focus-visible') && /--vscode-contrastBorder/.test(CTX_CSS) && /--vscode-contrastActiveBorder/.test(CTX_CSS));
check('forced-colors mode keeps the track, fill, bar and popover border visible with system colors', CTX_CSS.includes('@media (forced-colors:active){.rg .rt{stroke:CanvasText;opacity:1;stroke-width:1}.rg .rf{stroke:Highlight!important}') && CTX_CSS.includes('.cxb svg{outline:1px solid CanvasText}#ctxp{border:1px solid CanvasText}'));
check('no raw hex color in the context CSS other than the theme-variable fallbacks', (CTX_CSS.match(/#[0-9a-fA-F]{3,6}\b/g) || []).length === (CTX_CSS.match(/var\(--vscode-[\w-]+,#[0-9a-fA-F]{3,6}\)/g) || []).length);
check('the tooltip config is named (tipCfg) so check_webview can run a positive control without skip', /const tipCfg=\{bounds:/.test(fs.readFileSync(path.join(ROOT, 'src', 'webviewTip.ts'), 'utf8')));
const tipSrc = fs.readFileSync(path.join(ROOT, 'src', 'webviewTip.ts'), 'utf8'), popSrc = fs.readFileSync(path.join(ROOT, 'src', 'webviewPop.ts'), 'utf8');
check('tooltip engine honors a skip veto and the sidebar vetoes the open popover\'s own slot', /if\(cfg\.skip&&cfg\.skip\(el\)\)return/.test(popSrc) && /skip:el=>\{const s=ctxId&&el\.closest\('\.rs\[data-a=ctx\]'\)/.test(tipSrc));
check('live states tint the ring segment and outrank warn/error', ['running', 'waiting', 'unread', 'background'].every((k) => CTX_CSS.includes('.rs.' + k + ' .rg .rf{stroke:var(--k-' + k + ')}')));
const rowCss = Object.values(require(path.join(OUT, 'webviewCss.js'))).join('');
check('hover hides the row meta but never the ring slot (the dot stays visible)', /\.rh:hover \.hd \.rc>:not\(\.rs\)/.test(rowCss) && !/\.rh:hover \.hd \.rc[,{]/.test(rowCss));
// Slot geometry has one source: --rs (slot size) and --rg (.rc gap) on :root; --rw (the hover offset) is derived from both, never a literal,
// so changing the slot size cannot leave the hover actions or chevron overlapping it.
const layoutCss = require(path.join(OUT, 'webviewLayout.js')).LAYOUT_CSS;
const expandCss = require(path.join(OUT, 'webviewExpandCss.js')).EXPAND_CSS;
check('--rs and --rg are defined once on :root', /:root\{--rs:\d+px;--rg:\d+px\}/.test(rowCss) && (rowCss + CTX_CSS + layoutCss + expandCss).match(/--rs:/g).length === 1 && (rowCss + CTX_CSS + layoutCss + expandCss).match(/--rg:/g).length === 1);
check('--rw is derived from --rs and --rg, not a literal', /--rw:calc\(var\(--rs\) \+ var\(--rg\)\)/.test(rowCss) && !/--rw:\d/.test(rowCss + CTX_CSS + layoutCss + expandCss));
check('the slot and the ring svg use --rs; .rc uses --rg as its gap', /\.rs\{[^}]*width:var\(--rs\);height:var\(--rs\)/.test(CTX_CSS) && /\.rg svg\{width:var\(--rs\);height:var\(--rs\)/.test(CTX_CSS) && /\.rc\{[^}]*gap:var\(--rg\)/.test(layoutCss));
check('open-row slot offset derives from the title line box (1lh) and --rs, not a fixed margin', /\.r\.open \.hd \.rc\{margin-top:calc\(\(1lh \+ 2 \* var\(--tpy\) - var\(--rs\)\) \/ 2\)\}/.test(expandCss) && /\.r\.open \.hd \.t\{[^}]*padding:var\(--tpy\) 0/.test(expandCss));
check('the ring check runs in vscode:prepublish after check_dots', /check_dots\.js && node scripts\/checks\/check_ring\.js/.test(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts['vscode:prepublish']));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const set = pkg.contributes.configuration.properties['saropaChats.contextRingTokens'];
check('contextRingTokens is a number, default 300000, minimum 10000', !!set && set.type === 'number' && set.default === 300000 && set.minimum === 10000);
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
// Order-independent: restore() must call postRing() somewhere in its body. The old regex required
// postRing() directly before postMeta(), which broke whenever another post (e.g. postColorDormant)
// was added between them even though behavior stayed correct.
const restoreBody = (ext.match(/private restore\(\): void \{([\s\S]*?)\n  \}/) || [])[1] || '';
check('a change of the setting is posted to the panel, and restore sends it', /affectsConfiguration\('saropaChats\.contextRingTokens'\)\) \{ provider\.postRing\(\)/.test(ext) && restoreBody.includes('this.postRing();'));
check('the webview handles the ring message', /d\.type==='ring'/.test(fs.readFileSync(path.join(ROOT, 'src', 'webviewJs.ts'), 'utf8')));
const st = require(path.join(OUT, 'status.js'));
check('statuses keep Tiny, Huge, Empty and Nearly full', ['tiny', 'huge', 'empty', 'nearly'].every((k) => st.STATUS_KEYS ? st.STATUS_KEYS.includes(k) : true) && !st.pillOf);

if (failures.length) { console.error('check_ring FAILED (' + failures.length + ')'); failures.forEach((e) => console.error('  - ' + e)); process.exit(1); }
console.log('check_ring OK: ring fill, color steps, tooltip, no inline style, setting wiring');
