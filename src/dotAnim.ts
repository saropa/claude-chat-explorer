import * as vscode from 'vscode';

/** The animateDots setting (default on): throb and alternate the chat dots. */
export const dotsAnimated = (): boolean => vscode.workspace.getConfiguration('saropaChatExplorer').get('animateDots') !== false;
