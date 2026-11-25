// Fails the build when the Activity page script mishandles its caption. Runs the real page script (out/activityHtml.js) in the stub DOM
// of webview_harness.js with its fake clock (the caption is throttled to two paints a second, so every step advances the clock past 500 ms)
// and feeds it host messages: the idle caption, live captions, end / wait / reset events, and the click-to-focus state of the sidebar section.
const path = require('path');
const { createHarness, mkEl } = require('./webview_harness');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { activityHtml, activitySection } = require(path.join(OUT, 'activityHtml.js'));

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

// ---- 2. Sidebar section (host reachable through vs): click-to-focus on the other-chats hint. ----
{
  const s = activitySection(4000);
  // The section script expects `root` (its shadow root) and `host`, and the list page's global `vs`; the stub document stands in for the root.
  // #bg is the pill row reset() redraws; #cap the caption under test.
  const page = '<div id="bg"></div><div id="cap"></div><script nonce="x">const vs = acquireVsCodeApi(); const root = document; const host = document.documentElement;\n' + s.script + '</script>';
  const h = withGroups(createHarness({ page, name: 'activity_section' }));
  h.start();
  const cap = h.els.get('cap');
  const tick = () => h.advance(600);
  const act = (m) => h.deliver({ type: 'act', m }, 'act ' + m.type);
  const asks = () => h.posted.filter((p) => p && p.type === 'actFocusOther').length;
  const GO = 'Open the busiest other working chat';

  act({ type: 'idle', text: 'chat A — waiting for you · 2 other chats working', go: GO, looking: 'Finding the busiest other chat…' }); tick();
  h.check('with the other-chats hint the caption is a button', cap.classList.contains('go') && cap.getAttribute('role') === 'button' && cap.getAttribute('tabindex') === '0');
  h.check('the button carries the translated label as title and aria-label', cap.title === GO && cap.getAttribute('aria-label') === GO);
  h.check('the click wiring is listeners, not inline handlers', (cap._l.click || []).length === 1 && (cap._l.keydown || []).length === 1);

  h.fire(cap, 'click'); tick();
  h.check('a click asks the host to focus the busiest other chat', asks() === 1);
  h.check('a click shows its outcome at once and the caption stops being a button', cap.textContent === 'Finding the busiest other chat…' && !cap.classList.contains('go'));
  h.fire(cap, 'click'); tick();
  h.check('a second click on the outcome text sends nothing', asks() === 1);

  act({ type: 'note', text: 'Opening chat B…' }); tick();
  h.check('the host outcome replaces the click text', cap.textContent === 'Opening chat B…' && !cap.classList.contains('bad'));
  h.advance(4100); tick();
  h.check('the outcome falls back to the clickable idle text after 4 s', cap.textContent.startsWith('chat A') && cap.classList.contains('go'));

  let prevented = 0;
  h.fire(cap, 'keydown', { key: 'Enter', preventDefault() { prevented++; } }); tick();
  h.check('Enter activates the button', asks() === 2 && prevented === 1);
  h.advance(4100); tick();
  h.fire(cap, 'keydown', { key: ' ', preventDefault() { prevented++; } }); tick();
  h.check('Space activates the button', asks() === 3 && prevented === 2);
  h.advance(4100); tick();
  h.fire(cap, 'keydown', { key: 'a' }); tick();
  h.check('other keys do nothing', asks() === 3);

  act({ type: 'note', text: 'Could not open chat B', err: true }); tick();
  h.check('a failed open is shown as an error', cap.textContent === 'Could not open chat B' && cap.classList.contains('bad'));
  h.advance(4100); tick();
  h.check('the error clears with the next caption', !cap.classList.contains('bad'));

  h.deliver({ type: 'events', events: [] }, 'unwrapped'); // a list-page message that is not 'act' must be ignored by the section
  h.deliver({ type: 'act', m: { type: 'events', events: [{ t: 'caption', text: 'Running: tests' }] } }); tick();
  h.check('over a live caption the caption is plain text', cap.textContent === 'Running: tests' && !cap.classList.contains('go') && cap.getAttribute('role') === null);
  h.fire(cap, 'click'); tick();
  h.check('a click on a live caption sends nothing', asks() === 3);

  act({ type: 'reset' }); act({ type: 'idle', text: 'chat C — idle', go: '', looking: '' }); tick();
  h.check('without the hint (go empty) the idle caption is plain text', cap.textContent === 'chat C — idle' && !cap.classList.contains('go') && cap.getAttribute('tabindex') === null && cap.title === '');
  act({ type: 'idle', text: 'chat C — idle · 1 other chat working', go: GO, looking: 'x' }); tick();
  act({ type: 'reset' }); tick();
  h.check('reset drops the button state with the old chat', !cap.classList.contains('go') && cap.getAttribute('role') === null);
  h.report('idle vs live caption, end / wait / reset, click-to-focus button state, Enter / Space, outcome notes');
}
