# The Shanku project format (`.shkp`), schema 2

An **open** format: IFC for the model, JSON for everything else, in a zip or a folder. Anyone can read it
without Shanku — any unzip tool, any IFC tool, any JSON reader; the JSON files are described by the schemas
in `schemas/` (JSON Schema 2020-12). This specification is licensed CC BY 4.0.

## Files and forms

| Extension | What | Revit equivalent |
|---|---|---|
| `.shkp` | project | `.rvt` |
| `.shkf` | parametric family (later) | `.rfa` |
| `.shkt` | template (later) | `.rte`, `.rft` |

A project has **two forms with the same content**: a **folder** (for Git: one file per view, one line per
element) and a **zip** of that folder (`.shkp`, for keeping and sending). Unzipping a `.shkp` gives the
folder; zipping the folder gives a `.shkp`. Shanku opens both. Shanku 0.50.0's `.shk` (schema 1) still opens.

```
shanku.json                 the manifest (required)
model/<name>.ifc            the model, IFC (required)
shanku/
  views.json                the views in order, each with its file: [{"id": "3d", "file": "3d.json"}, …]
  views/<id>.json           one file per view: kind, level, ranges, graphics, display, dimensions
  graphics.json             the 3D view's graphics (optional)
  rates.json                the BOQ's rates (optional)
  edits.jsonl               native edits: edited and created elements, one per line by id (optional)
  deleted.json              native edits: ids of deleted elements (optional)
revit/
  link.json                 the Revit document the project is linked to (optional)
  pending.jsonl             changes staged for Revit, not yet applied: one per line (optional)
  types.jsonl, params.jsonl, levels.json   Revit data IFC does not carry (reserved; see "Revit and IFC")
```

## The manifest — `shanku.json`

```json
{
  "format": "shanku-project",
  "schema": 2,
  "app": "0.51.0",
  "name": "adani",
  "units": { "length": "mm" },
  "model": { "path": "model/adani.ifc", "fileName": "adani.ifc" }
}
```

`schema` is an integer: a reader refuses a schema newer than it knows ("saved by a newer Shanku"), and
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
4. **One file per view** (`shanku/views/<file>`): the view's id made safe for file names (`/ \ : * ? " < > |`
   and spaces become `_`; a clash gets `-2`, `-3`…), the id itself kept inside the file and in `views.json`.
5. File and folder names are ASCII-safe; the model keeps its own name under `model/`.

## Native edits

Until Shanku writes the model's IFC itself, a project keeps the IFC as it arrived plus its **edits**:
`shanku/edits.jsonl` holds every edited or created element as a parametric element
(`schemas/element.schema.json`: kind, mark, level, heights, and its point, line or outline), one per line,
sorted by id; `shanku/deleted.json` the ids deleted. Opening the project applies them to the model. These
are additions to schema 2 — older readers ignore them.

## Revit and IFC (decision 14A)

- **Parameters that fit IFC** go into IFC property sets on the element, where any IFC tool sees them.
- **What IFC does not carry** — the family and type catalogue with its parameters, parameters' Revit ids and
  storage types, levels and grids as Revit defines them — goes into `revit/*.jsonl`, keyed by the element's
  IFC GlobalId. Reserved in schema 2; filled by Shanku Bridge for Revit's "Export to Shanku".
- **Shanku's own** data (views, graphics, rates) is in `shanku/`.

## The model

`model/<name>.ifc` is IFC as the project holds it. Until Shanku writes IFC itself, it is the file as it
arrived; exports from Revit renumber IFC's `#` references on every export, so Git shows the IFC as changed
in bulk even when little changed. Shanku's own IFC writer (native editing) will write it canonically.
