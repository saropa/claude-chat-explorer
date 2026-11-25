// Unit check for out/keepWarmSettings.js (hook add/remove edits) and resources/keep_warm.js (early-exit behavior). No VS Code needed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const k = require(path.join(OUT, 'keepWarmSettings.js'));
const fails = [];
const check = (n, c) => { if (!c) { fails.push(n); } };
const S = '/home/u/.claude/saropa-chats/keep_warm.js';
const want = { type: 'command', command: 'node', args: [S], asyncRewake: true, timeout: 3900 };
const other = { hooks: [{ type: 'command', command: 'echo hi' }] };

// Add: empty settings gets the exact entry in a new group.
let r = k.addHook({}, S);
check('add to empty', r.changed && JSON.stringify(r.settings) === JSON.stringify({ hooks: { Stop: [{ hooks: [want] }] } }));
// Add twice: no duplicate, no change.
const again = k.addHook(r.settings, S);
check('no duplicate', !again.changed && again.settings.hooks.Stop.length === 1);
// Stale own entry is rewritten in place.
const stale = { hooks: { Stop: [{ hooks: [{ ...want, timeout: 1 }] }] } };
r = k.addHook(stale, S);
check('stale rewritten', r.changed && r.settings.hooks.Stop[0].hooks[0].timeout === 3900 && r.settings.hooks.Stop.length === 1);
// Other hooks and keys are preserved.
r = k.addHook({ theme: 'x', hooks: { Stop: [other], PreToolUse: [other] } }, S);
check('others kept', r.settings.theme === 'x' && r.settings.hooks.PreToolUse.length === 1 && r.settings.hooks.Stop.length === 2 && r.settings.hooks.Stop[0] === undefined === false);
// Input object is not mutated.
const input = { hooks: { Stop: [other] } };
k.addHook(input, S);
check('input not mutated', input.hooks.Stop.length === 1);

// Remove: sole entry drops group, Stop and hooks.
r = k.removeHook({ hooks: { Stop: [{ hooks: [want] }] } }, S);
check('remove sole', r.changed && !('hooks' in r.settings));
// Remove: shared group keeps the other hook; other groups stay.
r = k.removeHook({ hooks: { Stop: [{ hooks: [other.hooks[0], want] }, other], PreToolUse: [other] } }, S);
check('remove shared', r.changed && r.settings.hooks.Stop.length === 2 && r.settings.hooks.Stop[0].hooks.length === 1 && r.settings.hooks.PreToolUse.length === 1);
// Remove: nothing to remove is a no-op, and a pre-existing empty group is left alone.
r = k.removeHook({ hooks: { Stop: [{ hooks: [] }] } }, S);
check('remove no-op', !r.changed && r.settings.hooks.Stop.length === 1);
check('remove on empty', !k.removeHook({}, S).changed);

// Script: exits 0 silently on bad input, a missing session id and CLAUDE_CODE_REMOTE (HOME redirected so no state is written to the real one).
const script = path.join(ROOT, 'resources', 'keep_warm.js');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-'));
const run = (input, env) => spawnSync(process.execPath, [script], { input, env: { ...process.env, HOME: home, USERPROFILE: home, ...env }, timeout: 15000 });
check('bad json exits 0', run('not json').status === 0);
check('no session exits 0', run('{}').status === 0);
check('remote exits 0', run('{"session_id":"s1"}', { CLAUDE_CODE_REMOTE: '1' }).status === 0);
check('remote wrote nothing', !fs.existsSync(path.join(home, '.claude', 'keepwarm')));
// Global off-switch: state token is still published, then the script exits 0 without waiting.
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'keepwarm.off'), '');
const off = run('{"session_id":"s2","cwd":""}');
check('off exits 0', off.status === 0);
const st = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'keepwarm', 's2.json'), 'utf8'));
check('state written', typeof st.token === 'string' && st.pings === 0);
fs.rmSync(home, { recursive: true, force: true });

if (fails.length) { console.error('check_keepwarm FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('check_keepwarm ok');
