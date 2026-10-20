/** Pure schema-to-form logic for the Options screen: no vscode import, so scripts/check_options.js can run it. */
export const OPT_PREFIX = 'saropaChatExplorer.';

export interface OptEntry {
  key: string;
  group: string;
  label: string;
  help: string;
  type: 'boolean' | 'enum' | 'number' | 'integer' | 'string' | 'other';
  def: unknown;
  min?: number;
  max?: number;
  choices: { value: string; label: string }[];
}

export type OptCheck = { ok: true; value: unknown } | { ok: false; error: string };

/** Escape text for an HTML text or attribute position. */
export const escHtml = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const words = (s: string): string => { const t = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const plain = (s: string): string => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Every own setting in the manifest's configuration properties, in manifest order. */
export function parseSchema(props: unknown): OptEntry[] {
  const out: OptEntry[] = [];
  if (!props || typeof props !== 'object') { return out; }
  for (const [key, raw] of Object.entries(props as Record<string, unknown>)) {
    if (!key.startsWith(OPT_PREFIX) || !raw || typeof raw !== 'object') { continue; }
    const p = raw as Record<string, unknown>, rest = key.slice(OPT_PREFIX.length), parts = rest.split('.');
    const enums = Array.isArray(p.enum) ? p.enum.map(String) : undefined, descs = Array.isArray(p.enumDescriptions) ? p.enumDescriptions : [];
    const type = enums ? 'enum' : p.type === 'boolean' || p.type === 'number' || p.type === 'integer' || p.type === 'string' ? p.type : 'other';
    out.push({
      key, group: parts.length > 1 ? words(parts[0]) : 'General',
      label: typeof p.title === 'string' && p.title ? p.title : words(parts[parts.length - 1]),
      help: plain(String(p.description ?? p.markdownDescription ?? '')),
      type, def: p.default, min: num(p.minimum), max: num(p.maximum),
      choices: (enums ?? []).map((v, i) => ({ value: v, label: typeof descs[i] === 'string' && descs[i] ? `${v}: ${descs[i]}` : v })),
    });
  }
  return out;
}

/** Host-side check before any write. undefined means reset to default and is always allowed. */
export function validateValue(e: OptEntry | undefined, v: unknown): OptCheck {
  if (!e) { return { ok: false, error: 'Unknown setting.' }; }
  if (v === undefined) { return { ok: true, value: undefined }; }
  switch (e.type) {
    case 'boolean': return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: 'Must be true or false.' };
    case 'enum': return typeof v === 'string' && e.choices.some((c) => c.value === v) ? { ok: true, value: v } : { ok: false, error: 'Not one of the allowed choices.' };
    case 'string': return typeof v === 'string' && v.length <= 4096 ? { ok: true, value: v } : { ok: false, error: 'Must be text.' };
    case 'number': case 'integer': {
      if (typeof v !== 'number' || !Number.isFinite(v)) { return { ok: false, error: 'Must be a number.' }; }
      if (e.type === 'integer' && !Number.isInteger(v)) { return { ok: false, error: 'Must be a whole number.' }; }
      if (e.min !== undefined && v < e.min) { return { ok: false, error: `Must be at least ${e.min}.` }; }
      if (e.max !== undefined && v > e.max) { return { ok: false, error: `Must be at most ${e.max}.` }; }
      return { ok: true, value: v };
    }
    default: return { ok: false, error: 'Edit this setting in settings.json.' };
  }
}

/** The control for one setting: the HTML fragment (all text escaped). */
export function controlHtml(e: OptEntry, value: unknown): string {
  const id = 'o_' + escHtml(e.key), k = escHtml(e.key), lbl = `aria-labelledby="${id}_l" aria-describedby="${id}_h"`;
  switch (e.type) {
    case 'boolean': return `<input type="checkbox" id="${id}" data-k="${k}" data-t="boolean" ${lbl}${value === true ? ' checked' : ''}>`;
    case 'enum': return `<select id="${id}" data-k="${k}" data-t="enum" ${lbl}>${e.choices.map((c) => `<option value="${escHtml(c.value)}"${String(value) === c.value ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('')}</select>`;
    case 'number': case 'integer': return `<input type="number" id="${id}" data-k="${k}" data-t="${e.type}" ${lbl} step="${e.type === 'integer' ? 1 : 'any'}"${e.min !== undefined ? ` min="${e.min}"` : ''}${e.max !== undefined ? ` max="${e.max}"` : ''} value="${escHtml(value)}">`;
    case 'string': return `<input type="text" id="${id}" data-k="${k}" data-t="string" ${lbl} maxlength="4096" value="${escHtml(value)}">`;
    default: return `<span class="ro">Edit in settings.json: ${escHtml(JSON.stringify(value))}</span>`;
  }
}

/** The body of the form: one section per group. `values` maps key to the current value. */
export function buildFormHtml(entries: OptEntry[], values: Record<string, unknown>): string {
  const groups = new Map<string, OptEntry[]>();
  for (const e of entries) { groups.set(e.group, [...(groups.get(e.group) ?? []), e]); }
  let html = '';
  for (const [g, list] of groups) {
    html += `<section><h2>${escHtml(g)}</h2>`;
    for (const e of list) {
      const id = 'o_' + escHtml(e.key), range = e.min !== undefined || e.max !== undefined ? ` (${e.min ?? 'any'} to ${e.max ?? 'any'})` : '';
      html += `<div class="row" data-row="${escHtml(e.key)}"><div class="top"><label id="${id}_l" for="${id}">${escHtml(e.label)}</label>${controlHtml(e, values[e.key] ?? e.def)}`
        + `<button type="button" class="rs" data-reset="${escHtml(e.key)}" title="Reset to default" aria-label="Reset ${escHtml(e.label)} to default">Reset to default</button></div>`
        + `<div class="help" id="${id}_h">${escHtml(e.help)}${escHtml(range)}</div><div class="err" role="alert" hidden></div></div>`;
    }
    html += '</section>';
  }
  return html;
}
