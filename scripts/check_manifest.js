// Fails when package.json holds a contribution VS Code would reject or that points at nothing.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const errors = [];
const c = pkg.contributes || {};
const containers = (c.viewsContainers && c.viewsContainers.activitybar) || [];
const containerIds = new Set();
for (const v of containers) {
  containerIds.add(v.id);
  if (!/^[A-Za-z0-9_-]+$/.test(v.id)) errors.push(`viewsContainers id "${v.id}" may hold only letters, digits, "_" and "-" (VS Code rejects the whole list otherwise)`);
  if (!v.icon || !fs.existsSync(path.join(root, v.icon))) errors.push(`viewsContainers "${v.id}" icon missing: ${v.icon}`);
}
for (const key of Object.keys(c.views || {})) {
  if (!containerIds.has(key)) errors.push(`views key "${key}" is not a declared activitybar container`);
  for (const view of c.views[key]) if (view.icon && !fs.existsSync(path.join(root, view.icon))) errors.push(`view "${view.id}" icon missing: ${view.icon}`);
}
const declared = new Set((c.commands || []).map((x) => x.command));
for (const [menu, items] of Object.entries(c.menus || {})) {
  for (const m of items) if (!declared.has(m.command)) errors.push(`menu "${menu}" uses undeclared command ${m.command}`);
}
for (const f of [pkg.icon, pkg.main]) if (f && !fs.existsSync(path.join(root, f)) && f !== pkg.main) errors.push(`file missing: ${f}`);
const srcDir = path.join(root, 'src');
const src = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n');
if (!/registerCommand/.test(src)) errors.push('no registerCommand call found in src/');
for (const cmd of declared) if (!src.includes(`'${cmd}'`)) errors.push(`declared command ${cmd} has no matching string in src/ (no registerCommand?)`);
if (errors.length) { console.error('Manifest check FAILED:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log('Manifest check passed.');
