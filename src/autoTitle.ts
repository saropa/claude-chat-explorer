/** Pure logic for automatic session titles: emoji rules, prompt cleaning, title and skip rules, stage planning. No vscode import (unit-checked from scripts). */
import * as fs from 'fs';
import { StringDecoder } from 'string_decoder';
import { readInfo, titleLines, validEmoji } from './regenTitles';

export interface Rule { emoji: string; keywords: string[] }

export const DEFAULT_EMOJI = '💬';

/** Built-in feature areas; the first highest-scoring area wins. */
export const DEFAULT_RULES: Rule[] = [
  { emoji: '💳', keywords: 'billing purchase subscription pro entitlement trial paywall login sign-in signin auth payment price pricing checkout invoice refund revenuecat iap oauth premium upgrade lapse'.split(' ') },
  { emoji: '🖥️', keywords: 'server supabase backend api sync firebase cloud endpoint webhook http request response rest edge function functions deploy hosting latency remote'.split(' ') },
  { emoji: '🐾', keywords: 'pet pets dog dogs cat cats puppy kitten vet animal animals'.split(' ') },
  { emoji: '👤', keywords: 'contact contacts import duplicate vcard avatar phonebook merge-contact profile person phone email csv linkedin sim nickname'.split(' ') },
  { emoji: '👥', keywords: 'people group groups relationship family friend friends colleague household spouse partner child children parent sibling'.split(' ') },
  { emoji: '📅', keywords: 'event events calendar birthday anniversary reminder holiday schedule dates agenda nameday upcoming recurring'.split(' ') },
  { emoji: '🗺️', keywords: 'map maps place address location geocode gps marker tile tiles route directions city country region coordinates'.split(' ') },
  { emoji: '🌐', keywords: 'l10n translation translate arb locale language i18n localization localize gen-l10n nllb gemini multilingual rtl'.split(' ') },
  { emoji: '🎮', keywords: 'game games puzzle sudoku calcudoku mathdoku quiz trivia score board'.split(' ') },
  { emoji: '🎨', keywords: 'widget theme layout screen button dialog ui icon animation tablet design font color padding scroll sheet header responsive landscape dark'.split(' ') },
  { emoji: '🗄️', keywords: 'drift database schema migration sqlite query table tables column index sql transaction isar dao'.split(' ') },
  { emoji: '🚀', keywords: 'build release apk aab version store changelog publish playstore appstore gradle bundle ship launch'.split(' ') },
  { emoji: '🧪', keywords: 'test tests testing unit coverage mock fixture assert regression spec-test integration-test'.split(' ') },
  { emoji: '⚙️', keywords: 'settings hook hooks config claude rules ci workflow github permission agent subagent skill skills memory prompt preference preferences flag flags env script scripts'.split(' ') },
  { emoji: '📝', keywords: 'doc docs plan handover spec document documentation readme notes write writeup report tracker todo roadmap'.split(' ') },
  { emoji: '🔍', keywords: 'research investigate compare explore audit analyze analysis review evaluate'.split(' ') },
  { emoji: '🐛', keywords: 'bug bugs crash crashes error errors exception fail fails failing failure broken regression hang freeze stacktrace defect'.split(' ') },
  { emoji: '🔔', keywords: 'notification notifications push alert alerts badge fcm alarm toast snackbar banner'.split(' ') },
  { emoji: '⚡', keywords: 'performance perf slow jank speed fast startup anr lag memory ram cpu optimize optimization profile profiling frame frames'.split(' ') },
  { emoji: '💾', keywords: 'backup restore export exports download upload archive zip storage cloud-backup recovery'.split(' ') },
  { emoji: '🔒', keywords: 'security privacy encrypt encryption biometric lock passcode secure vulnerability secret secrets consent gdpr'.split(' ') },
  { emoji: '🖼️', keywords: 'photo photos image images camera gallery picture pictures media video thumbnail crop'.split(' ') },
  { emoji: '🤝', keywords: 'share sharing shared invite invitation referral deeplink deep-link qr'.split(' ') },
  { emoji: '♿', keywords: 'accessibility a11y semantics screenreader talkback voiceover contrast textscale inclusive'.split(' ') },
  { emoji: '🌿', keywords: 'git merge branch branches commit commits push pull rebase worktree conflict stash cherry-pick pr repo'.split(' ') },
  { emoji: '🚑', keywords: 'emergency sos medical ice hospital ambulance allergy allergies bloodtype safety'.split(' ') },
];

/** Valid rules from a settings value; anything else is dropped. */
export function parseRules(v: unknown): Rule[] {
  if (!Array.isArray(v)) { return []; }
  const out: Rule[] = [];
  for (const r of v) {
    const o = r as { emoji?: unknown; keywords?: unknown } | null;
    if (!o || typeof o.emoji !== 'string' || !validEmoji(o.emoji) || !Array.isArray(o.keywords)) { continue; }
    const keywords = o.keywords.filter((k): k is string => typeof k === 'string').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.length) { out.push({ emoji: o.emoji.trim(), keywords }); }
  }
  return out;
}

/** User rules first (they win ties); a user rule with a default's emoji replaces that default's keywords. */
export function mergeRules(user: Rule[], replace: boolean): Rule[] {
  if (replace) { return user; }
  const mine = new Set(user.map((r) => r.emoji));
  return [...user, ...DEFAULT_RULES.filter((r) => !mine.has(r.emoji))];
}

const PROFANITY = new Set(('fuck fucking fucked fucker fuckin shit shitty bullshit damn damned goddamn crap crappy bitch bastard asshole ass dick piss pissed wtf bloody arse bollocks').split(' '));
const AUTOMATED_START = /^(<(command-|local-command|task-notification|system-reminder)|\[(request interrupted|image|pasted|tool result))/i;
const AUTOMATED = ['<task-notification', 'task-id', '<system-reminder', 'system notification', 'tool-use-id', 'output-file'];

const isProfane = (w: string): boolean => PROFANITY.has(w.toLowerCase().replace(/[^a-z]/g, ''));

/** Machine-generated or command prompts that must not name a session. */
export function isSkippable(p: string): boolean {
  const t = p.trim(), low = t.toLowerCase();
  return !t || t.startsWith('/') || AUTOMATED_START.test(t) || t.split(/\s+/).length < 5 || AUTOMATED.some((m) => low.includes(m));
}

/** Prompt text without markup, ids and markdown symbols, on one line. */
export const cleanPrompt = (p: string): string => p
  .replace(/<[^>\n]*>/g, ' ').replace(/\S*task-id\S*/gi, ' ').replace(/\b[0-9a-f]{12,}\b/g, ' ')
  .replace(/[`*_#>~[\]()|]/g, ' ').replace(/\s+/g, ' ').trim();

/** Emoji of the rule whose keywords match most often as whole words; the default when none match. */
export function pickEmoji(text: string, rules: Rule[]): string {
  const low = text.toLowerCase();
  let best = DEFAULT_EMOJI, top = 0;
  for (const r of rules) {
    let score = 0;
    for (const k of r.keywords) { score += low.match(new RegExp(`(?<![a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'g'))?.length ?? 0; }
    if (score > top) { best = r.emoji; top = score; }
  }
  return best;
}

/** First sentence of a prompt, profanity removed, at most 50 characters, first letter capitalised. '' when nothing usable. */
export function makeTitle(prompt: string): string {
  const words = cleanPrompt(prompt).split(' ').filter((w) => w && !isProfane(w)).join(' ');
  const first = words.split(/(?<=[.!?])\s/)[0];
  let t = (first.split(' ').length >= 3 ? first : words).slice(0, 50);
  if (t.length === 50 && words.length > 50 && !/\s/.test(words[50] ?? ' ')) { t = t.replace(/\s+\S*$/, ''); }
  t = t.trim().replace(/[.,;:!?\-—\s]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Latest custom-title in transcript text (a head or tail slice), if any. */
export function customTitleOf(text: string): string | undefined {
  let t: string | undefined;
  for (const line of text.split('\n')) {
    if (!line.includes('"custom-title"')) { continue; }
    try { const o = JSON.parse(line) as { type?: unknown; customTitle?: unknown }; if (o.type === 'custom-title' && typeof o.customTitle === 'string') { t = o.customTitle; } } catch { /* partial line */ }
  }
  return t;
}

/** What the runner remembers per session: prompts seen when last titled, and the title it wrote. */
export interface Done { n: number; t: string }

export type Plan = { skip: true; final: boolean } | { skip: false; prompts: string[]; final: boolean };

/**
 * Decide what to do for one session. Stage 1: name once the first usable prompt exists. Stage 2: rename once when the 3rd prompt exists.
 * A custom title this feature did not write ends the work for good (final).
 */
export function planTitle(info: { prompts: string[]; custom?: string }, done: Done | undefined): Plan {
  if (info.custom && info.custom !== done?.t) { return { skip: true, final: true }; }
  if (done && (done.n >= 3 || info.prompts.length < 3)) { return { skip: true, final: done.n >= 3 }; }
  if (!info.prompts.some((p) => !isSkippable(p))) { return { skip: true, final: false }; }
  return { skip: false, prompts: info.prompts, final: info.prompts.length >= 3 };
}

/** The "emoji title" line for a session's prompts; undefined when no prompt qualifies. */
export function buildTitle(prompts: string[], rules: Rule[]): string | undefined {
  const first = prompts.find((p) => !isSkippable(p));
  const title = first ? makeTitle(first) : '';
  return title ? `${pickEmoji(prompts.map(cleanPrompt).join(' '), rules)} ${title}` : undefined;
}

const SCAN_CHUNK = 262144, SCAN_CAP = 4 * 1024 * 1024, TAIL = 16384;

/** First prompts and the latest custom title of a transcript, scanning forward in chunks until 3 prompts or EOF (capped). */
export async function scanPrompts(file: string): Promise<{ prompts: string[]; custom?: string; size: number }> {
  const h = await fs.promises.open(file, 'r');
  try {
    const size = (await h.stat()).size, dec = new StringDecoder('utf8'), buf = Buffer.alloc(SCAN_CHUNK);
    const keep: string[] = [], customs: string[] = [];
    let pos = 0, rest = '', prompts: string[] = [];
    const take = (l: string): boolean => {
      if (l.includes('"custom-title"')) { customs.push(l); return false; }
      if (!/"type":\s*"user"/.test(l)) { return false; }
      keep.push(l); return true;
    };
    while (pos < size && pos < SCAN_CAP) {
      const { bytesRead } = await h.read(buf, 0, SCAN_CHUNK, pos);
      if (!bytesRead) { break; }
      pos += bytesRead;
      const parts = (rest + dec.write(buf.subarray(0, bytesRead))).split('\n');
      rest = parts.pop() ?? '';
      let added = false;
      for (const l of parts) { added = take(l) || added; }
      if (added) { prompts = readInfo(keep.join('\n')).prompts; if (prompts.length >= 3) { break; } }
    }
    if (pos >= size && rest && take(rest)) { prompts = readInfo(keep.join('\n')).prompts; }
    return { prompts, custom: customTitleOf(customs.join('\n')), size };
  } finally { await h.close(); }
}

/**
 * Append the title lines unless the user renamed the session since we read it (a custom title other than our own previous one
 * in the tail). Adds a newline first when the file does not end with one. Returns false when it declined to write.
 */
export async function safeAppend(file: string, title: string, id: string, ownPrev: string | undefined): Promise<boolean> {
  const h = await fs.promises.open(file, 'a+');
  try {
    const size = (await h.stat()).size;
    const len = Math.min(size, TAIL), tail = Buffer.alloc(len);
    if (len) { await h.read(tail, 0, len, size - len); }
    const custom = customTitleOf(tail.toString('utf8'));
    if (custom && custom !== ownPrev) { return false; }
    await h.write((len && tail[len - 1] !== 10 ? '\n' : '') + titleLines(title, id));
    return true;
  } finally { await h.close(); }
}

/**
 * Drop the oldest records beyond keep, never one of the live sessions. Finished records go first: a finished session with no record
 * but a custom title is re-read as finished, so dropping it loses nothing, whereas an in-progress record would.
 */
export function prune(all: Record<string, Done>, live: Iterable<string>, keep: number): void {
  const liveSet = new Set(live), keys = Object.keys(all).filter((k) => !liveSet.has(k));
  let over = Object.keys(all).length - keep;
  for (const k of [...keys.filter((x) => all[x].n >= 3), ...keys.filter((x) => all[x].n < 3)]) {
    if (over-- <= 0) { break; }
    delete all[k];
  }
}
