/**
 * Pure display helpers. They are self-contained (no outer references) because the webview
 * embeds their source via Function.toString(); Node checks import the same functions.
 */

export const DAY_ORDER = ['Today', 'Yesterday', 'This week', 'Last week', 'Earlier'];

/** Short relative time: now, 28m, 1h, 3d, 2w, 4mo, 1y. */
export function shortAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) { return 'now'; }
  const m = Math.floor(s / 60);
  if (m < 60) { return m + 'm'; }
  const h = Math.floor(m / 60);
  if (h < 24) { return h + 'h'; }
  const d = Math.floor(h / 24);
  if (d < 7) { return d + 'd'; }
  if (d < 30) { return Math.floor(d / 7) + 'w'; }
  if (d < 365) { return Math.floor(d / 30) + 'mo'; }
  return Math.floor(d / 365) + 'y';
}

/** Status dot: g = active within 5 minutes, o = within 1 hour, n = older. */
export function dotOf(ms: number, now: number): string {
  const age = now - ms;
  if (age <= 300000) { return 'g'; }
  return age <= 3600000 ? 'o' : 'n';
}

/** Day group of a last-active time: Today, Yesterday, This week, Last week or Earlier. */
export function dayBucket(ms: number, now: number): string {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  const today = t.getTime();
  if (ms >= today) { return 'Today'; }
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (ms >= y.getTime()) { return 'Yesterday'; }
  const wk = new Date(today);
  wk.setDate(wk.getDate() - ((t.getDay() + 6) % 7)); // Monday of this week
  if (ms >= wk.getTime()) { return 'This week'; }
  const lw = new Date(wk.getTime());
  lw.setDate(lw.getDate() - 7);
  return ms >= lw.getTime() ? 'Last week' : 'Earlier';
}

/** Duration such as "2h 14m", "5m", "1d 3h" or "<1m". */
export function durText(first: number, last: number): string {
  const m = Math.floor(Math.max(0, last - first) / 60000);
  if (m < 1) { return '<1m'; }
  if (m < 60) { return m + 'm'; }
  const h = Math.floor(m / 60);
  if (h < 24) { return h + 'h ' + (m % 60) + 'm'; }
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) { return bytes + ' B'; }
  if (bytes < 1048576) { return Math.round(bytes / 1024) + ' KB'; }
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/** "42 messages · 2h 14m · 3 files edited · 120 KB". */
export function statsText(r: { msgs: number; first: number; last: number; edited: number; size: number }): string {
  const p: string[] = [r.msgs + (r.msgs === 1 ? ' message' : ' messages')];
  if (r.last > r.first) { p.push(durText(r.first, r.last)); }
  if (r.edited > 0) { p.push(r.edited + (r.edited === 1 ? ' file edited' : ' files edited')); }
  p.push(sizeText(r.size));
  return p.join(' · ');
}

/** Source of the helpers above, for the webview script. */
export const SHARED_SRC = [shortAgo, dotOf, dayBucket, durText, sizeText, statsText]
  .map((f) => f.toString()).join('\n') + '\nconst DAY_ORDER=' + JSON.stringify(DAY_ORDER) + ';\n';
