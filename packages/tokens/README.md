# @shanku/tokens 1.1.0

Design tokens for Shanku, generated from `tokens.json` (the approved design system).

```js
import '@shanku/tokens/tokens.css';          // CSS custom properties + .sk-type-* classes
import { cssVar } from '@shanku/tokens';      // cssVar('accent') -> 'var(--accent)'
```

## Themes

| `data-theme` on `<html>` | Result |
|---|---|
| not set | Follows the OS: Paper when light, Ink when dark |
| `paper` | Paper (light) |
| `ink` | Ink (dark) |

Every colour token has a Paper and an Ink value. Spacing, radius, size and opacity tokens are theme-independent.

## Rules

- Never hard-code a colour in a component; use `var(--token)`.
- `accent` is for selection and brand only. Use `accent-text` for orange text.
- Edit `tokens.json`, run `npm run build`, bump the version.

## Changelog

### 1.1.0 — 2026-09-22
- Added `select-window` (blue) and `select-crossing` (green) for the selection box, following AutoCAD's convention.

### 1.0.0 — 2026-09-21
- First release from the approved Shanku design system: 50 colour tokens (Paper and Ink), 8 type styles, spacing, radius, size and opacity scales.
