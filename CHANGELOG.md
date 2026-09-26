# Changelog

All notable changes to this repository. Package-level detail lives in each package README.

## 0.44.0 — 2026-09-26

### Added
- Start page with sample buildings: G+1 frame, G+14 residential tower (1,235 elements) and G+24 twin towers on a G+3 podium (4,780 elements), made by `tools/fixtures/make_showcase_ifc.py` (`npm run fixtures:showcase`), served gzipped; `.ifc.gz` files open directly.
- Snapping to the plan cut outline (and section box cuts): cut corners, cut edges, the cut face and column centres, for Measure and every Dimension tool. Engine 0.34.0, web 0.44.0.

### Fixed
- In plans of tall buildings, snaps could find nothing: the floors above the cut crowded the one being cut out of the candidates.

## 0.43.0 — 2026-09-26

### Added
- Annotate → Dimension, as in Revit: Aligned, Linear, Angular, Radial, Diameter, Arc Length, Spot Elevation, Spot Coordinate and Spot Slope, placed in plans, sections, elevations and 3D views, kept with their view, undoable, text overrides in Properties, a grip to move, following the model on live Revit updates. Engine 0.33.0, web 0.43.0, brand 1.9.0 (nine icons), ui 0.15.3, playground 0.1.16.

### Changed
- Measure and the Dimension tools show a one-line strip over the top of the view (like Revit's Options Bar); measurement results moved to a card in the lower right, so the model under the old bar stays clickable.

## 0.42.0 — 2026-09-26

### Added
- Measure, in 3D views, plans, sections and elevations: Distance with Revit-style snaps and Tab cycling (ΔX ΔY ΔZ, perpendicular between parallel faces, edges and centrelines), Clear & C/C between two elements, Along a centreline, edge or chain of joined walls and beams, Face area, and Chain with a running total. ME, the ribbon and the Quick Access toolbar. Engine 0.33.0 (with Dimensions), web 0.42.0, brand 1.8.0 (`measure` icon), ui 0.15.2, playground 0.1.15.
- Tab over the view steps through the elements under the cursor, then a chain of joined walls or beams, as in Revit; the element shown is outlined even when it is behind others. The browser's own Tab is off only while the pointer is over the view.

## 0.41.1 — 2026-09-26

### Fixed
- Models loaded from Revit: columns and walls one level low, labels and height colours off by the building's height. Levels are calibrated against the geometry (engine 0.32.0).

## 0.41.0 — 2026-09-26

### Changed
- One level definition for every model: the lowest level at or above the element's top (docs/design/levels.md). Round trips DXF → Shanku → Revit → Shanku keep every element on its level; the IFC storey and CH-LEVEL stay visible; QA flags a CH-LEVEL that differs. Engine 0.31.0.

## Shanku Bridge for Revit 0.7.1 — 2026-09-26

### Fixed
- Export to Revit: sunk beams got twice their z Offset Value (−3000 for −1500): the placement check trusted the beam's bounding box. Beams and slabs are now placed at offset 0, checked on their solid geometry against their level, then given the drawing's offset; afterwards only reported.

## 0.40.0 — 2026-09-26

### Changed (breaking for DXF → 3D level elevations)
- A level is the top of its storey (Revit's structural convention); Level 1 is ±0. Pipeline 2.0.0, engine 0.30.0. Models built before keep their geometry; their levels move to storey tops when rebuilt.
- Export to Revit hosts elements on their own level, top-constrains walls, writes marks to CH-ScheduleMark (Shanku Bridge for Revit 0.7.0).

### Fixed
- Level heads and readouts were off by the file's vertical origin shift (web-ifc COORDINATE_TO_ORIGIN): they now show the model's own elevations, for DXF → 3D models and models loaded from Revit alike.

## 0.39.2 — 2026-09-26

### Fixed
- Export to Revit: beams sat below their drawn height (Start/End Level Offset plus the family's own z Offset Value); now top-justified with the rise or sink in z Offset Value only, and the placement check corrects beam and slab heights (Shanku Bridge for Revit 0.6.1). Adjusted elements that still need checking are shown open.

## 0.39.1 — 2026-09-25

### Changed
- Trademark and independence notice (homepage footer, Guide → About Shanku, READMEs); compatibility wording ("Revit-style", generic "view cube"); homepage claims brought up to date with the Revit add-in; design rules for marks and trade dress.

## 0.39.0 — 2026-09-25

### Changed
- Combined release: main's 0.38.0 (Export to Revit) and 0.37.1 (view kept on live updates) with the dev line's 0.38.0 (colour by parameter, Fix in Revit, paste marks, Realistic and shadows, rate profiles, branded Excel). Both lines had numbered a release 0.38.0 and engine 0.28.0; engine 0.29.0.

## 0.38.0 — 2026-09-25 (main: Export to Revit)

### Added
- Export to Revit: the DXF → 3D model built natively in Revit from the template (dry run, approval by set, one undo, placement check, loaded back). Shanku Bridge for Revit 0.6.0; engine 0.28.0 (pipeline 1.3.0).

## 0.37.1 — 2026-09-25

### Fixed
- Updates from Revit reset plans and boxed views to the default 3D view (engine 0.27.1).

## 0.38.0 — 2026-09-25 (dev: colour by parameter, Realistic, rate profiles)

### Added
- Colour by parameter with an element palette and legend (after the Structura viewer).
- QA findings: Show in Revit; Fix in Revit for missing marks (proposed, reviewed, applied as one Revit undo).
- Paste marks to select (Ctrl + V on the model), synced to Revit.
- Realistic visual style and lightweight ground shadows (engine 0.28.0).
- BOQ rate profiles for Indian metros on a CPWD DSR 2023 base, editable once for every item.
- Brand 1.7.0 icons (colour, sun); ui 0.15.1.

### Changed
- The Excel BOQ follows the design system (fonts, colours, header, banding, totals).

## 0.37.0 — 2026-09-25

### Added
- Live updates from Revit: change feed, partial export of changed elements, merged in place with the view kept (Update, Auto-update). Shanku Bridge for Revit 0.5.0; engine 0.27.0.

## 0.36.0 — 2026-09-25

### Changed
- Revit 2025 look: adjustable label/value split, fixed Apply footer, sort within groups, Project Browser (search, guides, Families), Type Properties dialog with Preview, units next to numbers, thin scrollbars. Shanku Bridge for Revit 0.4.0.

### Fixed
- Missing row line under nested IFC groups.

## 0.35.0 — 2026-09-25

### Changed
- Properties works like Revit's palette (collapsible groups, family/type, Edit Type, Apply); Properties docks left and the Project Browser right (saved layouts reset once).

### Fixed
- Duplicate Revit parameters (hidden schedule copies); Revit warnings missing from Check and easy to miss after Apply; 0.0 MB in the load message. Shanku Bridge for Revit 0.3.0.

## 0.34.0 — 2026-09-25

### Added
- Revit bridge milestone 2: edit Revit instance parameters in Shanku (pending changes, undo, review, check, apply as one Revit undo, conflict detection and refresh). Shanku Bridge for Revit 0.2.0 (`/params/read`, `/params/write`, `features`).

## 0.33.0 — 2026-09-25

### Added
- Revit ribbon tab (Connect, Disconnect, Load/Reload, Sync, Send to Revit, Get from Revit, Bridge guide); brand 1.6.0 bridge icons.

## 0.32.0 — 2026-09-24

### Added
- Revit bridge, milestone 1: Shanku Bridge for Revit 0.1.0 (Revit 2025 add-in: pairing, IFC4 export in a rolled-back transaction, selection sync, Shanku ribbon tab) and the Revit window in Shanku (connect, pair, load, selection both ways). Protocol v1 in docs/bridge/protocol.md; mock add-in in tools/.

## 0.31.0 — 2026-09-24

### Changed
- Combined release of main's 0.30.0 (guide figures, homepage diagrams) and the design-system branch's 0.30.0 (What now?, BOQ scope, steel estimate, file diagnosis, view links).

## 0.30.0 — 2026-09-24

### Added
- Guide figures (mouse map and ten more diagrams) and figure sections on the homepage; themed, searchable, accessible.
- From the Structura viewer: "What now?" tasks in the title bar; BOQ scope switch with a scope sentence on every total and in Excel; reinforcement estimate from steel ratios with out-of-range warnings and a Reinforcement sheet; a diagnosis for files that do not open (what the file is, export steps, a copyable report); shareable view links (`#app&view=`).

## 0.29.0 — 2026-09-24

### Added
- Command search sections when empty: Recently used, Most used, New in this release (with New badges).

## 0.28.2 — 2026-09-24

### Fixed
- Chrome 154: Guide & FAQ crashed the app (`n is not a function`) on changing section or closing. An effect returned `scrollTo()`'s value, a Promise in Chrome 154, which React called as the cleanup. All effects now use block bodies; a test guards the pattern.

## 0.28.1 — 2026-09-24

### Fixed
- A failing window or panel no longer blanks the whole app: error boundaries per window and panel, a page-level report as a last resort, and errors outside redraws logged to Activity.

## 0.28.0 — 2026-09-24

### Changed
- Combined release: main's 0.26.0 (combined exploded views, selectable cut faces, cut outlines) and the design-system branch's 0.26.0 (DXF work) and 0.27.0 (QA checks and panel). Both lines had numbered a release 0.26.0.

## 0.26.0 — 2026-09-24

### Added
- Combined exploded views; cut faces respond to hover, selection and box preview; cut outlines.
- Includes the design-system branch release also numbered 0.25.0 (AutoCAD interface for DXF, 2D right-click menus, Revit gap analysis).
## 0.27.0 — 2026-09-24

### Added
- QA checks (actionable QA, phase 1, from the Structura viewer): 10 model-health and mark checks run on this device after every load (duplicates, overlapping columns, discontinuous columns, zero size, unusual length, no level, no grade, lateral-system gaps, missing marks, one mark for different sizes). A QA panel with severity tiles and finding cards (Select all, Isolate, Zoom, Step, what was measured and what the check does not prove) and a QA summary in the status bar (engine 0.25.0).
- docs/design/quick-wins.md: easy features from Revit add-ons (A1–A9) and ones Revit lacks (B1–B10).

### Changed
- Sample model (fixtures 1.2.0): ground-floor columns now stand on the footings; they stopped 900 mm above them, which the new QA check reported.

## 0.26.0 — 2026-09-24

### Added
- DXF viewer with an AutoCAD interface: adaptive grid with red X and green Y axes (F7), UCS icon, crosshair with pick box, `X, Y, 0.000` coordinates and status-bar toggles (engine 0.24.0, tokens 2.1.0).
- AutoCAD right-click menus in the 2D view, with and without a selection; Isolate / Hide / End Object Isolation (undoable); Quick Select, Find, Count, Select Similar, Zoom Window, Zoom Previous and Quick Properties.
- DXF extractor 1.2.0: object types and polyline global width.
- docs/design/revit-gap.md: Revit features BIM modellers use daily that Shanku lacks, easy to advanced.

## 0.25.0 — 2026-09-24

### Added
- Section grips in plans (lengthen, far clip, flip, move), undoable.

### Fixed
- Cut faces looked hollow: solid stencil caps on every visible cut plane, a shade darker than element faces. The 0.14.0 note claiming this colour was fixed was wrong (that edit never applied).
- DXF viewer with an AutoCAD interface: adaptive grid with red X and green Y axes (F7), UCS icon, crosshair with pick box, `X, Y, 0.000` coordinates and status-bar toggles (engine 0.23.0, tokens 2.1.0).
- AutoCAD right-click menus in the 2D view, with and without a selection; Isolate / Hide / End Object Isolation (undoable); Quick Select, Find, Count, Select Similar, Zoom Window, Zoom Previous and Quick Properties.
- DXF extractor 1.2.0: object types and polyline global width.

## 0.24.0 — 2026-09-24

### Added
- Command search: Ctrl + K finds every command (about 70, plus one per category, level and view) as well as elements, from one command registry.
- Guide & FAQ (F1): searchable guide, common questions, what's new and every shortcut.
- Exploded views by storey, radially or by category (engine 0.22.0), with a spread slider.
- Brand 1.5.0: explode and guide icons (ui 0.11.0).

### Fixed
- Repeated "Requires" lines in the web README.

## 0.23.0 — 2026-09-24

### Added
- Selectable view symbols (hover, select, properties, temporary dimensions for levels, delete sections); live window / crossing preview; section rubber band with 15° snapping, angle and length.

## 0.22.0 — 2026-09-23

### Added
- Section and elevation marks in plans; level lines and heads in elevations and sections; section traces across elevations; double-click a head to open its view.

## 0.21.0 — 2026-09-23

### Changed
- Structural plans: dashed hidden lines instead of transparent slabs; View Range offsets relative to the level (negative allowed); Section tool only in plans, sections and elevations (sections can now be drawn in elevations and sections).

## 0.20.1 — 2026-09-23

### Changed
- Merged `claude/design-system-extraction-7vri1d` (7679278): tokens 2.0.0, ViewCube compass hover contrast, clearer token notes.

## 0.20.0 — 2026-09-23

### Added
- Views and the Project Browser: structural plans per level with View Range, 3D views, elevations, sections (drawn in plan); per-view camera, graphics, filters, style, hides and box; duplicate, rename, delete, apply template per view; view properties; persisted per file.

### Fixed
- Transparent elements painting their back faces opaque.
## 0.19.1 — 2026-09-23

### Fixed
- ViewCube compass hover letters now reach 4.5:1 (were about 4:1 on Paper and 2.7:1 on Ink).
- Duplicate title lines left in the web and playground READMEs by the design-system merge.

### Changed
- @shanku/tokens 2.0.0: `on-select-window` removed in favour of `viewcube-hot` / `on-viewcube-hot`; clearer usage notes so design-system tooling checks each colour against the right surfaces.

## 0.19.0 — 2026-09-23

### Added
- View Templates: create from the current view, include switches, apply as one undoable step, export / import JSON.

### Changed
- Cursors follow the canvas theme (dark on Paper, light on Ink); dimension plates and grips use the canvas colour.
- Merged `claude/design-system-extraction-7vri1d` (c96726f): tokens 1.2.0 WCAG contrast fixes, token-only CSS, stylelint guard in CI.

### Fixed
- Floating windows stealing focus from a field that was focused on open.

## 0.18.0 — 2026-09-23

### Added
- View filters (manager + VG Filters tab); session persistence (IndexedDB); fullscreen toggle; logo opens the homepage in a new tab; Revit cursors; Shift + right-drag orbit; Ctrl / Shift selection in DXF.
## 0.16.2 — 2026-09-23

### Added
- Design tokens 1.2.0: `focus-ring`, `control-border`, shadow and z-index layers, and tokens for every colour that was hard-coded in app CSS.
- A contrast check in the tokens build (94 colour pairs, both themes) and `npm run lint:css` (stylelint, also in CI) rejecting raw colours and ad-hoc z-index values.

### Fixed
- Focus rings, control borders, orange text, faint text on Ink and the Temporary Hide/Isolate label now meet WCAG 2 contrast.

## 0.16.1 — 2026-09-23

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
