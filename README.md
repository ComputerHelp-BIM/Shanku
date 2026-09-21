# Shanku

Open, IFC-native structural modelling for reinforced concrete, in the browser. No install, and no sign-up for core features: files open from your disk and stay on your device.

> **Status: 0.1.0 — design system and UI foundation.** The modelling engine (IFC, DXF import, 3D viewport, BOQ) is not built yet. This repository currently holds the approved design system and the first React components.

## Repository layout

| Path | Package | Version | What it is |
|---|---|---|---|
| `packages/tokens` | `@shanku/tokens` | 1.0.0 | Design tokens for the Paper and Ink themes, compiled to CSS custom properties |
| `packages/brand` | `@shanku/brand` | 1.0.0 | Logos, the structural icon set, and the brand book (`BRAND.md`) |
| `packages/ui` | `@shanku/ui` | 0.1.0 | React components: title bar, ribbon, properties, project browser, view tabs, bottom panel, status bar, app shell |
| `apps/playground` | `@shanku/playground` | 0.1.0 | The full Shanku window with sample data, deployed to GitHub Pages |

The design source of truth is `packages/tokens/tokens.json` plus `packages/brand/BRAND.md`, taken from the approved Shanku Design System. Change tokens there, never in component CSS.

## Getting started

Requires Node 20 or newer (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev          # playground at http://localhost:5173
npm test             # unit tests (Vitest + Testing Library)
npm run typecheck
npm run build        # tokens -> ui -> playground
```

## Using the UI package

```tsx
import '@shanku/tokens/tokens.css';
import '@shanku/ui/styles.css';
import { ThemeProvider, AppShell, TitleBar /* … */ } from '@shanku/ui';
```

The consumer provides the fonts (IBM Plex Sans 400/600, IBM Plex Mono 400, Sora 600). The playground self-hosts them via `@fontsource`, so the app works offline.

## Keyboard

| Shortcut | Action |
|---|---|
| `Ctrl K` (`Cmd K` on macOS) | Focus the command search |
| `` Ctrl ` `` | Toggle the bottom panel (console, QA, BOQ, activity) |
| `` Ctrl Shift ` `` | Fallback toggle where a browser or OS takes `` Ctrl ` `` |

Shortcuts match the physical key (`KeyboardEvent.code`), so they work on every keyboard layout.

## Deploying the playground

`.github/workflows/pages.yml` builds and deploys `apps/playground` on every push to `main`. Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is then served at `https://shanku-bim.github.io/Shanku/`.

## Licence

Not chosen yet. Until a licence file is added, the code is all rights reserved and packages are marked `UNLICENSED`. Choose one before accepting outside contributions.

## Versioning

Every package follows semantic versioning (`major.minor.patch`). Each package README carries its own changelog; `CHANGELOG.md` summarises repository releases.
