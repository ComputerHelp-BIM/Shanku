import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import type { ModelUnits } from '../model/types';

/** Base quantities of one element, converted to SI (m, m², m³). */
export interface RawQuantities {
  netVolume?: number;
  grossVolume?: number;
  netArea?: number;
  grossArea?: number;
  netSideArea?: number;
  grossSideArea?: number;
  length?: number;
  depth?: number;
}

const FACTOR: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001, dm: 0.1, km: 1000 };
/** "mm" -> 0.001; "mm²" -> 1e-6; "mm³" -> 1e-9. Unknown -> 1. */
export function siFactor(unit: string): number {
  const base = unit.replace(/[²³]/g, '');
  const f = FACTOR[base] ?? 1;
  return unit.endsWith('³') ? f ** 3 : unit.endsWith('²') ? f ** 2 : f;
}

const num = (v: any): number | undefined => {
  const raw = v && typeof v === 'object' && 'value' in v ? v.value : v;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
};
const ref = (v: any): number | null => (v && typeof v === 'object' && 'value' in v ? Number(v.value) : null);
const name = (v: any): string => String(v && typeof v === 'object' && 'value' in v ? v.value ?? '' : '');

/**
 * Reads every IfcElementQuantity (Qto_*BaseQuantities in IFC4, "BaseQuantities" in IFC2x3)
 * in one pass and returns SI values per element express id.
 */
export function readQuantities(api: IfcAPI, modelID: number, units: ModelUnits): Map<number, RawQuantities> {
  const fl = siFactor(units.length);
  const fa = siFactor(units.area);
  const fv = siFactor(units.volume);
  const out = new Map<number, RawQuantities>();
  const qCache = new Map<number, RawQuantities>();
  const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  for (let i = 0; i < ids.size(); i++) {
    const rel = api.GetLine(modelID, ids.get(i));
    const qsId = ref(rel.RelatingPropertyDefinition);
    if (qsId === null) continue;
    let q = qCache.get(qsId);
    if (!q) {
      const qs = api.GetLine(modelID, qsId);
      if (!qs || qs.type !== WebIFC.IFCELEMENTQUANTITY) continue;
      q = {};
      for (const r of qs.Quantities ?? []) {
        const id = ref(r);
        if (id === null) continue;
        const line = api.GetLine(modelID, id);
        const n = name(line?.Name);
        const vol = num(line?.VolumeValue);
        const area = num(line?.AreaValue);
        const len = num(line?.LengthValue);
        if (vol !== undefined) {
          if (n === 'NetVolume') q.netVolume = vol * fv;
          else if (n === 'GrossVolume') q.grossVolume = vol * fv;
        } else if (area !== undefined) {
          if (n === 'NetArea') q.netArea = area * fa;
          else if (n === 'GrossArea') q.grossArea = area * fa;
          else if (n === 'NetSideArea') q.netSideArea = area * fa;
          else if (n === 'GrossSideArea') q.grossSideArea = area * fa;
        } else if (len !== undefined) {
          if (n === 'Length') q.length = len * fl;
          else if (n === 'Depth') q.depth = len * fl;
        }
      }
      qCache.set(qsId, q);
    }
    for (const o of rel.RelatedObjects ?? []) {
      const id = ref(o);
      if (id === null) continue;
      out.set(id, { ...out.get(id), ...q });
    }
  }
  return out;
}

/** First material name per element, from IfcRelAssociatesMaterial (element or its type). */
export function readMaterials(api: IfcAPI, modelID: number, typeIdOf: Map<number, number>): Map<number, string> {
  const nameOf = (id: number | null, depth = 0): string => {
    if (id === null || depth > 4) return '';
    const m = api.GetLine(modelID, id);
    if (!m) return '';
    switch (m.type) {
      case WebIFC.IFCMATERIAL:
        return name(m.Name);
      case WebIFC.IFCMATERIALLAYERSETUSAGE:
        return nameOf(ref(m.ForLayerSet), depth + 1);
      case WebIFC.IFCMATERIALLAYERSET:
        return nameOf(ref(m.MaterialLayers?.[0]), depth + 1);
      case WebIFC.IFCMATERIALLAYER:
        return nameOf(ref(m.Material), depth + 1);
      case WebIFC.IFCMATERIALPROFILESETUSAGE:
        return nameOf(ref(m.ForProfileSet), depth + 1);
      case WebIFC.IFCMATERIALPROFILESET:
        return nameOf(ref(m.MaterialProfiles?.[0]), depth + 1);
      case WebIFC.IFCMATERIALPROFILE:
        return nameOf(ref(m.Material), depth + 1);
      case WebIFC.IFCMATERIALLIST:
        return nameOf(ref(m.Materials?.[0]), depth + 1);
      case WebIFC.IFCMATERIALCONSTITUENTSET:
        return nameOf(ref(m.MaterialConstituents?.[0]), depth + 1);
      case WebIFC.IFCMATERIALCONSTITUENT:
        return nameOf(ref(m.Material), depth + 1);
      default:
        return '';
    }
  };
  const direct = new Map<number, string>();
  const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
  for (let i = 0; i < ids.size(); i++) {
    const rel = api.GetLine(modelID, ids.get(i));
    const n = nameOf(ref(rel.RelatingMaterial));
    if (!n) continue;
    for (const o of rel.RelatedObjects ?? []) {
      const id = ref(o);
      if (id !== null) direct.set(id, n);
    }
  }
  // Elements without their own material inherit their type's.
  for (const [el, type] of typeIdOf) if (!direct.has(el) && direct.has(type)) direct.set(el, direct.get(type)!);
  return direct;
}
