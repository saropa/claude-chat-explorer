import * as vscode from 'vscode';
import { searchChats } from './search';

class Provider implements vscode.WebviewViewProvider {
  private seq = 0;

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    view.webview.html = html();
    view.webview.onDidReceiveMessage(async (m) => {
      if (m.type === 'search') {
        const id = ++this.seq;
        try {
          const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
          const results = await searchChats(String(m.query), !!m.all, folders);
          if (id === this.seq) { view.webview.postMessage({ type: 'results', results }); }
        } catch (e) {
          if (id === this.seq) { view.webview.postMessage({ type: 'results', results: [] }); }
        }
      } else if (m.type === 'open') {
        await openChat(String(m.id));
      }
    });
  }
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
    vscode.window.registerWebviewViewProvider('claudeChatSearch.view', new Provider()));
}

export function deactivate(): void {}

function html(): string {
  const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body{padding:6px 8px;color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
input[type=text]{width:100%;box-sizing:border-box;padding:4px 6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none}
input[type=text]:focus{border-color:var(--vscode-focusBorder)}
label{display:block;margin:6px 0;cursor:pointer}
#status{margin:6px 0;color:var(--vscode-descriptionForeground)}
.r{padding:5px 4px;cursor:pointer}
.r:hover{background:var(--vscode-list-hoverBackground)}
.t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m{color:var(--vscode-descriptionForeground);font-size:0.9em}
.s{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--vscode-descriptionForeground)}
mark{background:var(--vscode-editor-findMatchHighlightBackground);color:inherit}
</style></head><body>
<input type="text" id="q" placeholder="Search chats" autofocus>
<label><input type="checkbox" id="all"> All projects</label>
<div id="status"></div><div id="list"></div>
<script nonce="${nonce}">
const vs=acquireVsCodeApi();const q=document.getElementById('q');const all=document.getElementById('all');
const st=document.getElementById('status');const list=document.getElementById('list');let timer;
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function go(){clearTimeout(timer);const v=q.value.trim();if(!v){list.innerHTML='';st.textContent='';return;}
st.textContent='Searching...';vs.postMessage({type:'search',query:v,all:all.checked});}
q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(go,400);});
q.addEventListener('keydown',e=>{if(e.key==='Enter')go();});
all.addEventListener('change',go);
function ago(ms){const d=Math.floor((Date.now()-ms)/86400000);if(d<1)return 'today';return d+(d===1?' day':' days')+' ago';}
window.addEventListener('message',e=>{if(e.data.type!=='results')return;const rs=e.data.results;
st.textContent=rs.length?'':'No matches';
list.innerHTML=rs.map(r=>{const sn=esc(r.before)+'<mark>'+esc(r.match)+'</mark>'+esc(r.after);
const meta=r.hits+(r.hits===1?' hit':' hits')+' \\u00b7 '+ago(r.mtime)+(all.checked?' \\u00b7 '+esc(r.project):'');
return '<div class="r" data-id="'+esc(r.id)+'"><div class="t">'+esc(r.title)+'</div><div class="m">'+meta+'</div><div class="s">'+sn+'</div></div>';}).join('');});
list.addEventListener('click',e=>{const el=e.target.closest('.r');if(el)vs.postMessage({type:'open',id:el.dataset.id});});
</script></body></html>`;
}
