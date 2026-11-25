// Fails the build when the browser view of the Activity diagram is unsafe or broken. Drives out/activityServer.js against a fake tracker:
// loopback bind, token and Host checks (404), the page's title and script syntax, the live event stream, and no polling once the page is gone.
const http = require('http');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.CCS_OUT || path.join(ROOT, 'out');
const { ActivityServer } = require(path.join(OUT, 'activityServer.js'));
const failures = [];
const check = (what, cond) => { if (!cond) { failures.push(what); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request; resolves with status, headers and body. `host` overrides the Host header (for the rebinding check). */
const get = (url, opts = {}) => new Promise((ok, fail) => {
  const u = new URL(url);
  const req = http.request({ host: '127.0.0.1', port: u.port, path: opts.path ?? u.pathname, method: opts.method ?? 'GET', headers: opts.host ? { Host: opts.host } : {} }, (res) => {
    let body = ''; res.setEncoding('utf8'); res.on('data', (c) => { body += c; }); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', fail); req.end();
});

async function main() {
  let calls = 0;
  const tracker = {
    clear() {},
    // One flash and one background pill for chat "a", on every refresh.
    async check() { calls++; return { colors: new Map([['a', '#f51b50']]), events: [{ t: 'flash', g: 'files', ch: 'a', col: '#f51b50', cur: true }, { t: 'bg', shell: 1, agent: 0, ch: 'a', col: '#f51b50', cur: true }] }; },
  };
  const server = new ActivityServer({
    projectTitle: () => 'My <Project> & "co"', currentId: () => 'a', liveIds: () => ['a'], titleOf: () => 'First chat', tracker,
    refreshMs: () => 100, fadeMs: () => 4000, log: () => {}, texts: { subtitle: 'Activity of all live chats', lost: 'Connection lost.', unknownChat: 'Chat' },
  });
  try {
    const url = await server.start();
    const addr = server.server.address();
    check('server binds loopback only', addr.address === '127.0.0.1' && url.startsWith('http://127.0.0.1:' + addr.port + '/'));
    check('server starts once: the same address comes back', (await server.start()) === url);

    // Page: title, escaped project name, strict CSP, and a script that parses.
    const page = await get(url);
    check('page is served', page.status === 200 && /text\/html/.test(page.headers['content-type']));
    check('document title is "<project> - Activity", escaped', page.body.includes('<title>My &lt;Project&gt; &amp; &quot;co&quot; - Activity</title>'));
    check('project title heads the page', page.body.includes('<h1>My &lt;Project&gt; &amp; &quot;co&quot;</h1>'));
    check('CSP allows only the stream as a connection and no external resources', page.body.includes("default-src 'none'") && page.body.includes("connect-src 'self'") && !/https?:\/\//.test(page.body.replace(/xmlns="[^"]*"/g, '')));
    check('page declares dark and light themes without VS Code variables being required', page.body.includes('prefers-color-scheme:light') && page.body.includes('--vscode-textLink-foreground:#'));
    const script = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(page.body);
    let parses = false;
    try { new vm.Script(script[1]); parses = true; } catch { /* reported below */ }
    check('page script parses (no flattened-comment or name clash)', parses);
    check('page re-dispatches stream messages to the diagram script', script && script[1].includes("new EventSource('events')") && script[1].includes("new MessageEvent('message'"));

    // Access control: every refusal is the same 404.
    const base = new URL(url);
    check('no token is 404', (await get(url, { path: '/' })).status === 404);
    check('wrong token is 404', (await get(url, { path: '/wrong/' })).status === 404);
    check('wrong token on the stream is 404', (await get(url, { path: '/wrong/events' })).status === 404);
    check('foreign Host header is 404 (rebinding)', (await get(url, { host: 'evil.example:' + base.port })).status === 404);
    check('Host without the port is 404', (await get(url, { host: '127.0.0.1' })).status === 404);
    check('non-GET is 404', (await get(url, { method: 'POST' })).status === 404);
    check('unknown path under the token is 404', (await get(url, { path: base.pathname + 'nope' })).status === 404);

    // No polling without a page.
    await sleep(350);
    check('no log reads while no page is connected', calls === 0);

    // Live stream.
    let data = '';
    const stream = http.request({ host: '127.0.0.1', port: base.port, path: base.pathname + 'events', headers: { Host: '127.0.0.1:' + base.port } });
    await new Promise((ok) => { stream.on('response', (res) => { check('stream is event-stream', /text\/event-stream/.test(res.headers['content-type'])); res.setEncoding('utf8'); res.on('data', (c) => { data += c; }); ok(); }); stream.end(); });
    await sleep(450);
    const msgs = data.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)));
    check('stream starts with fade and reset so the page is not blank', msgs[0] && msgs[0].type === 'fade' && msgs[1] && msgs[1].type === 'reset');
    check('stream delivers events tagged with chat and colour', msgs.some((m) => m.type === 'events' && m.events.some((e) => e.t === 'flash' && e.ch === 'a' && e.col === '#f51b50')));
    check('stream delivers the legend with the chat title and colour', msgs.some((m) => m.type === 'legend' && m.chats[0] && m.chats[0].title === 'First chat' && m.chats[0].col === '#f51b50'));
    check('one client is counted', server.clientCount === 1);

    // A second page gets the held background pill and legend at once, without waiting for a new event.
    let data2 = '';
    const s2 = http.request({ host: '127.0.0.1', port: base.port, path: base.pathname + 'events', headers: { Host: '127.0.0.1:' + base.port } });
    await new Promise((ok) => { s2.on('response', (res) => { res.setEncoding('utf8'); res.on('data', (c) => { data2 += c; }); ok(); }); s2.end(); });
    await sleep(50);
    check('a late page is given the running background task and the legend', data2.includes('"t":"bg"') && data2.includes('"type":"legend"'));
    s2.destroy();

    // Closing the last page stops all polling.
    stream.destroy();
    await sleep(250);
    check('no clients after the page closes', server.clientCount === 0);
    const after = calls; await sleep(350);
    check('polling stops when the last page closes', calls === after);
  } catch (e) {
    failures.push('threw: ' + (e && e.stack || e));
  } finally {
    server.dispose();
  }
  if (failures.length) { console.error('check_browser FAILED (' + failures.length + ')\n  - ' + failures.join('\n  - ')); process.exit(1); }
  console.log('check_browser OK: loopback bind, token and Host checks, page title and script, live stream, idle without a page');
}
main();
