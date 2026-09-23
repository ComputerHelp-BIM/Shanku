# Changelog

All notable changes to this repository. Package-level detail lives in each package README.

## 0.18.0 — 2026-09-23

### Added
- View filters (manager + VG Filters tab); session persistence (IndexedDB); fullscreen toggle; logo opens the homepage in a new tab; Revit cursors; Shift + right-drag orbit; Ctrl / Shift selection in DXF.

### Fixed
- Controls using the browser font instead of IBM Plex Sans (button reset), merged from `claude/design-system-extraction-7vri1d`.

## 0.17.0 — 2026-09-23

### Added
- Visibility/Graphics by category and Override Graphics in View by element (colour, transparency, halftone, visibility), undoable.
- `vercel.json` and deployment notes; the failed Vercel deployments were a missing output setting and a project rooted at `apps/web`.

## 0.16.0 — 2026-09-22

### Added
- Revit-layout right-click menus in 3D (with and without a selection); hover tooltips in 3D and DXF views; smooth ViewCube transitions; Next Pan/Zoom and Zoom Out (2x).

### Changed
- ViewCube faded at rest, lit while in use; cyan Temporary Hide/Isolate frame; view bar keeps only Fit.

### Fixed
- Orbit centre marker not showing.

## 0.15.0 — 2026-09-22

### Added
- Revit-style ViewCube with compass ring, Home and options menu.
- Temporary dimensions in 3D and in the DXF view; AutoCAD grips on DXF selections.

### Fixed
- Orbit getting stuck under the model; canvas theme not changing the background; Auto theme icon looking like Light/Dark.

## 0.14.0 — 2026-09-22

### Added
- Canvas theme separate from the interface theme; homepage theme toggle with screenshots in both themes.
- AutoCAD-style window / crossing selection colours in both views; box selection in the DXF view.
- Orbit centre marker.

### Changed
- Selected elements are see-through; section cut faces read as solid concrete.
- Tokens 1.1.0: `select-window`, `select-crossing`.

## 0.13.0 — 2026-09-22

### Added
- Homepage with fullscreen "Try Shanku free" and drop-to-open.
- Revit-style transactions for undo/redo (engine `History`), Quick Access Toolbar with undo/redo lists.
- Working ribbon tabs; ViewCube; Temporary Hide/Isolate menu; Reveal Hidden Elements; Edges toggle.

### Fixed
- Re-detecting marks or grades no longer resets the view, section box or hidden elements.

## 0.12.1 — 2026-09-22

### Fixed
- 3D camera stuck at the top or bottom view.
- Revit showed only parts of walls with windows/doors from DXF → 3D: walls with holes are now single closed tessellated solids.

## 0.12.0 — 2026-09-22

### Fixed
- IFC from the DXF pipeline now imports into Revit without "not cutting anything" errors (holes in wall geometry, Reference View), and lists each element once per type.
- Python console no longer blanks the tab.
- Stacked duplicate outlines with a single label are built once instead of skipped.

### Added
- Revit-style floating windows for BOQ, DXF → 3D and Keys.
- Selectable objects with properties in the 2D DXF view.
- Glass windows and doors in 3D.
- Closable {3D} tab (unloads the model).

### Changed
- Refactor: shared Pyodide constant, `usePipeline` hook, dead code and styles removed.

## 0.11.0 — 2026-09-22

### Added
- DXF → 3D pipeline for the Computer Help drawing format: frames, levels, labels, checks with Show, IFC4 output with openings, quantities and stable ids. Format spec in `docs/dxf-format.md`.

### Changed
- Windows and doors no longer add volume to the BOQ.

### Verified
- `Full_G4-3-Parts_Input.dxf`: 1,006 elements, 8 levels, 156 openings; IFC quantities match the engine geometry; 3 stacked duplicate columns found.

## 0.10.0 — 2026-09-22

### Added
- Working Python console with the `shanku` API; Ctrl + ` opens it.
- Section box grips (move faces, rotate in plan, snapping, undo) and capped cut faces.
- CI runs the console API tests alongside the DXF extractor tests.

## 0.9.0 — 2026-09-22

### Changed
- No separate browser windows: pop-out removed; floating panels stay inside the Shanku tab.
- Docking behaves like Revit: drag to dock beside the view or other docks, stack as tabs, float, move, resize, dock back; the 3D view keeps the space when docks change.

### Fixed
- White tab bars in the Ink theme.

## 0.8.0 — 2026-09-22

### Added
- Dockable workspace: Properties right and Project browser left by default; every panel can dock on any side, stack as tabs, float over the workspace, or pop out into its own browser window (other monitors included). Layout saved; Reset restores defaults.
- `@shanku/ui` 0.4.0 (`AppShell` workspace slot), `@shanku/brand` 1.1.0 (six workspace icons).

### Fixed
- CI `dxf-extractor` job: install Pillow alongside ezdxf.

### Changed
- The bottom panel is now dock panels (Activity, Keyboard, Python console, BOQ). The drag-up handle from 0.3.0 is replaced by dock splitters; Ctrl + ` still toggles.

## 0.7.0 — 2026-09-22

### Added
- BOQ window and Excel workbook built to the approved design-system specs (BoqWindow, BoqWorkbook): element-wise dimensions, quantities, item rates with per-element overrides, amounts; Summary / Levels / Elements / Rates / About as Excel Tables with live formulas.

### Verified
- The workbook's formulas were recalculated from scratch in LibreOffice (no cached values) and matched the app's totals, including overrides and empty rates.
- UMA NIWAS (IFC4 RV): window sort, filter, rate edit, override, reset, select, dock and export all exercised in the browser.

### Notes
- Excel table style uses the built-in `TableStyleMedium15` (dark header, light bands), the closest built-in to the design; custom fills would break banding when rows are sorted.
- Element rates use `INDEX/MATCH` instead of the `XLOOKUP` shown in the design preview, for Excel 2010+ and LibreOffice compatibility.

## 0.6.0 — 2026-09-22

### Added
- Concrete BOQ grouped by level, category and grade/material, with Excel export (BOQ, Elements, About sheets).
- Quantities fall back to 3D geometry for exports without base quantities.

### Verified (UMA NIWAS)
- IFC4 Reference View: 1,086 elements, 871.485 m³ total from IFC quantities.
- Default export without quantities: 870.770 m³ measured from geometry, within 0.1 %.

### Security
- ExcelJS pulls an old `uuid`; overridden to 11.1.1 in the root `package.json`. `npm audit`: 0 vulnerabilities.

## 0.5.0 — 2026-09-21

### Added
- IFC compatibility rating with fix-it tips; `docs/ifc-compatibility.md` names IFC4 Reference View [Structural] as the preferred export, with the Revit setup and test evidence.
- Automatic, configurable mark detection (Mark, Schedule Mark, ID, Type Mark, Comments, or `PsetName.Property`).

## 0.4.1 — 2026-09-21

### Fixed
- `@shanku/engine` 0.3.1: quantity units on Revit exports (mm lengths were labelled m).

### Verified: Revit export comparison (UMA NIWAS, Revit 2025)
- `Shanku Structural` (IFC2x3 CV2.0), IFC4 Reference View [Structural] and IFC4 Design Transfer View all open in about 0.5 s with 1,086 elements.
- Base quantities are present and match the geometry exactly: slabs 367.43 m³, columns 223.68 m³, beams 212.81 m³ (quantity sum = mesh volume).
- GlobalIds are identical across all three exports: 1,086 / 1,086.

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
