// Unit check for out/webApi.js and the disabled-by-default path. Fake tokens only; never touches the network, keychain or real credential files.
const fs = require('fs');
const path = require('path');
const OUT = process.env.CCS_OUT || path.join(__dirname, '..', 'out');
const w = require(path.join(OUT, 'webApi.js'));
const fails = [];
const check = (n, c) => { if (!c) { fails.push(n); } };
const FAKE = 'sk-ant-oat01-FAKE-TEST-TOKEN';
const creds = (exp) => JSON.stringify({ claudeAiOauth: { accessToken: FAKE, refreshToken: 'FAKE-REFRESH', expiresAt: exp } });
const NOW = 1_000_000;
const deps = (o = {}) => ({ platform: 'linux', now: () => NOW, keychain: async () => { throw new Error('no'); }, readFile: async (n) => { throw new Error('none ' + n); },
  fetch: async () => { throw new Error('network must not be called'); }, ...o });

(async () => {
  // token-file parsing
  check('creds ok', w.parseCredentials(creds(NOW + 1)).token === FAKE);
  check('creds bad json', w.parseCredentials('{') === undefined);
  check('creds no token', w.parseCredentials('{"claudeAiOauth":{}}') === undefined);
  check('org', w.parseOrg('{"oauthAccount":{"organizationUuid":"abcd1234-aaaa"}}') === 'abcd1234-aaaa' && w.parseOrg('{"oauthAccount":{"organizationUuid":"x y"}}') === undefined);
  let r = await w.readToken(deps({ readFile: async (n) => (n === 'credentials' ? creds(NOW + 5) : '{}') }));
  check('file token', r.ok && r.token === FAKE);
  r = await w.readToken(deps({ platform: 'darwin', keychain: async () => creds(0) }));
  check('keychain token (no expiry field)', r.ok && r.token === FAKE);
  r = await w.readToken(deps({ readFile: async () => creds(NOW - 1) }));
  check('expired', !r.ok && r.msg === w.SIGN_IN_MSG && !JSON.stringify(r).includes(FAKE));
  r = await w.readToken(deps());
  check('missing', !r.ok && r.msg === w.SIGN_IN_MSG);

  // response parsing
  const l = w.parseList({ data: [{ id: 'a_1', title: 'Old', updated_at: '2026-01-01T00:00:00Z', extra: 1 }, { id: 'b_2', title: ' New  one ', updated_at: '2026-02-01T00:00:00Z', session_status: 'idle', session_context: { sources: [{ url: 'https://g/x', revision: 'main' }] } }, { title: 'no id' }, 5, { id: 'bad id!' }] });
  check('list order+filter', l.length === 2 && l[0].id === 'b_2' && l[0].title === 'New one' && l[0].repo === 'https://g/x' && l[0].branch === 'main' && l[1].title === 'Old');
  check('list missing fields', w.parseList({ data: [{ id: 'z' }] })[0].title === 'Untitled web session');
  check('list bad shape', w.parseList(null) === undefined && w.parseList({ data: 3 }) === undefined);
  const ev = w.parseEvents({ data: [{ payload: { type: 'user' } }, { x: 1 }], next_cursor: 'c2' });
  check('events', ev.payloads.length === 2 && ev.next === 'c2' && w.parseEvents([]) === undefined);
  const m = w.mapPayloads([
    { type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { content: 'hello' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'Bash' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result' }] } },
    { type: 'weird', foo: 1 }, null, 'str']);
  check('map', m.length === 5 && m[0].role === 'You' && m[1].text === 'hi\n[tool: Bash]' && m[2].role === 'Raw' && m[2].text.includes('weird'));
  check('markdown', w.webMarkdown({ id: 'a', title: 'T' }, m).includes('## You - '));

  // paging and failure handling with a fake fetch
  const calls = [];
  const pages = { '': { data: [{ payload: { type: 'user', message: { content: 'one' } } }], next_cursor: 'n1' }, n1: { data: [{ payload: { type: 'user', message: { content: 'two' } } }] } };
  const d = deps({ fetch: async (url, h) => { calls.push({ url, h }); const c = /cursor=([^&]*)/.exec(url); return { status: 200, json: pages[c ? c[1] : ''] }; } });
  const t = await w.fetchTranscript(d, { token: FAKE, org: 'org-12345678' }, 'abc');
  check('paged', t.length === 2 && calls.length === 2 && calls[1].url.includes('cursor=n1') && calls[0].h.Authorization === 'Bearer ' + FAKE && calls[0].h['anthropic-beta'] === 'ccr-byoc-2025-07-29' && calls[0].h['x-organization-uuid'] === 'org-12345678');
  const seen = [];
  const lst = await w.listSessions(deps({ fetch: async (u) => { seen.push(u); return u.includes('/v1/code/') ? { status: 404, json: {} } : { status: 200, json: { data: [{ id: 'q' }] } }; } }), { token: FAKE });
  check('list fallback', lst.length === 1 && seen.length === 2);
  let msg = '';
  try { await w.listSessions(deps({ fetch: async () => ({ status: 500, json: {} }) }), { token: FAKE }); } catch (e) { msg = e.message; }
  check('http error has no token', msg.includes('500') && !msg.includes(FAKE));
  msg = '';
  try { await w.listSessions(deps({ fetch: async () => ({ status: 401, json: {} }) }), { token: FAKE }); } catch (e) { msg = e.message; }
  check('401 -> sign in', msg === w.SIGN_IN_MSG);

  // disabled by default
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const prop = pkg.contributes.configuration.properties['saropaChatExplorer.webSessions.enabled'];
  check('setting default false', prop && prop.type === 'boolean' && prop.default === false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'webSessions.ts'), 'utf8');
  check('load gated on setting', /async load\(\): Promise<void> \{\s*if \(!webEnabled\(\)/.test(src) && /async open\(id: unknown\): Promise<void> \{[^]*?!webEnabled\(\)/.test(src));
  check('no network code at import', !/^\s*(await )?fetch\(/m.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8')));

  if (fails.length) { console.error('check_web FAILED: ' + fails.join(', ')); process.exit(1); }
  console.log('check_web ok');
})();
