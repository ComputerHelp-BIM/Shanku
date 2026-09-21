# Changelog

All notable changes to this repository. Package-level detail lives in each package README.

## 0.2.0 — 2026-09-21

### Added
- `@shanku/engine` 0.2.0: IFC loading in a Web Worker (web-ifc), one merged mesh with feature edges, GPU state texture, ID-buffer picking, and Revit navigation and commands.
- `@shanku/web` 0.2.0: the Shanku app — open IFC (button, drop, sample), select, find by ID, properties on demand, project browser, activity log, keyboard reference; Revit shortcuts ZF/ZE/ZX/ZA, ZP/ZC, ZR/ZZ, HI/IC/HH/HR, BX, WF/HL/SD/CO, Home, Esc.
- `tools/fixtures/make_sample_ifc.py` 1.1.0 and a 50k-element performance test (3.0 s parse, 3.9 s open in the browser).

### Changed
- Pages now deploys the app at the site root and the playground at `/playground/`.
- Dev tooling moved to Vite 8, @vitejs/plugin-react 6 and Vitest 5: `npm audit` reports 0 vulnerabilities.

### Removed
- `.github/workflows/jekyll-gh-pages.yml` and `static.yml`: they deployed to the same Pages site as `pages.yml`, so whichever finished last replaced the app with raw repository files.

## 0.1.0 — 2026-09-21

First commit of the Shanku foundation.

### Added
- `@shanku/tokens` 1.0.0: the approved design system as tokens — 50 colour tokens for Paper and Ink, 8 type styles, spacing, radius, size and opacity scales — compiled to CSS custom properties. With no `data-theme`, the theme follows the OS.
- `@shanku/brand` 1.0.0: mark (Paper, Ink, small), app icon, 20 structural icons (outline, plus two-tone for column, beam, slab, wall, footing), brand book.
- `@shanku/ui` 0.1.0: ThemeProvider, useShortcut, Icon, ShankuMark, Button, IconButton, Kbd, TitleBar, CommandSearch, RibbonTabs, Ribbon, RibbonGroup, RibbonButton, DockPanel, TypeSelector, PropertySection, PropertyRow, TreeView, ViewTabs, BottomPanel, StatusBar, StatusChip, LocalIndicator, AppShell. 11 unit tests.
- `@shanku/playground` 0.1.0: the full window with sample data and a placeholder 3D preview.
- CI (typecheck, test, build) and GitHub Pages deployment for the playground.
