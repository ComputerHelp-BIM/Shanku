# Datums, work planes, hosting and constraints (design; approved 2026-10-01)

Decided 2026-10-01: **24A** elements are placed as Revit places them (relative to levels, with offsets and
attachments), now; **25A** the first build is a complete slice — levels, grids, reference planes, work
planes, hosting, attachments, Align locks, and Move rebuilt on them; **26A** a family editor later, on the
same foundation, aiming past Revit's (with ideas from Bonsai, Blender and SketchUp).

Why first: Revit's Move, Align, Copy and the create tools feel robust because of what sits under them — datums
to snap and lock to, a work plane per view, elements placed relative to levels, and constraints that hold.
Building more tools on absolute heights would mean redoing each of them later.

## Datums: real, editable elements

| Datum | What it is | Shown in |
|---|---|---|
| **Level** | name, elevation; "building storey" on or off | elevations, sections (head, line); plans are made from them |
| **Grid** | name (A, B, 1, 2…), a line (later an arc or multi-segment) and its extent | plans, elevations, sections (bubbles) |
| **Reference plane** | a named plane you draw — vertical in plans, any in elevations and sections | where drawn, and views it crosses |
| **Section / elevation plane** | the plane of a section or elevation view | as section and elevation marks (with the views work) |

Datums are moved, renamed and deleted like elements (with undo); levels and grids from IFC (IfcBuildingStorey,
IfcGrid) and from DXF → 3D become datums.

## Work planes

Every view has one: a plan's is its level (at the level's elevation); an elevation's or section's is its own
vertical plane. Tools draw and move in the active view's work plane; "Set work plane" picks a level, a grid,
a reference plane or a face. In 3D the work plane is the one last set (Revit's rule).

## Hosting (24A)

| Element | Placed by |
|---|---|
| Column, pedestal | base level + base offset, top level + top offset; point, rotation, profile |
| Beam | reference level; start and end offsets from it (a sloped beam: different offsets); line, section, justification |
| Wall | base level + offset; top: a level + offset, or unconnected height; line, thickness |
| Slab | level + height offset; outline; thickness |
| Footing, PCC | host level + offset; point or outline; depth |

An element's heights are computed from its levels: change a level's elevation and everything placed on it
follows — columns stretch, beams and slabs move with it. Existing models convert automatically (each element's
heights → the nearest levels by Shanku's level rule, with offsets for the rest), and the `.shkp` element schema
grows these fields (an addition: older files still open).

## Constraints, first set

- **Attachments:** an element's base or top attached to a level (as above) — the commonest constraint, kept by
  hosting itself.
- **Align locks:** after Align, a padlock locks the element's face or centre to the reference (a grid, a
  reference plane, another element's face); moving either moves both, or asks.
- **When an edit would break a constraint:** Revit's "Constraints are not satisfied" — **Remove constraints**
  (the edit goes ahead, the locks involved are removed) or **Cancel** (nothing changes).
- Later: dimension constraints (locked dimensions, EQ) — the next step after this build — and the family
  editor's parameters on the same mechanism.

## Move, rebuilt Revit's way

- **Select before or after** starting Move (MV); Enter or a right-click finishes selecting.
- **Start point, end point:** both picked with snaps (end, mid, centre, intersection, grid intersections, datum
  lines, nearest); a temporary "listening" dimension shows the distance — type a number and Enter to move by
  it along the direction shown.
- **Options bar:** Constrain (horizontal or vertical only), Disjoin, and for Copy, Multiple.
- **Ortho by default when close to 0° / 90°**, as Revit's angle snapping.
- **In the work plane:** plans move in X and Y; elevations and sections move along their plane — vertically,
  which changes **offsets** from the host levels, not absolute heights; an element attached to a level asks
  (Remove constraints / Cancel) before it is detached.
- The typed-value dialog stays as an alternative (useful for exact moves without picking).

## Order inside the build

1. Datums as elements (levels, grids, reference planes), from IFC and DXF; drawing and editing them.
2. Hosting: the element model on levels and offsets, conversion, `.shkp` fields; levels that move their elements.
3. Work planes; the picking and snapping engine (shared by every tool after).
4. Align with locks; constraint checks and the Remove constraints dialog.
5. Move rebuilt; then Copy, Rotate and Mirror on the same picking (they gain most from it).

## Out of this build

Dimension constraints (EQ, locked), the family editor, arcs and multi-segment grids, sloped levels, section and
elevation marks (with the views work), Sync with Revit (it will carry hosting across: Revit's own model).

## Progress

- **Hosting — done (engine 0.38.0, web 0.52.1):** the element model on levels and offsets; every native edit
  keeps it; saved in the `.shkp`. On adani.ifc all 4,440 converted elements host with exact heights and natural
  offsets (columns and beams on their levels, walls 650 under them, footing-to-plinth columns on Level 1).
- **Levels — done (web 0.53.0, engine 0.39.0):** the Levels window (LL): move a level and what is hosted on it
  follows (one undo), add levels, delete added empty ones; the model's own levels follow; saved in the `.shkp`.
- **Next:** the picking and snapping engine and work planes; grids and reference planes drawn with it; Align
  with locks; Move rebuilt. Renaming levels and deleting levels from the model come with the views work.
