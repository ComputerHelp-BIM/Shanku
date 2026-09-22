# IFC compatibility

Shanku rates every IFC file it opens and shows the result in Properties (with nothing selected) and in the Activity log.

| Rating | Export | Why |
|---|---|---|
| **Recommended** | **IFC4 Reference View [Structural]** | Current, certified schema. Keeps extrusions for beams, columns and slabs; quantities for every element including stairs; opens fastest in tests. |
| Supported | IFC2x3 Coordination View 2.0 | Mature and fine for viewing and BOQ, but stairs get no quantities. |
| Supported | IFC4 Design Transfer View | Works and carries material profile sets (useful for editing later), but Revit marks it unofficial. |
| Experimental | IFC4x3 | Revit's IFC4x3 export is experimental. |
| Limited | GSA, FM Handover, COBie, IFC2x2, IFC-SG | Built for handover or regulatory checks, not structural models. |

Whatever the format, Shanku also warns when base quantities, Revit property sets or levels are missing, because the BOQ, marks and per-level schedules depend on them.

## Recommended Revit 2025 setup ("Shanku Structural")

Start from **IFC4 Reference View [Structural]**, choose **Modify setup…**, duplicate it, and set:

| Tab | Setting | Value |
|---|---|---|
| General | Split walls, columns, ducts by level | On |
| General | Phase to export | Final phase |
| Additional Content | Export only elements visible in view | On (export from a structural 3D view) |
| Property Sets | Export Revit property sets | On |
| Property Sets | Export IFC common property sets | On |
| Property Sets | Export base quantities | On |
| Level of Detail | Detail level | Medium |
| Advanced | Store the IFC GUID in an element parameter after export | On, then **save the Revit model** |

## Evidence (UMA NIWAS, Revit 2025, 1,086 elements)

| Export | Size | Opens in | Quantities | GlobalIds stable |
|---|---|---|---|---|
| IFC4 Reference View [Structural] | 7.7 MB | 0.4 s | all, incl. stairs | yes |
| IFC2x3 CV2.0 (Shanku settings) | 6.9 MB | 0.4 s | all except stairs | yes |
| IFC4 Design Transfer View | 9.1 MB | 0.5 s | all | yes |

Quantity volumes match the 3D geometry exactly (slabs 367.43 m³, columns 223.68 m³, beams 212.81 m³).

## Marks

Shanku detects each element's mark from its properties, first match wins. Default order: `Mark`, `Schedule Mark`, `ID`, `Type Mark`, `Comments`. Change it in **Model → Settings → Marks** (or "Mark rules…" in Properties). A rule can be limited to one property set, e.g. `01--COLUMN_M.ID`. Rules are saved in the browser and apply to every model you open.
