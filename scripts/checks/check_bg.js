// Fails the build when background-task tracking breaks its promises: launches and finish notices parsed from real-shaped log lines (fixtures),
// shell vs agent kinds and launch times, a stale task dropped after BG_STALE_MS, a changed log format reported once, and the all-chats tailer
// staying cheap (the cap holds, and an unchanged chat log is never re-read). Runs out/bgAgents.js and out/activityAll.js on temporary files.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const FIX = path.join(__dirname, 'fixtures', 'bg');
const { BgTracker, feed, BG_STALE_MS } = require(path.join(OUT, 'bgAgents.js'));
const { AllChatsTracker } = require(path.join(OUT, 'activityAll.js'));
const { ColorBook } = require(path.join(OUT, 'chatColors.js'));
const { ALL_CHATS_MAX } = require(path.join(OUT, 'activityFeed.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const lines = (name) => fs.readFileSync(path.join(FIX, name), 'utf8').split('\n').filter(Boolean);

async function main() {
  // 1. Real-shaped lines: kind, launch time, finish notice.
  const open = new Map(), at = new Map();
  lines('launch_shell.jsonl').concat(lines('launch_agent.jsonl')).forEach((l) => feed(open, l, at));
  check('fixture: a shell launch is a shell and an agent launch an agent', open.get('bsh1abc2d') === 'shell' && open.get('agt9xyz8w') === 'agent');
  check('fixture: launch times come from the line timestamp', at.get('bsh1abc2d') === Date.parse('2026-11-25T10:00:00.000Z') && at.get('agt9xyz8w') === Date.parse('2026-11-25T10:05:00.000Z'));
  lines('notification_shell.jsonl').forEach((l) => feed(open, l, at));
  check('fixture: a finish notice closes its task and forgets its time', !open.has('bsh1abc2d') && !at.has('bsh1abc2d') && open.has('agt9xyz8w'));
  lines('notification_agent.jsonl').forEach((l) => feed(open, l, at));
  check('fixture: both closed', open.size === 0 && at.size === 0);

  // 2. Drift: a launch-looking line with no readable id is reported by the line, and once by the tracker.
  let drift = 0;
  feed(new Map(), lines('drifted_launch.jsonl')[0], new Map(), () => { drift++; });
  check('drift: an unreadable launch line is reported', drift === 1);
  const tmp = fs.mkdtempSync(path.join(process.env.CCS_TMP || os.tmpdir(), 'ccs-bg-'));
  const proj = path.join(tmp, 'proj'); fs.mkdirSync(proj);
  const idOf = (i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
  try {
    const f0 = path.join(proj, idOf(0) + '.jsonl');
    fs.writeFileSync(f0, lines('drifted_launch.jsonl')[0] + '\n' + lines('drifted_launch.jsonl')[0] + '\n');
    let tracked = 0;
    const t = new BgTracker(tmp, () => { tracked++; });
    await t.scan(f0);
    check('drift: the tracker reports it once, not per line or per poll', tracked === 1 && (await t.scan(f0)).size === 0 && tracked === 1);

    // 3. Stale tasks: dropped only when the launch AND the log are older than the limit; a fresh write revives the pill.
    const stamp = (ms) => new Date(ms).toISOString();
    const launch = (ms, id) => JSON.stringify({ type: 'user', timestamp: stamp(ms), toolUseResult: { backgroundTaskId: id } }) + '\n';
    const now = Date.now(), old = now - BG_STALE_MS - 60000;
    const f1 = path.join(proj, idOf(1) + '.jsonl');
    fs.writeFileSync(f1, launch(old, 'oldtask'));
    fs.utimesSync(f1, new Date(old), new Date(old));
    check('stale: an old launch in a long-silent log stops counting', (await new BgTracker(tmp).tasks(f1)).size === 0);
    fs.writeFileSync(f1, launch(now - 60000, 'newtask'));
    fs.utimesSync(f1, new Date(old), new Date(old));
    check('stale: a recent launch counts even if the log file is old', (await new BgTracker(tmp).tasks(f1)).size === 1);
    fs.writeFileSync(f1, launch(old, 'oldtask'));
    check('stale: an old launch counts while the log is being written (fresh mtime)', (await new BgTracker(tmp).tasks(f1)).size === 1);
    fs.writeFileSync(f1, JSON.stringify({ type: 'user', toolUseResult: { backgroundTaskId: 'nots' } }) + '\n');
    fs.utimesSync(f1, new Date(old), new Date(old));
    check('stale: a launch without a timestamp is aged by the silent log alone', (await new BgTracker(tmp).tasks(f1)).size === 0);
    const live = await new BgTracker(tmp).tasks(path.join(proj, idOf(1) + '.jsonl'), old + 1000);
    check('stale: the same log is not silent when seen at an earlier time', live.size === 1);

    // 4. All-chats polling cost: only the first 8 chats are ever opened, and an unchanged log is not read again.
    const ids = Array.from({ length: 12 }, (_, i) => idOf(100 + i));
    ids.forEach((id) => fs.writeFileSync(path.join(proj, id + '.jsonl'), launch(now - 1000, 'run' + id.slice(-3))));
    const opened = [], realOpen = fs.promises.open;
    fs.promises.open = (...a) => { opened.push(String(a[0])); return realOpen.apply(fs.promises, a); };
    try {
      const tr = new AllChatsTracker(new BgTracker(tmp), new ColorBook(undefined, () => {}));
      await tr.check(ids[0], ids);
      const files = new Set(opened.map((p) => path.basename(p, '.jsonl')));
      check('all-chats: the cap holds (only the first ' + ALL_CHATS_MAX + ' chats are read)', files.size === ALL_CHATS_MAX && ids.slice(ALL_CHATS_MAX).every((id) => !files.has(id)));
      opened.length = 0;
      await tr.check(ids[0], ids); await tr.check(ids[0], ids);
      check('all-chats: unchanged logs are not opened again', opened.length === 0);
      fs.appendFileSync(path.join(proj, ids[3] + '.jsonl'), JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x' }] } }) + '\n');
      await tr.check(ids[0], ids);
      check('all-chats: only the chat that grew is read', opened.length > 0 && opened.every((p) => path.basename(p, '.jsonl') === ids[3]));
    } finally { fs.promises.open = realOpen; }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  if (failures.length) { console.error('check_bg FAILED (' + failures.length + ')\n  - ' + failures.join('\n  - ')); process.exit(1); }
  console.log('check_bg OK: fixtures, kinds and launch times, stale limit, drift notice, all-chats cap and idle cost');
}
main().catch((e) => { console.error('check_bg threw: ' + (e && e.stack || e)); process.exit(1); });
