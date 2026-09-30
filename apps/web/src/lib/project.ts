/**
 * The Shanku project file: one zip (as .docx is) with the model and everything Shanku keeps for it.
 *
 *   manifest.json        { format: "shanku-project", schema, app, name, savedAt, model: { path, fileName, bytes } }
 *   model/<file>.ifc     the model as opened (IFC)
 *   state/views.json     views: plans, sections, elevations, their graphics, ranges and dimensions
 *   state/graphics.json  the 3D view's graphics
 *   state/pending.json   changes staged for Revit, not yet applied
 *   state/rates.json     the BOQ's rates
 *
 * Schema versions follow semver's spirit: a newer schema is refused with a clear message, never misread.
 * The extension is provisional (to be chosen); it lives only in PROJECT_EXT.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ModelState } from './session';

export const PROJECT_EXT = '.shk';
export const PROJECT_SCHEMA = 1;
const FORMAT = 'shanku-project';

export interface ProjectManifest {
  format: typeof FORMAT;
  schema: number;
  app: string;
  name: string;
  savedAt: string;
  model: { path: string; fileName: string; bytes: number };
}

export const isProjectFile = (name: string) => name.toLowerCase().endsWith(PROJECT_EXT);
/** "adani.ifc" → "adani.shk". */
export const projectNameFor = (modelName: string) => modelName.replace(/(\.ifc)?(\.gz)?$/i, '') + PROJECT_EXT;

const json = (v: unknown) => strToU8(JSON.stringify(v ?? null, null, 1));

export function packProject(model: { name: string; bytes: Uint8Array }, state: ModelState, app: string, now = new Date()): Uint8Array {
  const path = `model/${model.name.replace(/[\\/]/g, '_')}`;
  const manifest: ProjectManifest = { format: FORMAT, schema: PROJECT_SCHEMA, app, name: projectNameFor(model.name), savedAt: now.toISOString(), model: { path, fileName: model.name, bytes: model.bytes.byteLength } };
  return zipSync(
    {
      'manifest.json': json(manifest),
      [path]: [model.bytes, { level: 6 }],
      'state/views.json': json(state.views),
      'state/graphics.json': json(state.graphics),
      'state/pending.json': json(state.pending),
      'state/rates.json': json(state.rates),
    },
    { level: 6 },
  );
}

export class ProjectFileError extends Error {}

export function unpackProject(bytes: Uint8Array): { manifest: ProjectManifest; model: { name: string; bytes: Uint8Array }; state: ModelState } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ProjectFileError('This is not a Shanku project file (it cannot be unzipped).');
  }
  const read = (name: string) => (files[name] ? (JSON.parse(strFromU8(files[name])) as unknown) : undefined);
  const manifest = read('manifest.json') as ProjectManifest | undefined;
  if (!manifest || manifest.format !== FORMAT) throw new ProjectFileError('This is not a Shanku project file (it has no Shanku manifest).');
  if (manifest.schema > PROJECT_SCHEMA) throw new ProjectFileError(`This project was saved by a newer Shanku (project schema ${manifest.schema}); update Shanku to open it.`);
  const model = files[manifest.model.path];
  if (!model) throw new ProjectFileError('The project file has no model in it.');
  const opt = <T>(v: unknown) => (v === null ? undefined : (v as T));
  return {
    manifest,
    model: { name: manifest.model.fileName, bytes: model },
    state: { views: opt(read('state/views.json')), graphics: opt(read('state/graphics.json')), pending: opt(read('state/pending.json')), rates: opt(read('state/rates.json')) },
  };
}
