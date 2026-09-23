// @shanku/tokens contrast check — fails the build when a required colour pair drops below WCAG 2.
// Text needs 4.5:1 (1.4.3); focus indicators and control boundaries need 3:1 (1.4.11).
// Every pair is checked in every theme. Only opaque hex values are compared.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(join(here, '..', 'tokens.json'), 'utf8'));
const themes = src.color.themes.map((t) => t.id);
const tokens = new Map(src.color.tokens.map((t) => [t.name, t.value]));

const SURFACES = ['bg', 'panel', 'ribbon', 'viewport', 'field', 'chip', 'row-selected'];
const CONTROL_GROUNDS = ['bg', 'panel', 'ribbon', 'viewport', 'field', 'chip'];

/** [foreground, grounds, minimum ratio, why] */
const RULES = [
  ['text', SURFACES, 4.5, 'body text'],
  ['text-secondary', SURFACES, 4.5, 'secondary text'],
  ['text-faint', SURFACES, 4.5, 'hints, units, read-only values'],
  ['accent-text', SURFACES, 4.5, 'orange text'],
  ['focus-ring', SURFACES, 3, 'focus indicator'],
  ['control-border', CONTROL_GROUNDS, 3, 'control boundary'],
  ['brand-ink', ['accent'], 4.5, 'primary button label'],
  ['on-reveal-frame', ['reveal-frame'], 4.5, 'reveal-mode label'],
  ['on-temp-hide-frame', ['temp-hide-frame'], 4.5, 'temporary hide/isolate label'],
  ['viewcube-text', ['viewcube-top', 'viewcube-side'], 4.5, 'ViewCube face labels'],
  ['viewcube-compass', ['viewcube-ring'], 4.5, 'ViewCube compass letters'],
  ['on-viewcube-hot', ['viewcube-hot'], 4.5, 'ViewCube compass letters on hover'],
];

function valueFor(name, theme) {
  const v = tokens.get(name);
  if (v === undefined) throw new Error(`check-contrast: unknown token "${name}"`);
  return typeof v === 'string' ? v : v[theme] ?? v[themes[0]];
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`check-contrast: ${hex} is not an opaque #rrggbb colour`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const failures = [];
let checked = 0;
for (const theme of themes) {
  for (const [fg, grounds, min, why] of RULES) {
    for (const bg of grounds) {
      const ratio = contrast(valueFor(fg, theme), valueFor(bg, theme));
      checked++;
      if (ratio < min) failures.push(`  ${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1, needs ${min}:1 (${why})`);
    }
  }
}

if (failures.length) {
  console.error(`@shanku/tokens: ${failures.length} of ${checked} contrast pairs fail:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`@shanku/tokens: ${checked} contrast pairs pass (WCAG 2, ${themes.join(' + ')}).`);
