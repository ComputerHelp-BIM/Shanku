// @shanku/tokens build — tokens.json -> dist/tokens.css + dist/index.js + dist/index.d.ts
// Theme model:
//   :root / [data-theme="paper"]            Paper values (default)
//   [data-theme="ink"]                      Ink values (explicit choice)
//   @media (prefers-color-scheme: dark)     Ink values when no data-theme is set ("follow OS")
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

const themes = src.color.themes.map((t) => t.id);
const [first, second] = themes;
if (themes.length !== 2) throw new Error(`Expected 2 themes, found ${themes.length}`);

const seen = new Set();
function checkName(name) {
  if (!NAME.test(name)) throw new Error(`Invalid token name: ${name}`);
  if (seen.has(name)) throw new Error(`Duplicate token name: ${name}`);
  seen.add(name);
}
const valueFor = (tok, theme) =>
  typeof tok.value === 'string' ? tok.value : tok.value[theme] ?? tok.value[first];

const colorLines = { [first]: [], [second]: [] };
for (const tok of src.color.tokens) {
  checkName(tok.name);
  for (const th of themes) colorLines[th].push(`  --${tok.name}: ${valueFor(tok, th)};`);
}
// Only emit Ink overrides that differ from Paper, to keep the file small.
const inkOverrides = src.color.tokens
  .filter((t) => valueFor(t, second) !== valueFor(t, first))
  .map((t) => `  --${t.name}: ${valueFor(t, second)};`);

const staticLines = [];
for (const fam of Object.keys(src)) {
  if (['name', 'version', 'color', 'type'].includes(fam)) continue;
  const group = src[fam];
  if (!group || !Array.isArray(group.tokens)) continue;
  for (const tok of group.tokens) {
    checkName(tok.name);
    staticLines.push(`  --${tok.name}: ${tok.value};`);
  }
}
for (const [key, stack] of Object.entries(src.type.families)) staticLines.push(`  --font-${key}: ${stack};`);

const typeRules = [];
for (const group of src.type.groups) {
  for (const st of group.styles) {
    const fam = st.family ?? group.family;
    const decl = [
      `font-family: var(--font-${fam})`,
      `font-size: ${st.fontSize}`,
      `line-height: ${st.lineHeight}`,
      `font-weight: ${st.fontWeight}`,
      st.letterSpacing ? `letter-spacing: ${st.letterSpacing}` : null,
    ].filter(Boolean);
    typeRules.push(`.sk-type-${st.name} { ${decl.join('; ')}; }`);
  }
}

const css = `/* @shanku/tokens ${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version} — generated from tokens.json, do not edit. */
:root,
[data-theme="${first}"] {
  color-scheme: light;
${colorLines[first].join('\n')}
}

[data-theme="${second}"] {
  color-scheme: dark;
${inkOverrides.join('\n')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
${inkOverrides.map((l) => '  ' + l).join('\n')}
  }
}

:root {
${staticLines.join('\n')}
}

${typeRules.join('\n')}
`;

const names = [...seen];
const js = `// @shanku/tokens — generated from tokens.json, do not edit.
export const themes = ${JSON.stringify(themes)};
export const tokenNames = ${JSON.stringify(names)};
/** CSS custom-property reference for a token, e.g. cssVar('accent') -> 'var(--accent)'. */
export function cssVar(name) {
  if (!tokenNames.includes(name)) throw new Error('Unknown Shanku token: ' + name);
  return 'var(--' + name + ')';
}
export const tokens = ${JSON.stringify(src)};
`;
const dts = `// @shanku/tokens — generated from tokens.json, do not edit.
export type ThemeId = ${themes.map((t) => JSON.stringify(t)).join(' | ')};
export type TokenName = ${names.map((n) => JSON.stringify(n)).join('\n  | ')};
export declare const themes: readonly ThemeId[];
export declare const tokenNames: readonly TokenName[];
export declare function cssVar(name: TokenName): string;
export declare const tokens: Record<string, unknown>;
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/tokens.css'), css);
writeFileSync(join(root, 'dist/index.js'), js);
writeFileSync(join(root, 'dist/index.d.ts'), dts);
console.log(`@shanku/tokens: ${names.length} tokens, ${typeRules.length} type styles -> dist/`);
