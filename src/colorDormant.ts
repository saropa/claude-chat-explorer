import * as vscode from 'vscode';

/** Default dormancy threshold in minutes. The only code-side home of the literal; package.json declares the same default for the Settings UI. */
export const COLOR_DORMANT_DEFAULT_MIN = 3;

/**
 * The colorDormantMinutes setting as milliseconds: how long a chat may sit without activity before the session list hides its color marker.
 * 0 means never hide. A missing, negative or non-numeric value falls back to the default so a hand-edited settings.json cannot break the list.
 */
export const colorDormantMs = (): number => {
  const v = vscode.workspace.getConfiguration('saropaChats').get<number>('colorDormantMinutes');
  const min = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : COLOR_DORMANT_DEFAULT_MIN;
  return Math.round(min * 60000);
};
