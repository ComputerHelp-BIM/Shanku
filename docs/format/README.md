# The cad2bim project format (`.c2b`), schema 3

An **open** format: IFC for the model, JSON for everything else, in a zip or a folder. Anyone can read it
without cad2bim — any unzip tool, any IFC tool, any JSON reader; the JSON files are described by the schemas
in `schemas/` (JSON Schema 2020-12). This specification is licensed CC BY 4.0.

## Files and forms

| Extension | What | Revit equivalent |
|---|---|---|
| `.c2b` | project | `.rvt` |
| `.shkf` | parametric family (later) | `.rfa` |
| `.shkt` | template (later) | `.rte`, `.rft` |

A project has **two forms with the same content**: a **folder** (for Git: one file per view, one line per
element) and a **zip** of that folder (`.c2b`, for keeping and sending). Unzipping a `.c2b` gives the
folder; zipping the folder gives a `.c2b`. cad2bim opens both. Shanku 0.50.0's `.shk` (schema 1) still opens.

```
cad2bim.json                 the manifest (required)
model/<name>.ifc            the model, IFC (required)
cad2bim/
  views.json                the views in order, each with its file: [{"id": "3d", "file": "3d.json"}, …]
  views/<id>.json           one file per view: kind, level, ranges, graphics, display, dimensions
  graphics.json             the 3D view's graphics (optional)
  rates.json                the BOQ's rates (optional)
  edits.jsonl               native edits: edited and created elements, one per line by id (optional)
  deleted.json              native edits: ids of deleted elements (optional)
  levels.json               native edits: the levels, when moved or added (optional): [{name, z}]
  datums.json               grids and reference planes (optional): [{id, kind: grid | refplane, name, a: [x, y], b: [x, y]}], plan mm
  units.json                the project's display units (optional): {length: mm | cm | m | ft-in, decimals, grouping}
  locks.json                Align locks (optional): [{id, element, datum, to: center | face}]
revit/
  link.json                 the Revit document the project is linked to (optional)
  pending.jsonl             changes staged for Revit, not yet applied: one per line (optional)
  types.jsonl, params.jsonl, levels.json   Revit data IFC does not carry (reserved; see "Revit and IFC")
```

## The manifest — `cad2bim.json`

```json
{
  "format": "cad2bim-project",
  "schema": 2,
  "app": "0.51.0",
  "name": "adani",
  "units": { "length": "mm" },
  "model": { "path": "model/adani.ifc", "fileName": "adani.ifc" }
}
```

`schema` is an integer: a reader refuses a schema newer than it knows ("saved by a newer cad2bim"), and
reads every older one. Additions that older readers can ignore do not change it; anything they would misread
does.

## Rules that keep it Git-friendly

1. **No save time, no random values in content.** When a project was saved is Git's history (or the file's
   date), not a field that changes on every save. Saving an unchanged project gives identical bytes, the
   zip form included (entries in a fixed order, a fixed timestamp).
2. **Canonical JSON:** UTF-8, LF line endings, keys sorted, 2-space indentation, a final newline.
3. **JSON Lines** (`.jsonl`) for lists of elements or changes: one compact, key-sorted object per line,
   sorted by a stable key (the element's GlobalId, then the parameter's name), so changing one element changes
   one line.
4. **One file per view** (`cad2bim/views/<file>`): the view's id made safe for file names (`/ \ : * ? " < > |`
   and spaces become `_`; a clash gets `-2`, `-3`…), the id itself kept inside the file and in `views.json`.
5. File and folder names are ASCII-safe; the model keeps its own name under `model/`.

## Native edits

Until cad2bim writes the model's IFC itself, a project keeps the IFC as it arrived plus its **edits**:
`cad2bim/edits.jsonl` holds every edited or created element as a parametric element
(`schemas/element.schema.json`: kind, mark, level, heights, its point, line or outline, and its hosting on levels), one per line,
sorted by id; `cad2bim/deleted.json` the ids deleted. Opening the project applies them to the model. These
are additions to schema 3 — older readers ignore them.

## Revit and IFC (decision 14A)

- **Parameters that fit IFC** go into IFC property sets on the element, where any IFC tool sees them.
- **What IFC does not carry** — the family and type catalogue with its parameters, parameters' Revit ids and
  storage types, levels and grids as Revit defines them — goes into `revit/*.jsonl`, keyed by the element's
  IFC GlobalId. Reserved in schema 3; filled by cad2bim Bridge for Revit's "Export to cad2bim".
- **cad2bim's own** data (views, graphics, rates) is in `cad2bim/`.

## The model

`model/<name>.ifc` is IFC as the project holds it. Until cad2bim writes IFC itself, it is the file as it
arrived; exports from Revit renumber IFC's `#` references on every export, so Git shows the IFC as changed
in bulk even when little changed. cad2bim's own IFC writer (native editing) will write it canonically.

## Before cad2bim: Shanku's files

The app was called Shanku until 0.57.0. Its project files still open and read exactly as before:

| Saved by | Extension | Manifest | Folder | Format id | Schema |
|---|---|---|---|---|---|
| cad2bim 0.57.0+ | `.c2b` | `cad2bim.json` | `cad2bim/` | `cad2bim-project` | 3 |
| Shanku 0.51.0–0.56.x | `.shkp` | `shanku.json` | `shanku/` | `shanku-project` | 2 |
| Shanku 0.50.0 | `.shk` | `manifest.json` | (single JSON) | `shanku-project` | 1 |

Schema 3 is schema 2 with the names changed: on reading, a schema-2 file's `shanku.json` and `shanku/…` entries are
taken as `cad2bim.json` and `cad2bim/…`, and nothing else differs. Saving writes schema 3, to a new `.c2b` (an older
file is never overwritten). Family (`.c2f`) and template (`.c2t`) files are reserved for later.

The IFC property set `Shanku_Structural` keeps its name: models made by the DXF → 3D pipeline carry it, and marks and
grades are read from it.
