# @shanku/web 0.7.0

The Shanku app. Requires `@shanku/engine >= 0.6.0`, `@shanku/ui >= 0.3.0`, `@shanku/tokens >= 1.0.0`.

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
