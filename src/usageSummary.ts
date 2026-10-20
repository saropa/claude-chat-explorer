/** Pure grouping of usage rows into the Usage Summary lists. No vscode dependency. */
import { UsageRow } from './usageRows';

export interface Group { label: string; usd: number; chats: number; }
export const TOP_N = 10;
const DAY_MS = 86400000;
const MAX_DAYS = 14, MAX_WEEKS = 8, MAX_GROUPS = 10;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday 00:00 (local) of the week holding ms. */
const weekStart = (ms: number): Date => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/** Dollar text: two decimals, "<$0.01" below a cent. */
export const usd = (n: number): string => (n > 0 && n < 0.01 ? '<$0.01' : '$' + n.toFixed(2));

function group(rows: UsageRow[], key: (r: UsageRow) => string, order: 'label' | 'usd'): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const k = key(r), g = m.get(k) ?? { label: k, usd: 0, chats: 0 };
    g.usd += r.usd; g.chats++; m.set(k, g);
  }
  return [...m.values()].sort(order === 'label' ? (a, b) => b.label.localeCompare(a.label) : (a, b) => b.usd - a.usd);
}

/** Start of the local day holding ms. */
export const dayStart = (ms: number): number => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Spend of the chats active since local midnight. */

/** Chats whose context is at or above pct percent. */
export const nearlyFull = (rows: UsageRow[], pct: number): number => rows.filter((r) => r.pct >= pct).length;

export interface Summary { days: Group[]; weeks: Group[]; projects: Group[]; models: Group[]; top: UsageRow[]; total: number; }

/** Cost per day (last 14), week (last 8, from Monday), project and model (10 each), and the 10 priciest chats; chats with no cost are left out. */
export function summarize(all: UsageRow[], now: number): Summary {
  const rows = all.filter((r) => r.usd > 0);
  const dayFrom = dayStart(now) - (MAX_DAYS - 1) * DAY_MS, weekFrom = weekStart(now).getTime() - (MAX_WEEKS - 1) * 7 * DAY_MS;
  return {
    days: group(rows.filter((r) => r.last >= dayFrom), (r) => dayKey(new Date(r.last)), 'label').slice(0, MAX_DAYS),
    weeks: group(rows.filter((r) => r.last >= weekFrom), (r) => 'Week of ' + dayKey(weekStart(r.last)), 'label').slice(0, MAX_WEEKS),
    projects: group(rows, (r) => r.project || '(unknown)', 'usd').slice(0, MAX_GROUPS),
    models: group(rows, (r) => r.model || '(unknown)', 'usd').slice(0, MAX_GROUPS),
    top: [...rows].sort((a, b) => b.usd - a.usd).slice(0, TOP_N),
    total: rows.reduce((s, r) => s + r.usd, 0),
  };
}
