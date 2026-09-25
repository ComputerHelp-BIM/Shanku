# @shanku/brand 1.7.0
# @shanku/brand 1.2.1

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

### 1.7.0 — 2026-09-25
- Icons: colour (colour by parameter, a palette) and sun (shadows).

### 1.6.0 — 2026-09-25
- Bridge icons: link, unlink, importModel, sync, selectSend, selectGet (neutral, no third-party logos).

### 1.5.0 — 2026-09-24
- Added four icons: explodeStoreys, explodeRadial and explodeCategories (exploded views), and guide (Guide & FAQ; an open book, no letters inside).

### 1.4.0 — 2026-09-23
- Added the template icon (View Templates). Includes the visibility icon (1.3.0) and BRAND.md (1.2.1 on the design-system branch).

### 1.3.0 — 2026-09-23
- Added the visibility icon (Visibility/Graphics).
### 1.2.1 — 2026-09-23
- BRAND.md: focus ring, control borders, elevation, stacking and view-mode frames (@shanku/tokens 1.2.0); accessibility rules now state the 3:1 floor and the build-time contrast check.

### 1.2.0 — 2026-09-22
- Added edges, reveal, undo, redo and isolate icons.

### 1.1.0 — 2026-09-22
- Added six workspace icons for dockable panels: properties, browser, activity, keyboard, console, layout.

### 1.0.0 — 2026-09-21
- First release: four logo files, 20 structural icons (outline, plus two-tone for five elements), brand book.
