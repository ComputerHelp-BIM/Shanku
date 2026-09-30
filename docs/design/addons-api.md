# Add-ons: a public API, in Python (design, for review)

Goal: teams write their own tools for Shanku — as Revit users write add-ins — preferably in Python, and
Shanku can later ship them in a desktop app without rewriting them.

## Where add-ons run

- **In the browser, in Python:** each add-on runs in its own Web Worker with **Pyodide**, the Python Shanku
  already ships for DXF → 3D. Nothing to install; pure-Python packages (and Pyodide's numpy, pandas…) work.
- **Sandboxed:** an add-on cannot touch the page or Shanku's memory. It talks to Shanku only through the
  API, by messages; what it may do is declared up front (permissions).
- **Later, the desktop app** runs the same add-ons in CPython with the same `shanku` module.

## An add-on

A `.shanku-addon` file (a zip):

```toml
# shanku-addon.toml
id = "computerhelp.column-schedule"
name = "Column schedule"
version = "1.2.0"            # the add-on's own version (semver)
api = ">=1.0, <2"            # the Shanku API versions it works with
entry = "column_schedule:main"
permissions = ["model.read", "selection", "files.download"]   # shown before installing

[[ribbon]]
tab = "Add-ins"
label = "Column schedule"
icon = "column"
command = "build_schedule"
```

```python
import shanku

@shanku.command("build_schedule", title="Column schedule")
async def build_schedule():
    cols = shanku.model.elements(category="Column")
    rows = [(c.mark, c.level, c.props.get("CH-ConcreteGrade"), c.quantities.volume) for c in cols]
    await shanku.files.download("columns.csv", shanku.csv(rows, header=["Mark", "Level", "Grade", "Volume m³"]))
    shanku.ui.notice(f"{len(rows)} columns scheduled.")
```

## The `shanku` module (API 1.x)

| Area | What it offers | Permission |
|---|---|---|
| `shanku.model` | elements (by category, level, mark, type, GlobalId), properties, quantities, levels, bounds; read-only snapshots | `model.read` |
| `shanku.selection` | get, set, `on_change` | `selection` |
| `shanku.views` | open a view, isolate, hide, colour overrides, section box, camera | `views` |
| `shanku.ui` | commands and ribbon buttons, notices, progress, simple forms (fields → Shanku draws them with its design system) | — |
| `shanku.changes` | stage parameter, type, move and rotate edits for Revit (the same Changes for Revit list, Check, Apply, one undo) | `revit.edit` |
| `shanku.files` | files the user picks, downloads | `files.read`, `files.download` |
| `shanku.net` | HTTP requests (off unless declared) | `network` |
| events | `on_model_opened`, `on_selection_changed`, `on_revit_changes` | as above |

**Versioning:** semver on the API (`shanku.API_VERSION`); additions in minor versions; a breaking change
gets a new major, and the previous major keeps working for at least one release with deprecation notices.

## How it fits the code

The 0.49.2 split made each feature a hook with a typed surface. An `AddonHost` in the web app maps API calls
to those surfaces (the Revit bridge's editing, the views, selection…), so an add-on uses exactly what
Shanku's own features use. The Python side (`shanku` module) is a thin, typed client of that host, shipped
with type stubs so editors complete it.

## Milestones (proposal)

1. **Read and act:** `model` (read), `selection`, `views`, `ui` commands, ribbon buttons and notices; loading an
   add-on from a file; the Add-ins tab and manager (install, enable, remove, permissions).
2. **Forms, files, progress; changes for Revit** through `shanku.changes`.
3. **Events; add-on settings; sharing add-ons within a team** (a catalogue).
4. **Desktop runtime** (CPython) when the desktop app comes.

Open questions: whether add-ons may also be written in TypeScript (the same host makes it cheap); whether a
team catalogue needs sign-in (it will, with accounts); signing add-ons.
