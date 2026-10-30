// Unit check for out/autoTitleFlag.js: setting wins, stored fallback otherwise, toggle failure stores the fallback.
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const f = require(path.join(OUT, 'autoTitleFlag.js'));
const fails = [];
const check = (w, c) => { if (!c) { fails.push(w); } };
(async () => {
  check('config true', f.autoTitleOn(true, false) === true);
  check('config false beats fallback true', f.autoTitleOn(false, true) === false);
  check('unset uses fallback', f.autoTitleOn(undefined, true) === true && f.autoTitleOn(undefined, undefined) === false);
  check('unregistered uses fallback', f.autoTitleOn(undefined, true) === true);
  let stored = 'untouched';
  const store = async (v) => { stored = v; };
  const logs = [];
  check('write ok', (await f.setAutoTitle(true, async () => {}, store, (e) => logs.push(e))) === true && stored === undefined && !logs.length);
  check('write fails', (await f.setAutoTitle(true, async () => { throw new Error('not a registered configuration'); }, store, (e) => logs.push(e))) === false && stored === true && logs.length === 1);
  check('fails off', (await f.setAutoTitle(false, async () => { throw new Error('x'); }, store, () => {})) === false && stored === false);
  check('keys', f.AUTO_FALLBACK_KEY === 'saropaChatExplorer.autoTitle.enabled.fallback');
  if (fails.length) { console.error('AutoTitleFlag check FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('AutoTitleFlag check passed.');
})();
