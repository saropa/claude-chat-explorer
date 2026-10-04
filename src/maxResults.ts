import * as vscode from 'vscode';
import { clampMax, DEFAULT_MAX_RESULTS } from './limits';

/** Totals of a finished or running search, as the panel shows them. */
export interface Totals { totalChats: number; totalHits: number; capped: boolean; hitsCapped: boolean; max: number; }

/** The saropaChatExplorer.maxResults setting, read now and clamped to its range. */
export const maxResults = (): number => clampMax(vscode.workspace.getConfiguration('saropaChatExplorer').get('maxResults', DEFAULT_MAX_RESULTS));

/** The totals fields of a worker message. */
export const pickTotals = (w: any): Totals =>
  ({ totalChats: w.totalChats ?? 0, totalHits: w.totalHits ?? 0, capped: !!w.capped, hitsCapped: !!w.hitsCapped, max: w.max ?? DEFAULT_MAX_RESULTS });
