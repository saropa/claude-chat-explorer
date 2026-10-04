import { Options } from './types';

const WHENS = ['any', '1h', '2h', '4h', '8h', 'today', 'week', 'month'];
const LASTS = [0, 10, 25, 50, 100];
const SORTS = ['score', 'time', 'title', 'length', 'cost'];

/** Search options from a webview message, each field validated. */
export function opts(m: any): Options {
  const when = WHENS.includes(m.when) ? String(m.when) : 'any';
  const last = LASTS.includes(Number(m.last)) ? Number(m.last) : 0;
  return { all: !!m.all, cs: !!m.cs, ww: !!m.ww, re: !!m.re, any: !!m.any, when, subs: m.subs !== false, last };
}
export const sortOf = (m: any): string => (SORTS.includes(m.sort) ? String(m.sort) : 'score');
