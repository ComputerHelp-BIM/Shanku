# Revit features BIM modellers use every day that Shanku lacks

Status: Analysis (2026-09-24, Shanku 0.25.0). Ordered from easy to advanced. "Effort" assumes the current architecture: IFC in a worker, three.js viewer with per-element state textures, the command registry, History transactions and the Python console.

## What Shanku already covers

Views (plans, 3D, sections and elevations, each with its own settings), the Project Browser, Visibility/Graphics, filters, view templates, section box, Temporary Hide/Isolate, Reveal Hidden Elements, temporary dimensions, Select All Instances, Select Previous, two-letter shortcuts, Repeat Last Command, Undo with named steps, BOQ with rates and Excel export, mark and grade rules, exploded views, command search (Ctrl + K), Guide & FAQ, the Python console, DXF drawings with an AutoCAD interface, and DXF → 3D.

## Tier 1: easy (days each, high daily value)

| # | Feature | Revit name / key | Why modellers use it daily | How in Shanku |
|---|---|---|---|---|
| 1 | Measure | Measure Between Two References | Checking a clear span or a cover without placing a dimension | **Built in 0.41.0 (3D, plans, sections, elevations):** distance with snaps and Tab, clear & C/C, along, face area, chain. DXF view next. |
| 2 | Filter selection | Modify → Filter | Box-select a floor, then keep only beams | A dialog of category counts with checkboxes, like the Quick Select panel. It needs the selection plus a category set. |
| 3 | Tab cycling | Tab | Picking the beam under a slab edge | **Built in 0.41.0:** elements under the cursor front to back, then a chain of joined walls or beams; "2 of 3" shown over the view; the choice is outlined through what is in front. |
| 4 | Selection sets | Manage → Save / Load Selection | Coming back to "Level 3 transfer beams" | Named sets saved with the session. They show in the Project Browser and the palette, and Python can read them. |
| 5 | Thin lines | TL | Reading dense plans | One uniform in the edge material and a toggle in the view bar. |
| 6 | Selection toggles | Select links / pinned / by face | Stopping accidental picks | Pick filters by category (for example, never pick slabs) in the status bar. |
| 7 | Keyboard shortcut editor | KS | Keeping office-standard shortcuts | Edit `SEQUENCES` per user in localStorage. The command registry already names every action. |
| 8 | Crop region | Crop View / Crop Region Visible | Framing a plan or a section | A 2D rectangle per view in clip space. It reuses the section-box clipping. |
| 9 | Spot elevation and coordinate | SE / Spot Coordinate | Checking top of beam levels | A temporary annotation from a picked point's Z (or X and Y) relative to the project base. |

## Tier 2: medium (1–3 weeks each)

| # | Feature | Revit name | Why | How in Shanku |
|---|---|---|---|---|
| 10 | Schedules | View → Schedules | Every take-off and every check | Table views per category with chosen fields, sorting, grouping, totals and filters. Clicking a row selects the element. Export to CSV or Excel. The BOQ grid is the starting point. |
| 11 | Tags | Tag by Category, Tag All (TG) | Marks on plans for site drawings | Display-only tags from the mark rules, placed automatically and kept apart by leader rules. They are saved per view. |
| 12 | Saved dimensions and text | DI, TX | Marking up clear spans and notes | Persistent annotations per view, undoable. Temporary dimensions can be made permanent with one click, as in Revit. |
| 13 | Revision clouds and markup | Revision Cloud | Review comments | Markup per view, exported as BCF. This links to revision-timeline.md. |
| 14 | CAD underlay | Link CAD | Checking the model against the architect's plan | Draw a DXF inside a plan view at its level with a halftone option. Both viewers exist; this joins them. |
| 15 | Linked models | Manage Links | Architecture and structure together | Several IFCs in one scene, each with an offset and its own visibility. Element ids become (model, index). |
| 16 | Sheets and PDF | Sheets, Print | The deliverable | A title block with viewports at a scale, exported to PDF with vector lines. Start with one view per sheet. |
| 17 | Interference check | Collaborate → Interference Check | Checking beams against ducts, and columns against openings | A broad phase on element bounds, then a triangle-level narrow phase in a worker. The results use the actionable-QA finding shape. |
| 18 | Scope boxes | Scope Box | The same crop on many plans | A named box that drives the crop and section box of the views that use it. |

## Tier 3: advanced (a month or more each)

| # | Feature | Revit name | Why | How in Shanku |
|---|---|---|---|---|
| 19 | Modify tools | MV, CO, RO, MM, AR, AL, TR, OF, SL | Everyday model edits | Edit IFC placements and profiles with History transactions, then write the IFC back. The DXF menu already shows these entries greyed out. |
| 20 | Families and types | Edit Family, Type Properties | New column or beam sizes | A parametric profile catalogue (rectangle, circle, I and T sections), with a type editor that updates all instances. |
| 21 | Structural framing tools | Beam, Beam System, Column, Wall, Floor | Modelling, not just viewing | Placement on grids and levels with snapping and auto-join. The DXF → 3D builder is the first step. |
| 22 | Rebar | Rebar, Area and Path Reinforcement | Detailing | Bar shapes from IS 2502 codes, cover rules, and bar bending schedules. This is large but a strong fit for the Indian market. |
| 23 | Analytical model | Analytical Model | Handing off to ETABS and STAAD | Nodes and members from the physical model, then export. The Structura viewer shows what is expected on the ETABS side. |
| 24 | Worksharing | Central model, Synchronize | Teams | Live multi-user sessions (presence, element borrowing, sync) on a cloud back end. The local-only design stays the default. |
| 25 | Automation | Dynamo, Revit API | Repetitive work | Python macros (python-macros.md). Their recording and replay reuse the command registry. |

## Recommended next three

1. **Measure and Filter selection**, from Tier 1. They are small, used constantly, and reuse existing code.
2. **Schedules**, from Tier 2. This is what users ask for most, and the BOQ grid, the command registry and selection sync are already there.
3. **CAD underlay in plans**, from Tier 2. It joins the two viewers Shanku already has. Revit users do this every day, and it sets Shanku apart from IFC-only viewers.
