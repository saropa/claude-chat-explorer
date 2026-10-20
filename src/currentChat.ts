/** Which chat belongs to this VS Code window right now (highlighted in the sidebar like the official Claude Code list). */
import { TabInfo } from './stateDb';

export interface CurrentIn {
  /** Label of the active editor tab when it is a Claude Code tab; undefined when the active tab is something else. */
  activeLabel?: string;
  tabs: TabInfo[];
  /** Last session Claude activated in this workspace. */
  last?: string;
  /** Live sessions whose process belongs to this window. */
  here: string[];
}

const stem = (s: string): string => s.replace(/…+$|\.{3}$/, '').trim();

/** Tab whose stored (truncated) title matches the tab label; undefined when none or when two chats share the same start. */
export function tabByLabel(label: string, tabs: TabInfo[]): string | undefined {
  const l = label.trim(), hit = tabs.filter((t) => { const k = stem(t.title); return k !== '' && (l === t.title.trim() || l.startsWith(k)); });
  return hit.length === 1 ? hit[0].id : undefined;
}

/** The current chat: the focused Claude tab; else the last activated open tab; else the only live session of this window; else none. */
export function currentChat(i: CurrentIn): string {
  const ids = new Set(i.tabs.map((t) => t.id));
  if (i.activeLabel !== undefined) {
    const id = tabByLabel(i.activeLabel, i.tabs);
    if (id) { return id; }
    if (i.last && ids.has(i.last)) { return i.last; }
  } else if (i.last && ids.has(i.last)) { return i.last; }
  return i.here.length === 1 ? i.here[0] : '';
}
