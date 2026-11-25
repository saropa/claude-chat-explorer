/** The all-chats Activity tailer: one feed per live chat, with colours, shared by the side-pane diagram and the browser view. */
import { ActivityFeed, TaggedEvent, tagEvents, tailIds } from './activityFeed';
import { BgTracker } from './bgAgents';
import { ColorBook } from './chatColors';

/** What one refresh found: each tailed chat's colour and the tagged events of all of them. */
export interface AllChatsResult { colors: Map<string, string>; events: TaggedEvent[]; }

/**
 * Tails every live chat (the focused one first) and tags each chat's events with its colour. It exists as its own class so the pane and the
 * browser view run the same logic instead of two copies: each consumer owns one tracker (its own read positions, so one view never
 * swallows events the other still has to show) while both share the transcript locator and the colour book (so a chat has ONE colour everywhere).
 */
export class AllChatsTracker {
  private readonly feeds = new Map<string, ActivityFeed>();

  constructor(private readonly files: BgTracker, private readonly book: ColorBook) {}

  /** Forgets every read position: the next refresh only marks the end of each log, so nothing that happened meanwhile flashes. */
  clear(): void { this.feeds.clear(); }

  /** One refresh. `cur`: the focused chat (keeps its caption and waiting state); `live`: every live chat id. */
  async check(cur: string, live: readonly string[]): Promise<AllChatsResult> {
    // A focused chat that is not among the live ones still gets a colour, so its row and glow match.
    const colors = this.book.resolve(cur && !live.includes(cur) ? [cur, ...live] : live);
    const ids = tailIds(cur, live), events: TaggedEvent[] = [];
    // A chat that left the tailed set no longer reports; its background pills are cleared explicitly so they do not glow forever.
    for (const id of [...this.feeds.keys()]) {
      if (!ids.includes(id)) { this.feeds.delete(id); events.push({ t: 'bg', shell: 0, agent: 0, ch: id, col: '', cur: false }); }
    }
    const batches = await Promise.all(ids.map(async (id) => {
      let f = this.feeds.get(id);
      if (!f) { f = new ActivityFeed(undefined, undefined, this.files); this.feeds.set(id, f); }
      return tagEvents(await f.check(id), id, colors.get(id) ?? '', id === cur);
    }));
    return { colors, events: events.concat(batches.flat()) };
  }
}
