# Add-ons: pyRevit-style extensions, built into Shanku (design, for approval)

Replaces the earlier proposal in `addons-api.md` (a zipped add-on with a manifest). Decided with the team,
2026-09-30: sets 1A, 4B, 5A, 6A, 10 ("shanku: true" for now), 11A.

## The experience

As pyRevit is for Revit, but built in: a folder of scripts becomes buttons on Shanku's ribbon, with no
build step, and Reload picks up edits. The folder structure is pyRevit's, so the team's habits carry over.

```
ComputerHelp.extension/                 ← one Git repository can hold pyRevit and Shanku tools
  Structure.tab/
    Checks.panel/
      Column Schedule.pushbutton/
        script.py
        icon.png
        bundle.yaml                     ← shanku: true  (title, tooltip, author, min Shanku version)
      More.pulldown/ …                  ← pulldowns, split buttons, stacks as in pyRevit
  hooks/
    model-opened.py                     ← events, as pyRevit hooks
  lib/                                  ← shared Python for the extension's scripts
```

- **Buttons appear by themselves:** Shanku reads tabs, panels and buttons from the folder names; bundles
  with `shanku: true` in `bundle.yaml` are Shanku's, the others are left to pyRevit.
- **Where extensions come from:** a **public Git repository** (for now; private repositories with a
  read-only token, and later through accounts), updated in one click as pyRevit's Extension Manager does; a
  **local folder** for authoring (Chrome and Edge open it directly and remember it; saving a script reloads
  it); a zip.
- **Reload**, as pyRevit's; a developer mode that reloads on save.
- **Shipped in the box:** a "Shanku Tools" extension with working examples.

### Shanku's buttons inside Revit (decision 10)

With `shanku: true`, pyRevit still shows those buttons in Revit, where they cannot run. Every Shanku
script template starts with a guard, so a Shanku button in Revit says what it is and stops:

```python
from shanku import require_shanku; require_shanku()   # in Revit: "This tool runs in Shanku." and stop
```

A cleaner separation (own folder types, or a Shanku folder) is to be chosen later without changing scripts.

## Scripts

Python 3.12 in the browser (Pyodide, which Shanku already ships), each extension in its own sandboxed
worker: a crash or an endless loop never freezes Shanku, and a running script can be stopped. numpy,
pandas and ezdxf work; there is no IronPython and no Revit API — Revit actions go through
`shanku.revit`, the same checked, one-undo Changes for Revit as the app's own.

```python
from shanku import model, selection, forms, output

cols = model.elements(category="Column")
picked = forms.select_from_list([c.mark for c in cols], title="Columns to check", multiselect=True)
for c in cols:
    if c.mark in picked:
        output.print_md(f"**{output.linkify(c)}** {c.type_name} {c.quantities.volume:.2f} m³")
```

| Module | Like pyRevit's | Offers |
|---|---|---|
| `shanku.model` | `revit.doc` queries | elements by category, level, mark, type, GlobalId; properties, quantities, levels (read-only) |
| `shanku.selection` | `revit.get_selection` | get, set, on change |
| `shanku.views` | `revit.active_view` | open, isolate, hide, colour overrides, section box, camera |
| `shanku.forms` | `pyrevit.forms` | alert, ask_for_string, select_from_list, command switch, progress — drawn in Shanku's design |
| `shanku.output` | `pyrevit.output` | an output window: markdown, tables, element links that select when clicked |
| `shanku.revit` | — | stage parameter, type, move and rotate edits in Changes for Revit |
| `shanku.files` | — | files the user picks, downloads |
| `shanku.net` | — | HTTP requests (only if declared) |

The API is versioned (semver, `shanku.API_VERSION`); it starts at **0.x (preview)** for the team and becomes
1.0 when it is stable. Type stubs ship with it, so editors complete it.

## Permissions and risk (decision 5A, 11A)

On first load, like a Revit external add-in, Shanku shows what the extension can do and asks once:
**Always load**, **Load once**, or **Cancel** — with an explicit warning for high risk.

| Rating | When (Shanku works it out from what the extension declares) |
|---|---|
| 🟢 **Low** | reads the model, shows results |
| 🟡 **Medium** | changes the selection or views, saves files |
| 🔴 **High** | stages edits for Revit, uses the internet |

Extensions from the team's own repository carry a **"from your team"** mark. What an extension may do is
declared per bundle (`bundle.yaml: permissions: [...]`) and enforced by the sandbox, not only shown.

## How it fits the code

The add-on host sits in `apps/web/src/features/addons/` and maps the `shanku` module's calls onto the
feature hooks (`features/revit`, `features/views`, selection, commands). Ribbon buttons come from the same
command list as Shanku's own (`useAppCommands`).

## Milestones

1. **Extensions from a folder and a public Git repository**; ribbon from the folder structure; `model`,
   `selection`, `views`, `forms` (alert, lists, strings), `output`; Reload; permissions with ratings; "Shanku
   Tools" examples.
2. `shanku.revit` (Changes for Revit), `files`, progress in forms, hooks (events), developer mode.
3. Private repositories (token), extension settings, a team catalogue; the desktop runtime later.
