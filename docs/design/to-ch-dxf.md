# → CH DXF: the exact reverse of DXF → 3D (design, for approval)

Decided with the team, 2026-09-30: sets 2A, 3A, 7A (7B later), 8A, 9A. Stairs: a CH convention next, from a
drawing the team sends (set 12A).

## One neutral model, one writer

Every source becomes the **exchange model** Export to Revit already uses (levels, and elements with kind,
outline or centre and size, heights, mark, level), and one writer turns it into CH-format DXF:

```
DXF (CH) ──┐                          ┌──► CH DXF   (this design)
IFC ───────┤                          ├──► IFC4
Revit ─────┼──► exchange model ───────┤
ETABS e2k ─┤   (levels, elements)     └──► Shanku project file
Shanku file┘
```

**First source: IFC** (3A) — Shanku's own DXF → 3D models, IFC exported from Revit, and IFC from other
programs. Then Revit through the bridge (exact levels, offsets, sizes and marks), then ETABS `.e2k`.
glTF, OBJ and STL can be viewed, not converted: they do not say what is a column or a beam.

## The drawing (2A, 7A)

- **One DXF, a frame per level, identical floors merged** into one frame labelled "2-4", as the team draws.
- **Exactly what DXF → 3D reads, plus the grid:** frames and their level titles, CH layers (`CH-Column`,
  `CH-Beam`, `CH-Slab`, walls, footings, PCC, pedestals, openings), closed outlines, one label inside each in
  the CH form (`docs/dxf-format.md`: offset below the storey top, size, mark). Dimensions, grid bubbles and
  title blocks come later (7B).

## From IFC to the exchange model

| Element | Outline and size |
|---|---|
| Column, pedestal | plan section at mid-height: rectangle (width × length, rotation) or circle |
| Beam | plan outline of the member; depth from its geometry; offset below its level (sink) |
| Wall | plan outline; thickness; height to the level above, top offset |
| Slab | its footprint (holes kept); thickness; offset below its level |
| Footing, PCC | plan outline; top and bottom levels |
| Openings (doors, windows) | position in their wall, sill and head |

Levels follow Shanku's one definition (`docs/design/levels.md`): an element's level is the lowest level at or
above its top; offsets are measured below that level's top, as the CH labels expect.

## What does not fit (8A, 9A)

- **Approximated where it is safe, reported otherwise:** a slightly sloped beam gets its average height; a
  curved wall its polyline; stairs and ramps are listed in the report, not drawn, until the CH stair
  convention exists.
- **Missing marks are numbered in CH style** (C-1, B-1, … per level, in a stable order: level, then plan
  position) and listed in the report, so the drawing goes straight back through DXF → 3D.
- The report opens beside the result, each item with Show (zoom to it), as DXF → 3D's checks do.

## Proof: the round trip

Automatic tests on the team's drawings: DXF → 3D → DXF → 3D gives **the same elements, levels, marks and
quantities**, and DXF → 3D → DXF gives a drawing DXF → 3D reads without new findings. An IFC from Revit goes
through the same checks against its own quantities.

## Where it lives

The writer in Python beside the reader (`packages/engine/src/pipeline/ch_dxf_writer.py`, ezdxf, run in
Pyodide as DXF → 3D is), sources in `pipeline/sources/` (IFC first); in the app, a **Convert** menu offering
every direction from what is open (→ IFC, → Shanku project, → CH DXF).

## Milestones

1. IFC → exchange (columns, beams, walls, slabs, footings); the CH writer (frames, merged floors, layers,
   outlines, labels, grid); the report; round-trip tests; Convert → CH DXF.
2. Openings; Revit through the bridge as a source.
3. Stairs (after the CH stair convention); ETABS `.e2k`; drafting extras (7B).
