# cad2bim roadmap

<!-- Generated from apps/web/src/home/roadmap.ts by `npm run roadmap`; edit the list there, not this file. -->

Shipped work names the release that brought it. Ideas are not commitments — tell us which matter.

## Building now

### Editing

- **Move, Copy and Align polish** (update) — The refinements found in testing against Revit.

### Drawings & exchange

- **IFC writer** (new) — Download IFC with your edits in it — the base for syncing back to Revit.

## Next

### Editing

- **More Modify tools** (new) — Trim/Extend, Split, Scale, Match Type, Paste Aligned to Levels. Design: [native-editing.md](design/native-editing.md).
- **Rotate and Mirror by picking** (rework) — Centre and angle by clicking, like Move.
- **Move grids** (new) — And what is locked to them follows. Design: [datums-and-constraints.md](design/datums-and-constraints.md).
- **Align in elevations** (update) — Faces and levels, not only plans.

### Platform

- **Faster first hover** (update) — The first snap over a large model without a pause.

## Planned

### Editing

- **Create tools** (new) — Columns, beams, walls, slabs and footings, drawn in cad2bim. Design: [native-editing.md](design/native-editing.md).
- **Dimension constraints** (new) — Locked dimensions and EQ, as in Revit. Design: [datums-and-constraints.md](design/datums-and-constraints.md).
- **Families and templates** (new) — .c2f families and .c2t templates.

### Revit

- **Sync with Revit** (new) — Send cad2bim edits back to Revit; conflicts are always decided by a person. Design: [native-editing.md](design/native-editing.md).
- **Export to Revit: windows, doors and grids** (update) — DXF models built in Revit with their openings and datums.
- **Export to cad2bim, from Revit** (new) — A button in Revit that keeps what IFC drops. Design: [roadmap-archive.md](design/roadmap-archive.md).

### Drawings & exchange

- **Section and elevation markers** (new) — Markers in plans, and crop regions on views.
- **Model → CH DXF** (new) — The reverse of DXF → 3D: drawings from the model. Design: [to-ch-dxf.md](design/to-ch-dxf.md).
- **Stairs in DXF → 3D** (update) — The CH stair convention: runs and landings.
- **Sheets and PDF** (new) — Views on sheets with title blocks, printed to PDF.
- **ETABS models** (new) — Open .e2k analysis models as structure. Design: [roadmap-archive.md](design/roadmap-archive.md).

### Quantities & rebar

- **Rebar and bar bending schedules** (new) — Reinforcement in 3D and BBS to IS 2502 shapes.

### Platform

- **Versions and history** (new) — Every save kept; compare two revisions side by side. Design: [revision-timeline.md](design/revision-timeline.md).
- **Issues (BCF)** (new) — Pin an issue to a view and pass it to Revit and other tools.
- **Add-ons** (new) — pyRevit-style extensions in Python, from a folder or a Git repository. Design: [addons.md](design/addons.md).

## Ideas

### Drawings & exchange

- **Open DWG directly** (idea) — No more saving as DXF first.

### Quantities & rebar

- **Clash checks** (idea) — Members that overlap, found and listed.
- **IS 456 checks** (idea) — Cover, spacing and size rules flagged on the model.
- **Formwork quantities** (idea) — Shuttering areas beside concrete volumes.
- **Steel takeoff** (idea) — Reinforcement weight by diameter and level.
- **What changed, in quantities** (idea) — Concrete and cost differences between two revisions.

### Platform

- **Ask the model** (idea) — “Total M30 concrete on Level 4?” in plain words.
- **Tablet and phone** (idea) — Check a model on site from a tablet.
- **The model on its site** (idea) — Placed on the map, in its surroundings.

## Shipped

### Editing

- **Revit-style navigation** (new, 0.2) — View cube, orbit, pan, zoom and two-letter shortcuts.
- **Section box and exploded views** (new, 0.10) — Capped cuts with arrow grips; explode by storey, radially or by category.
- **Native editing** (new, 0.52) — Move, Copy, Rotate, Mirror, Array, Offset, Delete, Pin — one undo each. Design: [native-editing.md](design/native-editing.md).
- **Levels as datums** (new, 0.53) — Move a level and everything hosted on it follows. Design: [levels.md](design/levels.md).
- **Snaps and typed distances** (new, 0.54) — Element, datum and angle snaps; type a length and press Enter.
- **Grids and reference planes** (new, 0.54) — Drawn in plans, named 1, 2, 3 and A, B, C, shown in elevations.
- **Move, Copy and Align, Revit’s way** (rework, 0.55) — Start and end points, Constrain, Align with locks. Design: [datums-and-constraints.md](design/datums-and-constraints.md).
- **Grid underlay** (new, 0.56) — CAD-style grid in plans and elevations, Blender-style ground in 3D.
- **Visual Style menu** (update, 0.56) — Wireframe, Hidden Line, Shaded, Consistent Colors, Realistic.
- **Revit-style File menu and Modify tab** (revamp, 0.58) — Revit’s panels and order; Quick Access Toolbar.

### Revit

- **cad2bim Bridge for Revit** (new, 0.32) — Load the open Revit model, sync selection, edit parameters and types, build DXF models natively.

### Drawings & exchange

- **IFC viewer** (new, 0.2) — IFC2x3 and IFC4 from Revit and other tools, 50,000 elements smooth.
- **DXF drawings** (new, 0.4) — Linework and layers from AutoCAD and other CAD programs.
- **DXF → 3D** (new, 0.11) — CH-format drawings become an IFC4 model.

### Quantities & rebar

- **BOQ with rates** (new, 0.6) — Element-wise quantities, rates and overrides, to Excel with live formulas.
- **QA checks** (new, 0.5) — Every IFC rated, with the Revit export settings that improve it.

### Platform

- **Python console** (new, 0.8) — Ask the model questions in Python, in the browser.
- **Project files** (new, 0.50) — An open project format: model, views, edits and settings in one file. Design: [project-file.md](design/project-file.md).
- **Works offline** (new, 0.50) — After the first visit the app opens without a connection.
- **Project Units** (new, 0.54) — mm, cm, m or feet-inches, with Indian or international grouping.
- **Faster tools on big models** (rework, 0.56) — Snapping three times quicker on a 14,000-element tower.
- **Shanku becomes cad2bim** (revamp, 0.57) — New name, .c2b projects; every older file still opens.
- **This homepage and roadmap** (revamp, 0.59) — A drawing sheet you can scroll through; the guide brought up to date.
