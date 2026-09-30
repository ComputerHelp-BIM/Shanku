# The Shanku project, and never losing work (0.50.0; format 0.51.0)

## Three layers

1. **Kept on this device, as it changes.** The model and everything Shanku keeps for it are written to the
   browser's store (IndexedDB, localStorage) as they change: the model file, views (with their graphics,
   ranges and dimensions), the 3D view's graphics, colours, rates, and changes staged for Revit (per Revit
   document). A reload, a closed tab or a crash restores them when the model opens again.
2. **The project file, `.shkp`** — an open format specified in `docs/format/README.md` (schema 2, with JSON
   schemas): IFC for the model, canonical JSON for the rest, one file per view, one line per change, no save
   time in content, so an unchanged project saves to identical bytes; a zip of the same folder that works with
   Git. (0.50.0 wrote `.shk`, schema 1; it still opens, and saves as a new `.shkp`.) Family `.shkf` and
   template `.shkt` files are reserved. **Save** (Ctrl + S) writes back to the same
   file in Chrome and Edge (the file's handle is kept, even after a reload); **Save As** (Ctrl + Shift + S)
   picks a new one; other browsers download it. **Open** accepts `.shk` wherever a model opens (the Open
   button, drag and drop, the homepage): its state goes into the store first, then the model opens, so the
   usual restore brings everything back — one restore path, not two.
3. **Offline.** A service worker (`public/sw.js`, production builds) keeps the app's files and the Python
   runtime after first use, so Shanku opens without internet with the project restored. The page is fetched
   network-first (updates arrive whenever online). Never kept: `/api/`, shared models, the Revit bridge.

The title bar says where the work is: "Kept on this device · not saved to a file", "adani.shk · saved 2 min
ago", "adani.shk · changes not saved to the file". Leaving with a file older than the work asks first (the
work itself is still kept on this device).

## Rules

- A newer project schema is refused with a clear message, never misread; the schema is versioned.
- The store's state is keyed by the model's file name (as views were before); two different models with the
  same name share it — to be keyed by the model's identity when projects get their own ids.

## Next

- **Native editing** (creating and changing elements in Shanku without Revit) needs Shanku to write IFC;
  its edits will be kept and saved through these same layers.
- A project id, projects with several models (federation), recent projects; Git-backed Versions on top of the
  project file (`docs/roadmap.md`).
