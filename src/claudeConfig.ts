/** Claude Code configuration check: facts and deterministic findings for ~/.claude and the project. Pure; the file reader is injected. */
export type Category = 'bloat' | 'duplication' | 'redundancy' | 'gaps' | 'opportunities' | 'risks';
export type Severity = 'info' | 'warn' | 'high';
export interface Fact { label: string; value: string; }
export interface Finding { category: Category; severity: Severity; text: string; }
export interface Level { facts: Fact[]; findings: Finding[]; }
export interface ConfigReport { global: Level; project?: Level; }
/** read: file text or undefined when missing. list: entry names or undefined when the folder is missing. */
export interface Reader { read(p: string): string | undefined; list(p: string): string[] | undefined; }

export const BLOAT_WARN = 20_000, BLOAT_INFO = 10_000, RETENTION_RISK_DAYS = 365;
const SUBDIRS = ['rules', 'skills', 'agents', 'commands'];
const BROAD = new Set(['*', 'bash', 'bash(*)', 'bash(:*)', 'bash(**)', 'edit', 'write', 'webfetch']);
const j = (a: string, b: string) => a.replace(/[\\/]+$/, '') + '/' + b;

const kb = (n: number) => (n / 1024).toFixed(1) + ' KB';
const dup = (a: string[]) => [...new Set(a.filter((x, i) => a.indexOf(x) !== i))];
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function retentionText(days: number): string {
  const y = days / 365;
  return days + ' days' + (days >= 365 ? ' (' + (Number.isInteger(y) ? y : y.toFixed(1)) + (y === 1 ? ' year)' : ' years)') : '');
}

interface Ctx { r: Reader; dir: string; project: boolean; lv: Level; allow: string[]; rules: string[]; }

function readSettings(c: Ctx, file: string): void {
  const t = c.r.read(j(c.dir, file));
  if (t === undefined) { return; }
  c.lv.facts.push({ label: file, value: kb(t.length) });
  let s: Record<string, unknown>;
  try { s = obj(JSON.parse(t)); } catch { c.lv.findings.push({ category: 'risks', severity: 'warn', text: file + ' is not valid JSON, so Claude Code ignores it.' }); return; }
  const perm = obj(s.permissions), allow = strs(perm.allow), deny = strs(perm.deny);
  c.allow.push(...allow);
  for (const d of deny) { if (allow.includes(d)) { c.lv.findings.push({ category: 'redundancy', severity: 'warn', text: file + ': "' + d + '" is both allowed and denied; the allow entry has no effect.' }); } }
  for (const a of allow) { if (BROAD.has(a.trim().toLowerCase())) { c.lv.findings.push({ category: 'risks', severity: 'high', text: file + ': allow entry "' + a + '" is very broad and approves every matching action without asking.' }); } }
  const hooks = Object.keys(obj(s.hooks)), mcp = Object.keys(obj(s.mcpServers)), env = Object.keys(obj(s.env));
  if (allow.length || deny.length) { c.lv.facts.push({ label: file + ' permissions', value: allow.length + ' allow, ' + deny.length + ' deny, ' + strs(perm.ask).length + ' ask' }); }
  if (hooks.length) { c.lv.facts.push({ label: file + ' hooks', value: hooks.join(', ') }); }
  if (mcp.length) { c.lv.facts.push({ label: file + ' MCP servers', value: mcp.join(', ') }); }
  if (env.length) { c.lv.facts.push({ label: file + ' env', value: env.join(', ') }); }
  if (typeof s.cleanupPeriodDays === 'number') {
    const d = s.cleanupPeriodDays;
    c.lv.facts.push({ label: 'cleanupPeriodDays', value: retentionText(d) });
    if (d > RETENTION_RISK_DAYS) { c.lv.findings.push({ category: 'risks', severity: d >= 3650 ? 'high' : 'warn', text: 'cleanupPeriodDays is ' + retentionText(d) + ': chat transcripts under ~/.claude/projects are kept that long, so disk use and stored sensitive content keep growing. Lower it unless you need the history.' }); }
  }
}

function readDirs(c: Ctx): void {
  for (const n of SUBDIRS) {
    const e = c.r.list(j(c.dir, n));
    if (e === undefined) { continue; }
    c.lv.facts.push({ label: n + '/', value: e.length + ' entries' });
    if (!e.length) { c.lv.findings.push({ category: 'redundancy', severity: 'info', text: n + '/ exists but is empty.' }); }
    if (n === 'rules') { c.rules = e; }
  }
}

function claudeMd(c: Ctx, path: string, label: string): void {
  const t = c.r.read(path);
  if (t === undefined) {
    const why = c.project ? 'Claude gets no project-specific guidance (build, test and style conventions).' : 'no personal instructions apply to every project.';
    c.lv.findings.push({ category: 'gaps', severity: 'info', text: 'No ' + label + ': ' + why });
    return;
  }
  c.lv.facts.push({ label, value: kb(t.length) + ', ' + t.split('\n').length + ' lines' });
  if (t.length > BLOAT_WARN) { c.lv.findings.push({ category: 'bloat', severity: 'warn', text: label + ' is ' + kb(t.length) + ' (over ' + kb(BLOAT_WARN) + '); it is loaded into every session, so trim it or move detail into rules/ or skills/.' }); }
  else if (t.length > BLOAT_INFO) { c.lv.findings.push({ category: 'bloat', severity: 'info', text: label + ' is ' + kb(t.length) + '; consider trimming.' }); }
  const d = dup(t.split('\n').map((l) => l.trim()).filter((l) => l.length > 20));
  if (d.length) { c.lv.findings.push({ category: 'duplication', severity: 'info', text: label + ' repeats ' + d.length + ' line(s), e.g. "' + d[0].slice(0, 80) + '".' }); }
}

function level(r: Reader, dir: string, project: boolean, mdPath: string, mdLabel: string, extra: string[]): Ctx {
  const c: Ctx = { r, dir, project, lv: { facts: [], findings: [] }, allow: [], rules: [] };
  claudeMd(c, mdPath, mdLabel);
  readSettings(c, 'settings.json');
  readSettings(c, 'settings.local.json');
  for (const f of extra) { const t = r.read(f); if (t !== undefined) { c.lv.facts.push({ label: f.split('/').pop() ?? f, value: kb(t.length) }); } }
  readDirs(c);
  for (const a of dup(c.allow)) { c.lv.findings.push({ category: 'duplication', severity: 'info', text: 'Permission "' + a + '" is allowed more than once (settings.json and settings.local.json).' }); }
  if (!c.allow.length) { c.lv.findings.push({ category: 'opportunities', severity: 'info', text: 'No allow rules set: allow your routine safe commands to cut approval prompts.' }); }
  return c;
}

/** home is the ~/.claude folder; projectRoot is the workspace folder, if any. */
export function analyse(r: Reader, home: string, projectRoot?: string): ConfigReport {
  const g = level(r, home, false, j(home, 'CLAUDE.md'), '~/.claude/CLAUDE.md', []);
  if (!projectRoot) { return { global: g.lv }; }
  const p = level(r, j(projectRoot, '.claude'), true, j(projectRoot, 'CLAUDE.md'), 'CLAUDE.md', [j(projectRoot, '.mcp.json')]);
  for (const a of new Set(p.allow.filter((x) => g.allow.includes(x)))) { p.lv.findings.push({ category: 'duplication', severity: 'info', text: 'Permission "' + a + '" is allowed in both global and project settings.' }); }
  for (const n of p.rules.filter((x) => g.rules.includes(x))) { p.lv.findings.push({ category: 'duplication', severity: 'warn', text: 'Rule file "' + n + '" exists in both global and project rules/; the project copy shadows or repeats the global one.' }); }
  return { global: g.lv, project: p.lv };
}
