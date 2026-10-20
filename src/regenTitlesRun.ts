/** The "Regenerate session titles" command: scope and dry-run pickers, progress, claude calls, backup and write. */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { projectsRoot } from './files';
import { Candidate, backupDir, buildPrompt, parseResult, pickFiles, projectDirName, promptData, readInfo, titleLines } from './regenTitles';

export interface RegenDeps { currentId: () => string; refresh: () => void; log: (where: string, e: unknown) => void }

const callClaude = (data: string, signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
  const p = execFile('claude', ['-p', '--model', 'haiku', '--no-session-persistence'],
    { env: { ...process.env, SESSION_TITLE_HOOK_CHILD: '1' }, cwd: os.tmpdir(), timeout: 120000, maxBuffer: 1 << 20, signal },
    (err, stdout, stderr) => (err ? reject(new Error(String(stderr).trim().slice(0, 200) || err.message)) : resolve(stdout)));
  p.stdin?.end(buildPrompt(data));
});

async function generate(data: string, signal: AbortSignal): Promise<string> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    if (signal.aborted) { throw new Error('cancelled'); }
    try { return parseResult(await callClaude(data, signal)); } catch (e) { last = e; }
  }
  throw last;
}

async function candidates(all: boolean): Promise<Candidate[]> {
  const root = projectsRoot();
  let dirs: string[];
  if (all) { dirs = (await fs.promises.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); }
  else {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    dirs = cwd ? [projectDirName(cwd)] : [];
  }
  const out: Candidate[] = [];
  for (const d of dirs) {
    let names: string[] = [];
    try { names = await fs.promises.readdir(path.join(root, d)); } catch { continue; }
    for (const n of names.filter((x) => x.endsWith('.jsonl'))) {
      const file = path.join(root, d, n);
      try { out.push({ file, id: n.slice(0, -6), mtime: (await fs.promises.stat(file)).mtimeMs }); } catch { /* vanished */ }
    }
  }
  return out;
}

export async function regenTitles(d: RegenDeps, out: vscode.OutputChannel): Promise<void> {
  const scope = await vscode.window.showQuickPick([{ label: 'This project', all: false }, { label: 'All projects', all: true }], { title: 'Regenerate session titles: scope' });
  if (!scope) { return; }
  const mode = await vscode.window.showQuickPick([{ label: 'Preview only (dry run)', dry: true, description: 'Shows old and new titles; nothing is written' }, { label: 'Regenerate and write', dry: false, description: 'Backs up each transcript, then appends the new title' }], { title: 'Regenerate session titles: mode' });
  if (!mode) { return; }
  const dry = mode.dry;
  out.clear(); out.show(true);
  const { run, live } = pickFiles(await candidates(scope.all), d.currentId(), Date.now());
  let changed = 0, skipped = live.length, failed = 0;
  for (const l of live) { out.appendLine(`SKIP ${l.id}: active or modified in the last 5 minutes`); }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: dry ? 'Previewing session titles' : 'Regenerating session titles', cancellable: true }, async (prog, token) => {
    const ac = new AbortController();
    token.onCancellationRequested(() => ac.abort());
    let n = 0;
    for (const f of run) {
      if (token.isCancellationRequested) { out.appendLine('Cancelled'); break; }
      prog.report({ message: `${++n} of ${run.length}`, increment: 100 / Math.max(run.length, 1) });
      try {
        const { prompts, title: old } = readInfo(await fs.promises.readFile(f.file, 'utf8'));
        if (!prompts.length) { out.appendLine(`SKIP ${f.id}: no usable prompts`); skipped++; continue; }
        const next = await generate(promptData(prompts), ac.signal);
        out.appendLine(`${old ?? '(none)'}  ->  ${next}`);
        if (!dry) {
          const bdir = backupDir(os.homedir(), stamp, path.basename(path.dirname(f.file)));
          await fs.promises.mkdir(bdir, { recursive: true });
          await fs.promises.copyFile(f.file, path.join(bdir, path.basename(f.file)));
          await fs.promises.appendFile(f.file, titleLines(next, f.id), 'utf8');
        }
        changed++;
      } catch (e) {
        if (token.isCancellationRequested) { out.appendLine('Cancelled'); break; }
        out.appendLine(`FAIL ${f.id}: ${e instanceof Error ? e.message : String(e)}`); failed++;
        d.log('regenTitles', e);
      }
    }
  });
  const msg = `${dry ? 'Preview: ' : ''}${changed} ${dry ? 'would change' : 'changed'}, ${skipped} skipped, ${failed} failed`;
  out.appendLine(msg);
  if (!dry && changed) { d.refresh(); }
  void vscode.window.showInformationMessage(msg);
}
