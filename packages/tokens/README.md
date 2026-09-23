# @shanku/tokens 1.2.0

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

Every colour token has a Paper and an Ink value. Spacing, radius, size, opacity, shadow and z-index tokens are theme-independent.

## Rules

- Never hard-code a colour in a component; use `var(--token)`.
- `accent` is for selection and brand only. Use `accent-text` for orange text.
- Use `focus-ring` for focus outlines and `control-border` for the edge of anything interactive (inputs, selects, secondary buttons). `border` and `border-strong` are for dividers only.
- Shadows only through `shadow-*`, stacking layers only through `z-*`. `npm run lint:css` at the repository root rejects raw colours and ad-hoc z-index values.
- Edit `tokens.json`, run `npm run build`, bump the version. The build runs `scripts/check-contrast.mjs` first and fails if a required colour pair drops below WCAG 2 (4.5:1 for text, 3:1 for focus rings and control borders) in either theme.

## Changelog

### 1.2.0 — 2026-09-23
- Added `focus-ring` (Paper `#B35F12`, Ink `#D9761E`): at least 3:1 on every surface. `accent` was only 2.5:1 as a focus outline on Paper panels.
- Added `control-border` (Paper `#7A7E86`, Ink `#7C828C`): at least 3:1 for the edges of inputs, selects and secondary buttons. `border-strong` stays as a divider colour.
- Changed `accent-text` on Paper `#A3500C` → `#9C4C0A` (was 4.47:1 on panel and row-selected, now at least 4.8:1).
- Changed `text-faint` on Ink `#9297A0` → `#A0A5AD` (was 4.07:1 on chip and 3.84:1 on row-selected, now at least 4.55:1).
- Added `scrim`, `on-select-window`, `reveal-frame` / `on-reveal-frame`, `temp-hide-frame` / `on-temp-hide-frame` (dark label text: white on the cyan was 2.8:1) and ten `viewcube-*` colours, all previously hard-coded in app CSS.
- Added `shadow` tokens (`shadow-tooltip`, `shadow-menu`, `shadow-window`, `shadow-hero`) and `zIndex` tokens (`z-view-overlay` … `z-context-menu`).
- Added `scripts/check-contrast.mjs` (94 pairs), run by `npm run build` and `npm run check:contrast`.

### 1.1.0 — 2026-09-22
- Added `select-window` (blue) and `select-crossing` (green) for the selection box, following AutoCAD's convention.

### 1.0.0 — 2026-09-21
- First release from the approved Shanku design system: 50 colour tokens (Paper and Ink), 8 type styles, spacing, radius, size and opacity scales.
