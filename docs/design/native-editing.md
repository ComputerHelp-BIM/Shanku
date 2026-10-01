# Native editing (design; approved 2026-10-01)

Decided 2026-09-30: **16A** parametric elements are the model, IFC is generated from them; **17A** IFC from
other software: what maps cleanly becomes editable, the rest is read-only reference; **18B** models from
Revit are edited natively and synced to Revit later; first toolset: **Revit's Modify tab**.

## The model

Every editable element is a parametric record, the same "exchange" shape DXF → 3D and Export to Revit use:

| Kind | Defined by |
|---|---|
| Column, pedestal | point + rotation; profile (rectangle W × D, round Ø); base level + offset, top level + offset |
| Beam | line A → B; profile (W × D); level + offset (sink); justification |
| Wall | line A → B; thickness; base and top levels + offsets; justification |
| Slab | outline (polygon, holes); thickness; level + offset |
| Footing, PCC | point or outline; size; top level + offset; depth |
| Opening | host wall or slab; position; size; sill |

Each keeps its IFC **GlobalId** (its identity everywhere), mark, type, grade, parameters, and — for models
from Revit — its Revit element id and type id. Types (CH-Concrete-Rectangular-Column 300 × 600…) are a
catalogue the elements refer to.

- **Stored** in the project as `shanku/elements.jsonl` (one line per element, sorted by GlobalId) and
  `shanku/types.json` — so Git shows "C-1: 300 × 600 → 300 × 750" whatever the IFC looks like.
- **Shown** from the records directly: geometry is rebuilt in the browser for the elements an edit touches,
  so edits appear at once.
- **IFC is written** from the records on save and export, by the pipeline's IFC writer (Python, Pyodide),
  in a stable order with GlobalIds kept — the canonical `model/<name>.ifc`.

## Where elements come from

- **Shanku's DXF → 3D** and **models loaded from Revit**: all structural elements map (the exchange already
  holds them).
- **IFC from other software (17A):** rectangular and round columns, straight beams and walls, slabs with
  polygon outlines, footings map; anything else stays **reference** — shown with a lock and a tint,
  selectable and measurable, never edited, and written back unchanged.

## Editing

Every tool works on the selection (or asks for one), shows **temporary dimensions** and accepts **typed
values**, uses the existing **snaps** (end, mid, centre, intersection, grid, nearest), and ends in **one undo
step** (Ctrl + Z / Ctrl + Y; the engine's transactions). Edits are kept on the device as they happen (the
project's autosave) and saved into the `.shkp`. Pinned, reference and borrowed elements are refused with the
reason, as in Revit.

### Modify tab (Revit's names and shortcuts)

| Tool | Shortcut | Does |
|---|---|---|
| Align | AL | lines an element's face or centre up with a reference (grid, face, line); several in a row |
| Offset | OF | a beam or wall moved or copied parallel by a distance |
| Mirror – Pick Axis / Draw Axis | MM / DM | mirrored copies (or moved) about a grid, line or drawn axis |
| Move | MV | by typed ΔX/ΔY/ΔZ or two picked points |
| Copy | CO | as Move, keeping the original; Multiple |
| Rotate | RO | about a centre, by angle or picked rays |
| Trim/Extend to Corner | TR | two beams or walls meet at a corner |
| Trim/Extend Single / Multiple | — | beams or walls trimmed or extended to a boundary |
| Split Element | SL | a beam or wall split at a point (two elements, marks suffixed) |
| Array | AR | linear (count, spacing or "last") or radial; grouped or not |
| Scale | RE | as Revit: positions and lengths scaled about a base point (a beam or wall gets longer, a slab outline larger); thickness and section sizes never scale — they are types (decision 20); dropped if it proves of no use |
| Pin / Unpin | PN / UP | protects elements from changes |
| Delete | DE | with what depends on it listed (openings in a wall) |
| Match Type | MA | the type of one element given to others |
| Copy to Levels | — | the selection copied to chosen levels, offsets kept (multi-storey) |

Tools work in **plans, elevations and sections**; Move, Copy, Rotate, Mirror, Delete and Pin also in **3D**.

### Measure and dimensions (decision 21)

Both ways, to choose per use: **points**, as now (AutoCAD-style: snap to end, mid, centre, intersection), and
**faces and edges**, as Revit (hover highlights a face, an edge or a corner point; a dimension attaches to
the references picked and follows them when elements move).

## Revit (18B): edit natively, sync later

When a model loaded from Revit is edited in Shanku, **Sync with Revit** compares three states per element:
the model as loaded (the base), Shanku now, and Revit now (read through the bridge).

- Changed only in Shanku → sent to Revit (move, rotate, type, parameters exist; create, delete, copy, curve
  ends for trim/extend/split come in Shanku Bridge for Revit 0.13.0).
- Changed only in Revit → taken into Shanku.
- Changed in both → **a conflict**, listed per element with both values, for a person to choose (decision 22: never settled silently).

Sync is reviewed in Changes for Revit, checked, and applied as one undo in Revit.

## Stages

1. **The model and the first tools:** records from DXF → 3D, Revit and IFC; geometry rebuilt from records;
   undo/redo; elements in the `.shkp`; IFC written on save. Move, Copy, Rotate, Mirror, Delete, Pin, Align,
   Offset, Array (linear).
2. Trim/Extend (all three), Split, Scale, radial Array, Match Type, Copy to Levels.
3. Sync with Revit (three-way, conflicts), with Shanku Bridge for Revit 0.13.0.
4. Create tools: columns, beams, walls, slabs, footings, levels, grids (CL, BM, WA, SB, LL, GR).

## Progress

- **Stage 1 core — done (engine 0.36.0):** parametric elements; conversion from DXF → 3D and from IFC geometry,
  checked on `adani.ifc` (4,440 of 4,448 structural elements convert, each reproducing its IFC volume within
  5 %, columns and beams within 1 %; 8 stepped slabs stay reference); Move, Copy, Rotate, Mirror, Array,
  Offset, Align, Delete, Pin; undo and redo. Pure functions, unit-tested.
- **Stage 1 — done (0.52.0):** the Modify tab with typed values (Move, Copy, Rotate, Mirror, Array, Offset,
  Delete, Pin, Unpin), one undo each in the app's history; edited geometry merged into the model as live
  updates are; edits kept on the device and in the `.shkp` (`shanku/edits.jsonl`, `shanku/deleted.json`, until
  Shanku writes the IFC). First edit on adani.ifc ≈ 2.6 s (the parametric model is built), later ≈ 0.4 s.
- **Stage 1 still to come:** Align (needs picking a reference), picking points with snaps and temporary
  dimensions for every tool, Revit-style face and edge dimensions, IFC written from the edited model.
