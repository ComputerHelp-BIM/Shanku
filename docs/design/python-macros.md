# Python macros (design)

Status: **proposed**, not built. Written against Shanku 0.22.0 (`shanku.py` API 1.0.0). Nothing in this document exists in code yet unless it says "today".

## Why

In Revit, automating even a small repeated task means learning Dynamo or writing a C# add-in. Shanku already runs Python in the browser. Macros make that useful to people who do not program: **record** what you do, get a readable Python script, save it as a button, and run it again on any model. People who do program can edit the script or write one from scratch, using the same commands the buttons use.

## What exists today

| Piece | Where | State |
|---|---|---|
| Python runtime | Pyodide 0.27.7 in a worker (`apps/web/src/console/worker.ts`) | One persistent namespace per session. |
| `shanku` module | `apps/web/src/console/shanku.py` v1.0.0 | Read-only queries (`elements`, `selection`, `get`, `levels`, `info`, `boq`) and view actions (`select`, `isolate`, `hide`, `reset`, `fit`). |
| Actions back to the app | `RunResult.actions` (`client.ts`) | Serialisable JSON, applied by `App.tsx`; not transactions, not undoable. |
| Commands | `CommandId` union and `runCommand` switch (`apps/web/src/lib/shortcuts.ts`, `App.tsx`) | 16 view commands, two-letter Revit keys, "Repeat last command". Ribbon buttons mostly call inline closures, not commands. |
| Undo | `History` in `packages/engine/src/doc/transactions.ts` | Supports a `source` (e.g. a plugin id) that nothing uses yet. |
| Command palette | `CommandSearch` (Ctrl K) | Today it only finds elements by mark, ID or GlobalId. |
| Recording | — | Does not exist. |

## The key decision: one command registry

Recording clicks or mouse positions produces scripts that break as soon as the layout changes. Instead, **every action in Shanku becomes a named command with typed arguments**, and the recorder records commands. The same registry drives the ribbon, the context menu, keyboard shortcuts, the command palette and Python, so a recorded script replays exactly what the buttons do.

```ts
// apps/web/src/lib/commands.ts
interface CommandArg {
  name: string;
  type: 'elements' | 'string' | 'number' | 'boolean' | 'enum' | 'view' | 'level' | 'category';
  options?: readonly string[];      // for enum
  optional?: boolean;
}

interface Command<A = Record<string, unknown>> {
  id: string;                  // 'view.isolate', 'graphics.setStyle', 'boq.setRate'
  title: string;               // 'Isolate elements'
  group: string;               // 'Visibility', 'View', 'Quantities'…
  args: CommandArg[];
  keys?: string;               // 'HI' (two-letter) or 'mod+shift+h'
  /** Whether it changes undoable state; if so it runs inside history.run(title, …). */
  undoable: boolean;
  enabled(ctx: AppContext): boolean;
  run(args: A, ctx: AppContext, tx?: Transaction): void;
}

registerCommand(cmd: Command): void;
runCommandById(id: string, args: object, source?: string): void;
```

Existing `CommandId` values map one to one onto registry ids (`fit` → `view.fit`, `isolateElement` → `view.isolate`, and so on). The ribbon and context menu then call `runCommandById` instead of inline closures. This is worth doing even without macros: it gives a real command palette (see `structura-lessons.md`), consistent "Repeat" and consistent undo names.

### Elements in arguments

Recorded element arguments are stored as **GlobalIds**, not indices, so a macro recorded on one file replays on the next revision. The recorder also records *how* the selection was made when a command defined it ("all columns on Level 3") and prefers that form, because it works on any model:

```python
# recorded
shanku.view.isolate(shanku.elements(category="Column", level="Level 3"))
```

Only a hand-picked selection falls back to a GlobalId list.

## Recording

- **Start:** Record button in the Console panel header and in Manage → Macros, or the command `macro.record`. While recording, the status bar shows a red dot, "Recording macro · 7 steps", and a Stop button.
- **Captured:** every command run through the registry with its arguments; code run in the console; selections made through commands (Select by category, level, find). Camera orbiting, hover and panel resizing are not recorded.
- **Stop:** opens the macro editor with the generated script, a name field, a description and "Save". Nothing is saved without a name.

Generated code is readable and commented with the command titles:

```python
# shanku-macro: {"name": "Check level 3 columns", "api": "1.1", "created": "2026-09-24"}
import shanku

with shanku.transaction("Check level 3 columns"):
    # Visibility/Graphics: halftone slabs
    shanku.graphics.override_category("Slab", halftone=True)
    # Isolate elements
    shanku.view.isolate(shanku.elements(category="Column", level="Level 3"))
    # Display style: Hidden line
    shanku.view.set_style("hidden-line")
```

## Python API 1.1 (additive)

Everything in 1.0 keeps working. New parts:

| API | What it does |
|---|---|
| `shanku.api_version` | `"1.1.0"` |
| `shanku.run(command_id, **args)` | Runs any registered command |
| `shanku.commands()` | Lists commands with their arguments (for `help` and autocomplete) |
| `shanku.view`, `shanku.graphics`, `shanku.views`, `shanku.boq` … | Generated wrappers, one module per command group, with docstrings from the registry |
| `with shanku.transaction(name):` | Everything inside becomes one undo step named `name`, with source `macro:<name>` |
| `shanku.qa(check=None)` | Runs QA checks and returns findings (see `actionable-qa.md`) |
| `shanku.revisions()` / `shanku.diff(a, b)` | Read the revision timeline (see `revision-timeline.md`) |
| `shanku.ask(prompt, choices=None)` | Asks the user a question in a small dialog and returns the answer, so a macro can take input |
| `shanku.log(message)` | Writes to Activity |

The worker protocol keeps its shape. `RunResult.actions` gains one generic entry, `{ type: 'command', id, args }`. The app applies all actions from one run inside one `history.run(name, …, 'macro:<id>')` using the existing `startGroup` / `assimilate` support, so **undo reverses a whole macro in one step**.

One prerequisite follows from this: temporary hide/isolate and selection are not transactions today. For macros to undo cleanly they need to become undoable view state (change keys `view-hides` and `selection`), which is also what Revit users expect.

## Saving, running and sharing

- **Storage:** IndexedDB store `macros` (added in the same schema upgrade as the revision timeline), plus export and import as `.py` files with the `# shanku-macro:` header line.
- **Running:** Manage → Macros lists saved macros with Run, Edit, Duplicate, Delete and Export. A macro can be pinned to the Quick Access Toolbar, given a two-letter shortcut, and run from the command palette. "Run on this selection" passes the current selection as `shanku.selection()`.
- **Editor:** a code area with line numbers, Run, Run and record output, and Save. Syntax errors are shown with the line before running.
- **Examples shipped with the app:** "Isolate one level's columns", "Halftone everything but the selection", "BOQ for the selection to the console", "Mark every column without a grade" (with QA).

## Safety

- Macros run in the Pyodide worker: no DOM access and no access to the app's storage except through the `shanku` API.
- Network access from macros is blocked: `pyodide.http` and `js.fetch` are not exposed in the macro namespace, and the Content Security Policy `connect-src` stays limited to the app and the Pyodide CDN.
- **Imported macros show their code** and a plain summary of the commands they call ("changes BOQ rates", "changes view graphics") before the first run, with Run or Cancel.
- **Stopping a runaway script:** a Stop button interrupts it through Pyodide's interrupt buffer where cross-origin isolation is available. Otherwise the worker is terminated and restarted, and the log says the namespace was reset.
- A macro cannot write files. Exports it triggers go through the same download path, with the same confirmation as buttons.

## Design-system impact

- Recording indicator: a dot in `status-error` with the word "Recording", never colour alone.
- Macro list and editor reuse `DockPanel`, `Button`, `IconButton`, `Kbd` and the planned Menu and Dialog components; the editor uses the `mono` type style.
- New icon: "macro" (a play triangle over lines of code) on the 24 px grid, 1.5 px stroke.

## Delivery

| Phase | Scope |
|---|---|
| 1 | Command registry, ribbon and context menu moved onto it, command palette in Ctrl K (a `>` prefix for commands), view hides and selection made undoable |
| 2 | Python API 1.1 (`run`, generated wrappers, `transaction`), macro storage, editor, Run, Manage → Macros |
| 3 | Recorder, Quick Access pinning, shortcuts, import with review, example macros |

Tests: every command's arguments round-trip through JSON; a recorded macro replayed on the same model produces the same view state; replay on a revision uses GlobalIds; one macro run is one undo step; network calls from a macro fail.
