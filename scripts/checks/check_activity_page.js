// Fails the build when the Activity page script mishandles its caption. Runs the real page script (out/activityHtml.js) in the stub DOM
// of webview_harness.js with its fake clock (the caption is throttled to two paints a second, so every step advances the clock past 500 ms)
// and feeds it host messages: the idle caption, live captions, end / wait / reset events, and the click-to-focus state of the sidebar section.
const path = require('path');
const { createHarness, mkEl } = require('./webview_harness');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { activityHtml, activitySection, captionHtml } = require(path.join(OUT, 'activityHtml.js'));

/**
 * The harness's document.querySelector returns null; the Activity script looks up its groups by selector (and the stand-in core),
 * so each selector gets one stable stub element. Without this `wait` (which needs grp(g)) would be skipped and the check would prove nothing.
 */
function withGroups(h) {
  const bySel = new Map();
  h.document.querySelector = (sel) => { if (!bySel.has(sel)) { bySel.set(sel, mkEl('')); } return bySel.get(sel); };
  return h;
}

// ---- 1. Standalone page (no host to ask): idle vs live caption ordering. ----
{
  const h = withGroups(createHarness({ page: activityHtml(4000), name: 'activity_page' }));
  h.start();
  const cap = h.els.get('cap');
  const tick = () => h.advance(600); // past the 500 ms caption throttle
  const ev = (...events) => h.deliver({ type: 'events', events }, 'events');

  h.deliver({ type: 'idle', text: 'chat A — idle', go: 'Open the busiest other working chat', looking: 'Finding…' }); tick();
  h.check('idle text shows when no live caption is up', cap.textContent === 'chat A — idle');
  h.check('standalone page never makes the caption clickable (no host)', !cap.classList.contains('go') && cap.getAttribute('role') === null);

  ev({ t: 'caption', text: 'Running: tests' }); tick();
  h.check('a live caption wins over the idle text', cap.textContent === 'Running: tests');
  h.deliver({ type: 'idle', text: 'chat A — working' }); tick();
  h.check('an idle update does not replace a live caption', cap.textContent === 'Running: tests');

  ev({ t: 'busy', id: 'c1', g: 'terminal' }, { t: 'end', id: 'c1', g: 'terminal' }); tick();
  h.check('end with no pending calls returns to the idle text', cap.textContent === 'chat A — working');

  ev({ t: 'busy', id: 'c2', g: 'terminal' }, { t: 'busy', id: 'c3', g: 'files' }, { t: 'caption', text: 'Reading x' }, { t: 'end', id: 'c2', g: 'terminal' }); tick();
  h.check('end while another call is still pending keeps the live caption', cap.textContent === 'Reading x');
  ev({ t: 'end', id: 'c3', g: 'files' }); tick();

  ev({ t: 'caption', text: 'Running: build' }); tick();
  h.deliver({ type: 'idle', text: 'chat A — waiting for you' }); tick();
  ev({ t: 'wait', g: 'think' }); tick();
  h.check('a wait event drops the stale live caption so the idle text shows', cap.textContent === 'chat A — waiting for you');

  ev({ t: 'busy', id: 'c4', g: 'agents' }, { t: 'caption', text: 'Agent: review' }); tick();
  ev({ t: 'wait', g: 'think' }); tick();
  h.check('a wait while a call is still pending keeps the live caption', cap.textContent === 'Agent: review');
  ev({ t: 'end', id: 'c4', g: 'agents' }); tick();
  h.check('and the idle text returns when that call ends', cap.textContent === 'chat A — waiting for you');
  h.check('the standalone page keeps its open button hidden', h.els.get('capgo').hidden === true);

  ev({ t: 'caption', text: 'Running: lint' }); tick();
  h.deliver({ type: 'reset' }); tick();
  h.check('reset clears the caption at once', cap.textContent === '');
  ev({ t: 'end', id: 'none', g: 'terminal' }); tick();
  h.check('reset cleared the idle text too (an empty caption falls back to nothing)', cap.textContent === '');
  h.deliver({ type: 'idle', text: 'chat B — idle' }); tick();
  h.check('the new chat idle text shows after reset', cap.textContent === 'chat B — idle');

  // A malformed idle message (missing text) must not throw or print "undefined".
  h.deliver({ type: 'idle' }); tick();
  h.check('an idle message without text shows nothing, not "undefined"', cap.textContent === '');
  if (h.errors.length) { console.error('check activity_page FAILED (standalone)'); [...new Set(h.errors)].forEach((e) => console.error('  - ' + e)); process.exit(1); }
}

// ---- 1b. Section settings popover on the real sidebar page: gear opens it, inputs post to the host, 'prefs' sets them. ----
{
  const sidebar = require(path.join(OUT, 'webview.js')).html();
  const pw = ['acts', 'actm', 'actr0', 'actr1', 'actr2', 'actf0', 'actf1', 'actf2', 'actall', 'actbr']; // everything inside the popover wrapper
  const h = createHarness({ page: sidebar, name: 'activity_settings', popIds: pw });
  h.start();
  const el = (i) => h.els.get(i), last = () => h.posted[h.posted.length - 1];
  const prefs = (p) => h.deliver({ type: 'act', m: Object.assign({ type: 'prefs' }, p) }, 'act prefs');
  prefs({ refreshMs: 250, fadeMs: 8000, all: true });
  h.check('prefs check the matching radios and the All chats box', !el('actr0').checked && el('actr1').checked && !el('actr2').checked && el('actf0').checked && el('actall').checked === true);
  h.check('the group titles show the value in effect', el('actrv').textContent === ' · 250 ms' && el('actfv').textContent === ' · 8000 ms');
  prefs({ refreshMs: 500, fadeMs: 8000, all: false });
  h.check('a custom value checks no radio but is still shown, and all:false clears the box', [0, 1, 2].every((i) => !el('actr' + i).checked) && el('actrv').textContent === ' · 500 ms' && el('actall').checked === false);
  const before = h.posted.length;
  h.fire('acts', 'click');
  h.check('the gear opens the popover and reports it', el('actm').hidden === false && el('acts').getAttribute('aria-expanded') === 'true');
  h.check('the gear click does not collapse the section', !h.posted.slice(before).some((p) => p && p.type === 'actOpen'));
  el('actall').checked = true; h.fire('actall', 'change');
  h.check('the All chats checkbox posts its new state', JSON.stringify(last()) === JSON.stringify({ type: 'actSet', key: 'allChats', value: true }));
  el('actr2').checked = true; h.fire('actr2', 'change');
  h.check('a refresh radio posts its value', JSON.stringify(last()) === JSON.stringify({ type: 'actSet', key: 'refreshMs', value: 100 }));
  el('actf1').checked = true; h.fire('actf1', 'change');
  h.check('a fade radio posts its value', JSON.stringify(last()) === JSON.stringify({ type: 'actSet', key: 'fadeMs', value: 4000 }));
  const focused = el('acts').focused || 0;
  h.fire('actall', 'keydown', { key: 'Escape' });
  h.check('Escape closes the popover and returns focus to the gear', el('actm').hidden === true && el('acts').getAttribute('aria-expanded') === 'false' && (el('acts').focused || 0) > focused);
  h.fire('acts', 'click'); h.fire('actbr', 'click');
  h.check('Open in browser posts actBrowser and closes the popover', last() && last().type === 'actBrowser' && el('actm').hidden === true);
  if (h.errors.length) { console.error('check activity_page FAILED (settings popover)'); [...new Set(h.errors)].forEach((e) => console.error('  - ' + e)); process.exit(1); }
}

// ---- 2. Sidebar section (host reachable through vs): click-to-focus on the other-chats hint. ----
{
  const s = activitySection(4000);
  // The section script expects `root` (its shadow root) and `host`, and the list page's global `vs`; the stub document stands in for the root.
  // #bg is the pill row reset() redraws; captionHtml() is the real caption row (live text #cap plus the #capgo button).
  const page = '<div id="bg"></div>' + captionHtml() + '<script nonce="x">const vs = acquireVsCodeApi(); const root = document; const host = document.documentElement;\n' + s.script + '</script>';
  const h = withGroups(createHarness({ page, name: 'activity_section' }));
  h.start();
  const cap = h.els.get('cap'), btn = h.els.get('capgo');
  const tick = () => h.advance(600);
  const act = (m) => h.deliver({ type: 'act', m }, 'act ' + m.type);
  const events = (...evs) => h.deliver({ type: 'act', m: { type: 'events', events: evs } }, 'act events');
  const asks = () => h.posted.filter((p) => p && p.type === 'actFocusOther').length;
  const GO = 'Open the busiest other working chat', IDLE = 'chat A — waiting for you · 2 other chats working';
  // Enabled = shown, not aria-disabled, and the caption text styled as clickable.
  const enabled = () => !btn.hidden && btn.getAttribute('aria-disabled') === 'false' && cap.classList.contains('go');

  h.check('the button starts hidden (the harness stub does not parse other markup attributes)', btn.hidden === true && captionHtml().includes('hidden aria-disabled="true"'));
  act({ type: 'idle', text: IDLE, go: GO, looking: 'Finding the busiest other chat…' }); tick();
  h.check('with the other-chats hint the open button shows, enabled', enabled());
  h.check('the button carries the translated label as title and aria-label', btn.title === GO && btn.getAttribute('aria-label') === GO);
  h.check('the live region is not itself a button', cap.getAttribute('role') === null && cap.getAttribute('tabindex') === null);
  h.check('the open control is a native button (Enter / Space work without key handlers)', page.includes('<button type="button" id="capgo"'));
  h.check('the click wiring is listeners, not inline handlers', (btn._l.click || []).length === 1 && (cap._l.click || []).length === 1 && !/\son(click|keydown)=/.test(page));

  // Double click inside one paint window: the first click disables synchronously, so the second posts nothing.
  h.fire(btn, 'click'); h.fire(btn, 'click');
  h.check('a double click within the paint throttle posts once', asks() === 1);
  h.check('the click disables the button at once, before the paint', btn.getAttribute('aria-disabled') === 'true' && !cap.classList.contains('go'));
  tick();
  h.check('a click shows its outcome', cap.textContent === 'Finding the busiest other chat…');
  h.check('the button stays shown (disabled) while the click is in flight, so focus is kept', btn.hidden === false && btn.getAttribute('aria-disabled') === 'true');
  h.fire(cap, 'click'); tick();
  h.check('a click on the outcome text sends nothing', asks() === 1);

  act({ type: 'note', text: 'Opening chat B…' }); tick();
  h.check('the host outcome replaces the click text', cap.textContent === 'Opening chat B…' && !cap.classList.contains('bad'));
  // Live events must not wipe an active click outcome (wait, end of the last call, wake).
  events({ t: 'wait', g: 'think' }, { t: 'busy', id: 'z', g: 'files' }, { t: 'end', id: 'z', g: 'files' }, { t: 'wake' }); tick();
  h.check('wait / end / wake keep an active click outcome on screen', cap.textContent === 'Opening chat B…');
  h.advance(4100); tick();
  h.check('the outcome falls back to the enabled idle caption after 4 s', cap.textContent === IDLE && enabled());

  h.fire(cap, 'click'); tick();
  h.check('a click on the caption text works too while enabled', asks() === 2);
  h.advance(4100); tick();

  // A real live caption during an outcome replaces it, and the outcome's fallback timer must not wipe that caption later.
  h.fire(btn, 'click'); tick();
  events({ t: 'caption', text: 'Running: x' }); tick();
  h.advance(4100); tick();
  h.check('a live caption that replaced an outcome is not wiped by its timer', asks() === 3 && cap.textContent === 'Running: x');
  h.check('over a live caption the button is disabled', btn.getAttribute('aria-disabled') === 'true' && !cap.classList.contains('go'));
  h.fire(btn, 'click'); tick();
  h.check('a click over a live caption sends nothing', asks() === 3);
  events({ t: 'wait', g: 'think' }); tick();
  h.check('with no outcome showing, wait drops the live caption to the idle text', cap.textContent === IDLE && enabled());

  act({ type: 'note', text: 'Could not open chat B', err: true }); tick();
  h.check('a failed open is shown as an error', cap.textContent === 'Could not open chat B' && cap.classList.contains('bad'));
  h.advance(4100); tick();
  h.check('the error clears with the next caption', !cap.classList.contains('bad'));

  h.deliver({ type: 'events', events: [] }, 'unwrapped'); // a list-page message that is not 'act' must be ignored by the section

  act({ type: 'reset' }); act({ type: 'idle', text: 'chat C — idle', go: '', looking: '' }); tick();
  h.check('without the hint (go empty) the idle caption is plain text and the button hidden', cap.textContent === 'chat C — idle' && !cap.classList.contains('go') && btn.hidden === true);
  act({ type: 'idle', text: 'chat C — idle · 1 other chat working', go: GO, looking: 'x' }); tick();
  act({ type: 'reset' }); tick();
  h.check('reset drops the button with the old chat', !cap.classList.contains('go') && btn.hidden === true && btn.getAttribute('aria-disabled') === 'true');
  h.report('idle vs live caption, end / wait / reset, click-to-focus button, double click, outcome kept over live events');
}
