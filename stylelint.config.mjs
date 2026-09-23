// Keeps component and app CSS on the design tokens: no raw colours, no ad-hoc z-index layers.
// Colours, shadows and stacking layers live in packages/tokens/tokens.json and reach CSS as var(--token).
/** @type {import('stylelint').Config} */
export default {
  ignoreFiles: ['**/dist/**', '**/node_modules/**'],
  rules: {
    // Raw colours: use a colour token (var(--text), var(--scrim)…) or add one to tokens.json.
    'color-no-hex': [true, { message: 'Use a colour token (var(--…)) instead of a hex value; add one to packages/tokens/tokens.json if none fits.' }],
    'color-named': ['never', { message: 'Use a colour token (var(--…)) instead of a named colour.' }],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch'],
      { message: 'Use a colour or shadow token (var(--…)) instead of a colour function.' },
    ],
    // App-level stacking uses the z-* tokens; 1–5 is allowed only for stacking inside one component
    // (sticky table cells, resize handles), where it never competes with other layers.
    'declaration-property-value-allowed-list': [
      { 'z-index': ['/^var\\(--z-[a-z-]+\\)$/', '/^[1-5]$/', 'auto', '0'] },
      { message: 'Use a z-index token (var(--z-…)); plain 1–5 only for stacking inside one component.' },
    ],
  },
};
