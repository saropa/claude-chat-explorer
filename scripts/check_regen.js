// Unit check for out/regenTitles.js: prompt extraction, emoji/title validation, result parsing, live-session filter. Never calls claude.
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const r = require(path.join(OUT, 'regenTitles.js'));
const fails = [];
const check = (w, c) => { if (!c) { fails.push(w); } };
check('emoji ok', r.validEmoji('🚀') && r.validEmoji('👍🏽') && r.validEmoji('🇦🇺'));
check('emoji bad', !r.validEmoji('') && !r.validEmoji('ab') && !r.validEmoji('🚀🔥') && !r.validEmoji(5));
check('title ok', r.validTitle('Fix login bug') && r.validTitle('One two three four five six seven eight'));
check('title bad', !r.validTitle('Single') && !r.validTitle('a b c d e f g h i') && !r.validTitle('x '.repeat(30)));
check('parse', r.parseResult('noise {"emoji":"🐛","title":"Fix login bug."} tail') === '🐛 Fix login bug');
let threw = false; try { r.parseResult('{"emoji":"x","title":"Fix bug"}'); } catch { threw = true; }
check('parse invalid throws', threw);
const u = (content, extra) => JSON.stringify({ type: 'user', message: { content }, ...extra });
const text = [u('first'), u('<ide>skip'), u('[x]'), u('meta', { isMeta: true }), u('side', { isSidechain: true }),
  u([{ type: 'text', text: '<a>tag' }, { type: 'text', text: 'blocks ok' }]), u('third'), u('fourth'), 'not json',
  JSON.stringify({ type: 'custom-title', customTitle: 'Old' })].join('\n');
const i = r.readInfo(text);
check('prompts', JSON.stringify(i.prompts) === JSON.stringify(['first', 'blocks ok', 'third']) && i.title === 'Old');
check('truncate', r.promptData(['a'.repeat(2000)]).length === 1500);
check('project dir', r.projectDirName('/Users/a/my.proj') === '-Users-a-my-proj');
const now = 10 * 60 * 1000;
const p = r.pickFiles([{ id: 'cur', mtime: 0 }, { id: 'new', mtime: now - 1000 }, { id: 'old', mtime: 0 }], 'cur', now);
check('live filter', p.run.length === 1 && p.run[0].id === 'old' && p.live.length === 2);
const l = r.titleLines('🐛 Fix bug', 's1').trim().split('\n').map((x) => JSON.parse(x));
check('title lines', l[0].type === 'custom-title' && l[0].customTitle === '🐛 Fix bug' && l[1].type === 'agent-name' && l[1].agentName === '🐛 Fix bug' && l[1].sessionId === 's1');
if (fails.length) { console.error('Regen check FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('Regen check passed.');
