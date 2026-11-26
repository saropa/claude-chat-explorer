/** The "Generate session titles" commands: bulk (scope and dry-run pickers, progress, claude calls, backup and write) and single-session (row context menu). Internal names keep "regen" so command ids and keybindings stay stable. */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { projectsRoot } from './files';
import { readLive, sessionsDir } from './liveState';
import { Candidate, backupDir, buildPrompt, parseResult, pickFiles, projectDirName, promptData, readInfo, titleLines } from './regenTitles';

export interface RegenDeps { currentId: () => string; /** Ids of every session the live watcher reports as live (open in any tab or window, not just this one); optional so older callers keep compiling. */ liveIds?: () => string[]; refresh: () => void; log: (where: string, e: unknown) => void }

/**
 * Sessions that must not get a title line appended right now: every session with a running Claude process, read fresh from
 * ~/.claude/sessions (one <pid>.json per process, machine-wide, so it covers chat tabs of EVERY VS Code window and terminal or SDK runs),
 * plus the watcher's ids. The watcher alone was not enough: its list is up to 30 s old (a chat resumed in another window seconds ago was
 * missed) and it drops non-VS Code entrypoints, whose processes write the same transcript. A failed read falls back to the watcher's ids.
 */
async function busySessions(d: RegenDeps): Promise<Set<string>> {
  const busy = new Set(d.liveIds?.() ?? []);
  try { for (const id of (await readLive(sessionsDir())).pids.keys()) { busy.add(id); } } catch { /* keep the watcher's ids */ }
  return busy;
}

const callClaude = (data: string, signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
  const p = execFile('claude', ['-p', '--model', 'haiku', '--no-session-persistence'],
    { env: { ...process.env, SESSION_TITLE_HOOK_CHILD: '1' }, cwd: os.tmpdir(), timeout: 120000, maxBuffer: 1 << 20, signal },
    (err, stdout, stderr) => (err ? reject(new Error(String(stderr).trim().slice(0, 200) || err.message)) : resolve(stdout)));
  p.stdin?.end(buildPrompt(data));
});

export async function generate(data: string, signal: AbortSignal): Promise<string> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    if (signal.aborted) { throw new Error('cancelled'); }
    try { return parseResult(await callClaude(data, signal)); } catch (e) { last = e; }
  }
  throw last;
}

/** Backs up a transcript under ~/.claude/backups/session_titles, then appends the new title line. Shared by the bulk and the single-session commands so both write identically. */
async function backupAndAppend(file: string, id: string, title: string, stamp: string): Promise<void> {
  const bdir = backupDir(os.homedir(), stamp, path.basename(path.dirname(file)));
  await fs.promises.mkdir(bdir, { recursive: true });
  await fs.promises.copyFile(file, path.join(bdir, path.basename(file)));
  await fs.promises.appendFile(file, titleLines(title, id), 'utf8');
}

/** Timestamp used in the backup folder name (same format for every run). */
const backupStamp = (): string => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

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
  const scope = await vscode.window.showQuickPick([{ label: 'This project', all: false }, { label: 'All projects', all: true }], { title: 'Generate session titles: scope' });
  if (!scope) { return; }
  const mode = await vscode.window.showQuickPick([{ label: 'Preview only (dry run)', dry: true, description: 'Shows old and new titles; nothing is written' }, { label: 'Generate and write', dry: false, description: 'Backs up each transcript, then appends the new title' }], { title: 'Generate session titles: mode' });
  if (!mode) { return; }
  const dry = mode.dry;
  out.clear(); out.show(true);
  // The bulk run skips the same live sessions as the single-session command: before, it only skipped this window's chat and files changed in the last 5 minutes, so it could append to a chat open in another window.
  const { run, live } = pickFiles(await candidates(scope.all), d.currentId(), Date.now(), await busySessions(d));
  let changed = 0, skipped = live.length, failed = 0;
  for (const l of live) { out.appendLine(`SKIP ${l.id}: open in a chat tab or terminal, or modified in the last 5 minutes`); }
  const stamp = backupStamp();
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: dry ? 'Previewing session titles' : 'Generating session titles', cancellable: true }, async (prog, token) => {
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
          await backupAndAppend(f.file, f.id, next, stamp);
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

/**
 * Finds the transcript file of one session id by looking for <id>.jsonl in every project folder; undefined when no project holds it.
 * Archived sessions are found too: archiving is a flag in this extension's store and never moves the file. Subagent transcripts
 * (<parent>/subagents/agent-<id>.jsonl) are deliberately not searched: the session list renders only parent rows (subagent hits sit inside
 * their parent's row, under the parent's data-vscode-context), so the command only ever receives a parent id, and a subagent has no title of its own.
 */
async function findSessionFile(id: string): Promise<Candidate | undefined> {
  const root = projectsRoot();
  let dirs: string[] = [];
  try { dirs = (await fs.promises.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return undefined; }
  for (const d of dirs) {
    const file = path.join(root, d, id + '.jsonl');
    try { return { file, id, mtime: (await fs.promises.stat(file)).mtimeMs }; } catch { /* not in this project */ }
  }
  return undefined;
}

/**
 * Row context menu: generates the title of ONE session with the same generator, backup and write as the bulk command.
 * Every call ends in a visible message (success, skipped with the reason, or failure), and shows a cancellable progress notification meanwhile.
 */
export async function generateTitleFor(id: string, d: RegenDeps, out: vscode.OutputChannel): Promise<void> {
  const f = await findSessionFile(id);
  if (!f) { void vscode.window.showWarningMessage(vscode.l10n.t('Generate Title: the session file was not found.')); return; }
  // Same live-session rule as the bulk run: appending to a transcript that is open or being written could interleave with Claude's own writes.
  // busySessions adds every session with a running Claude process in any window (read fresh, see its comment) to pickFiles' own rules.
  if (pickFiles([f], d.currentId(), Date.now(), await busySessions(d)).run.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Generate Title: skipped. This session is open in a chat tab or terminal, or was changed in the last 5 minutes.'));
    return;
  }
  let title = '';
  let error = '';
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating session title', cancellable: true }, async (_prog, token) => {
    const ac = new AbortController();
    token.onCancellationRequested(() => ac.abort());
    try {
      const { prompts } = readInfo(await fs.promises.readFile(f.file, 'utf8'));
      if (!prompts.length) { error = 'the session has no usable prompts'; return; }
      title = await generate(promptData(prompts), ac.signal);
      if (token.isCancellationRequested) { title = ''; error = 'cancelled'; return; }
      await backupAndAppend(f.file, f.id, title, backupStamp());
    } catch (e) {
      title = '';
      error = token.isCancellationRequested ? 'cancelled' : (e instanceof Error ? e.message : String(e));
      if (error !== 'cancelled') { out.appendLine(`FAIL ${id}: ${error}`); d.log('generateTitleFor', e); }
    }
  });
  if (title) { d.refresh(); void vscode.window.showInformationMessage(vscode.l10n.t('Generate Title: {0}', title)); }
  else { void vscode.window.showWarningMessage(vscode.l10n.t('Generate Title: no title written ({0}).', error)); }
}
