# Design documents

Proposals for features that are not built yet. Each one says what exists today, the design, its effect on the design system, and a phased delivery plan. When a feature ships, its document moves to the relevant package README or to `docs/`, and the entry here says so.

| Document | Status | Summary |
|---|---|---|
| [revision-timeline.md](revision-timeline.md) | Proposed | Every model you open for a project becomes a revision; compare any two in 3D, in a change list, and as CSV, Excel or BCF. |
| [actionable-qa.md](actionable-qa.md) | Phase 1 built (0.27.0) | One finding shape for every check, with select, isolate, zoom, step, ignore and safe fixes; model-health, mark and IS 1893 screening checks. |
| [python-macros.md](python-macros.md) | Proposed | One command registry for buttons, keys, palette and Python; record actions as readable Python; save, share and run macros as one undo step. |
| [structura-lessons.md](structura-lessons.md) | Analysis | What Shanku can take from the Structura ETABS viewer, in priority order, and what to leave behind. |
| [revit-gap.md](revit-gap.md) | Analysis | Revit features BIM modellers use daily that Shanku lacks, easy to advanced (25 items), with how each fits Shanku and the recommended next three. |
| [quick-wins.md](quick-wins.md) | Analysis | Easy features: A1–A9 exist in Revit or only through add-ons; B1–B10 are not in Revit even with add-ons. Each one reuses existing Shanku code. |
| [revit-parity.md](revit-parity.md) | Living | Revit 2025 patterns in Shanku's panels (Properties, Project Browser, Type Properties, docking, scrollbars): what, why, where in code, and the design review log. |
| [levels.md](levels.md) | Living | The one definition of an element's level (lowest level at or above its top) for Shanku, the pipeline and Export to Revit. |
| [addons.md](addons.md) | For approval | Add-ons as pyRevit-style extensions built into Shanku: folders → ribbon, Python in sandboxed workers, the `shanku` module, permissions with risk ratings. Replaces addons-api.md. |
| [to-ch-dxf.md](to-ch-dxf.md) | For approval | → CH DXF, the exact reverse of DXF → 3D: every source to the exchange model, one CH writer, round-trip proof. |
| [project-file.md](project-file.md) | Living | The Shanku project: kept on the device as it changes, the .shk file (Save back, Save As, open), offline. |
| [datums-and-constraints.md](datums-and-constraints.md) | Approved, in progress | Levels, grids, reference planes, work planes; elements placed on levels with offsets (Revit's hosting); attachments and Align locks; Move rebuilt Revit's way. |

