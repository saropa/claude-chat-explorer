/** Names live sessions in the background: reads only the head and tail of a transcript, appends a custom-title, remembers what it did. */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { projectsRoot } from './files';
import { Done, buildTitle, customTitleOf, mergeRules, parseRules, planTitle } from './autoTitle';
import { promptData, readInfo, titleLines } from './regenTitles';
import { generate } from './regenTitlesRun';

const KEY = 'saropaChatExplorer.autoTitleDone';
const KEEP = 500;
const HEAD = 32768, TAIL = 16384;

async function slice(file: string, at: (size: number) => [number, number]): Promise<{ text: string; size: number }> {
  const h = await fs.promises.open(file, 'r');
  try {
    const size = (await h.stat()).size, [pos, len] = at(size);
    const buf = Buffer.alloc(len);
    const { bytesRead } = await h.read(buf, 0, len, pos);
    return { text: buf.toString('utf8', 0, bytesRead), size };
  } finally { await h.close(); }
}

export class AutoTitler {
  private running = false;
  private readonly files = new Map<string, string>();
  private readonly size = new Map<string, number>(); // file size at the last look: unchanged means nothing new to read

  constructor(private readonly state: vscode.Memento, private readonly log: (where: string, e: unknown) => void, private readonly wrote: () => void) {}

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
    const root = projectsRoot();
    let dirs: fs.Dirent[] = [];
    try { dirs = await fs.promises.readdir(root, { withFileTypes: true }); } catch { return undefined; }
    for (const d of dirs.filter((x) => x.isDirectory())) {
      const f = path.join(root, d.name, id + '.jsonl');
      try { await fs.promises.access(f); this.files.set(id, f); return f; } catch { /* not in this project */ }
    }
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
        const head = await slice(file, (size) => [0, Math.min(size, HEAD)]);
        if (this.size.get(id) === head.size) { continue; }
        this.size.set(id, head.size);
        const tail = head.size > HEAD ? await slice(file, (size) => [Math.max(0, size - TAIL), Math.min(size, TAIL)]) : head;
        const info = readInfo(head.text);
        const plan = planTitle({ prompts: info.prompts, custom: customTitleOf(tail.text) ?? customTitleOf(head.text) }, all[id]);
        if (plan.skip) { if (plan.final) { all[id] = { n: 3, t: '' }; dirty = true; } continue; }
        let title = buildTitle(plan.prompts, rules);
        if (haiku && title) { title = await generate(promptData(plan.prompts), new AbortController().signal).catch(() => title); }
        if (!title) { continue; }
        await fs.promises.appendFile(file, titleLines(title, id), 'utf8');
        this.size.delete(id);
        all[id] = { n: plan.final ? 3 : Math.max(1, plan.prompts.length), t: title };
        dirty = true;
        this.wrote();
      } catch (e) { this.log('autoTitle ' + id, e); }
    }
    if (dirty) {
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) { delete all[k]; }
      await this.state.update(KEY, all);
    }
  }
}
