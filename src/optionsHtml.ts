import { randomBytes } from 'crypto';
import { buildFormHtml, escHtml, OptEntry } from './optionsForm';

export const OPT_TITLE = 'Saropa Chat Explorer: Options';

const CSS = `body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:16px 24px;max-width:820px}
h1{font-size:1.4em;font-weight:600;margin:0 0 12px}h2{font-size:1.1em;font-weight:600;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--vscode-panel-border)}
.row{padding:8px 0}.top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top label{font-weight:600;min-width:200px}
input[type=text],input[type=number],select{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:3px 6px;font:inherit;min-width:140px}
input:focus,select:focus,button:focus{outline:1px solid var(--vscode-focusBorder)}
.help{color:var(--vscode-descriptionForeground);margin-top:3px}.err{color:var(--vscode-errorForeground);margin-top:3px}.ro{color:var(--vscode-descriptionForeground)}
button{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:0;padding:3px 10px;cursor:pointer;font:inherit}
button:hover{background:var(--vscode-button-secondaryHoverBackground)}button.rs[hidden]{display:none}
footer{margin-top:24px;padding-top:12px;border-top:1px solid var(--vscode-panel-border)}`;

const SCRIPT = `const vs=acquireVsCodeApi();
const q=(s,r)=>(r||document).querySelector(s);
const rowOf=(k)=>document.querySelector('[data-row="'+CSS.escape(k)+'"]');
function showErr(k,m){const r=rowOf(k);if(!r)return;const e=q('.err',r);e.textContent=m||'';e.hidden=!m;}
function read(c){const t=c.dataset.t;if(t==='boolean')return{ok:true,v:c.checked};
if(t==='enum'||t==='string')return{ok:true,v:c.value};
if(c.value.trim()==='')return{ok:false,m:'Enter a number.'};
const n=Number(c.value);if(!isFinite(n))return{ok:false,m:'Must be a number.'};
if(t==='integer'&&!Number.isInteger(n))return{ok:false,m:'Must be a whole number.'};
if(c.min!==''&&n<Number(c.min))return{ok:false,m:'Must be at least '+c.min+'.'};
if(c.max!==''&&n>Number(c.max))return{ok:false,m:'Must be at most '+c.max+'.'};
return{ok:true,v:n};}
document.addEventListener('change',(ev)=>{const c=ev.target.closest('[data-k]');if(!c)return;const r=read(c);
if(!r.ok){showErr(c.dataset.k,r.m);return;}showErr(c.dataset.k,'');vs.postMessage({type:'set',key:c.dataset.k,value:r.v});});
document.addEventListener('click',(ev)=>{const b=ev.target.closest('button');if(!b)return;
if(b.dataset.reset){showErr(b.dataset.reset,'');vs.postMessage({type:'reset',key:b.dataset.reset});}
else if(b.id==='open'){vs.postMessage({type:'openSettings'});}});
window.addEventListener('message',(ev)=>{const m=ev.data;if(!m||m.type!=='values'||!m.values)return;
for(const k of Object.keys(m.values)){const s=m.values[k],c=document.getElementById('o_'+k);if(!c)continue;
if(c.dataset.t==='boolean')c.checked=s.value===true;else if(document.activeElement!==c||s.reset)c.value=s.value;
const b=q('[data-reset="'+CSS.escape(k)+'"]',rowOf(k));if(b)b.hidden=s.isDefault;showErr(k,s.error||'');}});
vs.postMessage({type:'ready'});`;

/** The Options page. Settings come from the manifest schema, never a hand list. */
export function optionsHtml(entries: OptEntry[], values: Record<string, unknown>): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(OPT_TITLE)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="${nonce}">${CSS}</style></head><body>
<h1>Options</h1><main>${buildFormHtml(entries, values)}</main>
<footer><button type="button" id="open">Open in VS Code Settings</button></footer>
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
