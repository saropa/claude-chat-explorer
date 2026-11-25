// Unit check for out/keepWarmSettings.js (hook add/remove edits) and resources/keep_warm.js (early-exit behavior). No VS Code needed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const k = require(path.join(OUT, 'keepWarmSettings.js'));
const lg = require(path.join(OUT, 'keepWarmLog.js'));
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
check('others kept', r.settings.theme === 'x' && r.settings.hooks.PreToolUse.length === 1 && r.settings.hooks.Stop.length === 2);
// The old assertion `... === undefined === false` was a no-op; compare by JSON: user's group first and unchanged, ours appended.
check('others kept: user group unchanged', JSON.stringify(r.settings.hooks.Stop[0]) === JSON.stringify(other));
check('others kept: own group appended', JSON.stringify(r.settings.hooks.Stop[1]) === JSON.stringify({ hooks: [want] }));
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
// CLAUDE_CONFIG_DIR is blanked so a developer's own value cannot redirect the test state; blank must fall back to ~/.claude.
const run = (input, env) => spawnSync(process.execPath, [script], { input, env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: '', ...env }, timeout: 15000 });
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
// pendingPing: the watcher's flag makes a non-marker reply count as a ping turn (count kept), and one Stop consumes it.
const stateFile = path.join(home, '.claude', 'keepwarm', 's3.json');
const runTurn = (reply) => run(JSON.stringify({ session_id: 's3', cwd: '', last_assistant_message: reply }));
fs.writeFileSync(stateFile, JSON.stringify({ token: 'old', pings: 3, pendingPing: true }));
runTurn('Sure, it is 9:05 AM');
let s3 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
check('pendingPing keeps count on paraphrased reply', s3.pings === 3);
check('pendingPing cleared after one Stop', !('pendingPing' in s3));
runTurn('a real answer');
s3 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
check('real turn resets count once flag is gone', s3.pings === 0);
fs.writeFileSync(stateFile, JSON.stringify({ token: 'old', pings: 4 }));
runTurn('warm · 9:05 AM');
check('marker reply without flag keeps count', JSON.parse(fs.readFileSync(stateFile, 'utf8')).pings === 4);
// pendingPing + a long reply is a real user turn: count resets and the flag is consumed (the 80-char cap).
fs.writeFileSync(stateFile, JSON.stringify({ token: 'old', pings: 5, pendingPing: true }));
runTurn('x'.repeat(81));
s3 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
check('pendingPing + long reply resets count', s3.pings === 0 && !('pendingPing' in s3));
// Boundary: exactly 80 chars still counts as a ping answer.
fs.writeFileSync(stateFile, JSON.stringify({ token: 'old', pings: 5, pendingPing: true }));
runTurn('x'.repeat(80));
check('pendingPing + 80-char reply keeps count', JSON.parse(fs.readFileSync(stateFile, 'utf8')).pings === 5);
// A marker reply is a ping turn even when long and without the flag.
fs.writeFileSync(stateFile, JSON.stringify({ token: 'old', pings: 5 }));
runTurn('warm · ' + 'x'.repeat(200));
check('marker reply keeps count regardless of length', JSON.parse(fs.readFileSync(stateFile, 'utf8')).pings === 5);
// Heartbeat: written on valid input even for early exits (remote / no session), not on bad JSON.
const hb = path.join(home, '.claude', 'saropa-chats', 'last_run.json');
check('heartbeat written on valid run', fs.existsSync(hb) && JSON.parse(fs.readFileSync(hb, 'utf8')).version === 1);
const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw2-'));
spawnSync(process.execPath, [script], { input: 'not json', env: { ...process.env, HOME: home2, USERPROFILE: home2, CLAUDE_CONFIG_DIR: '' }, timeout: 15000 });
check('no heartbeat on bad stdin', !fs.existsSync(path.join(home2, '.claude', 'saropa-chats', 'last_run.json')));
// CLAUDE_CONFIG_DIR: heartbeat and state land under it, not under HOME/.claude.
const cfg = path.join(home2, 'custom-cfg');
spawnSync(process.execPath, [script], { input: '{"session_id":"s9","cwd":""}', env: { ...process.env, HOME: home2, USERPROFILE: home2, CLAUDE_CONFIG_DIR: cfg }, timeout: 15000 });
check('config dir: heartbeat under CLAUDE_CONFIG_DIR', fs.existsSync(path.join(cfg, 'saropa-chats', 'last_run.json')));
check('config dir: state under CLAUDE_CONFIG_DIR', fs.existsSync(path.join(cfg, 'keepwarm', 's9.json')));
check('config dir: nothing under HOME/.claude', !fs.existsSync(path.join(home2, '.claude')));
fs.rmSync(home2, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });

// Config dir resolution (TypeScript side) and the paths derived from it.
check('config dir env wins', k.claudeConfigDir({ CLAUDE_CONFIG_DIR: '/x/cfg' }, '/h') === '/x/cfg');
check('config dir blank falls back', k.claudeConfigDir({ CLAUDE_CONFIG_DIR: '  ' }, '/h') === path.join('/h', '.claude'));
check('config dir unset falls back', k.claudeConfigDir({}, '/h') === path.join('/h', '.claude'));
check('derived paths follow config dir', k.stableScriptPath('/c') === path.join('/c', 'saropa-chats', 'keep_warm.js')
  && k.settingsFilePath('/c') === path.join('/c', 'settings.json') && k.heartbeatPath('/c') === path.join('/c', 'saropa-chats', 'last_run.json')
  && k.pingLogPath('/c') === path.join('/c', 'keepwarm', 'log.jsonl'));

// Absolute node path: written as the command; a changed path rewrites the entry in place; matching stays by script path.
const N1 = '/usr/bin/node', N2 = '/opt/nvm/node';
r = k.addHook({}, S, N1);
check('abs node written as command', r.settings.hooks.Stop[0].hooks[0].command === N1);
r = k.addHook(r.settings, S, N1);
check('same node path: no change', !r.changed);
r = k.addHook(r.settings, S, N2);
check('changed node path rewritten in place', r.changed && r.settings.hooks.Stop.length === 1 && r.settings.hooks.Stop[0].hooks.length === 1 && r.settings.hooks.Stop[0].hooks[0].command === N2);
check('hasOwnHook true/false', k.hasOwnHook(r.settings, S) && !k.hasOwnHook({}, S));
check('remove works regardless of command', k.removeHook(r.settings, S).changed);

// Log summary: today's lines only, tokens summed, ratio, tolerant of garbage and a cut first line.
const day = Date.UTC(2026, 10, 25);
const logText = ['ld":1}', 'not json', '{"t":' + (day / 1000 - 5) + ',"cache_read":999,"cache_creation":1}',
  '{"t":' + (day / 1000 + 10) + ',"cache_read":900,"cache_creation":100}', '{"t":' + (day / 1000 + 20) + ',"cache_read":null,"cache_creation":null}',
  '{"cache_read":5}', '[1]', ''].join(String.fromCharCode(10));
const sm = lg.summarizeLog(logText, day);
check('summary counts only today', sm.pings === 2);
check('summary sums tokens', sm.cacheRead === 900 && sm.cacheCreation === 100 && Math.abs(sm.readShare - 0.9) < 1e-9);
check('summary empty has null share', lg.summarizeLog('', day).readShare === null && lg.summarizeLog('', day).pings === 0);
// Heartbeat freshness: missing and >24h are stale; 23h is fresh; parse tolerates junk.
const nowMs = Date.UTC(2026, 10, 25, 12);
check('heartbeat missing is stale', lg.heartbeatStale(undefined, nowMs));
check('heartbeat 25h is stale', lg.heartbeatStale(nowMs - 25 * 3600e3, nowMs));
check('heartbeat 23h is fresh', !lg.heartbeatStale(nowMs - 23 * 3600e3, nowMs));
check('parseHeartbeat ok', lg.parseHeartbeat('{"t":123,"version":1}') === 123);
check('parseHeartbeat junk', lg.parseHeartbeat('xx') === undefined && lg.parseHeartbeat('{"t":"a"}') === undefined && lg.parseHeartbeat(undefined) === undefined);

if (fails.length) { console.error('check_keepwarm FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('check_keepwarm ok');
