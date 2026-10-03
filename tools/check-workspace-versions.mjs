#!/usr/bin/env node
/**
 * Every @cad2bim/* dependency must name the version that package actually has: otherwise `npm ci` on a
 * clean clone looks for it on the public registry and fails (it happened twice when a package was bumped).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const dirs = ['packages', 'apps'].flatMap((d) => readdirSync(join(root, d)).map((n) => join(root, d, n))).filter((d) => existsSync(join(d, 'package.json')));
const pkgs = dirs.map((d) => JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')));
const version = Object.fromEntries(pkgs.map((p) => [p.name, p.version]));
const wrong = [];
for (const p of pkgs)
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'])
    for (const [name, want] of Object.entries(p[field] ?? {}))
      if (name in version && want !== version[name] && want !== '*' && !want.startsWith('workspace:')) wrong.push(`${p.name} wants ${name}@${want}, but it is ${version[name]}`);
// version constants shown to people must match their package (the status bar showed engine 0.35.1 for 0.39.0)
for (const [file, name, pkg] of [['packages/engine/src/index.ts', 'ENGINE_VERSION', '@cad2bim/engine'], ['apps/web/src/app/constants.ts', 'APP_VERSION', '@cad2bim/web']]) {
  const m = new RegExp(`${name} = '([^']+)'`).exec(readFileSync(join(root, file), 'utf8'));
  if (!m) wrong.push(`${file} has no ${name}`);
  else if (m[1] !== version[pkg]) wrong.push(`${file}: ${name} is ${m[1]}, but ${pkg} is ${version[pkg]}`);
}
// Vite aliases that point the apps at package sources must name real workspace packages: after the rename to
// cad2bim they still matched @shanku/…, so imports fell through to packages' built dist/ — fine locally, where dist/
// exists, but the GitHub Pages build (which does not build them) failed to resolve @cad2bim/ui/styles.css.
for (const app of dirs.filter((d) => existsSync(join(d, 'vite.config.ts')))) {
  const cfg = readFileSync(join(app, 'vite.config.ts'), 'utf8');
  for (const m of cfg.matchAll(/find:\s*\/\^(@[a-z0-9-]+)\\\/([a-z0-9-]+)/g)) {
    const name = `${m[1]}/${m[2]}`;
    if (!(name in version)) wrong.push(`${app.slice(root.length)}/vite.config.ts aliases ${name}, which is not a workspace package`);
  }
}
if (wrong.length) {
  console.error('Workspace out of step:\n  ' + wrong.join('\n  ') + '\nFix each line above (for a dependency version, then run npm install to refresh package-lock.json).');
  process.exit(1);
}
console.log(`Workspace versions in step (${pkgs.length} packages).`);
