/** The Activity diagram's idle caption: which chat the diagram follows and what that chat is doing, shown while no live event caption is up. */

/** What the host knows when it builds the text: the followed chat's title ('' when none), its dot state (undefined when it has no dot) and how many OTHER chats are working. */
export interface IdleInfo { title: string; state: string | undefined; others: number }

// Single source of the wording. No first-person voice. State keys are the dot states of liveState.ts.
const STATE_TEXT: Record<string, string> = { running: 'working', waiting: 'waiting for you', background: 'background tasks running', unread: 'idle', idle: 'idle' };
const IDLE_TEXT = 'idle'; // a followed chat with no dot (closed tab / no live process) or an unknown state
const MAX_TITLE = 60; // the caption is one line; long titles are cut here so the state text after them stays readable

/** Dot states that count as another chat "working": it runs, or it still has background tasks. A chat waiting for the user is not working. */
export function isWorking(state: string | undefined): boolean { return state === 'running' || state === 'background'; }

/** Counts the chats other than `cur` that are working, from the dots map (id to { s }). */
export function othersWorking(dots: { [id: string]: { s: string } }, cur: string): number {
  return Object.entries(dots).filter(([id, d]) => id !== cur && isWorking(d.s)).length;
}

/** The caption text: "<title> — <state>" plus "· N other chats working"; '' when there is nothing to say (no followed chat and no others working). */
export function idleText(i: IdleInfo): string {
  const others = i.others > 0 ? `${i.others} ${i.others === 1 ? 'other chat' : 'other chats'} working` : '';
  const title = i.title.length > MAX_TITLE ? i.title.slice(0, MAX_TITLE - 1) + '…' : i.title;
  // No followed chat: only the busy-chats hint can be said, without the leading separator.
  if (!title) { return others; }
  const state = (i.state && STATE_TEXT[i.state]) || IDLE_TEXT;
  return others ? `${title} — ${state} · ${others}` : `${title} — ${state}`;
}
