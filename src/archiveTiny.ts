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

export async function archiveTiny(d: TinyDeps): Promise<void> {
  const ids = tinyIds(await d.rows(), d, Date.now());
  if (!ids.length) { void vscode.window.showInformationMessage('No empty or tiny chats to archive.'); return; }
  const ok = await vscode.window.showWarningMessage(`Archive ${ids.length} empty and tiny chats?`,
    { modal: true, detail: 'Chats with no messages or 1 to 3 messages move to the Archived section. Pinned chats and chats open now are skipped. Nothing is deleted: Unarchive brings a chat back.' }, 'Archive');
  if (ok !== 'Archive') { return; }
  const n = await d.archive(ids);
  void vscode.window.showInformationMessage(`Archived ${n} chats`);
}
