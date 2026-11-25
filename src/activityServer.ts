/** The browser view of the Activity diagram: a local-only HTTP server that serves the page and streams live events to it. */
import * as http from 'http';
import { randomBytes } from 'crypto';
import { AddressInfo } from 'net';
import { ActivityEvent } from './activityMap';
import { AllChatsTracker } from './activityAll';
import { browserPage } from './activityHtml';

/** What the server needs from the extension; passed in so the server has no dependency on VS Code and can be tested on its own. */
export interface ServerDeps {
  /** Title of the active project, shown at the top of the page. */
  projectTitle(): string;
  /** The chat in the focused tab (keeps its caption and waiting state), or ''. */
  currentId(): string;
  /** Every live chat id. */
  liveIds(): string[];
  /** Display title of a chat, or '' when unknown. */
  titleOf(id: string): string;
  /** Tracker for this view's own read positions (shares the locator and colour book with the pane). */
  tracker: AllChatsTracker;
  refreshMs(): number;
  fadeMs(): number;
  log(msg: string): void;
  /** Page strings. */
  texts: { subtitle: string; lost: string; unknownChat: string };
}

const KEEPALIVE_MS = 15000; // proxies and browsers drop an idle stream; a comment line every 15 s keeps it open and reveals a dead peer

/**
 * One server per extension, bound to 127.0.0.1 on a random port and started on first use. Every request must carry the random token in its path
 * and the exact Host the URL was built with: the token keeps other local programs out, the Host check stops DNS-rebinding pages in the user's browser.
 * Nothing is read from the chat logs while no browser page is connected.
 */
export class ActivityServer {
  private server?: http.Server;
  private readonly token = randomBytes(18).toString('base64url');
  private port = 0;
  private readonly clients = new Set<http.ServerResponse>();
  private readonly bg = new Map<string, ActivityEvent>(); // chat key -> its latest background-task event, replayed to a page that connects later
  private timer?: ReturnType<typeof setInterval>;
  private keep?: ReturnType<typeof setInterval>;
  private busy = false;
  private again = false;
  private legendSig = '';
  private legendMsg = '';

  constructor(private readonly deps: ServerDeps) {}

  /** Number of connected pages (for tests and for the idle check). */
  get clientCount(): number { return this.clients.size; }

  /** Starts the server if needed and returns the page URL. Rejects when no port can be bound. */
  async start(): Promise<string> {
    if (!this.server) {
      const srv = http.createServer((req, res) => this.handle(req, res));
      await new Promise<void>((ok, fail) => {
        srv.once('error', fail);
        srv.listen(0, '127.0.0.1', () => { srv.removeListener('error', fail); ok(); }); // loopback only: never reachable from the network
      });
      // A later socket error must not crash the extension host; it is logged.
      srv.on('error', (e) => this.deps.log('activity server error: ' + String(e)));
      this.port = (srv.address() as AddressInfo).port;
      this.server = srv;
      this.deps.log(`activity server listening on 127.0.0.1:${this.port}`);
    }
    return `http://127.0.0.1:${this.port}/${this.token}/`;
  }

  /** Closes the stream of every page and stops the server. */
  dispose(): void {
    this.stopWork();
    for (const c of this.clients) { c.end(); }
    this.clients.clear();
    this.server?.close();
    this.server = undefined;
  }

  /** Routes one request; anything that is not a GET with the right Host and token is a plain 404 that reveals nothing. */
  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1'), base = `/${this.token}/`;
    // Host must be exactly what the URL we handed out uses; a rebinding page reaches this server under its own hostname.
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${this.port}` || !url.pathname.startsWith(base)) { this.deny(res); return; }
    const rest = url.pathname.slice(base.length);
    if (rest === '') { this.page(res); } else if (rest === 'events') { this.stream(req, res); } else { this.deny(res); }
  }

  /** The one answer for every refused request: the same body whatever was wrong, so a probe learns nothing. */
  private deny(res: http.ServerResponse): void { res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('Not found'); }

  private page(res: http.ServerResponse): void {
    const html = browserPage({ title: this.deps.projectTitle(), fadeMs: this.deps.fadeMs(), subtitle: this.deps.texts.subtitle, lost: this.deps.texts.lost });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(html);
  }

  /** Opens one event stream: the current state first (so the page is not blank), then live messages until the page closes. */
  private stream(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    this.clients.add(res);
    const first = this.clients.size === 1;
    // The first page after an idle spell starts from the end of every log, so nothing old replays.
    if (first) { this.deps.tracker.clear(); this.bg.clear(); this.legendSig = ''; this.legendMsg = ''; }
    this.write(res, { type: 'fade', ms: this.deps.fadeMs() });
    this.write(res, { type: 'reset' });
    if (this.bg.size) { this.write(res, { type: 'events', events: [...this.bg.values()] }); }
    if (this.legendMsg) { res.write(this.legendMsg); }
    // The stream is closed by the browser (tab closed, reload); the last one out stops all polling.
    req.on('close', () => { this.clients.delete(res); if (!this.clients.size) { this.stopWork(); } });
    if (first) { this.startWork(); }
  }

  private write(res: http.ServerResponse, m: unknown): void { res.write(`data: ${JSON.stringify(m)}\n\n`); }

  private broadcast(m: unknown): void { for (const c of this.clients) { this.write(c, m); } }

  /** Starts polling and keep-alives; only runs while a page is connected. */
  private startWork(): void {
    this.stopWork();
    this.timer = setInterval(() => this.poke(), this.deps.refreshMs());
    this.keep = setInterval(() => { for (const c of this.clients) { c.write(': keep-alive\n\n'); } }, KEEPALIVE_MS);
    this.poke();
  }

  private stopWork(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    if (this.keep) { clearInterval(this.keep); this.keep = undefined; }
  }

  /** One refresh of every live chat, pushed to every page; a check still running makes the next one wait (one more run after it). */
  private poke(): void {
    if (!this.clients.size) { return; }
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    const cur = this.deps.currentId(), live = this.deps.liveIds();
    void this.deps.tracker.check(cur, live).then((r) => {
      for (const e of r.events) {
        // Remember the latest background state per chat for pages that connect later; a zero count removes it.
        if (e.t === 'bg') { if (e.shell || e.agent) { this.bg.set(e.ch, e); } else { this.bg.delete(e.ch); } }
      }
      if (r.events.length && this.clients.size) { this.broadcast({ type: 'events', events: r.events }); }
      const ids = [...new Set(cur ? [cur, ...live] : live)];
      this.sendLegend(ids.map((id) => ({ id, title: this.deps.titleOf(id) || this.deps.texts.unknownChat, col: r.colors.get(id) ?? '' })));
    }).catch((e) => this.deps.log('activity server check failed: ' + String(e))).finally(() => {
      this.busy = false;
      if (this.again) { this.again = false; this.poke(); }
    });
  }

  /** The legend goes out only when it changed, and is kept so a page that connects later gets it at once. */
  private sendLegend(chats: { id: string; title: string; col: string }[]): void {
    const sig = JSON.stringify(chats);
    if (sig === this.legendSig) { return; }
    this.legendSig = sig;
    this.legendMsg = `data: ${JSON.stringify({ type: 'legend', chats })}\n\n`;
    for (const c of this.clients) { c.write(this.legendMsg); }
  }
}
