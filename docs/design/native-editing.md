# Native editing (design, for approval)

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
| Scale | RE | **positions** scaled about a base point (a layout enlarged); section sizes are types and do not scale, as in Revit |
| Pin / Unpin | PN / UP | protects elements from changes |
| Delete | DE | with what depends on it listed (openings in a wall) |
| Match Type | MA | the type of one element given to others |
| Copy to Levels | — | the selection copied to chosen levels, offsets kept (multi-storey) |

Tools work in **plans, elevations and sections**; Move, Copy, Rotate, Mirror, Delete and Pin also in **3D**.

## Revit (18B): edit natively, sync later

When a model loaded from Revit is edited in Shanku, **Sync with Revit** compares three states per element:
the model as loaded (the base), Shanku now, and Revit now (read through the bridge).

- Changed only in Shanku → sent to Revit (move, rotate, type, parameters exist; create, delete, copy, curve
  ends for trim/extend/split come in Shanku Bridge for Revit 0.13.0).
- Changed only in Revit → taken into Shanku.
- Changed in both → **a conflict**, listed per element with both values, for a person to choose.

Sync is reviewed in Changes for Revit, checked, and applied as one undo in Revit.

## Stages

1. **The model and the first tools:** records from DXF → 3D, Revit and IFC; geometry rebuilt from records;
   undo/redo; elements in the `.shkp`; IFC written on save. Move, Copy, Rotate, Mirror, Delete, Pin, Align,
   Offset, Array (linear).
2. Trim/Extend (all three), Split, Scale, radial Array, Match Type, Copy to Levels.
3. Sync with Revit (three-way, conflicts), with Shanku Bridge for Revit 0.13.0.
4. Create tools: columns, beams, walls, slabs, footings, levels, grids (CL, BM, WA, SB, LL, GR).
