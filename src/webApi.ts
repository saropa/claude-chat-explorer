/** Claude Code Web (cloud) sessions: read-only client for an unofficial, undocumented API. No vscode dependency. The token is only read, held in memory for one call and never logged, stored or put in an error. */
import { textOf } from './parse';

export const API = 'https://api.anthropic.com';
export const SIGN_IN_MSG = 'Sign in with the Claude Code CLI (claude auth login) and retry';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const TIMEOUT_MS = 15000;
const MAX_PAGES = 50;
const RAW_CAP = 2000;

export interface WebSession { id: string; title: string; updated: number; status: string; repo: string; branch: string; }
export interface WebMsg { role: 'You' | 'Agent' | 'Raw'; ts: number; text: string; }
export type TokenResult = { ok: true; token: string; org?: string } | { ok: false; msg: string };

/** Host access, injected so tests never touch the keychain, disk or network. */
export interface WebDeps {
  platform: string; now: () => number;
  keychain: (service: string) => Promise<string>; // stdout of `security find-generic-password -w`; rejects when absent
  readFile: (name: 'credentials' | 'account') => Promise<string>;
  fetch: (url: string, headers: { [k: string]: string }, ms: number) => Promise<{ status: number; json: unknown }>;
}

const rec = (v: unknown): { [k: string]: unknown } => (v && typeof v === 'object' && !Array.isArray(v) ? (v as { [k: string]: unknown }) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const time = (v: unknown): number => { const n = typeof v === 'number' ? v : Date.parse(str(v)); return Number.isFinite(n) ? n : 0; };

/** Token and expiry from credentials JSON (claudeAiOauth.accessToken / expiresAt). */
export function parseCredentials(text: string): { token: string; expiresAt: number } | undefined {
  try {
    const o = rec(rec(JSON.parse(text)).claudeAiOauth), token = str(o.accessToken);
    return token ? { token, expiresAt: typeof o.expiresAt === 'number' ? o.expiresAt : 0 } : undefined;
  } catch { return undefined; }
}

/** Organization id from the account file, if present (not secret; the list call works without it). */
export function parseOrg(text: string): string | undefined {
  try { const v = str(rec(rec(JSON.parse(text)).oauthAccount).organizationUuid); return /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : undefined; } catch { return undefined; }
}

/** Read the login token: macOS keychain first, else ~/.claude/.credentials.json. Never refreshes or writes. */
export async function readToken(d: WebDeps): Promise<TokenResult> {
  let c: { token: string; expiresAt: number } | undefined;
  if (d.platform === 'darwin') { try { c = parseCredentials(await d.keychain(KEYCHAIN_SERVICE)); } catch { /* fall back to the file */ } }
  if (!c) { try { c = parseCredentials(await d.readFile('credentials')); } catch { /* none */ } }
  if (!c || (c.expiresAt && c.expiresAt <= d.now())) { return { ok: false, msg: SIGN_IN_MSG }; }
  let org: string | undefined;
  try { org = parseOrg(await d.readFile('account')); } catch { /* optional */ }
  return { ok: true, token: c.token, org };
}

/** Sessions from a list response; rows without an id are dropped, newest first. */
export function parseList(json: unknown): WebSession[] | undefined {
  const data = rec(json).data;
  if (!Array.isArray(data)) { return undefined; }
  const out: WebSession[] = [];
  for (const raw of data) {
    const r = rec(raw), id = str(r.id);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) { continue; }
    const src = Array.isArray(rec(r.session_context).sources) ? (rec(r.session_context).sources as unknown[]) : [];
    const s0 = rec(src[0]);
    out.push({ id, title: str(r.title).replace(/\s+/g, ' ').trim() || 'Untitled web session', updated: time(r.updated_at), status: str(r.session_status),
      repo: str(s0.url) || str(s0.git_repo_url), branch: str(s0.revision) || str(s0.branch) });
  }
  return out.sort((a, b) => b.updated - a.updated);
}

/** Payloads and the next cursor from a teleport-events page. */
export function parseEvents(json: unknown): { payloads: unknown[]; next: string } | undefined {
  const o = rec(json);
  if (!Array.isArray(o.data)) { return undefined; }
  return { payloads: o.data.map((e) => (rec(e).payload !== undefined ? rec(e).payload : e)), next: str(o.next_cursor) };
}

const rawText = (p: unknown): string => { let s: string; try { s = JSON.stringify(p) ?? String(p); } catch { s = String(p); } return s.length > RAW_CAP ? s.slice(0, RAW_CAP) + '...' : s; };

/** One payload as a message: user and assistant rows (the local JSONL shape) give text plus tool-call lines; anything else is raw text. */
export function mapPayload(p: unknown): WebMsg | undefined {
  const r = rec(p), type = str(r.type), m = rec(r.message), ts = time(r.timestamp);
  if ((type === 'user' || type === 'assistant') && ('content' in m)) {
    const tools = Array.isArray(m.content) ? (m.content as unknown[]).map(rec).filter((b) => b.type === 'tool_use').map((b) => `[tool: ${str(b.name) || 'unknown'}]`) : [];
    const text = [textOf(m.content), ...tools].filter(Boolean).join('\n');
    return text ? { role: type === 'user' ? 'You' : 'Agent', ts, text } : undefined; // empty rows (tool results only) are skipped
  }
  return { role: 'Raw', ts, text: rawText(p) };
}

export const mapPayloads = (ps: unknown[]): WebMsg[] => ps.map(mapPayload).filter((m): m is WebMsg => !!m);

const two = (n: number) => String(n).padStart(2, '0');
const stampOf = (ms: number): string => { if (!ms) { return '-'; } const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };

/** The transcript as Markdown, same layout as the local session export. */
export function webMarkdown(s: Pick<WebSession, 'id' | 'title'>, msgs: WebMsg[]): string {
  const out = [`# ${s.title}`, '', `Web session: ${s.id}`, 'Read-only copy from the unofficial Claude Code Web API.'];
  for (const m of msgs) { out.push('', `## ${m.role} - ${stampOf(m.ts)}`, '', m.role === 'Raw' ? '```json\n' + m.text + '\n```' : m.text); }
  return out.join('\n') + '\n';
}

function headers(t: { token: string; org?: string }): { [k: string]: string } {
  const h: { [k: string]: string } = { Authorization: `Bearer ${t.token}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'ccr-byoc-2025-07-29' };
  if (t.org) { h['x-organization-uuid'] = t.org; }
  return h;
}

/** GET one path; throws an Error whose message holds only the status, never the token. */
async function get(d: WebDeps, t: { token: string; org?: string }, path: string): Promise<unknown> {
  const r = await d.fetch(API + path, headers(t), TIMEOUT_MS);
  if (r.status === 401 || r.status === 403) { throw new Error(SIGN_IN_MSG); }
  if (r.status < 200 || r.status >= 300) { throw new Error(`Web sessions request failed (HTTP ${r.status})`); }
  return r.json;
}

/** The session list: /v1/code/sessions, else /v1/sessions. */
export async function listSessions(d: WebDeps, t: { token: string; org?: string }): Promise<WebSession[]> {
  let first: unknown;
  try { const l = parseList(await get(d, t, '/v1/code/sessions?limit=200')); if (l) { return l; } } catch (e) { first = e; if ((e as Error).message === SIGN_IN_MSG) { throw e; } }
  const l = parseList(await get(d, t, '/v1/sessions?limit=200').catch((e) => { throw first ?? e; }));
  if (!l) { throw new Error('Web sessions response had an unexpected shape'); }
  return l;
}

/** Every payload of one session, paged by cursor (capped), mapped to messages. */
export async function fetchTranscript(d: WebDeps, t: { token: string; org?: string }, id: string): Promise<WebMsg[]> {
  const all: unknown[] = [], seen = new Set<string>();
  let cursor = '';
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = parseEvents(await get(d, t, `/v1/code/sessions/${encodeURIComponent(id)}/teleport-events?limit=1000${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`));
    if (!page) { throw new Error('Web transcript response had an unexpected shape'); }
    all.push(...page.payloads);
    if (!page.next || seen.has(page.next)) { break; }
    seen.add(page.next); cursor = page.next;
  }
  return mapPayloads(all);
}
