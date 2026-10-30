import { randomBytes } from 'crypto';
import { Category, ConfigReport, Level } from './claudeConfig';
import { escHtml } from './optionsForm';

export const CFG_TITLE = 'Saropa Chat Explorer: Claude Config';
const CATS: Category[] = ['bloat', 'duplication', 'redundancy', 'gaps', 'opportunities', 'risks'];

const CSS = `body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:16px 24px;max-width:820px}
h1{font-size:1.4em;font-weight:600;margin:0 0 12px}h2{font-size:1.1em;font-weight:600;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--vscode-panel-border)}h3{font-size:1em;margin:12px 0 4px}
table{border-collapse:collapse}td{padding:2px 16px 2px 0;vertical-align:top}td:first-child{color:var(--vscode-descriptionForeground)}
.f{padding:3px 0}.high{color:var(--vscode-errorForeground)}.warn{color:var(--vscode-editorWarning-foreground)}.info{color:var(--vscode-descriptionForeground)}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;padding:4px 12px;cursor:pointer;font:inherit}
button:hover{background:var(--vscode-button-hoverBackground)}button:focus{outline:1px solid var(--vscode-focusBorder)}`;
const SCRIPT = `const vs=acquireVsCodeApi();document.getElementById('copy').addEventListener('click',()=>vs.postMessage({type:'copy'}));`;

function levelHtml(title: string, lv: Level | undefined, none: string): string {
  if (!lv) { return `<h2>${escHtml(title)}</h2><p class="info">${escHtml(none)}</p>`; }
  const facts = lv.facts.length ? '<table>' + lv.facts.map((f) => `<tr><td>${escHtml(f.label)}</td><td>${escHtml(f.value)}</td></tr>`).join('') + '</table>' : '<p class="info">Nothing found.</p>';
  const cats = CATS.map((c) => {
    const l = lv.findings.filter((f) => f.category === c);
    return l.length ? `<h3>${c[0].toUpperCase() + c.slice(1)}</h3>` + l.map((f) => `<div class="f ${f.severity}">${escHtml(f.text)}</div>`).join('') : '';
  }).join('');
  return `<h2>${escHtml(title)}</h2><h3>Facts</h3>${facts}${cats || '<p class="info">No findings.</p>'}`;
}

export function configHtml(rep: ConfigReport): string {
  const nonce = randomBytes(18).toString('base64url');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(CFG_TITLE)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="${nonce}">${CSS}</style></head><body>
<h1>Claude Config</h1><button type="button" id="copy">Copy for AI</button>
${levelHtml('Global (~/.claude)', rep.global, '')}${levelHtml('Project', rep.project, 'No workspace folder is open.')}
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}
