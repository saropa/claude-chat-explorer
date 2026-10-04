import * as vscode from 'vscode';
import { Abort, Options, searchChats, buildTerms, Result, MAX_RESULTS } from './search';

const NAME = 'Saropa Chat Search';
const STATE_KEY = 'saropaChatSearch.state';
const HIST_KEY = 'saropaChatSearch.history';
const HIST_MAX = 20;

interface HistItem { query: string; all: boolean; cs: boolean; ww: boolean; re: boolean; when: string; }
interface Saved extends HistItem { sort: string; results: Result[]; searched: string; }

class Provider implements vscode.WebviewViewProvider {
  private seq = 0;
  private sig: Abort = { aborted: false };
  private view?: vscode.WebviewView;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private get state(): Saved {
    return this.ctx.workspaceState.get<Saved>(STATE_KEY)
      ?? { query: '', all: false, cs: false, ww: false, re: false, when: 'any', sort: 'score', results: [], searched: '' };
  }
  private get history(): HistItem[] {
    return this.ctx.workspaceState.get<HistItem[]>(HIST_KEY) ?? [];
  }
  private post(m: unknown): void { void this.view?.webview.postMessage(m); }
  private async setHistory(h: HistItem[]): Promise<void> {
    await this.ctx.workspaceState.update(HIST_KEY, h);
    this.post({ type: 'history', history: h });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.title = NAME;
    view.webview.options = { enableScripts: true };
    view.webview.html = html();
    view.webview.onDidReceiveMessage((m) => { void this.onMessage(m); });
    // Re-post saved state; the webview script also sends 'ready' for the race where it loads later.
    this.post({ type: 'restore', state: this.state, history: this.history });
  }

  private async onMessage(m: any): Promise<void> {
    try {
      if (m.type === 'ready') {
        this.post({ type: 'restore', state: this.state, history: this.history });
      } else if (m.type === 'draft') {
        const s = this.state;
        await this.ctx.workspaceState.update(STATE_KEY, { ...s, ...opts(m), sort: sortOf(m), query: String(m.query ?? '') });
      } else if (m.type === 'search') {
        await this.search(m);
      } else if (m.type === 'open') {
        await openChat(String(m.id));
      } else if (m.type === 'histRemove') {
        await this.setHistory(this.history.filter((_, i) => i !== m.index));
      } else if (m.type === 'histClear') {
        await this.setHistory([]);
      }
    } catch { /* never break the message loop */ }
  }

  private async search(m: any): Promise<void> {
    const query = String(m.query ?? '').trim();
    const o = opts(m);
    const id = ++this.seq;
    this.sig.aborted = true; // cancel the previous scan immediately
    const sig: Abort = { aborted: false };
    this.sig = sig;
    if (!query) {
      await this.ctx.workspaceState.update(STATE_KEY, { ...o, sort: sortOf(m), query: '', results: [], searched: '' });
      this.post({ type: 'results', results: [], searched: '' });
      return;
    }
    try { buildTerms(query, o); } catch (e) {
      this.post({ type: 'error', message: (e as Error).message });
      return;
    }
    this.post({ type: 'start' });
    let pending: Result[] = [];
    let prog = { done: 0, total: 0 };
    let timer: NodeJS.Timeout | undefined;
    const live = () => id === this.seq && !sig.aborted;
    const flush = () => {
      timer = undefined;
      if (!live()) { return; }
      this.post({ type: 'batch', results: pending, done: prog.done, total: prog.total });
      pending = [];
    };
    try {
      const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
      const results = await searchChats(query, o, folders, sig, (r, done, total) => {
        if (!live()) { return; }
        if (r) { pending.push(r); }
        prog = { done, total };
        if (!timer) { timer = setTimeout(flush, 100); }
      });
      if (timer) { clearTimeout(timer); timer = undefined; }
      if (!live()) { return; }
      flush();
      const searched = results.length ? '' : 'No matches';
      await this.ctx.workspaceState.update(STATE_KEY, { ...o, sort: sortOf(m), query, results, searched });
      if (!live()) { return; }
      if (results.length) { await this.addHistory({ query, ...o }); }
      this.post({ type: 'done', results, searched });
    } catch {
      if (timer) { clearTimeout(timer); }
      if (live()) { this.post({ type: 'results', results: [], searched: 'Search failed' }); }
    }
  }

  private async addHistory(item: HistItem): Promise<void> {
    const same = (a: HistItem) => a.query === item.query && a.cs === item.cs && a.ww === item.ww && a.re === item.re && a.when === item.when;
    await this.setHistory([item, ...this.history.filter((h) => !same(h))].slice(0, HIST_MAX));
  }
}

const WHENS = ['any', '1h', '2h', '4h', '8h', 'today'];
const SORTS = ['score', 'time', 'title'];

function opts(m: any): Options {
  const when = WHENS.includes(m.when) ? String(m.when) : 'any';
  return { all: !!m.all, cs: !!m.cs, ww: !!m.ww, re: !!m.re, when };
}

function sortOf(m: any): string {
  return SORTS.includes(m.sort) ? String(m.sort) : 'score';
}

async function openChat(id: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id);
    return;
  } catch { /* fall through */ }
  try {
    const ok = await vscode.env.openExternal(
      vscode.Uri.parse('vscode://anthropic.claude-code/open?session=' + id));
    if (ok) { return; }
  } catch { /* fall through */ }
  vscode.window.showErrorMessage('Could not open Claude chat ' + id);
}

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeChatSearch.view', new Provider(ctx),
      { webviewOptions: { retainContextWhenHidden: true } }));
}

export function deactivate(): void {}

function html(): string {
  const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${NAME}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body{padding:6px 8px;color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
.box{position:relative}
input[type=text]{width:100%;box-sizing:border-box;padding:4px 74px 4px 6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none;font-family:inherit;font-size:inherit}
input[type=text]:focus{border-color:var(--vscode-focusBorder)}
input.bad{border-color:var(--vscode-inputValidation-errorBorder)}
.opts{position:absolute;right:2px;top:2px;display:flex;gap:1px}
.opt{width:22px;height:20px;padding:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;color:var(--vscode-foreground);border:1px solid transparent;border-radius:3px;font-size:12px;font-family:var(--vscode-editor-font-family,monospace)}
.opt:hover{background:var(--vscode-toolbar-hoverBackground)}
.opt.on{background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent);color:var(--vscode-inputOption-activeForeground)}
.opt u{text-decoration:underline}
#err{display:none;margin-top:-1px;padding:4px 6px;font-size:0.9em;background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);color:var(--vscode-inputValidation-errorForeground,var(--vscode-foreground))}
#bar{position:relative;height:2px;margin-top:2px;overflow:hidden;visibility:hidden}
#bar.on{visibility:visible}
#bar i{position:absolute;top:0;bottom:0;width:30%;background:var(--vscode-progressBar-background);animation:slide 1.2s linear infinite}
@keyframes slide{0%{left:-30%}100%{left:100%}}
label{display:block;margin:6px 0;cursor:pointer}
#status{margin:6px 0;color:var(--vscode-descriptionForeground)}
.r{padding:5px 4px;cursor:pointer}
.r:hover{background:var(--vscode-list-hoverBackground)}
.t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m{color:var(--vscode-descriptionForeground);font-size:0.9em}
.s{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--vscode-descriptionForeground)}
mark{background:var(--vscode-editor-findMatchHighlightBackground);color:inherit}
#hist .h{display:flex;align-items:center;padding:3px 4px;cursor:pointer}
#hist .h:hover{background:var(--vscode-list-hoverBackground)}
#hist .h span.q{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hist .h .fl{color:var(--vscode-descriptionForeground);font-size:0.85em;margin-left:6px}
#hist .x{border:none;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;padding:0 4px;font-size:14px;line-height:1}
#hist .x:hover{color:var(--vscode-foreground)}
#hist .cap{margin:4px 0;color:var(--vscode-descriptionForeground);font-size:0.9em}
.sel{display:flex;gap:8px;margin-top:6px}
.sel label{display:flex;align-items:center;gap:4px;margin:0;flex:1;min-width:0;cursor:default}
.sel select{flex:1;min-width:0;padding:2px 4px;color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border);font-family:inherit;font-size:inherit;outline:none}
.sel select:focus{border-color:var(--vscode-focusBorder)}
.sel select option{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-listBackground,var(--vscode-dropdown-background))}
a{color:var(--vscode-textLink-foreground);cursor:pointer}
</style></head><body>
<div class="box">
<input type="text" id="q" placeholder="Search chats" autofocus>
<div class="opts">
<button class="opt" id="cs" title="Match Case (Alt+C)">Aa</button>
<button class="opt" id="ww" title="Match Whole Word (Alt+W)"><u>ab</u></button>
<button class="opt" id="re" title="Use Regular Expression (Alt+R)">.*</button>
</div></div>
<div class="sel">
<label>When <select id="when"><option value="any">Any time</option><option value="1h">Last hour</option><option value="2h">Last 2 hours</option><option value="4h">Last 4 hours</option><option value="8h">Last 8 hours</option><option value="today">Today</option></select></label>
<label>Sort <select id="sort"><option value="score">Score</option><option value="time">Time</option><option value="title">Title</option></select></label>
</div>
<div id="err"></div>
<div id="bar"><i></i></div>
<label><input type="checkbox" id="all"> All projects</label>
<div id="status"></div><div id="list"></div><div id="hist"></div>
<script nonce="${nonce}">
const vs=acquireVsCodeApi();const $=id=>document.getElementById(id);
const q=$('q'),all=$('all'),when=$('when'),sort=$('sort'),st=$('status'),list=$('list'),hist=$('hist'),bar=$('bar'),err=$('err');
const flags={cs:$('cs'),ww:$('ww'),re:$('re')};
let timer,history=[],hasResults=false,busy=false,acc=[],prog=null,lastRs=[],lastMsg='';
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function cur(){return{query:q.value.trim(),all:all.checked,cs:flags.cs.classList.contains('on'),ww:flags.ww.classList.contains('on'),re:flags.re.classList.contains('on'),when:when.value,sort:sort.value};}
function setFlag(k,v){flags[k].classList.toggle('on',!!v);flags[k].setAttribute('aria-pressed',v?'true':'false');}
function showErr(m){err.style.display=m?'block':'none';err.textContent=m||'';q.classList.toggle('bad',!!m);}
function setBusy(b){busy=b;bar.classList.toggle('on',b);renderHist();}
function draft(){vs.postMessage(Object.assign({type:'draft'},cur()));}
function go(){clearTimeout(timer);const c=cur();showErr('');draft();
acc=[];prog=null;
if(!c.query){list.innerHTML='';hasResults=false;st.textContent='';setBusy(false);vs.postMessage(Object.assign({type:'search'},c));return;}
st.textContent='Searching...';setBusy(true);vs.postMessage(Object.assign({type:'search'},c));}
function renderHist(){
if(hasResults||busy||err.style.display==='block'||!history.length){hist.innerHTML='';return;}
hist.innerHTML='<div class="cap">Recent searches</div>'+history.map((h,i)=>{
const f=(h.cs?'Aa ':'')+(h.ww?'ab ':'')+(h.re?'.*':'');
return '<div class="h" data-i="'+i+'" title="'+esc(h.query)+'"><span class="q">'+esc(h.query)+'</span><span class="fl">'+esc(f.trim())+'</span><button class="x" data-x="'+i+'" title="Remove" aria-label="Remove">\\u00d7</button></div>';
}).join('')+'<div class="cap"><a id="clr">Clear history</a></div>';}
hist.addEventListener('click',e=>{
const x=e.target.closest('[data-x]');if(x){e.stopPropagation();vs.postMessage({type:'histRemove',index:+x.dataset.x});return;}
if(e.target.id==='clr'){vs.postMessage({type:'histClear'});return;}
const h=e.target.closest('.h');if(h){const it=history[+h.dataset.i];q.value=it.query;all.checked=!!it.all;
setFlag('cs',it.cs);setFlag('ww',it.ww);setFlag('re',it.re);when.value=it.when||'any';go();}});
q.addEventListener('input',()=>{clearTimeout(timer);draft();timer=setTimeout(go,400);});
q.addEventListener('keydown',e=>{
if(e.key==='Enter'){go();return;}
if(e.altKey&&!e.ctrlKey&&!e.metaKey){const k={KeyC:'cs',KeyW:'ww',KeyR:'re'}[e.code];
if(k){e.preventDefault();setFlag(k,!flags[k].classList.contains('on'));go();}}});
Object.keys(flags).forEach(k=>flags[k].addEventListener('click',()=>{setFlag(k,!flags[k].classList.contains('on'));go();q.focus();}));
all.addEventListener('change',go);
when.addEventListener('change',go);
sort.addEventListener('change',()=>{draft();render(lastRs,lastMsg);});
function ordered(rs){const a=rs.slice();
if(sort.value==='time')a.sort((x,y)=>y.last-x.last);
else if(sort.value==='title')a.sort((x,y)=>x.title.toLowerCase().localeCompare(y.title.toLowerCase()));
else a.sort((x,y)=>y.score-x.score);return a;}
function ago(ms){const s=Math.floor((Date.now()-ms)/1000);if(s<60)return 'just now';
const u=[['minute',60],['hour',3600],['day',86400],['week',604800],['month',2592000],['year',31536000]];
let pick=u[0];for(const x of u){if(s>=x[1])pick=x;}const n=Math.floor(s/pick[1]);return n+' '+pick[0]+(n===1?'':'s')+' ago';}
function absShort(ms){return new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function snip(r){let o='',p=0;for(const g of r.ranges){o+=esc(r.snippet.slice(p,g[0]))+'<mark>'+esc(r.snippet.slice(g[0],g[1]))+'</mark>';p=g[1];}
return o+esc(r.snippet.slice(p));}
function render(rs,msg){lastRs=rs;lastMsg=msg;hasResults=rs.length>0;st.textContent=msg||'';
list.innerHTML=ordered(rs).map(r=>{
const meta=r.hits+(r.hits===1?' hit':' hits')+' \\u00b7 <span title="'+esc(new Date(r.last).toLocaleString())+'">'+ago(r.last)+' \\u00b7 '+esc(absShort(r.last))+'</span>'+(all.checked?' \\u00b7 '+esc(r.project):'');
return '<div class="r" data-id="'+esc(r.id)+'" title="'+esc(new Date(r.last).toLocaleString())+'"><div class="t">'+esc(r.title)+'</div><div class="m">'+meta+'</div><div class="s">'+snip(r)+'</div></div>';}).join('');
renderHist();}
window.addEventListener('message',e=>{const d=e.data;
if(d.type==='restore'){const s=d.state;q.value=s.query||'';all.checked=!!s.all;setFlag('cs',s.cs);setFlag('ww',s.ww);setFlag('re',s.re);when.value=s.when||'any';sort.value=s.sort||'score';
history=d.history||[];render(s.results||[],s.searched);}
else if(d.type==='history'){history=d.history||[];renderHist();}
else if(d.type==='start'){acc=[];prog=null;}
else if(d.type==='batch'){if(!busy)return;acc=acc.concat(d.results).sort((a,b)=>b.score-a.score).slice(0,${MAX_RESULTS});prog={done:d.done,total:d.total};
render(acc,'Searched '+d.done+' of '+d.total+' chats, '+acc.length+' matches');}
else if(d.type==='done'){busy=false;bar.classList.remove('on');acc=d.results;render(d.results,d.searched||(prog?'Searched '+prog.total+' of '+prog.total+' chats, '+d.results.length+' matches':''));}
else if(d.type==='error'){setBusy(false);st.textContent='';list.innerHTML='';hasResults=false;showErr(d.message);renderHist();}
else if(d.type==='results'){busy=false;bar.classList.remove('on');render(d.results,d.searched);}});
list.addEventListener('click',e=>{const el=e.target.closest('.r');if(el)vs.postMessage({type:'open',id:el.dataset.id});});
vs.postMessage({type:'ready'});
</script></body></html>`;
}
