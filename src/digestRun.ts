/**
 * Host side of chat digests: the three commands (Build, Rebuild, Export), the optional automatic rebuild, and the
 * card's digest links. The worker gathers and saves (digestBuild.ts); this file runs the AI between the two steps,
 * through the claude command (Haiku) with at most 2 processes at a time.
 */
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { AiState, autoDue } from './digest';
import { AI_SLOTS, AI_TIMEOUT_MS, AI_TRIES, AiCall, AiPart, runAi } from './digestAi';
import { EXPORT_DIR, INDEX_NAME, supersededExports } from './digestMd';
import { DigestInputReply } from './digestBuild';
import { readDigest, digestDir } from './digestStore';
import { Limiter } from './execLimit';
import { Exec, ExecResult, pool } from './wipExec';
import { isSessionId } from './sessionId';

export const BUILD_CMD = 'saropaChats.buildDigests';
export const REBUILD_CMD = 'saropaChats.rebuildDigest';
export const EXPORT_CMD = 'saropaChats.exportDigests';
const CFG = 'saropaChats';
export const AUTO_SETTING = 'digest.auto';
export const AI_SETTING = 'digest.useAi';
/** Build commands name the commands the owner can run next; one place for their titles in messages. */
const BUILD_TITLE = 'Saropa: Build Session Digests';
/** Gathering scans the whole chat file, which can take a while for a very large chat: a long, soft worker request. */
const GATHER_MS = 120000;
const AUTO_EVERY_MS = 2 * 60 * 1000; // how often the automatic rebuild looks for idle stale digests
const OPEN_MAX_BYTES = 50 * 1024 * 1024; // larger session files are not opened in the editor (VS Code struggles with them)

/** What the service needs from the extension. */
export interface DigestDeps {
  request: (m: { [k: string]: unknown }, timeoutMs?: number) => Promise<any>; // a soft worker request: a stall fails this call only
  storage: string; // the extension's storage folder (the worker's dir)
  busy: () => Set<string>; // chats that are not idle now (running or waiting), from the live state
  post: (m: unknown) => void; // to the sidebar page
  log: (where: string, e: unknown) => void;
  setQuery: (q: string) => void; // run a search in the sidebar
}

/** One claude run with the prompt on stdin, shaped as an Exec so the shared Limiter can queue it. */
const claudeExec = (prompt: string): Exec => (cmd, args, o) => new Promise<ExecResult>((resolve) => {
  const p = execFile(cmd, args, { env: { ...process.env, SESSION_TITLE_HOOK_CHILD: '1' }, cwd: o.cwd, timeout: o.timeout, maxBuffer: 1 << 20, signal: o.signal, windowsHide: true },
    (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      resolve({ code: e ? (e.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr), timedOut: !!e?.killed && !o.signal?.aborted, aborted: !!o.signal?.aborted });
    });
  // A missing program fails at spawn; the error handler keeps the stdin write from throwing on top of it.
  p.stdin?.on('error', () => undefined);
  p.stdin?.end(prompt);
});

/** The real model call: claude -p --model haiku --no-session-persistence, queued on the limiter. An error carries code ENOENT when claude is not installed. */
export function haikuCall(lim: Limiter): AiCall {
  return async (prompt, signal) => {
    const r = await lim.wrap(claudeExec(prompt), 'ui')('claude', ['-p', '--model', 'haiku', '--no-session-persistence'], { cwd: os.tmpdir(), timeout: AI_TIMEOUT_MS, signal });
    if (r.aborted) { throw new Error('cancelled'); }
    if (r.code !== 0) { throw Object.assign(new Error(r.timedOut ? 'claude timed out' : r.stderr.trim().slice(0, 200) || `claude failed (${String(r.code)})`), { code: r.code }); }
    return r.stdout;
  };
}

/** How one build ended: its AI state, or gone (the chat is no longer indexed) or lost (the gathered build expired). */
type Outcome = AiState | 'gone' | 'lost';

/** Digest commands and the automatic rebuild of one window. */
export class DigestService {
  private readonly lim = new Limiter(AI_SLOTS, AI_SLOTS);
  private readonly call: AiCall;
  private readonly active = new Set<string>(); // chats being built now: never two builds of one chat
  private timer?: NodeJS.Timeout;
  private autoRunning = false;
  private noCli = false; // claude was not found: later builds of this run skip the AI instead of failing 3 times each
  private readonly drifted = new Set<string>(); // chat-file layout problems already written to the output channel: each is logged once per window

  constructor(private readonly d: DigestDeps, call?: AiCall) { this.call = call ?? haikuCall(this.lim); }

  private cfg(): vscode.WorkspaceConfiguration { return vscode.workspace.getConfiguration(CFG); }
  private useAi(): boolean { return this.cfg().get(AI_SETTING) !== false; }

  /** Build one digest: gather, run the AI (unless off or nothing to send), save. A cancel stops before the save, so no half digest is written. */
  async buildOne(id: string, signal?: AbortSignal): Promise<Outcome> {
    // A second build of the same chat while one runs would race on the worker's gathered state.
    if (this.active.has(id)) { return 'lost'; }
    this.active.add(id);
    try {
      const r: DigestInputReply | undefined = await this.d.request({ t: 'digestInput', chat: id }, GATHER_MS);
      if (!r) { return 'gone'; }
      this.logDrift(id, r.drift);
      let state: AiState = 'none';
      let part: AiPart | undefined;
      // Three reasons to skip the AI: nothing to send, the setting is off, or claude is missing (already known this run).
      if (!r.input.pieces.length) { state = 'none'; }
      else if (!this.useAi()) { state = 'off'; }
      else if (this.noCli) { state = 'failed'; }
      else {
        try { part = await runAi(r.input, this.call, signal); state = 'ok'; } catch (e) {
          if (signal?.aborted) { throw e; } // canceled: no save
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') { this.noCli = true; }
          this.d.log(`digest AI ${id}`, e);
          state = 'failed';
        }
      }
      const s = await this.d.request({ t: 'digestSave', chat: id, state, part });
      if (!s) { return 'lost'; }
      // The page updates the row marker and an open card at once; no new search is needed.
      this.d.post({ type: 'digestChanged', id, goal: s.goal ?? '' });
      return state;
    } finally { this.active.delete(id); }
  }

  /**
   * Write each chat-file layout problem the worker found to the output channel, once per window: the same drift shows on
   * every chat of a changed Claude Code version, and one line is enough to report it. The digest itself carries the note.
   */
  private logDrift(id: string, drift: unknown): void {
    // The list crossed a thread boundary: only string entries are trusted.
    for (const k of Array.isArray(drift) ? drift.filter((x): x is string => typeof x === 'string') : []) {
      if (this.drifted.has(k)) { continue; }
      this.drifted.add(k);
      const what = k === 'dialog answers'
        ? 'question dialogs were found but none of their answers could be read; the chat-file layout may have changed'
        : 'no assistant row has a stop_reason field, so whether the session ended cleanly is unknown; the chat-file layout may have changed';
      this.d.log(`digest layout ${id}`, what);
    }
  }

  /** The one error of a command run whose builds found no claude program: what happened and what was saved instead. */
  private showNoCli(): void {
    void vscode.window.showErrorMessage(vscode.l10n.t('The claude CLI was not found on PATH. Digests were saved with the exact parts only; install Claude Code or add claude to PATH, then build again.'));
  }

  /** "Build Session Digests": every chat with no digest or an out-of-date one, after a count confirmation, with progress and cancel. */
  async buildAll(): Promise<void> {
    let todo: Array<{ id: string; state: string; calls?: number }>;
    try { todo = ((await this.d.request({ t: 'digestTodo' })) ?? []).filter((x: { state: string }) => x.state !== 'fresh'); } catch (e) {
      this.d.log('digest list', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not list the sessions to build digests for: {0}', (e as Error).message));
      return;
    }
    if (!todo.length) { void vscode.window.showInformationMessage(vscode.l10n.t('Every session already has an up-to-date digest.')); return; }
    const fresh = todo.filter((x) => x.state === 'none').length, stale = todo.length - fresh;
    const ai = this.useAi();
    // The cost bound: the most AI calls the run can make (each chat's pieces plus a merge), from the worker's estimate.
    const calls = todo.reduce((n, x) => n + (typeof x.calls === 'number' && x.calls > 0 ? x.calls : 0), 0);
    const go = vscode.l10n.t('Build');
    const pick = await vscode.window.showInformationMessage(todo.length === 1 ? vscode.l10n.t('Build a digest for 1 session?') : vscode.l10n.t('Build digests for {0} sessions?', todo.length), {
      modal: true,
      detail: vscode.l10n.t('{0} sessions: {1} without a digest, {2} out of date.', todo.length, fresh, stale) + ' '
        // With AI on the owner sees the upper bound of calls before agreeing; with AI off it is stated that nothing is called.
        + (ai ? vscode.l10n.t('Up to an estimated {0} AI calls to the claude command (Haiku) on the Claude subscription, at most {1} at a time; a malformed reply is retried up to {2} times.', calls, AI_SLOTS, AI_TRIES)
          : vscode.l10n.t('AI parts are turned off: no AI calls are made, only the exact parts are built.')),
    }, go);
    if (pick !== go) { return; }
    this.noCli = false; // a new run checks for claude again
    await this.runMany(todo.map((x) => x.id), vscode.l10n.t('Building session digests'), true);
  }

  /** Build a list of chats with a cancelable progress notification, then report the counts. */
  private async runMany(ids: string[], title: string, report: boolean): Promise<void> {
    const n = { ok: 0, plain: 0, failed: 0, err: 0, done: 0 };
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (prog, token) => {
      const ac = new AbortController();
      token.onCancellationRequested(() => ac.abort());
      await pool(ids, AI_SLOTS, async (id) => {
        try {
          const o = await this.buildOne(id, ac.signal);
          // 'ok' and 'none' are complete digests; 'off' and 'failed' hold the exact parts only.
          if (o === 'ok' || o === 'none') { n.ok++; } else if (o === 'off') { n.plain++; } else if (o === 'failed') { n.failed++; } else { n.err++; }
        } catch (e) {
          if (!ac.signal.aborted) { n.err++; this.d.log(`digest ${id}`, e); }
        }
        n.done++;
        prog.report({ message: vscode.l10n.t('{0} of {1}', n.done, ids.length), increment: 100 / Math.max(ids.length, 1) });
      }, () => ac.signal.aborted);
    });
    if (!report) { return; }
    const built = n.ok + n.plain + n.failed;
    const parts = [built === 1 ? vscode.l10n.t('Built 1 digest') : vscode.l10n.t('Built {0} digests', built)];
    if (n.plain) { parts.push(vscode.l10n.t('{0} without AI parts (turned off)', n.plain)); }
    if (n.failed) { parts.push(vscode.l10n.t('{0} without AI parts ({1})', n.failed, this.noCli ? vscode.l10n.t('the claude CLI was not found') : vscode.l10n.t('the AI call failed; retried on the next build'))); }
    if (n.err) { parts.push(vscode.l10n.t('{0} failed (see the Saropa Chats output)', n.err)); }
    if (n.done < ids.length) { parts.push(vscode.l10n.t('stopped after {0} of {1}', n.done, ids.length)); }
    void vscode.window.showInformationMessage(parts.join(', ') + '.');
    // A missing claude is not a per-chat failure: one error for the whole run says why the AI parts are missing.
    if (this.noCli) { this.showNoCli(); }
  }

  /** "Rebuild Session Digest" (row menu and the card's button): one chat at once, with the card's button showing busy and done. */
  async rebuild(id: string): Promise<void> {
    if (!isSessionId(id)) { return; }
    if (this.active.has(id)) { void vscode.window.showInformationMessage(vscode.l10n.t('A digest for this session is already being built.')); return; }
    this.noCli = false;
    this.d.post({ type: 'digestState', id, state: 'busy' });
    try {
      const o = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Building the session digest'), cancellable: true }, (_p, token) => {
        const ac = new AbortController();
        token.onCancellationRequested(() => ac.abort());
        return this.buildOne(id, ac.signal).catch((e) => { if (ac.signal.aborted) { return 'cancelled' as const; } throw e; });
      });
      this.d.post({ type: 'digestState', id, state: o === 'gone' || o === 'lost' || o === 'cancelled' ? '' : 'done' });
      // A missing claude gets the one clear error of this run instead of the plain info line.
      if (o === 'failed' && this.noCli) { this.showNoCli(); return; }
      const msg = o === 'gone' ? vscode.l10n.t('This session is not indexed yet. Try again in a moment.')
        : o === 'lost' ? vscode.l10n.t('The digest build was interrupted. Try again.')
          : o === 'cancelled' ? vscode.l10n.t('Digest build canceled.')
            : o === 'off' ? vscode.l10n.t('Digest built with the exact parts only (AI parts are turned off).')
              : o === 'failed' ? vscode.l10n.t('Digest built without AI parts: the AI call failed (see the Saropa Chats output).')
                : vscode.l10n.t('Digest built.');
      void vscode.window.showInformationMessage(msg);
    } catch (e) {
      this.d.post({ type: 'digestState', id, state: '' });
      this.d.log('rebuild digest', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not build the digest: {0}', (e as Error).message));
    }
  }

  /** "Export Session Digests to Project": one Markdown file per digest of the open project, plus INDEX.md, into docs/history/chats. */
  async export(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    // No folder means no place to write: an error, so the command never looks like it did something.
    if (!folders.length) { void vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder is open: digests are written into the {0} folder of a project. Open a folder and export again.', EXPORT_DIR.join('/'))); return; }
    // With several folders open the owner picks the project; one folder needs no question, so the first folder is never taken silently.
    const f = folders.length === 1 ? folders[0] : (await vscode.window.showQuickPick(folders.map((x) => ({ label: x.name, description: x.uri.fsPath, x })), { title: vscode.l10n.t('Export session digests: project') }))?.x;
    // A dismissed pick is the owner's cancel; say so, so the command always ends with a visible outcome.
    if (!f) { void vscode.window.showInformationMessage(vscode.l10n.t('Export canceled: no project folder picked.')); return; }
    try {
      const r: { files: Array<{ name: string; text: string }>; index: string; missing: number; stale: number } | undefined = await this.d.request({ t: 'digestExport', folder: f.uri.fsPath }, GATHER_MS);
      if (!r || !r.files.length) {
        void vscode.window.showInformationMessage(r?.missing ? vscode.l10n.t('No digests for {0} yet ({1} without one). Run "{2}" first.', f.name, r.missing, BUILD_TITLE) : vscode.l10n.t('No digests for {0} yet. Run "{1}" first.', f.name, BUILD_TITLE));
        return;
      }
      const dir = vscode.Uri.joinPath(f.uri, ...EXPORT_DIR);
      await vscode.workspace.fs.createDirectory(dir);
      // A title change gives a new file name for the same session: remove the old file (same _<id8>.md tail) first, or both stay.
      const old = (await vscode.workspace.fs.readDirectory(dir)).filter(([, t]) => t === vscode.FileType.File).map(([n]) => n);
      for (const n of supersededExports(old, r.files.map((x) => x.name))) { await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, n)); }
      // Each file is replaced in place; other files in the folder are left alone. INDEX.md is rewritten every time.
      for (const x of r.files) { await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, x.name), Buffer.from(x.text, 'utf8')); }
      const index = vscode.Uri.joinPath(dir, INDEX_NAME);
      await vscode.workspace.fs.writeFile(index, Buffer.from(r.index, 'utf8'));
      const extra = [r.missing ? (r.missing === 1 ? vscode.l10n.t('1 session has no digest yet') : vscode.l10n.t('{0} sessions have no digest yet', r.missing)) : '', r.stale ? (r.stale === 1 ? vscode.l10n.t('1 is out of date') : vscode.l10n.t('{0} are out of date', r.stale)) : ''].filter(Boolean).join('; ');
      const open = vscode.l10n.t('Open Index');
      const pick = await vscode.window.showInformationMessage((r.files.length === 1 ? vscode.l10n.t('Exported 1 digest to {0}', EXPORT_DIR.join('/')) : vscode.l10n.t('Exported {0} digests to {1}', r.files.length, EXPORT_DIR.join('/'))) + (extra ? ` (${extra})` : '') + '.', open);
      if (pick === open) { await vscode.window.showTextDocument(index); }
    } catch (e) {
      this.d.log('export digests', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not export the digests: {0}', (e as Error).message));
    }
  }

  /** The card's link of a message decision: open the session file at that message's line. The line comes from the stored digest, never from the page. */
  async openMessage(id: string, i: number): Promise<void> {
    const dg = readDigest(digestDir(this.d.storage), id);
    const line = dg?.decisions.find((x) => x.src === 'message' && x.i === i)?.line;
    if (!dg || !line) { void vscode.window.showInformationMessage(vscode.l10n.t('That message is not in the stored digest any more. Rebuild the digest.')); return; }
    try {
      const w: { file: string; size: number } | undefined = await this.d.request({ t: 'digestWhere', chat: id });
      if (!w) { void vscode.window.showInformationMessage(vscode.l10n.t('This session is not indexed yet. Try again in a moment.')); return; }
      // VS Code handles very large single-line files badly; name the line instead of opening such a file.
      if (w.size > OPEN_MAX_BYTES) { void vscode.window.showInformationMessage(vscode.l10n.t('The session file is too large to open in the editor ({0} MB). The message is on line {1}.', Math.round(w.size / 1048576), line)); return; }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(w.file));
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true });
    } catch (e) {
      this.d.log('open digest message', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not open the session file: {0}', (e as Error).message));
    }
  }

  /** The card's link of a reference: a URL opens in the browser, a commit or PR runs its search, a Markdown path opens when the file exists. Only references stored in the digest are acted on. */
  async openRef(id: string, ref: string): Promise<void> {
    const dg = readDigest(digestDir(this.d.storage), id);
    if (!dg || !dg.refs.includes(ref)) { void vscode.window.showInformationMessage(vscode.l10n.t('That reference is not in the stored digest any more. Rebuild the digest.')); return; }
    if (/^https?:\/\//i.test(ref)) { await vscode.env.openExternal(vscode.Uri.parse(ref)); return; }
    if (/^#\d+$/.test(ref)) { this.d.setQuery('pr:' + ref.slice(1)); return; }
    if (/^[0-9a-f]{7,40}$/.test(ref)) { this.d.setQuery('sha:' + ref.slice(0, 12)); return; }
    // A relative path is read against the folder the chat started in, where it was written.
    const p = path.isAbsolute(ref) ? ref : path.join(dg.start ?? dg.folder, ref);
    try { await vscode.window.showTextDocument(vscode.Uri.file(p), { preview: true }); } catch { void vscode.window.showInformationMessage(vscode.l10n.t('That file is not available: {0}', ref)); }
  }

  /** Turn the automatic rebuild on or off from the setting; called at start and when the setting changes. */
  syncAuto(): void {
    const on = this.cfg().get(AUTO_SETTING) === true;
    if (on && !this.timer) { this.timer = setInterval(() => { void this.autoTick(); }, AUTO_EVERY_MS); }
    if (!on && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  /** One automatic pass: rebuild stale digests whose chat file has been quiet for 10 minutes and whose chat is not busy. */
  private async autoTick(): Promise<void> {
    // One pass at a time: a slow pass must not stack up behind the interval.
    if (this.autoRunning) { return; }
    this.autoRunning = true;
    try {
      const todo: Array<{ id: string; mtime: number; state: string }> = (await this.d.request({ t: 'digestTodo' })) ?? [];
      const busy = this.d.busy(), now = Date.now();
      const due = todo.filter((x) => x.state === 'stale' && autoDue(x.mtime, now, busy.has(x.id))).map((x) => x.id);
      // Background work: no notification; each rebuilt digest updates its row, and failures go to the output channel.
      await pool(due, AI_SLOTS, async (id) => { try { await this.buildOne(id); } catch (e) { this.d.log(`auto digest ${id}`, e); } });
    } catch (e) { this.d.log('auto digest', e); }
    finally { this.autoRunning = false; }
  }

  /** Stop the automatic-rebuild timer when the extension unloads, so no interval keeps running (and rebuilding) after deactivation. */
  dispose(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }
}
