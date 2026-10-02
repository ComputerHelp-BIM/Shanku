# Roadmap

Recorded requests and proposals; each gets its own design review before it is built.

## Next

- **Datums, work planes, hosting and constraints** — done 0.52.1–0.55.0 (`docs/design/datums-and-constraints.md`).

0. **Native Shanku projects** — done in 0.50.0 (`docs/design/project-file.md`): project file, save back, offline. Next on it: native editing (IFC writing), project ids, several models.

1. **Add-ons as pyRevit-style extensions** — `docs/design/addons.md` (for approval).
2. **→ CH DXF**, the reverse of DXF → 3D — `docs/design/to-ch-dxf.md` (for approval); then the **CH stair
   convention**, from a drawing the team sends.

## Then

2. **Revit "Export to Shanku" button, and a Shanku project file.** A button in Shanku Bridge for Revit that
   writes the model in Shanku's own format without losing what IFC drops.
   - **Proposal:** a single zip file (as .docx is) holding `model.ifc` (IFC4, internal axes, as the bridge
     exports now) and JSON beside it for what IFC loses or flattens: every instance and type parameter with its
     Revit id and storage type, families and types (with their parameters), levels and grids as Revit has them,
     views, and Shanku's own state (views, graphics, dimensions, rates, pending changes). Shanku opens it like an
     IFC and keeps the extras; a later Export to Revit can use them to rebuild types exactly.
   - **Extension:** to choose (`.shk`, `.shu`, `.shn`, `.sha`…), after checking which are free of common
     clashes (`.sha` is often read as a checksum file, for example).
3. **ETABS `.e2k` → IFC or a Shanku project file.** A pipeline, in Python like DXF → 3D: stories, grids,
   materials, frame sections, frames (columns, beams, braces), areas (slabs, walls) and their assignments →
   the same exchange Shanku builds from DXF, then IFC4 or the project file; later the way back (Shanku → e2k).
   Other open formats (IFC from ETABS/STAAD, SAF) after it.

## Earlier list

Export to Revit: windows, doors, grids · change tracking (last sync / Revit / Shanku) · undo across the bridge ·
views: section and elevation markers, crop regions · reinforcement and BBS · ETABS/STAAD round trips, revision
comparison · licence (AGPL-3.0 proposed), domain, trademark · Vercel plan (Pro for company use) or R2 storage.
