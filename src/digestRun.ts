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
import { AI_SLOTS, AI_TIMEOUT_MS, AiCall, AiPart, budgeted, CallBudget, callBound, CAP_CODE, DEFAULT_MAX_AI_CALLS, runAi } from './digestAi';
import { BUILD_TITLE, TIMELINE_TITLE, EXPORT_DIR, INDEX_NAME, DriftText, driftLine, driftTextWith, supersededExports } from './digestMd';
import { DIGEST_TEXT, DigestTextTable } from './webviewDigest';
import { DigestInputReply } from './digestBuild';
import { readDigest, digestDir } from './digestStore';
import { Limiter } from './execLimit';
import { Exec, ExecResult, pool } from './wipExec';
import { isSessionId } from './sessionId';
import { TimelineSrc, TimelineText, timelineDoc, timelineProjects } from './digestTimeline';
import { showReadOnly } from './editorView';

export const BUILD_CMD = 'saropaChats.buildDigests';
export const REBUILD_CMD = 'saropaChats.rebuildDigest';
export const EXPORT_CMD = 'saropaChats.exportDigests';
export const TIMELINE_CMD = 'saropaChats.showDecisionsTimeline';
/** Internal command behind the timeline's session-file links (not in the palette): opens a decision's line through openLine. */
export const OPEN_LINE_CMD = 'saropaChats.openDigestDecision';
const CFG = 'saropaChats';
export const AUTO_SETTING = 'digest.auto';
export const AI_SETTING = 'digest.useAi';
/** Most AI calls (retries included) one Build, Rebuild or automatic pass may make; 0 turns the AI off for every run. */
export const CAP_SETTING = 'digest.maxAiCallsPerRun';
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

/**
 * How one build ended: its AI state, gone (the chat is no longer indexed), lost (the gathered build expired) or capped
 * (saved with the exact parts only because the run's AI call cap was used up; stored as 'failed', so Build retries it).
 */
type Outcome = AiState | 'gone' | 'lost' | 'capped';

/**
 * The timeline's user-facing strings, localized in the host through vscode.l10n.t; the formatter (digestTimeline.ts) is
 * pure and only places them. The empty-state sentence is shared by the document and the "nothing to show" message.
 */
const timelineText = (): TimelineText => ({
  all: vscode.l10n.t('All projects'),
  heading: (label) => vscode.l10n.t('Decisions timeline: {0}', label),
  empty: (project) => (project
    ? vscode.l10n.t('No digests of {0} have decisions yet. Run "{1}" to build digests.', project, BUILD_TITLE)
    : vscode.l10n.t('No digests have decisions yet. Run "{0}" to build digests.', BUILD_TITLE)),
  // Singular and plural are separate whole strings so each language can inflect them.
  counts: (n, sessions) => (n === 1
    ? (sessions === 1 ? vscode.l10n.t('1 decision in 1 session, newest first.') : vscode.l10n.t('1 decision in {0} sessions, newest first.', sessions))
    : (sessions === 1 ? vscode.l10n.t('{0} decisions in 1 session, newest first.', n) : vscode.l10n.t('{0} decisions in {1} sessions, newest first.', n, sessions))),
  sessionFile: vscode.l10n.t('Session file:'),
});

/** The drift line's strings, localized in the host: the shared English table (DRIFT_STRINGS) passed through vscode.l10n.t. */
const driftText = (): DriftText => driftTextWith((m, ...a) => vscode.l10n.t(m, ...a));

/**
 * The digest webview's strings, localized in the host: every DIGEST_TEXT entry (the one English source) passed through
 * vscode.l10n.t. The {0} placeholders stay in the text; the page fills them, so word order can change per language.
 */
export const digestTextL10n = (): DigestTextTable => Object.fromEntries(Object.entries(DIGEST_TEXT).map(([k, v]) => [k, vscode.l10n.t(v)])) as DigestTextTable;

/** Digest commands and the automatic rebuild of one window. */
export class DigestService {
  private readonly lim = new Limiter(AI_SLOTS, AI_SLOTS);
  private readonly call: AiCall;
  private readonly active = new Set<string>(); // chats being built now: never two builds of one chat
  private timer?: NodeJS.Timeout;
  private autoRunning = false;
  private noCli = false; // claude was not found: later builds of this run skip the AI instead of failing 3 times each
  private readonly drifted = new Set<string>(); // chat-file layout problems already written to the output channel: each is logged once per window
  private driftMsg?: { type: 'digestDrift'; text: string; action: string }; // the last drift line posted, re-posted when the panel reloads

  constructor(private readonly d: DigestDeps, call?: AiCall) { this.call = call ?? haikuCall(this.lim); }

  private cfg(): vscode.WorkspaceConfiguration { return vscode.workspace.getConfiguration(CFG); }
  private useAi(): boolean { return this.cfg().get(AI_SETTING) !== false; }
  /** The saropaChats.digest.maxAiCallsPerRun setting; a missing, negative or non-number value falls back to the default (CallBudget clamps it). */
  private maxCalls(): number { return new CallBudget(Number(this.cfg().get(CAP_SETTING, DEFAULT_MAX_AI_CALLS))).cap; }
  /** A fresh call cap for one run (a Build, a Rebuild or one automatic pass). */
  private budget(): CallBudget { return new CallBudget(this.maxCalls()); }

  /**
   * Build one digest: gather, run the AI (unless off, nothing to send, or the run's call cap is used up), save. A cancel
   * stops before the save, so no half digest is written. budget is the run's call cap; without one (a caller that has no
   * run) a fresh budget from the setting is used, so no build path is ever uncapped.
   */
  async buildOne(id: string, signal?: AbortSignal, budget: CallBudget = this.budget()): Promise<Outcome> {
    // A second build of the same chat while one runs would race on the worker's gathered state.
    if (this.active.has(id)) { return 'lost'; }
    this.active.add(id);
    try {
      const r: DigestInputReply | undefined = await this.d.request({ t: 'digestInput', chat: id }, GATHER_MS);
      if (!r) { return 'gone'; }
      this.logDrift(id, r.drift);
      let state: AiState = 'none';
      let part: AiPart | undefined;
      let capped = false;
      // True when the AI was skipped only for the call cap: the save then keeps the stored digest's AI parts.
      let keepAi = false;
      // Four reasons to skip the AI: nothing to send, the setting is off, claude is missing (already known this run), or
      // the run's call cap is used up (the session keeps the exact parts and its AI parts read "not generated").
      if (!r.input.pieces.length) { state = 'none'; }
      else if (!this.useAi()) { state = 'off'; }
      // A cap of 0 is a deliberate "AI off", not a failure: saved as 'off', so Build does not list it as missing AI parts
      // and retry it forever. A stored digest's AI parts are still kept (keepAi below).
      else if (budget.cap <= 0) { state = 'off'; keepAi = true; }
      else if (this.noCli) { state = 'failed'; }
      else if (budget.left() <= 0) { budget.refuse(); capped = true; state = 'failed'; }
      else {
        try {
          part = await runAi(r.input, budgeted(this.call, budget), signal);
          state = 'ok';
          // Benign deviations were normalized instead of retried; the output channel names them so a drifting model is visible.
          if (part.fixed?.length) { this.d.log(`digest AI ${id}`, 'reply normalized: ' + part.fixed.join('; ')); }
        } catch (e) {
          if (signal?.aborted) { throw e; } // canceled: no save
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') { this.noCli = true; }
          // The cap stopped this session mid-way: not an AI failure, so it is counted as capped, not logged as an error.
          if (code === CAP_CODE) { capped = true; } else { this.d.log(`digest AI ${id}`, e); }
          state = 'failed';
        }
      }
      // The notes stay on the host: the worker's save takes the AI parts only.
      const sent = part ? { goal: part.goal, decisions: part.decisions, open: part.open } : undefined;
      // A capped session keeps the AI parts of its previous digest instead of replacing them with "not generated";
      // the state stays 'failed' so the next Build retries it.
      const s = await this.d.request({ t: 'digestSave', chat: id, state, part: sent, keepAi: keepAi || capped });
      if (!s) { return 'lost'; }
      // The page updates the row marker and an open card at once; no new search is needed.
      this.d.post({ type: 'digestChanged', id, goal: s.goal ?? '' });
      return capped ? 'capped' : state;
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

  /**
   * Recompute the panel's layout-drift line from the stored digests' flags and post it. Called at start, after every Build,
   * Rebuild and automatic pass, so the line persists until a build changes the flags. An empty text hides the line.
   */
  async syncDrift(): Promise<void> {
    try {
      // Long timeout: the worker answers only after the index has loaded, which can exceed the default 6 s soft limit.
      const c = await this.d.request({ t: 'digestDrift' }, GATHER_MS);
      // The counts crossed a thread boundary: anything that is not a count reads as 0.
      const n = { dialog: Number(c?.dialog) || 0, stop: Number(c?.stop) || 0 };
      this.driftMsg = { type: 'digestDrift', text: driftLine(n, driftText()), action: vscode.l10n.t('Show Output') };
      this.d.post(this.driftMsg);
    } catch (e) { this.d.log('digest drift', e); }
  }

  /** Post the localized digest card/marker strings to the page; a (re)loaded panel starts with the English defaults. */
  postText(): void { this.d.post({ type: 'digestText', text: digestTextL10n() }); }

  /** Post the last drift line again (a reloaded panel starts empty); computes it first when none was computed yet. */
  postDrift(): void {
    if (this.driftMsg) { this.d.post(this.driftMsg); } else { void this.syncDrift(); }
  }

  /** The one error of a command run whose builds found no claude program: what happened and what was saved instead. */
  private showNoCli(): void {
    void vscode.window.showErrorMessage(vscode.l10n.t('The claude CLI was not found on PATH. Digests were saved with the exact parts only; install Claude Code or add claude to PATH, then build again.'));
  }

  /** "Build Session Digests": every chat with no digest, an out-of-date one or missing AI parts, after a count confirmation, with progress and cancel. */
  async buildAll(): Promise<void> {
    let todo: Array<{ id: string; state: string; calls?: number; aiMissing?: boolean }>;
    // A fresh digest whose AI parts were not generated (failed, or cut by the call cap) is retried by Build, as its note says.
    try { todo = ((await this.d.request({ t: 'digestTodo' }, GATHER_MS)) ?? []).filter((x: { state: string; aiMissing?: boolean }) => x.state !== 'fresh' || x.aiMissing === true); } catch (e) {
      this.d.log('digest list', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not list the sessions to build digests for: {0}', (e as Error).message));
      return;
    }
    if (!todo.length) { void vscode.window.showInformationMessage(vscode.l10n.t('Every session already has an up-to-date digest.')); return; }
    const fresh = todo.filter((x) => x.state === 'none').length, stale = todo.length - fresh;
    const ai = this.useAi();
    // The cost bound: the most AI calls the run can make (each chat's pieces plus a merge), from the worker's estimate,
    // times AI_TRIES for the retries, and cut by the run's call cap.
    const b = callBound(todo.reduce((n, x) => n + (typeof x.calls === 'number' && x.calls > 0 ? x.calls : 0), 0), this.maxCalls());
    const go = vscode.l10n.t('Build');
    // With AI on the owner sees the upper bound of calls before agreeing; with AI off (or a cap of 0) it is stated that nothing is called.
    const cost = !ai ? vscode.l10n.t('AI parts are turned off: no AI calls are made, only the exact parts are built.')
      : b.off ? vscode.l10n.t('The AI call cap (setting {0}) is 0: no AI calls are made, only the exact parts are built.', CFG + '.' + CAP_SETTING)
        : vscode.l10n.t('Up to an estimated {0} AI calls, at most {1} with retries, to the claude command (Haiku) on the Claude subscription, {2} at a time.', b.calls, b.withRetries, AI_SLOTS)
          // The cap is named only when it can cut the run short; a cap above the bound changes nothing.
          + (b.capped ? ' ' + vscode.l10n.t('The run stops calling the AI after {0} calls (setting {1}); the remaining sessions get the exact parts only.', b.cap, CFG + '.' + CAP_SETTING) : '');
    const pick = await vscode.window.showInformationMessage(todo.length === 1 ? vscode.l10n.t('Build a digest for 1 session?') : vscode.l10n.t('Build digests for {0} sessions?', todo.length), {
      modal: true,
      // A single session reads "1 session", not "1 sessions".
      detail: (todo.length === 1 ? vscode.l10n.t('1 session: {0} without a digest, {1} out of date or missing AI parts.', fresh, stale) : vscode.l10n.t('{0} sessions: {1} without a digest, {2} out of date or missing AI parts.', todo.length, fresh, stale)) + ' ' + cost,
    }, go);
    if (pick !== go) { return; }
    this.noCli = false; // a new run checks for claude again
    await this.runMany(todo.map((x) => x.id), vscode.l10n.t('Building session digests'), true);
  }

  /** Build a list of chats with a cancelable progress notification, under one call cap, then report the counts. */
  private async runMany(ids: string[], title: string, report: boolean): Promise<void> {
    const n = { ok: 0, plain: 0, failed: 0, capped: 0, err: 0, done: 0 };
    const budget = this.budget();
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (prog, token) => {
      const ac = new AbortController();
      token.onCancellationRequested(() => ac.abort());
      await pool(ids, AI_SLOTS, async (id) => {
        try {
          const o = await this.buildOne(id, ac.signal, budget);
          // 'ok' and 'none' are complete digests; 'off', 'failed' and 'capped' hold the exact parts only.
          if (o === 'ok' || o === 'none') { n.ok++; } else if (o === 'off') { n.plain++; } else if (o === 'failed') { n.failed++; } else if (o === 'capped') { n.capped++; } else { n.err++; }
        } catch (e) {
          if (!ac.signal.aborted) { n.err++; this.d.log(`digest ${id}`, e); }
        }
        n.done++;
        prog.report({ message: vscode.l10n.t('{0} of {1}', n.done, ids.length), increment: 100 / Math.max(ids.length, 1) });
      }, () => ac.signal.aborted);
    });
    // The drift line is recomputed from the stored flags after every run, so it clears once rebuilt digests read fine.
    void this.syncDrift();
    if (!report) { return; }
    const built = n.ok + n.plain + n.failed + n.capped;
    const parts = [built === 1 ? vscode.l10n.t('Built 1 digest') : vscode.l10n.t('Built {0} digests', built)];
    if (n.plain) { parts.push(vscode.l10n.t('{0} without AI parts (turned off)', n.plain)); }
    // One total for every digest whose AI parts were not generated, then the reasons, so the owner sees the count at a glance.
    const notGen = n.failed + n.capped;
    if (notGen) {
      const why: string[] = [];
      if (n.failed) { why.push(this.noCli ? vscode.l10n.t('{0}: the claude CLI was not found', n.failed) : vscode.l10n.t('{0}: the AI call failed', n.failed)); }
      if (n.capped) { why.push(vscode.l10n.t('{0}: the cap of {1} AI calls per run was reached (setting {2})', n.capped, budget.cap, CFG + '.' + CAP_SETTING)); }
      parts.push(vscode.l10n.t('{0} with AI parts not generated ({1}; retried on the next build)', notGen, why.join('; ')));
    }
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
      if (o === 'failed' && this.noCli) { this.showNoCli(); return; } // the finally below still refreshes the drift line
      const msg = o === 'gone' ? vscode.l10n.t('This session is not indexed yet. Try again in a moment.')
        : o === 'lost' ? vscode.l10n.t('The digest build was interrupted. Try again.')
          : o === 'cancelled' ? vscode.l10n.t('Digest build canceled.')
            : o === 'off' ? vscode.l10n.t('Digest built with the exact parts only (AI parts are turned off).')
              : o === 'failed' ? vscode.l10n.t('Digest built without AI parts: the AI call failed (see the Saropa Chats output).')
                // The cap applies to a single rebuild too (each command is one run), so a cap of 0 keeps AI off here as well.
                : o === 'capped' ? vscode.l10n.t('Digest built without AI parts: the cap of {0} AI calls per run was reached (setting {1}).', this.maxCalls(), CFG + '.' + CAP_SETTING)
                  : vscode.l10n.t('Digest built.');
      void vscode.window.showInformationMessage(msg);
    } catch (e) {
      this.d.post({ type: 'digestState', id, state: '' });
      this.d.log('rebuild digest', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not build the digest: {0}', (e as Error).message));
    } finally {
      // A rebuilt digest may clear (or add) a drift flag: recompute the panel line from the stored flags. In a finally so
      // the no-claude early return and an error path refresh it too (they used to skip it).
      void this.syncDrift();
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

  /**
   * "Show Decisions Timeline": pick All projects or one project with digests, then open a read-only document of every
   * Dialog and Message decision, newest first, grouped by day, each linking to its line of the session file.
   */
  async timeline(): Promise<void> {
    let srcs: TimelineSrc[];
    try { srcs = ((await this.d.request({ t: 'digestTimeline' }, GATHER_MS)) ?? []) as TimelineSrc[]; } catch (e) {
      this.d.log('decisions timeline', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not read the session digests: {0}', (e as Error).message));
      return;
    }
    // No decision anywhere: say so and offer the Build command, instead of opening an empty document or an empty pick.
    if (!srcs.some((s) => s.d.decisions.length)) {
      const build = vscode.l10n.t('Build Session Digests');
      const pick = await vscode.window.showInformationMessage(timelineText().empty(), build);
      if (pick === build) { await vscode.commands.executeCommand(BUILD_CMD); }
      return;
    }
    const projects = timelineProjects(srcs);
    // The first item is the whole timeline; the rest are the projects that have digests, each with its folder for telling same-named projects apart.
    const text = timelineText();
    const items: Array<vscode.QuickPickItem & { key?: string }> = [{ label: text.all }, ...projects.map((p) => ({ label: p.label, description: p.path, key: p.key }))];
    const chosen = await vscode.window.showQuickPick(items, { title: vscode.l10n.t('Decisions timeline: project'), matchOnDescription: true });
    // A dismissed pick is the owner's cancel; it still gets a visible outcome.
    if (!chosen) { void vscode.window.showInformationMessage(vscode.l10n.t('Decisions timeline canceled: no project picked.')); return; }
    try {
      // Built inside the try: the stored digests are disk data, and a failure here must show the error message, not become an unhandled rejection.
      const doc = timelineDoc(srcs, chosen.key, chosen.key === undefined ? undefined : chosen.label, text);
      // The fallback is what the tab shows once the document was dropped from memory; it names this command, not the search.
      // Each link runs the digest opener (size check, stored line) instead of a raw file URI, the same path as the card's Message links.
      const files = doc.links.map((l) => ({ ...l, cmd: { command: OPEN_LINE_CMD, args: [l.id, l.at ?? 0] } }));
      await showReadOnly(vscode.l10n.t('Decisions: {0}', chosen.label), { text: doc.text, spans: [], links: [], files }, vscode.l10n.t('This timeline is no longer available. Run "{0}" again.', TIMELINE_TITLE));
    } catch (e) {
      this.d.log('decisions timeline', e);
      void vscode.window.showErrorMessage(vscode.l10n.t('Could not open the decisions timeline: {0}', (e as Error).message));
    }
  }

  /** The card's link of a message decision: open the session file at that message's line. The line comes from the stored digest, never from the page. */
  async openMessage(id: string, i: number): Promise<void> {
    const dg = readDigest(digestDir(this.d.storage), id);
    const line = dg?.decisions.find((x) => x.src === 'message' && x.i === i)?.line;
    if (!dg || !line) { void vscode.window.showInformationMessage(vscode.l10n.t('That message is not in the stored digest any more. Rebuild the digest.')); return; }
    await this.openAt(id, line);
  }

  /**
   * A timeline link: open the session file at a decision's line. The command URI can be built by anyone, so the id must be a
   * session id and the line must be the line of a decision in that session's stored digest (0: a decision with no line, opened
   * at the top). Then the same opener as the card's Message links runs, with its 50 MB check.
   */
  async openLine(id: unknown, line: unknown): Promise<void> {
    if (!isSessionId(id)) { return; }
    const n = typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : 0;
    const dg = readDigest(digestDir(this.d.storage), id);
    // A line that is no decision's line (the digest was rebuilt since the timeline opened) is refused with a visible reason.
    if (!dg || !dg.decisions.some((x) => !!x && typeof x === 'object' && (x.line ?? 0) === n)) { void vscode.window.showInformationMessage(vscode.l10n.t('That decision is not in the stored digest any more. Run "{0}" again.', TIMELINE_TITLE)); return; }
    await this.openAt(id, n || 1);
  }

  /** Open a session file at a 1-based line in the editor; files over OPEN_MAX_BYTES are named with the line instead, since VS Code handles them badly. */
  private async openAt(id: string, line: number): Promise<void> {
    try {
      const w: { file: string; size: number } | undefined = await this.d.request({ t: 'digestWhere', chat: id });
      if (!w) { void vscode.window.showInformationMessage(vscode.l10n.t('This session is not indexed yet. Try again in a moment.')); return; }
      // VS Code handles very large single-line files badly; name the line instead of opening such a file.
      if (w.size > OPEN_MAX_BYTES) { void vscode.window.showInformationMessage(vscode.l10n.t('The session file is too large to open in the editor ({0} MB). The decision is on line {1}.', Math.round(w.size / 1048576), line)); return; }
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
      const todo: Array<{ id: string; mtime: number; state: string }> = (await this.d.request({ t: 'digestTodo' }, GATHER_MS)) ?? [];
      const busy = this.d.busy(), now = Date.now();
      const due = todo.filter((x) => x.state === 'stale' && autoDue(x.mtime, now, busy.has(x.id))).map((x) => x.id);
      // Background work: no notification; each rebuilt digest updates its row, and failures go to the output channel.
      // One call cap per pass: the background rebuild can never spend more than one Build run would.
      const budget = this.budget();
      await pool(due, AI_SLOTS, async (id) => { try { await this.buildOne(id, undefined, budget); } catch (e) { this.d.log(`auto digest ${id}`, e); } });
      // The owner gets no notification for a background pass, so a cap that cut it short is at least in the output channel.
      if (budget.reached) { this.d.log('auto digest', `the cap of ${budget.cap} AI calls per run was reached; the remaining sessions got the exact parts only`); }
      // Rebuilt digests may change the drift counts; the panel line follows the stored flags.
      if (due.length) { void this.syncDrift(); }
    } catch (e) { this.d.log('auto digest', e); }
    finally { this.autoRunning = false; }
  }

  /** Stop the automatic-rebuild timer when the extension unloads, so no interval keeps running (and rebuilding) after deactivation. */
  dispose(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }
}
