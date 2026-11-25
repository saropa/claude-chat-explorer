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
  const req = http.request({ host: '127.0.0.1', port: u.port, path: opts.path ?? u.pathname, method: opts.method ?? 'GET', headers: Object.fromEntries(Object.entries({ ...(opts.host ? { Host: opts.host } : {}), ...(opts.headers ?? {}) }).filter(([, v]) => v !== undefined)) }, (res) => {
    let body = ''; res.setEncoding('utf8'); res.on('data', (c) => { body += c; }); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', fail); req.end(opts.body);
});

async function main() {
  let calls = 0;
  const focused = []; let focusFails = false; // chats the page asked to reveal; focusFails makes the handler fail
  const tracker = {
    clear() {},
    // One flash and one background pill for chat "a", on every refresh.
    async check() { calls++; return { colors: new Map([['a', '#f51b50']]), events: [{ t: 'flash', g: 'files', ch: 'a', col: '#f51b50', cur: true }, { t: 'bg', shell: 1, agent: 0, ch: 'a', col: '#f51b50', cur: true }] }; },
  };
  const server = new ActivityServer({
    projectTitle: () => 'My <Project> & "co"', currentId: () => 'a', liveIds: () => ['a'], titleOf: () => 'First chat', tracker,
    focusChat: async (id) => { if (focusFails) { throw new Error('boom'); } focused.push(id); },
    refreshMs: () => 100, fadeMs: () => 4000, log: () => {}, texts: { subtitle: 'Activity of all live chats', lost: 'Connection lost.', unknownChat: 'Chat', focusSent: 'Sending', focusDone: 'Done', focusFailed: 'Failed' },
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
    // Remote windows: the forwarded address (what asExternalUri returns) is allowed as an exact Host; any other host stays refused.
    server.allowHost('Forwarded.Example:50123');
    check('an allowed forwarded Host is served (case-insensitive)', (await get(url, { host: 'forwarded.example:50123' })).status === 200);
    check('an unlisted Host is still 404 after allowHost', (await get(url, { host: 'forwarded.example:50124' })).status === 404 && (await get(url, { host: 'other.example:50123' })).status === 404);
    check('the allowed Host still needs the token', (await get(url, { host: 'forwarded.example:50123', path: '/wrong/' })).status === 404);
    // Page pieces of the pill timer and the chat reveal (legend buttons and pills carry the chat id; every click shows an outcome).
    check('page has the pill timer slot and the outcome line', page.body.includes('<i class="tm"></i>') && page.body.includes('id="note"') && page.body.includes('function tick()'));
    check('page reveals a chat by POST /focus from delegated listeners (no inline handlers)', script[1].includes("fetch('focus', { method: 'POST'") && script[1].includes("document.addEventListener('click'") && script[1].includes('dataset.ch') && !/\son(click|load)=/.test(page.body));
    const efn = /function elapsed\(ms\) \{[\s\S]*?\n\}/.exec(script[1]);
    const elapsed = efn ? vm.runInNewContext('(' + efn[0].replace('function elapsed', 'function') + ')') : null;
    check('elapsed time reads 45s, 4m 12s, 1h 5m and never goes negative', elapsed && elapsed(45000) === '45s' && elapsed(252000) === '4m 12s' && elapsed(3900000) === '1h 5m' && elapsed(-5000) === '0s');
    // POST /focus: the one request that changes anything. Every refusal is a plain 404; a handler failure is a 500 the page can show.
    const focusUrl = url + 'focus', origin = 'http://127.0.0.1:' + new URL(url).port, json = { 'Content-Type': 'application/json' };
    const post = (extra = {}, body = JSON.stringify({ chat: 'a' }), path) => get(url, { method: 'POST', path: path ?? new URL(focusUrl).pathname, headers: { ...json, Origin: origin, ...extra }, body });
    check('focus without Origin is 404', (await post({ Origin: undefined })).status === 404 && focused.length === 0);
    check('focus from another origin is 404', (await post({ Origin: 'http://evil.example' })).status === 404 && focused.length === 0);
    check('focus with a non-JSON content type is 404', (await post({ 'Content-Type': 'text/plain' })).status === 404 && focused.length === 0);
    check('focus with the wrong token is 404', (await post({}, undefined, '/wrong/focus')).status === 404 && focused.length === 0);
    check('focus with a foreign Host is 404', (await get(url, { method: 'POST', host: 'evil.example:1', path: new URL(focusUrl).pathname, headers: { ...json, Origin: 'http://evil.example:1' }, body: '{"chat":"a"}' })).status === 404 && focused.length === 0);
    check('focus for an unknown chat is 404', (await post({}, JSON.stringify({ chat: 'zzz' }))).status === 404 && focused.length === 0);
    check('focus with a broken or empty body is 404', (await post({}, '{nope')).status === 404 && (await post({}, '{}')).status === 404 && focused.length === 0);
    check('focus with an oversized body is 404', (await post({}, JSON.stringify({ chat: 'a'.repeat(5000) }))).status === 404 && focused.length === 0);
    check('focus with GET is 404', (await get(url, { path: new URL(focusUrl).pathname })).status === 404);
    const ok = await post();
    check('a valid focus request reveals that chat', ok.status === 200 && focused.length === 1 && focused[0] === 'a');
    focusFails = true;
    check('a failing reveal answers 500, not success', (await post()).status === 500);
    focusFails = false;
    // Two overlapping start() calls share one bind: same URL, one listening server.
    const twin = new ActivityServer({ ...server.deps, tracker });
    const [u1, u2] = await Promise.all([twin.start(), twin.start()]);
    check('concurrent start() calls share one server', u1 === u2);
    twin.dispose();
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
