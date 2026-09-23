# @shanku/web 0.14.0

The Shanku app. Requires `@shanku/engine >= 0.12.0`, `@shanku/ui >= 0.6.0`, `@shanku/tokens >= 1.0.0`.

Open an IFC file (button, drag and drop, or the sample frame); it is read on this device and never uploaded. Navigate and select like Revit; the Properties panel shows identity, level, property sets and quantities; the Project browser selects by level or category; the Activity tab logs load times; the Keyboard tab lists every shortcut.

```bash
npm run dev          # from the repo root
```

## Roadmap for the workspace

Next for the UI: dockable panels like Revit. Properties and the Project browser (and later the QA and BOQ panels) will dock to any side, stack as tabs, float as windows, or pop out, with the layout saved per user. The plan is dockview (MIT), themed with Shanku tokens.

## Revit shortcuts supported

Mouse: middle-drag pan, Shift + middle-drag orbit, wheel zoom to cursor, double middle-click fit, click / Ctrl / Shift selection, window and crossing box selection.

Keys: `Home`, `Esc`, `ZF` `ZE` `ZX` `ZA` fit, `ZP` `ZC` previous view, `ZR` `ZZ` zoom region, `HI` `IC` `HH` `HR` temporary hide/isolate, `BX` section box, `WF` `HL` `SD` `CO` visual styles, `Ctrl K` find, `` Ctrl ` `` bottom panel.

Not yet: perspective camera and walkthrough (`W` `A` `S` `D`, `Q` `E`, Shift + wheel look), SteeringWheel (`F8`), thin lines (`TL`), graphic display options (`GD`).

## Changelog

### 0.14.0 — 2026-09-22
- **Canvas theme is separate from the interface theme** (View → Canvas: Auto / Light / Dark), as in Revit: a dark interface can keep a light canvas. Remembered between visits.
- **Selected elements are see-through**, so elements behind them stay visible.
- **Section cuts look solid**, not hollow.
- **Selection box in AutoCAD colours** in both the 3D and DXF views: drag right is a blue solid window, drag left a green dashed crossing. The DXF view now supports box selection and multiple objects.
- **Orbit shows its centre** while you drag (selection, else section box, else model).
- **Homepage**: theme toggle in the nav, and screenshots in both themes so a dark page never shows a light app.

### 0.13.0 — 2026-09-22
- **Homepage** in front of the app (hero, how it works, toolkit, real screenshots, specs, FAQ). **Try Shanku free** opens the app full screen in the same page (browsers only allow fullscreen on a click in the same page); dropping an .ifc or .dxf on the homepage opens it directly. `#app` links straight to the app. The app is loaded on demand, so the homepage stays small.
- **Undo / redo as transactions** (Revit-style): Quick Access Toolbar with Undo ▾ / Redo ▾ listing named steps (undo back to any point), Ctrl + Z, Ctrl + Y, Ctrl + Shift + Z. Undoable now: section box on/off, grip moves and rotation, BOQ rates and overrides, mark and grade rules.
- **Ribbon tabs switch**: Model (Open, Structure, Select, Quantities), View (Create, Section, Graphics, Windows), Manage (Settings).
- **ViewCube**: faces, edges and corners (26 directions), drag to orbit, Home.
- **View controls**: Temporary Hide/Isolate menu (IC, HC, HI, HH, HR), Reveal Hidden Elements (RH, magenta frame; pick hidden elements and Unhide, EU), Graphics → Edges.
- Fixed: changing mark or grade rules reset hidden elements, the section box and the camera (the view now reloads only for a different file).

### 0.12.1 — 2026-09-22
- Requires @shanku/engine 0.10.0: camera no longer sticks at the top or bottom; DXF → 3D walls import completely in Revit.

### 0.12.0 — 2026-09-22
- **BOQ, DXF → 3D and Keys are Revit-style windows** that float anywhere above the app, ribbon included; Properties, Project browser, Activity and the console stay dockable. Saved dock layouts from earlier versions are reset once.
- **2D DXF selection**: click any line, polyline, circle, text, hatch or block to highlight it and see its properties (handle, layer, colour, linetype, length, area, vertices, text, block…); Esc clears.
- **Windows and doors are see-through glass** in 3D.
- **Close files from their tabs**: the {3D} tab closes the model; it is hidden when only drawings are open.
- Fixed: opening the Python console could blank the whole tab (its output scrolling moved the app frame; the saved layout then repeated it on every visit).
- Refactor: DXF → 3D logic moved into `usePipeline`; dead styles removed.

### 0.11.0 — 2026-09-22
- **DXF → 3D** (ribbon Open → DXF → 3D): pick a drawing in the Computer Help format; the review panel (docked under the view) shows levels with editable names and heights, element counts per level and the checks, each with **Show** to zoom the drawing to it. **Create 3D model** writes an IFC4 file, opens it as the model (BOQ, marks, console all work) and offers **Download IFC**.

### 0.10.0 — 2026-09-22
- **Python console** (Pyodide, runs on this device): `shanku` API 1.0.0 for read-only queries (`elements()`, `selection()`, `get()`, `levels()`, `info()`, `boq()`, `ElementList.volume / .where / .by`) and view actions (`select`, `isolate`, `hide`, `reset`, `fit`). Results that are lists show as tables; errors show their traceback. Enter runs, Shift + Enter adds a line, ↑ ↓ history, Ctrl + L clears. Try `shanku.help()`.
- **Ctrl + ` opens the Python console** at the bottom (was Activity).
- **Section box grips** (engine 0.7.0): drag the arrows to move faces, the ring to rotate, Ctrl + Z to undo; cut faces capped.

### 0.9.0 — 2026-09-22
- Everything stays inside the Shanku tab: pop-out windows removed. Panels float over the whole workspace instead.
- Revit-like docking checked end to end: drag a tab to any side of the 3D view or another dock to dock it, onto another panel to stack them as tabs, drag a floating window by its tab bar, resize it from any edge or corner, resize docks with the splitters (highlighted on hover), Float / Dock buttons. The 3D view never takes panels as tabs.
- When docks change, the 3D view absorbs the freed space (side docks go back to their normal width); splitter sizes you set yourself are kept.
- Fixed: tab bars showed white in the Ink theme (dockview's stylesheet loaded after ours; theme rules now win).

### 0.8.0 — 2026-09-22
- **Dockable panels** (dockview, MIT): Project browser docks left and Properties right by default; Activity, Keyboard, Python console and BOQ dock at the bottom or anywhere else. Drag a tab to dock it on any side or stack it with other panels; every group has **Float** (a window over the whole workspace, not just the 3D view) and **Dock** buttons. The layout is saved per browser; ribbon **Windows → Reset** restores the defaults.
- Ribbon **Windows** group toggles Properties, Browser, Activity, Keys and Console; **Quantities → BOQ** opens the BOQ as a floating panel. Ctrl + ` and the status-bar **Panel** button show or hide the bottom docks.
- Pop-out windows follow the Paper / Ink theme.
- Fixed CI: the Python extractor job installs Pillow (ezdxf's drawing add-on needs it).

### 0.7.0 — 2026-09-22
- The approved **BOQ window** (design system: BoqWindow): floats over the 3D view (ribbon Quantities → BOQ), drag, resize, minimise, dock to the bottom panel, position remembered. Tabs Elements, Levels, Summary, Rates. Elements shows mark, ID, level, category, type, grade, length, width, depth, height, area, volume, rate and amount; sortable headers, filter and category/level pickers, virtualised rows, click to select (Ctrl adds, Shift removes).
- **Rates** per item (category + grade) with **per-element overrides**: Enter sets the item rate, Alt + Enter overrides one element, right-click switches. Overrides are keyed by GlobalId and saved per file in the browser.
- The approved **Excel format** (design system: BoqWorkbook): Summary, Levels, Elements, Rates, About; every range an Excel Table (filters, sorting, banding, totals via SUBTOTAL). Summary and Levels are live `SUMIFS` over Elements; element rates come from the Rates sheet via `INDEX/MATCH` (works in Excel 2010+ and LibreOffice) unless overridden. Indian number format for amounts.

### 0.6.0 — 2026-09-22
- BOQ tab (ribbon Quantities → BOQ): concrete quantities grouped by any mix of level, category and grade/material, with totals; click a row to select its elements; notes when volumes came from geometry.
- Export Excel: `<file> - BOQ.xlsx` with BOQ (live SUM totals, filters, frozen header), Elements (one row per element) and About (source, format rating, rules, caveats). ExcelJS (MIT) loads only on first export.
- Grade rules dialog; quantities and grade shown in Properties.

### 0.5.0 — 2026-09-21
- Compatibility badge and tips in Properties for every IFC, plus an Activity entry. See `docs/ifc-compatibility.md`.
- Marks: shown in Properties with their source, used in the status bar and in Ctrl + K search. Mark rules dialog (Model → Settings → Marks) to reorder, add or limit rules to one property set; saved in the browser.

### 0.4.1 — 2026-09-21
- Requires @shanku/engine 0.3.1 (correct quantity units on Revit exports).

### 0.4.0 — 2026-09-21
- Open DXF drawings as 2D view tabs beside {3D} (ribbon DXF button or drag and drop). Each file gets its own tab colour, like pyRevit's tab colouring.
- 2D view: AutoCAD-style middle-drag pan, wheel zoom, double middle-click fit, ZF and Home fit; theme-aware colours with colour 7 flipping black/white.
- Layers panel with filter, per-layer on/off and All on / All off; drawing properties with a units override (for files whose $INSUNITS is wrong); live X/Y cursor readout.
- Dropping a DWG explains how to convert it to DXF.

### 0.3.0 — 2026-09-21
- The bottom panel starts hidden and takes no space. Open it with Ctrl + `, by dragging up from the bottom edge of the view, or with Panel in the status bar. Its height is remembered.
- Tested with real reconstruction files: Test16 (1,493 elements) and Tower1 (14,039 elements, 29 MB, opens in about 3 s).

### 0.2.0 — 2026-09-21
- Revit controls from the navigation cheat sheet: Ctrl adds and Shift removes, window/crossing selection, Home, ZF/ZE/ZX/ZA, ZP/ZC, ZR/ZZ, HI/IC/HH/HR with the view outlined while anything is hidden, BX, WF/HL/SD/CO, Keyboard tab.

### 0.1.0 — 2026-09-21
- First release: open IFC, navigate, select, inspect properties, project browser, activity log.
