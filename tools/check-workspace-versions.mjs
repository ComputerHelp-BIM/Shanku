#!/usr/bin/env node
/**
 * Every @shanku/* dependency must name the version that package actually has: otherwise `npm ci` on a
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
if (wrong.length) {
  console.error('Workspace versions out of step:\n  ' + wrong.join('\n  ') + '\nUpdate the dependency, then run npm install to refresh package-lock.json.');
  process.exit(1);
}
console.log(`Workspace versions in step (${pkgs.length} packages).`);
