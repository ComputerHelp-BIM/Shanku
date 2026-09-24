# Shanku

Open, IFC-native structural modelling for reinforced concrete, in the browser. No install, and no sign-up for core features: files open from your disk and stay on your device.

> **Status: 0.2.0 — open, navigate and inspect IFC.** Live at https://shanku-bim.github.io/Shanku/ (component playground at `/Shanku/playground/`). DXF import, modelling and BOQ come next.

## Repository layout

| Path | Package | Version | What it is |
|---|---|---|---|
| `packages/tokens` | `@shanku/tokens` | 2.0.0 | Design tokens for the Paper and Ink themes, compiled to CSS custom properties |
| `packages/brand` | `@shanku/brand` | 1.4.0 | Logos, the structural icon set, and the brand book (`BRAND.md`) |
| `packages/ui` | `@shanku/ui` | 0.10.1 | React components: title bar, ribbon, properties, project browser, view tabs, bottom panel, status bar, app shell |
| `packages/engine` | `@shanku/engine` | 0.21.0 | IFC loading in a worker, element model, three.js viewer with Revit navigation and picking |
| `apps/web` | `@shanku/web` | 0.23.0 | The Shanku app |
| `apps/playground` | `@shanku/playground` | 0.1.5 | Component playground with sample data |
| `tools/fixtures` | — | 1.1.0 | Python generator for sample and 50k-element test IFC files |

The design source of truth is `packages/tokens/tokens.json` plus `packages/brand/BRAND.md`, taken from the approved Shanku Design System. Change tokens there, never in component CSS; `npm run lint:css` enforces it, and the tokens build fails if a colour pair drops below WCAG 2 contrast.

## Getting started

Requires Node 20 or newer (22 recommended, see `.nvmrc`).

```bash
npm install
npm run dev          # the app at http://localhost:5173
npm run dev:playground
npm test             # unit tests (Vitest + Testing Library)
npm run typecheck
npm run lint:css     # CSS uses tokens only: no raw colours or ad-hoc z-index
npm run build        # tokens -> ui -> playground -> web
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

**Deploying:** GitHub Pages builds automatically; for Vercel see `docs/deploy.md`.

**DXF → 3D:** drawings in the Computer Help format become IFC4 models; see `docs/dxf-format.md`.

**Preferred IFC export: IFC4 Reference View [Structural].** See `docs/ifc-compatibility.md` for the Revit setup and how other formats rate.

**Design documents:** proposed features (revision timeline, actionable QA, Python macros) and lessons from the Structura viewer are in `docs/design/`.

The 3D view follows Revit: see `apps/web/README.md` for the full list, or the Keyboard tab in the app.

Shortcuts match the physical key (`KeyboardEvent.code`), so they work on every keyboard layout.

## Deploying the playground

`.github/workflows/pages.yml` builds the app and the playground on every push to `main` and deploys both: the app at `https://shanku-bim.github.io/Shanku/`, the playground at `/Shanku/playground/`. Keep it the only Pages workflow; two workflows deploying to Pages overwrite each other.

## Licence

Not chosen yet. Until a licence file is added, the code is all rights reserved and packages are marked `UNLICENSED`. Choose one before accepting outside contributions.

## Versioning

Every package follows semantic versioning (`major.minor.patch`). Each package README carries its own changelog; `CHANGELOG.md` summarises repository releases.
