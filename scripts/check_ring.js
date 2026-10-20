// Fails the build when the row context ring breaks its promises: no ring without token data, fill and color steps at 80% and 100%,
// the "136.8k of 300k tokens" tooltip, no inline style (CSP is nonce-only), and the setting reaching the webview live.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { CTX_JS, CTX_CSS } = require(path.join(OUT, 'webviewCtx.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };

const make = new Function('return (function(){' + CTX_JS + '\nreturn {ringHtml, setMax(n){ringMax=n;}};})()');
const ring = make();
const html = (tokens, max) => { if (max) { ring.setMax(max); } return ring.ringHtml(tokens === undefined ? {} : { ctx: { tokens } }); };

check('no ring without context data', html(undefined, 300000) === '' && ring.ringHtml({ ctx: { tokens: 0 } }) === '');
const a = html(136800, 300000);
check('tooltip reads "136.8k of 300k tokens"', /data-tip="136\.8k of 300k tokens"/.test(a) && /aria-label="136\.8k of 300k tokens"/.test(a));
check('half-full ring has the normal color and a proportional dash', !/ rw| re/.test(a.match(/class="rg[^"]*"/)[0]) && /stroke-dasharray="17\.2 37\.7"/.test(a));
check('warning from 80 percent', / rw"/.test(html(240000, 300000)) && !/ rw"/.test(html(239000, 300000)));
check('error from 100 percent, dash capped at the full circle', / re"/.test(html(300000, 300000)) && / re"/.test(html(900000, 300000)) && /stroke-dasharray="37\.7 37\.7"/.test(html(900000, 300000)));
check('the limit setting moves the steps (1M limit)', !/ rw| re/.test(html(500000, 1000000).match(/class="rg[^"]*"/)[0]) && /500k of 1M tokens/.test(html(500000, 1000000)));
check('no inline style attribute in the ring', !/style=/.test(a));
check('ring CSS uses theme variables and has warning and error colors', /\.rg\.rw/.test(CTX_CSS) && /\.rg\.re/.test(CTX_CSS) && /--vscode-editorWarning-foreground/.test(CTX_CSS) && /--vscode-editorError-foreground/.test(CTX_CSS));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const set = pkg.contributes.configuration.properties['saropaChatExplorer.contextRingTokens'];
check('contextRingTokens is a number, default 300000, minimum 10000', !!set && set.type === 'number' && set.default === 300000 && set.minimum === 10000);
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
check('a change of the setting is posted to the panel, and restore sends it', /affectsConfiguration\('saropaChatExplorer\.contextRingTokens'\)\) \{ provider\.postRing\(\)/.test(ext) && /this\.postRing\(\);\s*void this\.postMeta/.test(ext));
check('the webview handles the ring message', /d\.type==='ring'/.test(fs.readFileSync(path.join(ROOT, 'src', 'webviewJs.ts'), 'utf8')));
const st = require(path.join(OUT, 'status.js'));
check('statuses keep Tiny, Huge, Empty and Nearly full', ['tiny', 'huge', 'empty', 'nearly'].every((k) => st.STATUS_KEYS ? st.STATUS_KEYS.includes(k) : true) && !st.pillOf);

if (failures.length) { console.error('check_ring FAILED (' + failures.length + ')'); failures.forEach((e) => console.error('  - ' + e)); process.exit(1); }
console.log('check_ring OK: ring fill, color steps, tooltip, no inline style, setting wiring');
