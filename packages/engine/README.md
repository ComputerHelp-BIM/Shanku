# @shanku/engine 0.14.0

The Shanku model engine: IFC loading, the element model, and the 3D viewer.

- **IFC loading** with web-ifc (MPL-2.0) inside a Web Worker, so the UI never blocks. `IfcClient` gives a promise API; properties are read on demand.
- **One draw call** for the whole model: geometry merged into one indexed mesh, plus feature edges (boundary and > 30° creases only).
- **Per-element state on the GPU** (selected, hover, hidden) in a small texture, so selection never rebuilds geometry.
- **ID-buffer picking**: one pixel rendered per pick, constant time regardless of model size.
- **Revit navigation and commands** in `Viewer` (see below). Colours come from `@shanku/tokens` at runtime, so the view follows Paper and Ink.

Requires `three` 0.186 and `web-ifc` 0.0.77. The app must serve `web-ifc.wasm` and pass its folder to `new IfcClient(wasmPath)`.

## Viewer

| Input | Behaviour |
|---|---|
| Middle-drag | Pan |
| Shift + middle-drag | Orbit about the selection (else the section box, else the model) |
| Wheel | Zoom about the cursor |
| Double middle-click | Zoom to fit |
| Alt + left-drag / Alt + Shift + left-drag | Orbit / pan (trackpads) |
| Click · Ctrl + click · Shift + click | Select · add · remove (`onPick(index, mode)`) |
| Left-drag left → right / right → left | Window / crossing box select (`onBoxSelect`) |

Methods: `fit(indices?)` (ZF/ZE/ZX/ZA), `home()`, `setView(view)`, `previousView()` (ZP/ZC), `startZoomRegion()` (ZR/ZZ), `setHidden(indices)` (HH/HI/IC/HR), `setSectionBox(indices | null)` (BX), `setDisplayStyle('shaded' | 'consistent' | 'hiddenLine' | 'wireframe')` (SD/CO/HL/WF).

## DXF 2D view

`src/dxf/extract.py` uses ezdxf's own drawing front end, so blocks, dimensions, leaders, hatches and BYLAYER/BYBLOCK colours resolve as ezdxf renders them. Linetypes are drawn solid for speed. Text is placed by insertion point, height, rotation and alignment in the app's UI font (not the drawing's SHX font). Coordinates are rebased to the drawing's lower-left corner for float precision; the cursor readout adds the origin back.

The first DXF in a session downloads Python and ezdxf from jsDelivr and PyPI (about 15 MB, then cached by the browser). The drawing itself never leaves the device. Measured in headless Chromium: a 0.4 MB drawing opens in 6.7 s including that first download; the 23.6 MB Test17 drawing (505,000 lines, 10,465 texts, 14 floor plans) opens in 26 s. Self-hosting Pyodide for offline use is planned.

## Performance (measured)

51,280-element synthetic RCC tower (615,360 triangles, 14.5 MB IFC): parsed in 3.0 s in Node, opened in 3.9 s in Chromium including worker transfer. Target: under 8 s. Run it yourself:

```bash
python tools/fixtures/make_sample_ifc.py large large-frame.ifc
SHANKU_LARGE_IFC=../../large-frame.ifc npm test -w @shanku/engine
```

## Known limits

- Crossing selection tests element bounding boxes, so a diagonal element can be caught by a box that only touches its bounds.
- The section box clips but does not cap cut faces yet.
- Perspective camera, walkthrough (WASD, Q/E) and the SteeringWheel (F8) are not implemented.

## Changelog

### 0.14.0 — 2026-09-22
- Smooth camera transitions (ease in-out, ~0.45 s) for ViewCube clicks, Home, named views and Previous / Next Pan/Zoom; respects reduced motion.
- Fixed: the orbit centre marker never showed (the orbit code path that runs did not call it).
- `zoomOut2x()`, `nextView()`, `canGoPrevious` / `canGoNext`; camera history keeps orientation (restores upside-down views correctly).
- Events: `onNavigate(active)` while orbiting, panning, zooming or animating; `onHover` carries the pointer position. DXF viewer: `onHover(entity, x, y)` once per frame.

### 0.13.0 — 2026-09-22
- Orbit no longer stops at straight down / up: the camera carries on over the top or under the bottom, and horizontal drags reverse while upside down (as in Revit), so it never gets stuck under the model.
- `setHomeView(current)` for the ViewCube's Set Current View as Home / Reset Home.
- Temporary dimensions: 3D (length, width, height in mm on the edges of a single selected element that face the camera, read-only) and 2D (`tempDims`: an object's own sizes, the distance from each straight edge to the nearest parallel line outside it, or between two selected parallel lines). The DXF view draws a thick highlight, AutoCAD grips (vertices and midpoints) and the dimensions.

### 0.12.0 — 2026-09-22
- Selected elements draw see-through (Revit-like): they move to the transparent pass, so what is behind them stays visible.
- Section cuts read as solid: the cap colour is now a flat concrete tone between the top and side faces, not a dark hole.
- Orbit shows the centre of rotation while dragging (selection, else section box, else model).
- Selection box follows AutoCAD: drag right = window (blue, solid, fully inside), drag left = crossing (green, dashed, anything touched). Same in the DXF viewer, which gained box selection (`selectInRect`), multi-object highlight and per-entity bounds.
- `refreshTheme()` on both viewers, for a canvas theme separate from the interface theme.

### 0.11.0 — 2026-09-22
- Added transactions modelled on the Revit API (`History`, `Transaction`): named transactions that commit as one undo step or roll back completely, one open at a time, groups with `assimilate()` / `rollBackGroup()`, undo/redo lists and listeners. Built to be opened to plugins.
- Viewer: `lookFrom(dir)` for the ViewCube (plan views north-up), `orbitBy`, `orientation`, `onCamera`; `setEdges`; `setReveal` (hidden elements in Revit's reveal magenta, pickable); `setSectionBoxState` + `onSectionBoxEdit` so section-box edits are transactions (the viewer's private undo stack is gone); bottom view.

### 0.10.0 — 2026-09-22
- Fixed: orbiting froze at the top and bottom (straight down or up). Orbit now rotates the camera's own orientation about its right axis instead of re-aiming with lookAt, which is undefined at the poles. Regression tests added.
- Pipeline 1.2.0: a wall with windows or doors is one closed tessellated solid (`IfcPolygonalFaceSet`) with the holes in it. Several touching extrusions made Revit merge the pieces and drop some. Tested watertight, outward-facing and exact net volume; on the sample all 212 walls match the BOQ within 0.00004 m³.

### 0.9.0 — 2026-09-22
- Fixed (pipeline 1.1.0): IFC for Revit. Walls now carry window and door holes in their own geometry (Reference View), with no opening elements, voids or fills, which Revit reported as "not cutting anything". Every element was also listed twice in its type relationship; now once.
- Pipeline 1.1.0: stacked identical outlines with one label are built once (warning) instead of skipped.
- Windows and doors render as glass (a transparent second pass).
- DXF extractor 1.1.0: every line, fill and text records its DXF object; `DrawingViewer.pickAt` / `select` pick with a CAD pick box and highlight; `DxfClient.entity` returns object properties; drawings stay open in the worker until `forget`.
- One Pyodide constant (`@shanku/engine/pyodide`) for all workers.

### 0.8.0 — 2026-09-22
- Added the DXF → 3D pipeline (`src/pipeline/dxf2ifc.py` 1.0.0): reads the Computer Help format (see `docs/dxf-format.md`) and writes IFC4 with storeys, extrusions, openings, types, materials, `Shanku_DXF` properties, base quantities and stable GlobalIds; checks with locations. Runs in the DXF worker (`DxfClient.pipeline`) and in CPython (pytest).
- Windows and doors carry no BOQ volume. The "no Revit property sets" hint only appears for files authored in Revit.

### 0.7.0 — 2026-09-22
- Section box, Revit-style: six arrow grips move one face each along its own direction at any view angle (Shift snaps faces to 100 mm), a ring rotates the box in plan (Shift: 15°), the box outline always shows, `undoSectionBox()` steps back through edits, and cut members are capped with a flat cut colour so sections read solid. Maths in `render/sectionBox.ts` (tested); `onSectionBoxChange` event.

### 0.6.0 — 2026-09-22
- Added `ElementRecord.dims` (length, width, depth, height in m, null where not meaningful): IFC Width/Depth/Height/Length and cross-section area where reliable, element bounds otherwise.

### 0.5.0 — 2026-09-22
- Added BOQ quantities per element: `volume` (m³), `length` (m, columns and beams), `area` (m², slabs and walls), `quantitySource` ('ifc' | 'geometry'). IFC base quantities are read in one pass and converted to SI; files without them fall back to volumes computed from the geometry (divergence theorem), which matched IFC quantities to 0.1 % on UMA NIWAS.
- Added `grade` / `gradeSource`: configurable rules (`DEFAULT_GRADE_RULES`), then the IFC material name (element or its type). `IfcClient.grades(rules)` re-detects.
- Added `buildBoq(elements, levels, groupBy)`: rows by any mix of level, category and grade, sorted by elevation and category, with totals.

### 0.4.0 — 2026-09-21
- Added IFC compatibility rating (`info.compatibility`: recommended / supported / limited / experimental, with fix-it notes), from schema, view definition, quantity sets, Revit property sets and levels.
- Added mark detection: `ElementRecord.mark` and `markSource`, from configurable rules (`DEFAULT_MARK_RULES`: Mark, Schedule Mark, ID, Type Mark, Comments; `PsetName.Property` for one set). One pass over property relationships. `IfcClient.marks(rules)` re-detects on the open model.

### 0.3.1 — 2026-09-21
- Fixed: quantity lengths showed as metres on Revit exports. Units now come from the project's IfcUnitAssignment only; Revit also writes a stray metre IfcSIUnit that used to override millimetres. Values were right, the unit label was wrong.

### 0.3.0 — 2026-09-21
- Added DXF 2D viewing: `DxfClient` runs ezdxf 1.4.4 (MIT) in Pyodide 0.27.7 (MPL-2.0) inside a worker; `DrawingViewer` draws lines and fills on the GPU and text on a canvas overlay, with AutoCAD pan/zoom and per-layer visibility.
- Added `resolvePalette`: colour 7 follows the theme; colours too close to the background are pulled toward the foreground so every layer stays readable in Paper and Ink.
- Python extractor `src/dxf/extract.py` 1.0.0 with pytest tests.

### 0.2.0 — 2026-09-21
- Breaking: `onPick(index, additive)` became `onPick(index, mode)` with Revit rules (Ctrl adds, Shift removes).
- Added window/crossing box selection, zoom region, previous view history, Home, temporary hide/isolate, section box with clipping, and four visual styles.
- Hover is an orange outline with a faint tint, as the design system specifies, instead of a fill.
- Fit is tight to the projected box of the model or selection.

### 0.1.0 — 2026-09-21
- First release: worker-based IFC parsing, merged mesh and feature edges, state texture, ID-buffer picking, Revit pan/orbit/zoom, theme-aware colours.
