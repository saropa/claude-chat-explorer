/** Bulk archive of Empty and Tiny chats, behind a modal count confirmation. */
import * as vscode from 'vscode';
import { statusesOf } from './status';
import { UsageRow } from './usageRows';

export interface TinyDeps {
  rows: () => Promise<UsageRow[]>;
  archived: () => Set<string>;
  pins: () => string[];
  dots: () => { [id: string]: string };
  archive: (ids: string[]) => Promise<number>;
}

/** Ids of Empty or Tiny chats that are not archived, pinned or open now. */
export function tinyIds(rows: UsageRow[], d: Pick<TinyDeps, 'archived' | 'pins' | 'dots'>, now: number): string[] {
  const arch = d.archived(), pins = new Set(d.pins()), dots = d.dots();
  return rows.filter((r) => {
    if (arch.has(r.id) || pins.has(r.id) || dots[r.id]) { return false; }
    const st = statusesOf({ msgs: r.msgs, last: r.last, size: r.size }, false, now);
    return st.includes('empty') || st.includes('tiny');
  }).map((r) => r.id);
}

/** Ids of every chat that is not already archived, pinned or open now (open = has a live dot state). Backs the "Clean up" button. */
export function closedIds(rows: UsageRow[], d: Pick<TinyDeps, 'archived' | 'pins' | 'dots'>): string[] {
  const arch = d.archived(), pins = new Set(d.pins()), dots = d.dots();
  // Same skip rules as tinyIds so open and pinned sessions are never swept away by a bulk action.
  return rows.filter((r) => !arch.has(r.id) && !pins.has(r.id) && !dots[r.id]).map((r) => r.id);
}

/** Archive every session that is not open or pinned, behind a modal count confirmation (reversible via Unarchive). */
export async function archiveClosed(d: TinyDeps): Promise<void> {
  const ids = closedIds(await d.rows(), d);
  if (!ids.length) { void vscode.window.showInformationMessage('Nothing to clean up: every session is open, pinned or already archived.'); return; }
  const ok = await vscode.window.showWarningMessage(`Archive ${ids.length} sessions?`,
    { modal: true, detail: 'Every session that is not open now moves to the Archived section. Pinned sessions and sessions open now are skipped. Nothing is deleted: Unarchive brings a session back.' }, 'Archive');
  if (ok !== 'Archive') { return; }
  const n = await d.archive(ids);
  void vscode.window.showInformationMessage(`Archived ${n} sessions`);
}

export async function archiveTiny(d: TinyDeps): Promise<void> {
  const ids = tinyIds(await d.rows(), d, Date.now());
  if (!ids.length) { void vscode.window.showInformationMessage('No empty or tiny sessions to archive.'); return; }
  const ok = await vscode.window.showWarningMessage(`Archive ${ids.length} empty and tiny sessions?`,
    { modal: true, detail: 'Sessions with no messages or 1 to 3 messages move to the Archived section. Pinned sessions and sessions open now are skipped. Nothing is deleted: Unarchive brings a session back.' }, 'Archive');
  if (ok !== 'Archive') { return; }
  const n = await d.archive(ids);
  void vscode.window.showInformationMessage(`Archived ${n} sessions`);
}
