# @shanku/engine 0.2.0

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

### 0.2.0 — 2026-09-21
- Breaking: `onPick(index, additive)` became `onPick(index, mode)` with Revit rules (Ctrl adds, Shift removes).
- Added window/crossing box selection, zoom region, previous view history, Home, temporary hide/isolate, section box with clipping, and four visual styles.
- Hover is an orange outline with a faint tint, as the design system specifies, instead of a fill.
- Fit is tight to the projected box of the model or selection.

### 0.1.0 — 2026-09-21
- First release: worker-based IFC parsing, merged mesh and feature edges, state texture, ID-buffer picking, Revit pan/orbit/zoom, theme-aware colours.
