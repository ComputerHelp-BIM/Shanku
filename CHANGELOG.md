# Changelog

All notable changes to this repository. Package-level detail lives in each package README.

## 0.4.0 — 2026-09-21

### Added
- DXF drawings open as 2D view tabs (AutoCAD-style viewing only; DXF-to-model comes later as a redesigned pipeline). ezdxf in Pyodide, loaded on first use.
- Per-file tab colours, pyRevit style.
- CI runs the Python extractor tests.

### Verified with your files
- `UMA_NIWAS_BUILDING-ST-30-04-2025.ifc` (Revit 2025, IFC2x3 CV2.0): 1,057 elements, 13 levels, 0.6 s.
- `Full_G4-3-Parts_Input_Footing.dxf`: 3,741 lines, 412 texts, 29 layers; declared units say inches, override available.
- `StructuralPlan-Test17-clean.dxf`: 505,000 lines, 1,943 fills, 10,465 texts, 33 layers, 26 s.

## 0.3.0 — 2026-09-21

### Changed
- `@shanku/ui` 0.2.0: the bottom panel works like VS Code's: hidden takes no space, drag the edge up or press Ctrl + ` to open, drag to resize or close.
- `@shanku/web` 0.3.0: the panel starts hidden, remembers its height, and has a Panel toggle in the status bar.

### Verified
- Real files: Test16-Preliminary-AssumedLevels.ifc (1,493 elements, 1.0 s) and Tower1-Preliminary-AssumedLevels.ifc (14,039 elements, 29 MB, 2.5 s parse, about 3 s in the browser): every element categorised and assigned a level, properties readable.

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
