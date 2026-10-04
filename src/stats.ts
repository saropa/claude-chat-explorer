import { Chat, Result } from './types';

export const projectOf = (c: Chat): string => c.dir.split('-').filter(Boolean).pop() ?? c.dir;

/** Stat fields every result row carries (message count, first time, files edited, size). */
export function statFields(c: Chat): Pick<Result, 'msgs' | 'first' | 'edited' | 'size'> {
  return {
    msgs: c.count, first: c.first || c.last,
    edited: c.files.filter((f) => f.edited).length, size: c.size,
  };
}
