/** Names live sessions in the background: reads only the head and tail of a transcript, appends a custom-title, remembers what it did. */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { projectsRoot } from './files';
import { Done, buildTitle, mergeRules, parseRules, planTitle, prune, safeAppend, scanPrompts } from './autoTitle';
import { promptData } from './regenTitles';
import { generate } from './regenTitlesRun';

const KEY = 'saropaChatExplorer.autoTitleDone';
const KEEP = 500;
const MISS_MS = 30000, HAIKU_MS = 30000;

export class AutoTitler {
  private running = false;
  private readonly files = new Map<string, string>();
  private readonly misses = new Map<string, number>(); // id -> when locate last failed
  private readonly size = new Map<string, number>(); // file size at the last look: unchanged means nothing new to read

  constructor(private readonly state: vscode.Memento, private readonly log: (where: string, e: unknown) => void, private readonly wrote: (id: string, title: string) => void) {}

  /** A watcher poll finished. Never blocks it: one pass at a time, and none when the setting is off. */
  onLive(ids: Iterable<string>): void {
    const cfg = vscode.workspace.getConfiguration('saropaChatExplorer');
    if (this.running || cfg.get('autoTitle.enabled') !== true) { return; }
    this.running = true;
    void this.pass([...ids], cfg).catch((e) => this.log('autoTitle', e)).finally(() => { this.running = false; });
  }

  private async locate(id: string): Promise<string | undefined> {
    const known = this.files.get(id);
    if (known) { return known; }
    if (Date.now() - (this.misses.get(id) ?? 0) < MISS_MS) { return undefined; }
    const root = projectsRoot();
    let dirs: fs.Dirent[] = [];
    try { dirs = await fs.promises.readdir(root, { withFileTypes: true }); } catch { return undefined; }
    for (const d of dirs.filter((x) => x.isDirectory())) {
      const f = path.join(root, d.name, id + '.jsonl');
      try { await fs.promises.access(f); this.files.set(id, f); return f; } catch { /* not in this project */ }
    }
    this.misses.set(id, Date.now());
    return undefined;
  }

  private async pass(ids: string[], cfg: vscode.WorkspaceConfiguration): Promise<void> {
    const rules = mergeRules(parseRules(cfg.get('emojiRules')), cfg.get('emojiRulesReplaceDefaults') === true);
    const haiku = cfg.get('autoTitle.useHaiku') === true;
    const all = { ...this.state.get<Record<string, Done>>(KEY, {}) };
    let dirty = false;
    for (const id of ids) {
      if ((all[id]?.n ?? 0) >= 3) { continue; }
      const file = await this.locate(id);
      if (!file) { continue; }
      try {
        const size = (await fs.promises.stat(file)).size;
        if (this.size.get(id) === size) { continue; }
        const info = await scanPrompts(file);
        this.size.set(id, info.size);
        const plan = planTitle({ prompts: info.prompts, custom: info.custom }, all[id]);
        if (plan.skip) { if (plan.final) { all[id] = { n: 3, t: '' }; dirty = true; } continue; }
        let title = buildTitle(plan.prompts, rules);
        // Hard 30s cap for the whole background call (generate stops retrying once the signal fires).
        if (haiku && title) { title = await generate(promptData(plan.prompts), AbortSignal.timeout(HAIKU_MS)).catch(() => title); }
        if (!title) { continue; }
        if (!(await safeAppend(file, title, id, all[id]?.t))) { all[id] = { n: 3, t: '' }; dirty = true; continue; }
        this.size.delete(id);
        delete all[id]; // re-insert last so pruning keeps active sessions
        all[id] = { n: plan.final ? 3 : Math.max(1, plan.prompts.length), t: title };
        dirty = true;
        this.wrote(id, title);
      } catch (e) { this.files.delete(id); this.log('autoTitle ' + id, e); }
    }
    if (dirty) {
      prune(all, ids, KEEP);
      await this.state.update(KEY, all);
    }
  }
}
