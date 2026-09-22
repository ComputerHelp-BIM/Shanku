import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import { CATEGORY_ORDER, categoryOf, prettyIfcClass } from '../model/categories';
import type {
  Category,
  ElementRecord,
  Level,
  ModelUnits,
  ParsedModel,
  PropertyGroup,
  PropertyItem,
  PropertyValue,
} from '../model/types';
import { GrowableF32, GrowableU32 } from './buffers';
import { featureEdges } from './edges';
import { assessCompatibility, readViewDefinition } from './compat';
import { DEFAULT_MARK_RULES, detectMarks } from './marks';

export interface ParseOptions {
  fileName: string;
  /** Called every ~500 elements with the number streamed so far and the total. */
  onProgress?: (done: number, total: number) => void;
  /** Feature-edge angle. Default 30°. */
  edgeAngleDeg?: number;
  /** Mark detection rules in priority order. Default DEFAULT_MARK_RULES. */
  markRules?: readonly string[];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Classes that carry geometry but are not model elements a user selects. */
const SKIP = new Set(['IFCOPENINGELEMENT', 'IFCSPACE', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT']);

const str = (v: unknown): string => {
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    const inner = (v as { value: unknown }).value;
    return inner === null || inner === undefined ? '' : String(inner);
  }
  return '';
};
const refId = (v: unknown): number | null =>
  v && typeof v === 'object' && 'value' in (v as Record<string, unknown>) ? Number((v as { value: unknown }).value) : null;

function forEachLine(api: IfcAPI, modelID: number, type: number, fn: (line: any) => void) {
  const ids = api.GetLineIDsWithType(modelID, type);
  for (let i = 0; i < ids.size(); i++) fn(api.GetLine(modelID, ids.get(i)));
}

const PREFIX: Record<string, string> = { MILLI: 'm', CENTI: 'c', DECI: 'd', KILO: 'k' };

/**
 * Reads the project's length, area and volume units from IfcProject.UnitsInContext.
 * Only the project's own IfcUnitAssignment counts: Revit also writes other IfcSIUnits
 * (e.g. a metre inside a derived unit) that must not override the project's millimetres.
 * Falls back to scanning all IfcSIUnits only when the project declares none.
 */
export function readUnits(api: IfcAPI, modelID: number): ModelUnits {
  const units: ModelUnits = { length: 'm', area: 'm²', volume: 'm³' };
  const apply = (u: any) => {
    if (!u || u.type !== WebIFC.IFCSIUNIT) return;
    const kind = String(u.UnitType?.value ?? '');
    const prefix = PREFIX[String(u.Prefix?.value ?? '')] ?? '';
    if (kind === 'LENGTHUNIT') units.length = `${prefix}m`;
    if (kind === 'AREAUNIT') units.area = `${prefix}m²`;
    if (kind === 'VOLUMEUNIT') units.volume = `${prefix}m³`;
  };
  let fromProject = false;
  forEachLine(api, modelID, WebIFC.IFCPROJECT, (p) => {
    const ua = refId(p.UnitsInContext);
    if (ua === null) return;
    const assignment = api.GetLine(modelID, ua);
    for (const r of assignment?.Units ?? []) {
      const id = refId(r);
      if (id === null) continue;
      apply(api.GetLine(modelID, id));
      fromProject = true;
    }
  });
  if (!fromProject) forEachLine(api, modelID, WebIFC.IFCSIUNIT, apply);
  return units;
}

/**
 * Opens an IFC file with an initialised IfcAPI and produces everything the viewer
 * needs: element records, one merged mesh, feature edges and model info.
 * Runs in a Web Worker in the browser and directly in Node for tests.
 * The model is left open so properties can be read on demand; call `api.CloseModel`.
 */
export function parseIfc(api: IfcAPI, bytes: Uint8Array, options: ParseOptions): { modelID: number; model: ParsedModel } {
  const t0 = now();
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0) throw new Error('This file could not be opened as IFC.');
  const schema = api.GetModelSchema(modelID);
  const t1 = now();

  // ---- relations: storeys, containment, types ----
  const storeyName = new Map<number, string>();
  const storeyElev = new Map<string, number | null>();
  forEachLine(api, modelID, WebIFC.IFCBUILDINGSTOREY, (s) => {
    const name = str(s.Name) || `Storey #${s.expressID}`;
    storeyName.set(s.expressID, name);
    const elev = s.Elevation?.value;
    storeyElev.set(name, typeof elev === 'number' ? elev : null);
  });
  const levelOf = new Map<number, string>();
  forEachLine(api, modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, (r) => {
    const s = refId(r.RelatingStructure);
    const name = s !== null ? storeyName.get(s) : undefined;
    if (!name) return;
    for (const el of r.RelatedElements ?? []) {
      const id = refId(el);
      if (id !== null) levelOf.set(id, name);
    }
  });
  // Parts of an assembly (e.g. Revit's aggregated beams) inherit the parent's level.
  forEachLine(api, modelID, WebIFC.IFCRELAGGREGATES, (r) => {
    const parent = refId(r.RelatingObject);
    const lvl = parent !== null ? levelOf.get(parent) ?? storeyName.get(parent) : undefined;
    if (!lvl) return;
    for (const el of r.RelatedObjects ?? []) {
      const id = refId(el);
      if (id !== null && !levelOf.has(id)) levelOf.set(id, lvl);
    }
  });
  const typeOf = new Map<number, string>();
  forEachLine(api, modelID, WebIFC.IFCRELDEFINESBYTYPE, (r) => {
    const t = refId(r.RelatingType);
    const typeName = t !== null ? str(api.GetLine(modelID, t).Name) : '';
    for (const el of r.RelatedObjects ?? []) {
      const id = refId(el);
      if (id !== null) typeOf.set(id, typeName);
    }
  });
  let projectName = '';
  forEachLine(api, modelID, WebIFC.IFCPROJECT, (p) => {
    projectName = str(p.LongName) || str(p.Name);
  });
  const units = readUnits(api, modelID);
  const marks = detectMarks(api, modelID, options.markRules ?? DEFAULT_MARK_RULES);
  const quantitySets = api.GetLineIDsWithType(modelID, WebIFC.IFCELEMENTQUANTITY).size();
  const viewDefinition = readViewDefinition(new TextDecoder().decode(bytes.subarray(0, 4096)));
  const t2 = now();

  // ---- geometry ----
  const positions = new GrowableF32(1 << 18);
  const normals = new GrowableF32(1 << 18);
  const vertexElement = new GrowableF32(1 << 16);
  const indices = new GrowableU32(1 << 18);
  const edgePos = new GrowableF32(1 << 16);
  const edgeElement = new GrowableF32(1 << 14);
  const localEdgeCache = new Map<number, Float32Array>();
  const elements: ElementRecord[] = [];
  const indexOfExpress = new Map<number, number>();
  const angle = options.edgeAngleDeg ?? 30;
  let triangleCount = 0;
  const mb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];

  api.StreamAllMeshes(modelID, (mesh, i, total) => {
    const expressId = mesh.expressID;
    const line = api.GetLine(modelID, expressId);
    const upper = api.GetNameFromTypeCode(line.type) ?? 'IFCPRODUCT';
    if (SKIP.has(upper)) return;

    let index = indexOfExpress.get(expressId);
    if (index === undefined) {
      index = elements.length;
      indexOfExpress.set(expressId, index);
      elements.push({
        index,
        expressId,
        globalId: str(line.GlobalId),
        ifcClass: prettyIfcClass(upper),
        category: categoryOf(upper),
        name: str(line.Name),
        tag: str(line.Tag),
        typeName: typeOf.get(expressId) ?? '',
        level: levelOf.get(expressId) ?? '',
        mark: marks.byExpressId.get(expressId)?.[0] ?? '',
        markSource: marks.byExpressId.get(expressId)?.[1] ?? '',
        bounds: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
      });
    }
    const rec = elements[index];
    const b = rec.bounds;

    const placed = mesh.geometries;
    for (let g = 0; g < placed.size(); g++) {
      const pg = placed.get(g);
      const geom = api.GetGeometry(modelID, pg.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
      const m = pg.flatTransformation;
      const base = positions.length / 3;
      const vCount = verts.length / 6;

      positions.reserve(vCount * 3);
      normals.reserve(vCount * 3);
      vertexElement.reserve(vCount);
      for (let v = 0; v < vCount; v++) {
        const o = v * 6;
        const x = verts[o], y = verts[o + 1], z = verts[o + 2];
        const px = m[0] * x + m[4] * y + m[8] * z + m[12];
        const py = m[1] * x + m[5] * y + m[9] * z + m[13];
        const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
        positions.push(px); positions.push(py); positions.push(pz);
        if (px < b[0]) b[0] = px; if (py < b[1]) b[1] = py; if (pz < b[2]) b[2] = pz;
        if (px > b[3]) b[3] = px; if (py > b[4]) b[4] = py; if (pz > b[5]) b[5] = pz;
        const nx0 = verts[o + 3], ny0 = verts[o + 4], nz0 = verts[o + 5];
        let nx = m[0] * nx0 + m[4] * ny0 + m[8] * nz0;
        let ny = m[1] * nx0 + m[5] * ny0 + m[9] * nz0;
        let nz = m[2] * nx0 + m[6] * ny0 + m[10] * nz0;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        normals.push(nx); normals.push(ny); normals.push(nz);
        vertexElement.push(index);
      }
      indices.reserve(idx.length);
      for (let k = 0; k < idx.length; k++) indices.push(base + idx[k]);
      triangleCount += idx.length / 3;

      let local = localEdgeCache.get(pg.geometryExpressID);
      if (!local) {
        local = featureEdges(verts, idx, angle);
        localEdgeCache.set(pg.geometryExpressID, local);
      }
      edgePos.reserve(local.length);
      edgeElement.reserve(local.length / 3);
      for (let e = 0; e < local.length; e += 3) {
        const x = local[e], y = local[e + 1], z = local[e + 2];
        edgePos.push(m[0] * x + m[4] * y + m[8] * z + m[12]);
        edgePos.push(m[1] * x + m[5] * y + m[9] * z + m[13]);
        edgePos.push(m[2] * x + m[6] * y + m[10] * z + m[14]);
        edgeElement.push(index);
      }
      geom.delete();
    }
    for (let a = 0; a < 3; a++) {
      if (b[a] < mb[a]) mb[a] = b[a];
      if (b[a + 3] > mb[a + 3]) mb[a + 3] = b[a + 3];
    }
    if (options.onProgress && (i % 500 === 0 || i === total - 1)) options.onProgress(i + 1, total);
  });
  const t3 = now();

  // ---- summary ----
  const categories: Partial<Record<Category, number>> = {};
  const levelCount = new Map<string, number>();
  for (const e of elements) {
    categories[e.category] = (categories[e.category] ?? 0) + 1;
    if (e.level) levelCount.set(e.level, (levelCount.get(e.level) ?? 0) + 1);
  }
  const orderedCategories: Partial<Record<Category, number>> = {};
  for (const c of CATEGORY_ORDER) if (categories[c]) orderedCategories[c] = categories[c];
  const levels: Level[] = [...storeyElev.entries()]
    .map(([name, elevation]) => ({ name, elevation, elementCount: levelCount.get(name) ?? 0 }))
    .sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));

  const model: ParsedModel = {
    info: {
      fileName: options.fileName,
      fileSize: bytes.byteLength,
      schema,
      projectName,
      units,
      levels,
      categories: orderedCategories,
      elementCount: elements.length,
      vertexCount: positions.length / 3,
      triangleCount,
      edgeCount: edgePos.length / 6,
      bounds: elements.length ? (mb as ParsedModel['info']['bounds']) : [0, 0, 0, 0, 0, 0],
      viewDefinition,
      quantitySets,
      compatibility: assessCompatibility({
        schema,
        viewDefinition,
        quantitySets,
        revitPropertySets: ['Dimensions', 'Constraints', 'Identity Data', 'Materials and Finishes'].some((n) => marks.psetNames.has(n)),
        elementCount: elements.length,
        elementsWithoutLevel: elements.filter((e) => !e.level).length,
      }),
      timings: { open: t1 - t0, relations: t2 - t1, geometry: t3 - t2, total: t3 - t0 },
    },
    elements,
    mesh: {
      positions: positions.toArray(),
      normals: normals.toArray(),
      elementIds: vertexElement.toArray(),
      indices: indices.toArray(),
    },
    edges: { positions: edgePos.toArray(), elementIds: edgeElement.toArray() },
  };
  return { modelID, model };
}

// ---------------------------------------------------------------------------
// Properties, read on demand for the selected element.

function valueOf(v: any): PropertyValue {
  if (v === null || v === undefined) return null;
  const raw = typeof v === 'object' && 'value' in v ? v.value : v;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
  const s = String(raw);
  if (s === 'T' || s === '.T.') return true;
  if (s === 'F' || s === '.F.') return false;
  return s;
}

function quantityItem(q: any, units: ModelUnits): PropertyItem | null {
  const name = str(q.Name);
  if (q.LengthValue !== undefined) return { name, value: valueOf(q.LengthValue), unit: units.length };
  if (q.AreaValue !== undefined) return { name, value: valueOf(q.AreaValue), unit: units.area };
  if (q.VolumeValue !== undefined) return { name, value: valueOf(q.VolumeValue), unit: units.volume };
  if (q.CountValue !== undefined) return { name, value: valueOf(q.CountValue), unit: '' };
  if (q.WeightValue !== undefined) return { name, value: valueOf(q.WeightValue), unit: 'kg' };
  if (q.TimeValue !== undefined) return { name, value: valueOf(q.TimeValue), unit: 's' };
  return null;
}

function groupFrom(set: any, units: ModelUnits, kindHint: 'pset' | 'type'): PropertyGroup | null {
  const name = str(set.Name) || 'Properties';
  const items: PropertyItem[] = [];
  if (Array.isArray(set.HasProperties)) {
    for (const p of set.HasProperties) {
      if (!p) continue;
      if (p.NominalValue !== undefined) items.push({ name: str(p.Name), value: valueOf(p.NominalValue), unit: '' });
      else if (Array.isArray(p.EnumerationValues))
        items.push({ name: str(p.Name), value: p.EnumerationValues.map(valueOf).join(', '), unit: '' });
      else if (Array.isArray(p.ListValues)) items.push({ name: str(p.Name), value: p.ListValues.map(valueOf).join(', '), unit: '' });
    }
    return { name, kind: kindHint, items };
  }
  if (Array.isArray(set.Quantities)) {
    for (const q of set.Quantities) {
      const item = q ? quantityItem(q, units) : null;
      if (item) items.push(item);
    }
    return { name, kind: 'qto', items };
  }
  return null;
}

/** Attributes, property sets, quantity sets and type properties of one element. */
export async function readProperties(api: IfcAPI, modelID: number, expressId: number, units: ModelUnits): Promise<PropertyGroup[]> {
  const line = api.GetLine(modelID, expressId);
  const attributes: PropertyItem[] = [
    { name: 'Name', value: str(line.Name) || null, unit: '' },
    { name: 'Description', value: str(line.Description) || null, unit: '' },
    { name: 'Object type', value: str(line.ObjectType) || null, unit: '' },
    { name: 'Tag', value: str(line.Tag) || null, unit: '' },
    { name: 'Predefined type', value: str(line.PredefinedType) || null, unit: '' },
  ].filter((i) => i.value !== null);
  const groups: PropertyGroup[] = [{ name: 'Attributes', kind: 'attributes', items: attributes }];

  const sets: any[] = await api.properties.getPropertySets(modelID, expressId, true, false);
  for (const s of sets) {
    const g = groupFrom(s, units, 'pset');
    if (g && g.items.length) groups.push(g);
  }
  const typeSets: any[] = await api.properties.getTypeProperties(modelID, expressId, true);
  for (const t of typeSets) {
    for (const s of t.HasPropertySets ?? []) {
      const g = groupFrom(s, units, 'type');
      if (g && g.items.length) groups.push({ ...g, name: `${g.name} (type)` });
    }
  }
  return groups;
}
