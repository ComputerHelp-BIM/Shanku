# Levels: one definition for Shanku and Revit

**An element's level is the lowest level at or above its top.**

This is Revit's structural convention and the Computer Help drawing convention, and it is the only
definition Shanku uses: for DXF → 3D models, models loaded from Revit, and any other IFC.

| Element | Its level | Revit parameters (Export to Revit) |
|---|---|---|
| Column, pedestal | the level it rises to | Base Level: the level below; Top Level: its level |
| Wall | the level it rises to (a free-standing wall: the level that closes its storey) | Base Constraint: the level below; Top Constraint: its level, Top Offset (e.g. −beam depth) |
| Beam | the level it hangs from, sunk or with an upstand up to 600 mm | Reference Level: its level; z Justification Top; the sink or rise in z Offset Value; Start/End Level Offset 0 |
| Slab, chajja | the level it hangs from | Level: its level; the sink in Height Offset From Level |
| Footing, PCC, pedestal | Level 1 (±0) | on Level 1, negative offsets |
| Anything above the highest level (roof parapet) | the highest level | |

## Levels themselves

A level is the **top** of its storey. The DXF frame labelled Level n holds the structure below Level n;
Level 1 (the foundation frame) is ±0; Level n sits at the sum of the storey heights up to it (pipeline
2.0.0).

## Files whose levels are floors

Many IFCs from other programs use the opposite reading: a storey's elevation is its floor, its contents
rise above it, and there is no level at the roof. Read by tops, such a file's top storey would rise above
every level and merge into the one below. Shanku recognises it — more than 15 % of the elements finish
above the highest level (`FLOOR_FILE_SHARE`) — and keeps the file's own storeys. Properties shows which
reading applies (Levels: "Top of storey" or "As filed (floor levels)"). Models from the DXF → 3D
pipeline and from the R25 template always have a level at each storey top, so they read by tops.

## Where it lives

- **Shanku:** `packages/engine/src/model/levelRule.ts` (`assignLevels`, `levelOf`), applied when a model
  loads. Level heights: each storey's declared elevation, moved by the file's origin shift. Beams, slabs
  and footings may rise `UPSTAND_TOLERANCE` (600 mm) above their level; everything else follows its top
  exactly (5 mm rounding).
- **What is kept beside it:** `storey`, the IfcBuildingStorey the file uses (Revit files columns and
  walls under their base level), shown as "IFC storey" in Properties; `chLevel`, the CH-LEVEL label,
  shown when it differs.
- **CH-LEVEL** is a label that Export to Revit writes and your team keeps up to date. Shanku never
  lets it override the geometry; QA "CH-LEVEL differs from the level" lists stale labels (for example
  after copying a floor in Revit).
- **The pipeline** (`dxf2ifc.py`) and **Export to Revit** (`ExportPlanner.OwnLevel` / `BaseLevel`)
  follow the same definition, so a round trip DXF → Shanku → Revit → Shanku keeps every element on the
  same level.
