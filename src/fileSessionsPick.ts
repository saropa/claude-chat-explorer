/** The "Chats that touched <file>" QuickPick: resume, copy a hand-over note, search in panel, copy the list. */
import * as path from 'path';
import * as vscode from 'vscode';
import { FileSession } from './fileSessions';
import { ago, handoverNote, markdownList, touchOf } from './fileSessionsNote';
import { STATUS_LABELS } from './status';

export interface PickDeps { open: (id: string) => Promise<void>; findInPanel: (query: string) => Promise<void>; relPath: string; }
type Item = vscode.QuickPickItem & { s: FileSession };

const NOTE_BTN: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('clippy'), tooltip: 'Copy hand-over note' };
const PANEL_BTN: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('search'), tooltip: 'Search in panel' };
const LIST_BTN: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('copy'), tooltip: 'Copy list' };

/** The query that finds this file's chats in the panel; a path with spaces is quoted. */
export const panelQuery = (rel: string, edited = false): string => `${edited ? 'edited' : 'file'}:${/\s/.test(rel) ? `"${rel}"` : rel}`;

function toItem(s: FileSession): Item {
  const folder = path.basename(s.project.replace(/\\/g, '/'));
  const status = s.status.map((k) => STATUS_LABELS[k] ?? k).join(', ');
  return { s, label: s.title, buttons: [NOTE_BTN, PANEL_BTN],
    description: `${touchOf(s)} · ${ago(s.last)} · ${folder}`,
    detail: [s.branch, status].filter(Boolean).join(' · ') || undefined };
}

async function copy(text: string, what: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  void vscode.window.showInformationMessage(`Copied ${what}.`);
}

/** Show the list; it disposes itself when closed. */
export function showPick(fileName: string, items: FileSession[], d: PickDeps): void {
  const qp = vscode.window.createQuickPick<Item>();
  qp.title = `Chats that touched ${fileName}`;
  qp.placeholder = 'Pick a chat to resume';
  qp.matchOnDescription = qp.matchOnDetail = true;
  qp.items = items.map(toItem);
  qp.buttons = [LIST_BTN];
  qp.onDidTriggerButton(() => { void copy(markdownList(items, d.relPath), 'the list'); });
  qp.onDidTriggerItemButton((e) => {
    if (e.button === NOTE_BTN) { void copy(handoverNote(e.item.s, d.relPath), 'the hand-over note'); }
    else { qp.hide(); void d.findInPanel(panelQuery(d.relPath)); }
  });
  qp.onDidAccept(() => { const it = qp.selectedItems[0]; qp.hide(); if (it) { void d.open(it.s.id); } });
  qp.onDidHide(() => qp.dispose());
  qp.show();
}
