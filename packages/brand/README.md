# @shanku/brand 1.1.0

Logos, the custom structural icon set and the brand book (`BRAND.md`, the full design-system guidelines: voice, themes, colour rules, type, iconography, layout, shortcuts, accessibility).

## Logos — `assets/logos/`

| File | Use |
|---|---|
| `shanku-mark-paper.svg` | Mark on light grounds |
| `shanku-mark-ink.svg` | Mark on dark grounds (includes the Ink ground) |
| `shanku-mark-small.svg` | 32 px and below (heavier strokes) |
| `shanku-app-icon.svg` | App icon, favicon, PWA icon |

The wordmark is lowercase **shanku** in Sora SemiBold. It is typeset, not yet outlined.

## Icons — `icons.json`, `assets/icons/`

Round 1: 20 icons on a 24 px grid, 1.5 px round strokes, `currentColor`. `icons.json` holds each icon's inner SVG as `outline`, and a `twoTone` version for the five structural elements used on large ribbon buttons (column, beam, slab, wall, footing). Generic actions come from Lucide.

## Changelog

### 1.1.0 — 2026-09-22
- Added six workspace icons for dockable panels: properties, browser, activity, keyboard, console, layout.

### 1.0.0 — 2026-09-21
- First release: four logo files, 20 structural icons (outline, plus two-tone for five elements), brand book.
