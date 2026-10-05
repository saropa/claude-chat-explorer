// Shared harness for the page checks: builds a stub DOM and a fake clock, runs a page script in node vm,
// and collects every exception, window.onerror and console.error as a failure.
// Page-agnostic: pass the page html and the ids that sit inside a popover wrapper.
const vm = require('vm');

/** A stub element; hidden, classes, attributes and listeners behave like the real thing for the page scripts. */
function mkEl(id) {
  const cls = new Set();
  return {
    id, value: '', checked: false, hidden: false, disabled: false, title: '', textContent: '', innerHTML: '', className: '', tabIndex: 0,
    scrollTop: 0, scrollHeight: 0, clientHeight: 0, offsetWidth: 300, offsetHeight: 20, dataset: {}, style: { setProperty() {}, removeProperty() {} },
    children: [], childNodes: [], parentNode: null, get parentElement() { return mkEl(''); }, options: [{ text: 'Any', value: '' }], selectedIndex: 0, nextElementSibling: null, previousElementSibling: null, isConnected: true, open: false, type: '', selectionStart: 0,
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) { cls.add(c); } else { cls.delete(c); } return on; } },
    _l: {}, attrs: {}, addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }, removeEventListener() {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; }, removeAttribute(k) { delete this.attrs[k]; },
    focus() { this.focused = (this.focused || 0) + 1; }, blur() {}, click() {}, select() {}, scrollIntoView() {}, appendChild() {}, remove() {}, insertAdjacentHTML() {}, setSelectionRange() {},
    closest(sel) { return this.inPw && sel === '.pw' ? {} : null; }, matches: () => false, contains: () => false, querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 20, width: 300, height: 20 }),
  };
}

/** A fake clock: timers run only when advance(ms) is called; Date.now() follows it. */
function mkClock() {
  const c = { t: Date.now(), seq: 0, timers: new Map() };
  c.setTimeout = (f, ms) => { const id = ++c.seq; c.timers.set(id, { f, at: c.t + Math.max(0, Number(ms) || 0), every: 0 }); return id; };
  c.setInterval = (f, ms) => { const id = ++c.seq; const e = Math.max(1, Number(ms) || 1); c.timers.set(id, { f, at: c.t + e, every: e }); return id; };
  c.clear = (id) => { c.timers.delete(id); };
  c.pending = () => c.timers.size;
  /** Move time forward, running due timers in order; a throwing timer is reported through onThrow. */
  c.advance = (ms, onThrow) => {
    const end = c.t + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of c.timers) { if (t.at <= end && (!next || t.at < next[1].at)) { next = [id, t]; } }
      if (!next) { break; }
      const [id, t] = next;
      c.t = Math.max(c.t, t.at);
      if (t.every) { t.at = c.t + t.every; } else { c.timers.delete(id); }
      try { t.f(); } catch (e) { onThrow(e); }
    }
    c.t = end;
  };
  return c;
}

/**
 * createHarness({ page, name, width, popIds }):
 *   page: the html of the page; name: label for messages; width/height: window size; popIds: element ids that sit inside a .pw wrapper.
 * Returns the stub world and helpers; call h.start() to run the script, h.report() to finish.
 */
function createHarness(opt) {
  const page = opt.page, name = opt.name || 'page';
  const m = /<script nonce="[^"]*">([\s\S]*)<\/script>/.exec(page);
  const errors = [];
  const fail = (where, e) => errors.push(where + ': ' + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '));
  const h = { page, errors, fail, clock: mkClock(), posted: [], listeners: { window: {}, document: {} } };
  if (!m) { console.error('check ' + name + ': no <script> found in the page'); process.exit(1); }
  h.script = m[1];
  h.check = (what, cond) => { if (!cond) { fail(what, 'expected output missing'); } };
  h.step = (what, fn) => { try { fn(); } catch (e) { fail(what, e); } };
  try { new vm.Script(h.script, { filename: name + '.js' }); } catch (e) { fail('syntax', e); h.syntaxFailed = true; }

  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
  h.mkEl = mkEl;
  h.els = new Map(ids.map((i) => [i, mkEl(i)]));
  for (const t of page.matchAll(/<[^>]*\sid="([^"]+)"[^>]*>/g)) { if (/\shidden(\s|>|=)/.test(t[0])) { h.els.get(t[1]).hidden = true; } } // honor hidden in the markup
  (opt.popIds || []).forEach((i) => { if (h.els.get(i)) { h.els.get(i).inPw = true; } });
  const listeners = h.listeners;
  const document = {
    body: mkEl('body'), documentElement: Object.assign(mkEl('html'), { clientWidth: opt.width || 400 }), activeElement: null,
    getElementById: (i) => h.els.get(i) || null, querySelector: () => null, querySelectorAll: () => [],
    createElement: (t) => Object.assign(mkEl(''), t === 'template' ? { content: { children: [] } } : {}),
    addEventListener(t, f) { (listeners.document[t] = listeners.document[t] || []).push(f); }, removeEventListener() {},
  };
  const window = {
    addEventListener(t, f) { (listeners.window[t] = listeners.window[t] || []).push(f); }, removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: () => ({ matches: false, addEventListener() {} }),
    innerWidth: opt.width || 400, innerHeight: opt.height || 800, requestAnimationFrame: (f) => h.clock.setTimeout(f, 16), getSelection: () => ({ toString: () => '' }),
  };
  const clk = h.clock;
  class FakeDate extends Date { constructor(...a) { if (a.length) { super(...a); } else { super(clk.t); } } static now() { return clk.t; } }
  const sandbox = {
    window, document, console: { log() {}, warn() {}, error: (...a) => fail('console.error', a.map(String).join(' ')) },
    acquireVsCodeApi: () => ({ postMessage: (x) => h.posted.push(x), getState: () => undefined, setState() {} }),
    setTimeout: clk.setTimeout, clearTimeout: clk.clear, setInterval: clk.setInterval, clearInterval: clk.clear, requestAnimationFrame: window.requestAnimationFrame,
    navigator: { clipboard: {} }, Date: FakeDate, Math, JSON, Array, Object, Set, Map, String, Number, RegExp, Error, Promise, Intl, URL, Symbol,
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} }, CSS: { escape: (s) => s },
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  Object.assign(window, { document, console: sandbox.console });
  h.document = document; h.window = window;
  h.ctx = vm.createContext(sandbox);
  h.run = (code, where) => { try { return vm.runInContext(code, h.ctx, { filename: where }); } catch (e) { fail(where, e); } };
  /** Fire an event on a stub element (its own listeners, then document's) or on document. */
  h.fire = (idOrEl, type, extra) => {
    const el = typeof idOrEl === 'string' ? h.els.get(idOrEl) : idOrEl;
    const ev = Object.assign({ type, key: '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault() {}, stopPropagation() {}, target: el }, extra || {});
    const fs = el === document ? listeners.document[type] || [] : (el._l[type] || []).concat(listeners.document[type] || []);
    for (const f of fs) { try { f(ev); } catch (e) { fail('event ' + type, e); } }
  };
  /** Post a host message to the page. */
  h.deliver = (msg, where) => {
    for (const f of listeners.window.message || []) { try { f({ data: msg }); } catch (e) { fail(where || msg.type, e); } }
  };
  /** Move the fake clock; a throwing timer is a failure. */
  h.advance = (ms) => clk.advance(ms, (e) => fail('timer', e));
  h.resize = (w) => {
    window.innerWidth = w; document.documentElement.clientWidth = w;
    for (const f of listeners.window.resize || []) { try { f({ type: 'resize' }); } catch (e) { fail('resize', e); } }
  };
  h.start = () => { if (!h.syntaxFailed) { h.run(h.script, name + '.js'); } };
  h.report = (okText) => {
    const uniq = [...new Set(errors)];
    if (uniq.length) {
      console.error('check ' + name + ' FAILED: the page script threw or a check failed (' + uniq.length + ')');
      uniq.slice(0, 12).forEach((e) => console.error('  - ' + e));
      process.exit(1);
    }
    console.log('check ' + name + ' OK: ' + (okText || 'page script ran ' + h.posted.length + ' posts, no exceptions'));
    process.exit(0);
  };
  return h;
}

module.exports = { createHarness, mkEl, mkClock };
