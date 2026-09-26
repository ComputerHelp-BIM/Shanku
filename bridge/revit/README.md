# Shanku Bridge for Revit 0.7.2

Connects **Revit 2025** to **Shanku** in your browser on the same computer: load the open Revit model
into Shanku, keep the selection in step both ways, edit Revit parameters from Shanku, and keep Shanku up
to date as the Revit model changes, and build the model of a DXF drawing natively in Revit (Export to
Revit). Protocol: `docs/bridge/protocol.md`.

> Autodesk, Revit and AutoCAD are registered trademarks or trademarks of Autodesk, Inc., and/or its subsidiaries and/or affiliates in the USA and/or other countries. Shanku is an independent software application developed by Computer Help and is not affiliated with, sponsored by, or endorsed by Autodesk, Inc. Shanku Bridge for Revit is a third-party add-in that uses the Revit API.

## Install

1. Close Revit.
2. Unzip `Shanku.Revit-0.7.2.zip`, open PowerShell in the folder, then:
   ```powershell
   Unblock-File .\install.ps1
   powershell -ExecutionPolicy RemoteSigned -File .\install.ps1
   ```
3. Start Revit. On the first start Revit asks about the unsigned add-in: choose **Always Load**.

Remove it with `install.ps1 -Uninstall`.

## Use

1. Open a project in Revit, then **Shanku → Connect**: Revit shows a 6-digit code (5 minutes, once).
2. In Shanku (https://shanku.vercel.app), click **Revit** in the status bar (or search *Connect to Revit*),
   enter the code, and allow Chrome's *local network access* prompt.
3. **Load from Revit** opens the model in Shanku. Select in either program and the other follows.

A browser stays paired across restarts; **Shanku → Disconnect** unpairs every browser.

## What it does, and does not do (0.7.2)

- Loading exports IFC4 Reference View inside a transaction that is rolled back, so the model is never
  changed. Selection sync only selects.
- Live updates only read: Revit exports the changed elements in the background (the export transaction
  is rolled back); with a dialog open in Revit, Shanku waits.
- Parameter edits change the model only when you press **Apply** in Shanku's Changes window: one
  transaction named "Shanku: update N parameters on M elements", so one Edit → Undo in Revit takes it
  all back. Only instance parameters; each change is refused if the value changed in Revit since
  Shanku read it, the parameter is read-only, or the element is borrowed by someone else. Numbers are
  read in the project's units. **Check in Revit** runs the same checks and keeps nothing.
- Listens on `http://localhost:7071` for Shanku's sites only (see `shanku_bridge_config.json` for the
  port and extra sites). Nothing leaves your computer.
- Revit runs requests when it is idle: with a dialog open in Revit, Shanku waits.

## Export to Revit

Shanku's **Export to Revit** sends the drawing's model (from DXF → 3D); the add-in builds it in the open
model with that model's families:

| Drawing | Revit |
|---|---|
| Column, pedestal | `CH-Concrete-Rectangular-Column` (W, L) or `CH-Concrete-Round-Column` (W): Base Level the level below, Top Level its own (CH-LEVEL) |
| Beam | `CH-Concrete-Rectangular-Beam` (W, H), on its own level: z Justification Top, Start/End Level Offset 0, the rise or sink in z Offset Value |
| Wall (RCC / brick) | Basic Wall `CH-SHEAR-WALL-{T}` / `CH-PARDI-WALL-{T}`: Base Constraint the level below, Top Constraint its own level with Top Offset |
| Slab, chajja | Floor `{T} THK. RCC SLAB`, on its own level (sink in Height Offset From Level) |
| Footing, PCC | `CH-Concrete-Rectangular-Footing` (Width, Length, Foundation Thickness) |

A level is the top of its storey (Shanku pipeline 2.0.0): Level 1 is ±0 with the foundations below it.
Levels are matched by name, then by elevation (within 1 mm), else created; a level with the same name at
another height is reused and flagged in the review. A missing size is made by
duplicating the family's first type (walls and floors: the nearest thickness) and resizing it. Every
element gets `CH-ScheduleMark` (else `Comments`; never the built-in `Mark`, which Revit wants unique while a
drawing's marks repeat), `CH-ID` (so a second export skips it) and `CH-LEVEL`. The
drawing origin goes to the Project Base Point. After placing, each element is checked against the
drawing; columns and footings are moved or turned 90° when their family places them differently, and
anything still off is reported. Everything is one transaction group (one undo); the check before is a
dry run that is always rolled back.

Change families, sizing parameters and type-name patterns in `shanku_export_config.json` (in the add-in
folder; read on every export, no restart).

## Troubleshooting

| Symptom | Fix |
|---|---|
| No Shanku tab | Check `%APPDATA%\Autodesk\Revit\Addins\2025\Shanku.Revit.addin` exists; see `%APPDATA%\Shanku\bridge.log`. |
| Connect says the port is in use | Set another `port` in `shanku_bridge_config.json` (in the add-in folder) and in Shanku's Revit window. |
| Shanku says "Revit not found" | Revit is closed, the add-in is not loaded, or Chrome's local network access was blocked (site settings). |
| Load takes long | Large models export slowly; Shanku waits up to 10 minutes. Close dialogs in Revit. |

Log: `%APPDATA%\Shanku\bridge.log`.

## Build

Needs the .NET 8 SDK (not Revit): `.\build.ps1` runs the tests, builds, and assembles `dist\`.

## Changelog

### 0.7.2 — 2026-09-26
- Requests from Shanku run at once. Revit runs external events when its window processes messages,
  so with Revit idle in the background a request could wait until the mouse moved over Revit. After
  raising the event the add-in posts an empty message (WM_NULL) to Revit's main window to wake it.

### 0.7.1 — 2026-09-26
- Fixed: a sunk beam (drawing −1500) got z Offset Value −3000. The placement check measured the beam's
  bounding box, which for this family still reached the level, and lowered it a second time. Beams and
  slabs are now placed in two steps: offset 0 first, their real top (solid geometry, not the bounding
  box) measured against the level and corrected if the family places it elsewhere, then the drawing's
  offset added. Afterwards they are only measured (on their solids) and reported, never moved again.

### 0.7.0 — 2026-09-26
- Export to Revit hosts each element on its own level (CH-LEVEL), the top of its storey: columns from
  the level below up to it, walls base on the level below with Top Constraint on it and a Top Offset,
  beams and slabs hanging from it, foundations on Level 1 (±0). Before, a nearest-level guess put
  columns and beams one storey up and left walls unconnected.
- Marks go to CH-ScheduleMark (else Comments), never the built-in Mark, which Revit wants unique.
- A level with the same name at another height is flagged in the review (`exists-elsewhere`).

### 0.6.1 — 2026-09-26
- Fixed: exported beams sat 1500 mm (or more) below their height. Beams took their offset in
  Start/End Level Offset while the family added its own default z Offset Value, so the two added up.
  A beam is now top-justified with Start/End Level Offset 0 and its rise or sink in z Offset Value only;
  every value is set explicitly. The placement check also corrects a beam's or slab's height through
  its offset parameter when it still differs from the drawing.

### 0.6.0 — 2026-09-25
- Export to Revit (`/model/create`, feature `create`): native levels, types and elements from Shanku's
  exchange, dry run, one undo, placement check with corrections; `shanku_export_config.json`.

### 0.5.0 — 2026-09-25
- Live updates: a `DocumentChanged` handler collects the model elements modified, added and deleted (by
  anyone, and by Shanku's Apply) and sends one `changes` event 0.6 s after a burst of changes; deleted
  elements are named from the add-in's id map.
- `/model/export` with `{ globalIds }` exports only those elements: a temporary 3D view isolating them,
  exported with the same options (so coordinates and GlobalIds match the full export), inside the
  transaction that is rolled back. `/hello` lists `changes` and `partial-export`.

### 0.4.0 — 2026-09-25
- Numbers: each number parameter carries the project's display unit symbol ("mm", "m³"…) for Shanku to
  show. When Revit's `SetValueString` refuses the text, the add-in reads it itself: "600", "600.000",
  "600,5", "600 mm", "0.6 m" (no unit: the project's display unit), converted to Revit's units.

### 0.3.0 — 2026-09-25
- Parameters are read the way the Properties palette shows them (`GetOrderedParameters`): no hidden
  schedule copies (a second Base Level, Base Offset, Category…), in the palette's order. Adds the family
  name and the type's parameters (read-only).
- **Check in Revit** now reports Revit's warnings (duplicate marks…): the dry run commits inside a
  transaction group that is always rolled back, so warnings are raised and nothing is kept, whether or
  not a warning comes up. Warning text is tidied (no "..").

### 0.2.0 — 2026-09-25
- Parameter editing (milestone 2): `/params/read` (instance parameters with group, kind, value,
  read-only reason) and `/params/write` (one transaction, a sub-transaction per change, conflict and
  worksharing checks, dry run, Revit warnings collected instead of dialogs). `/hello` lists `features`.

### 0.1.0 — 2026-09-24
- First release (milestone 1): pairing with a one-time code, load the model as IFC4 RV, selection sync
  both ways, Shanku ribbon tab (Connect, Disconnect, Open Shanku), log file.
