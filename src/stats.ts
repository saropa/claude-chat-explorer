import { mergedGit } from './gitInfo';
import { Chat, Result } from './types';

export const projectOf = (c: Chat): string => c.dir.split('-').filter(Boolean).pop() ?? c.dir;

type StatKeys = 'msgs' | 'first' | 'edited' | 'size';
type Extra = Partial<Pick<Result, 'cost' | 'add' | 'rem' | 'models' | 'prs' | 'commits'>>;

/** Stat fields every result row carries (message count, first time, files edited, size), plus cost and git counts when the chat has them. */
export function statFields(c: Chat, subs: Chat[] = []): Pick<Result, StatKeys> & Extra {
  const out: Pick<Result, StatKeys> & Extra = {
    msgs: c.count, first: c.first || c.last,
    edited: c.files.filter((f) => f.edited).length, size: c.size,
  };
  if (c.cost) { Object.assign(out, { cost: c.cost.usd, add: c.cost.add, rem: c.cost.rem, models: c.cost.models }); }
  const g = mergedGit(c, subs);
  if (g.prs.length) { out.prs = g.prs.length; }
  if (g.commits.length) { out.commits = g.commits.length; }
  return out;
}
