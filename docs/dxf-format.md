# DXF → 3D: the Computer Help drawing format (source of truth)

The DXF → 3D pipeline (`packages/engine/src/pipeline/dxf2ifc.py`, version 1.0.0) reads this format and writes an IFC4 file. Everything is in millimetres. **Only closed polylines are used**; open lines, arcs, blocks and anything else on element layers are ignored and listed in the checks.

## Frames and levels

| Item | Layer | Rule |
|---|---|---|
| Frame | `Part-1`, `Part-2`, … | Closed polyline around one plan. Built in Part order (then left to right). |
| Origin | `CH-Origin` | One circle per frame; the same building point in every frame, so frames stack. |
| Level | `CH-Level` | Text inside the frame: `1`, or a range `2-4` (one plan repeated on levels 2, 3, 4). |
| Storey height | `CH-Height` | Text inside the frame, e.g. `3000`. The frame without a height is the foundation frame. |

Storeys stack from ±0 (top of pedestal) by their heights: in the sample, levels 2, 3, 4 at 0, 3000, 6000; 5, 6, 7 at 9000, 12000, 15000; 8 at 18000. The foundation level sits at the lowest foundation bottom. Level names default to "Level n" and can be changed on the import screen; storey heights can be edited there too.

## Elements: one closed outline, one label inside it

| Outline layer | Label layer | Label | Meaning |
|---|---|---|---|
| `CH-PCC` | `CHT-PCC` | `-2000,150,PC-1` | top level from ±0, thickness downward, mark |
| `CH-Footing` | `CHT-Footing` | `-1500,500,FT-1` | same |
| `CH-Pedestal` | `CHT-Pedestal` | `0,1500,PD-1` | same |
| `CH-Column` | `CHT-Column` | `T0,3000,C-1` | offset below the storey top (`T` optional), height downward, mark |
| `CH-Beam` | `CHT-Beam` | `T0,600,B-2` · `1500,600,B-1` | offset below storey top, depth, mark |
| `CH-Slab` | `CHT-Slab` | `T0,125,S-2` | offset below storey top, thickness, mark |
| `CH-Wall-RCC` / `CH-Wall-Brick` | `CHT-Wall-RCC` / `CHT-Wall-Brick` | `600,2400,W-1` | offset below storey top (the beam depth), height, mark |
| `CH-Chajja` | `CHT-Chajja` | `450,150,CH-1` | offset below storey top, thickness, mark |
| `CH-Window` | `CHT-Window` | `2,1000,1400,WN-1` | frame count (0 = not given, built as 1), sill, height, mark |
| `CH-Door` | `CHT-Door` | `1,0,2100,D1` | panel count (0 = not given, built as 1), sill, height, mark |

Windows and doors cut an opening through the wall they sit in (host found by position); without a host they are built without an opening and reported.

## What the model gets

IFC4 (Reference View header), extruded solids, storeys with your names, materials RCC / PCC / Brick by layer (concrete grade left blank to set in Shanku), types by size (`Column 230x500`, `Beam 230x600`, `Slab 125` …), property set `Shanku_DXF` (Mark, DXF label, layer, handle) and base quantities (net volume after openings, length, width, depth / height, areas). GlobalIds are derived from layer, mark, level and position, so a revised drawing keeps the same ids for unchanged elements.

## Checks

Errors skip the item: missing or extra labels in an outline, unreadable labels, identical outlines stacked on each other, frames without origin or level. Warnings build but tell you: labels outside any outline, walls taller than their storey, openings outside walls, solids overlapping in plan by more than 1 mm (touching is fine). Notes: ignored open lines, panel counts left at 0. Each check with a place has **Show**, which zooms the 2D drawing to it.

## Verified on `Full_G4-3-Parts_Input.dxf`

1,006 elements on 8 levels, 156 openings; IFC quantities equal the engine's geometry after openings (e.g. PCC 14.339 m³, footing 34.647 m³, pedestal 11.739 m³, beams 95.577 m³); 3 real drawing errors found (stacked duplicate columns C-12/C-13 twice and C-16/C-17). Read 0.5 s, IFC written 0.6 s; in the browser about 8 s the first time (Python start-up), 3 s to build and open.
