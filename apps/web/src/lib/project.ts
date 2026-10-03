/**
 * The cad2bim project file, `.c2b` (docs/format/README.md, schema 3): an open format — IFC for the model,
 * JSON for everything else — as a zip (for keeping and sending) of the same folder that works with Git.
 * Written canonically (sorted keys, fixed order, no save time, a fixed zip timestamp), so saving an unchanged
 * project gives identical bytes. Reads Shanku's files from before the rename too — schema 2 (`.shkp`, 0.51.0–0.56.x) and
 * schema 1 (`.shk`, 0.50.0) — by renaming their entries on reading; a newer schema is refused.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ModelState } from './session';

export const PROJECT_EXT = '.c2b';
/** Older project files that still open: Shanku's, before the rename to cad2bim (0.57.0). */
export const LEGACY_EXTS = ['.shkp', '.shk'];
export const PROJECT_SCHEMA = 3;
const FORMAT = 'cad2bim-project';
/** Shanku's format id (schemas 1–2): read as this one, its entries renamed. */
const LEGACY_FORMAT = 'shanku-project';
/** Every zip entry's timestamp: fixed, so identical content gives identical bytes. */
const ZIP_TIME = new Date('2000-01-01T00:00:00Z');

export interface ProjectManifest {
  format: typeof FORMAT | typeof LEGACY_FORMAT;
  schema: number;
  app: string;
  name: string;
  units?: { length: 'mm' | 'm' };
  model: { path: string; fileName: string };
}

export const isProjectFile = (name: string) => [PROJECT_EXT, ...LEGACY_EXTS].some((e) => name.toLowerCase().endsWith(e));
/** "adani.ifc" → "adani.c2b". */
export const projectNameFor = (modelName: string) => baseName(modelName) + PROJECT_EXT;
const baseName = (modelName: string) => modelName.replace(/(\.ifc)?(\.gz)?$/i, '');

/** Canonical JSON: keys sorted at every level, 2-space indentation, a final newline. */
export function canonical(v: unknown): string {
  return JSON.stringify(sortKeys(v), null, 2) + '\n';
}
/** One JSON Lines line: compact, keys sorted. */
const line = (v: unknown) => JSON.stringify(sortKeys(v));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
/** A name safe in any file system (the format's rule 4). */
export const safeName = (s: string) => s.replace(/[/\\:*?"<>|\s]+/g, '_').replace(/^\.+/, '_') || '_';

type View = { id: string } & Record<string, unknown>;
type Change = { globalId?: string; name?: string } & Record<string, unknown>;

export function packProject(model: { name: string; bytes: Uint8Array }, state: ModelState, app: string): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, text: string) => (files[path] = strToU8(text));
  const modelPath = `model/${safeName(model.name)}`;
  const manifest: ProjectManifest = { format: FORMAT, schema: PROJECT_SCHEMA, app, name: baseName(model.name), units: { length: 'mm' }, model: { path: modelPath, fileName: model.name } };
  put('cad2bim.json', canonical(manifest));
  files[modelPath] = model.bytes;
  // views: one file each, their order and files in views.json
  const views = Array.isArray(state.views) ? (state.views as View[]).filter((v) => v && typeof v.id === 'string') : [];
  if (views.length) {
    const used = new Set<string>();
    const index = views.map((v) => {
      let file = `${safeName(v.id)}.json`;
      for (let n = 2; used.has(file.toLowerCase()); n++) file = `${safeName(v.id)}-${n}.json`;
      used.add(file.toLowerCase());
      put(`cad2bim/views/${file}`, canonical(v));
      return { id: v.id, file };
    });
    put('cad2bim/views.json', canonical(index));
  }
  if (state.graphics !== undefined && state.graphics !== null) put('cad2bim/graphics.json', canonical(state.graphics));
  if (state.rates !== undefined && state.rates !== null) put('cad2bim/rates.json', canonical(state.rates));
  // datums (grids, reference planes) and the project's display units
  if (Array.isArray(state.datums) && state.datums.length) put('cad2bim/datums.json', canonical(state.datums));
  if (state.units) put('cad2bim/units.json', canonical(state.units));
  // native edits: edited and created elements, one per line by id; deleted ids
  const edits = state.edits as { elements: Array<{ id: string }>; deleted: string[]; levels?: Array<{ name: string; z: number }>; locks?: unknown[] } | undefined;
  if (edits?.locks?.length) put('cad2bim/locks.json', canonical(edits.locks));
  if (edits?.levels?.length) put('cad2bim/levels.json', canonical(edits.levels));
  if (edits?.elements.length) put('cad2bim/edits.jsonl', [...edits.elements].sort((a, b) => a.id.localeCompare(b.id)).map(line).join('\n') + '\n');
  if (edits?.deleted.length) put('cad2bim/deleted.json', canonical([...edits.deleted].sort()));
  // changes staged for Revit: the document they are for, and one change per line in a stable order
  if (state.pending?.key && state.pending.changes.length) {
    put('revit/link.json', canonical({ documentKey: state.pending.key }));
    const rows = [...(state.pending.changes as Change[])].sort((a, b) => `${a.globalId ?? ''}\u0000${a.name ?? ''}`.localeCompare(`${b.globalId ?? ''}\u0000${b.name ?? ''}`));
    put('revit/pending.jsonl', rows.map(line).join('\n') + '\n');
  }
  // fixed entry order and timestamp: identical content, identical bytes
  const ordered = Object.fromEntries(Object.keys(files).sort().map((k) => [k, [files[k], { level: k.startsWith('model/') ? 6 : 9, mtime: ZIP_TIME }] as const]));
  return zipSync(ordered as Parameters<typeof zipSync>[0], { mtime: ZIP_TIME });
}

export class ProjectFileError extends Error {}

export function unpackProject(bytes: Uint8Array): { manifest: ProjectManifest; model: { name: string; bytes: Uint8Array }; state: ModelState } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ProjectFileError('This is not a cad2bim project file (it cannot be unzipped).');
  }
  // Shanku's files (schemas 1–2): the same layout under the old names — rename, then read as one
  if (files['shanku.json'] && !files['cad2bim.json']) {
    const renamed: Record<string, Uint8Array> = {};
    for (const [k, v] of Object.entries(files)) renamed[k === 'shanku.json' ? 'cad2bim.json' : k.startsWith('shanku/') ? 'cad2bim/' + k.slice(7) : k] = v;
    files = renamed;
  }
  const json = (name: string) => (files[name] ? (JSON.parse(strFromU8(files[name])) as unknown) : undefined);
  const manifest = (json('cad2bim.json') ?? json('manifest.json')) as (ProjectManifest & { schema: number }) | undefined;
  if (!manifest || (manifest.format !== FORMAT && manifest.format !== LEGACY_FORMAT)) throw new ProjectFileError('This is not a cad2bim project file (it has no cad2bim manifest).');
  if (manifest.schema > PROJECT_SCHEMA) throw new ProjectFileError(`This project was saved by a newer cad2bim (project schema ${manifest.schema}); update cad2bim to open it.`);
  const model = files[manifest.model.path];
  if (!model) throw new ProjectFileError('The project file has no model in it.');
  const opt = <T>(v: unknown) => (v === null ? undefined : (v as T));
  if (manifest.schema === 1) {
    // Shanku 0.50.0 (.shk): one JSON file per kind of state
    return { manifest, model: { name: manifest.model.fileName, bytes: model }, state: { views: opt(json('state/views.json')), graphics: opt(json('state/graphics.json')), pending: opt(json('state/pending.json')), rates: opt(json('state/rates.json')) } };
  }
  const index = json('cad2bim/views.json') as Array<{ id: string; file: string }> | undefined;
  const views = index?.map((e) => json(`cad2bim/views/${e.file}`)).filter((v): v is View => !!v);
  const link = json('revit/link.json') as { documentKey: string } | undefined;
  const pendingText = files['revit/pending.jsonl'] ? strFromU8(files['revit/pending.jsonl']) : '';
  const changes = pendingText.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown);
  const editsText = files['cad2bim/edits.jsonl'] ? strFromU8(files['cad2bim/edits.jsonl']) : '';
  const edited = editsText.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown);
  const deleted = (json('cad2bim/deleted.json') as string[] | undefined) ?? [];
  const levels = json('cad2bim/levels.json') as Array<{ name: string; z: number }> | undefined;
  const lockList = json('cad2bim/locks.json') as unknown[] | undefined;
  return {
    manifest,
    model: { name: manifest.model.fileName, bytes: model },
    state: {
      views: views?.length ? views : undefined,
      graphics: opt(json('cad2bim/graphics.json')),
      rates: opt(json('cad2bim/rates.json')),
      pending: link && changes.length ? { key: link.documentKey, changes } : undefined,
      edits: edited.length || deleted.length || levels?.length || lockList?.length ? { elements: edited, deleted, ...(levels?.length ? { levels } : {}), ...(lockList?.length ? { locks: lockList } : {}) } : undefined,
      datums: opt(json('cad2bim/datums.json')),
      units: opt(json('cad2bim/units.json')),
    },
  };
}
