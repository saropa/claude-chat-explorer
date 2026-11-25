// Fails the build when the stale-registry detector is wrong. Drives out/staleConfig.js (no vscode): a window that started on an old
// build and got a newer extension host has a registry without the new settings; staleKeys must name exactly those.
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { manifestProperties, staleKeys, isUnregisteredError } = require(path.join(OUT, 'staleConfig.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const props = { 'saropaChats.a': { default: true }, 'saropaChats.b': { default: 0 }, 'saropaChats.c': { type: 'string' } };

// 1. Every declared default is registered: nothing stale.
check('no stale keys when all defaults are registered', eq(staleKeys(props, () => true), []));
// 2. A default of false/0 is still a registered default (only undefined means unknown).
check('false and 0 defaults count as registered', eq(staleKeys(props, (k) => (k === 'saropaChats.a' ? false : 0)), []));
// 3. A key the registry does not know is flagged.
check('unregistered key is stale', eq(staleKeys(props, (k) => (k === 'saropaChats.a' ? undefined : true)), ['saropaChats.a']));
// 4. A key with no manifest default is never flagged, even when the registry returns undefined.
check('key without a manifest default is not flagged', eq(staleKeys(props, () => undefined), ['saropaChats.a', 'saropaChats.b']));
// 5. Object and array forms of contributes.configuration.
check('object form', eq(Object.keys(manifestProperties({ properties: props })), Object.keys(props)));
check('array form merges sections', eq(Object.keys(manifestProperties([{ properties: { x: { default: 1 } } }, { properties: { y: { default: 2 } } }, {}])), ['x', 'y']));
check('missing configuration is empty', eq(manifestProperties(undefined), {}));

// 6. The real manifest: every setting with a default is found, so the detector sees the real keys.
const pkg = require(path.join(ROOT, 'package.json'));
const real = manifestProperties(pkg.contributes.configuration);
check('real manifest has settings', Object.keys(real).length > 0);
check('real manifest declares activity.allChats', real['saropaChats.activity.allChats'] !== undefined);
check('real manifest is not stale against itself', eq(staleKeys(real, (k) => real[k].default), []));

// 7. Only VS Code's unregistered-setting rejection counts as a stale registry.
check('unregistered error matches', isUnregisteredError(new Error('Unable to write to User Settings because saropaChats.activity.allChats is not a registered configuration.')));
check('string error matches', isUnregisteredError('x is not a registered configuration'));
check('other error does not match', !isUnregisteredError(new Error('EACCES: permission denied')));
check('undefined does not match', !isUnregisteredError(undefined));

if (failures.length) { console.error('check_staleconfig FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('check_staleconfig ok');
