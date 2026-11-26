// Static check of the sidebar section headers and the popover registry.
// 1. Narrow sidebar: each header (Account & Usage, Session Manager, Activity) is a block whose text label truncates with an ellipsis,
//    and the gear / three-dot buttons never shrink, so at ~180px the label gives way instead of running under the buttons.
// 2. Popover registry: makePop called again for the same buttons (a section script re-run) replaces its window.__pops entry instead of
//    adding a stale second one; different buttons still get their own entry.
const path = require('path');
const vm = require('vm');

const OUT = process.env.CCS_OUT || path.join(__dirname, '..', '..', 'out');
const page = require(path.join(OUT, 'webview.js')).html();
const { POP_JS } = require(path.join(OUT, 'webviewPop.js'));
const fails = [];
const check = (what, ok) => { if (!ok) { fails.push(what); } };

// The declarations of one CSS selector, joined (a selector may appear in several rules); '' when the page has none.
const rulesOf = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...page.matchAll(new RegExp('(?:^|[}\\n,])\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1]).join(';');
};

// ---- 1. Header labels truncate; buttons keep their size. ----
// The labels are bare text nodes; a flex header would make them items that never shrink, so each header must be a block that truncates.
for (const sel of ['#acth', '#smh', '#acct>summary']) {
  const r = rulesOf(sel);
  for (const decl of ['display:block', 'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap']) {
    check(`${sel} declares ${decl}`, r.includes(decl));
  }
  check(`${sel} is not a flex box (a flex text item would not truncate)`, !/display:\s*(inline-)?flex/.test(r));
  // Font sizes follow the theme: a px font size on a header would ignore the user's font setting.
  check(`${sel} sets no px font size`, !/font-size:\s*\d+px/.test(r));
  check(`${sel} chevron is an inline box beside the text`, rulesOf(sel + '>.chev').includes('display:inline-block'));
}
for (const sel of ['#acth', '#smh']) { check(`${sel} may shrink (min-width:0, flex:1)`, rulesOf(sel).includes('min-width:0') && rulesOf(sel).includes('flex:1')); }
for (const sel of ['#acts', '#smm']) { check(`${sel} never shrinks (flex:none)`, rulesOf(sel).includes('flex:none')); }
check('header button wrappers never shrink', /#acthr>\.pw,#smhr>\.pw\{flex:none\}/.test(page));
// The Account gear is positioned over the summary, so the summary must reserve room for it in the rule that sets its padding (an earlier separate padding-right rule was silently reset).
check('Account summary reserves room for its gear', /padding:2px 28px 2px 0/.test(rulesOf('#acct>summary')));

// ---- 2. Popover registry dedupe. ----
{
  // Minimal DOM: makePop only registers listeners and looks elements up by id at call time.
  const stub = () => ({ hidden: true, setAttribute() {}, focus() {}, style: {}, getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), offsetWidth: 0, offsetHeight: 0 });
  const els = new Map();
  const document = { getElementById: (id) => { if (!els.has(id)) { els.set(id, stub()); } return els.get(id); }, addEventListener() {}, documentElement: { clientWidth: 300 } };
  const window = { addEventListener() {}, innerWidth: 300, innerHeight: 600 };
  const ctx = vm.createContext({ document, window });
  vm.runInContext(POP_JS + '\nthis.makePop=makePop;', ctx);
  ctx.makePop([['acts', 'actm']]);
  ctx.makePop([['acts', 'actm']]); // a re-render wiring the same gear again
  check('a second makePop for the same button leaves one registry entry', window.__pops.length === 1);
  const sm = ctx.makePop([['smm', 'smmm']]);
  check('a makePop for another button adds its own entry', window.__pops.length === 2 && window.__pops.includes(sm));
  // The surviving entry for the gear is the newest instance, so toggling closes live popovers, not a stale copy.
  const latest = ctx.makePop([['acts', 'actm']]);
  check('the newest instance replaces the old one', window.__pops.length === 2 && window.__pops.includes(latest));
}

if (fails.length) { console.error('Header check FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('Header check passed.');
