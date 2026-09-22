import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

/**
 * Mark detection. Rules are property names in priority order, case-insensitive.
 * A rule can be qualified with its property set: "01--COLUMN_M.ID". The first
 * rule with a non-empty value wins for each element.
 */
export const DEFAULT_MARK_RULES: readonly string[] = ['Mark', 'Schedule Mark', 'ID', 'Type Mark', 'Comments'];

/**
 * Concrete grade rules, same syntax as marks. When none match, the element's IFC
 * material name is used (e.g. "RCC_COLUMN"), so every element lands in a group.
 */
export const DEFAULT_GRADE_RULES: readonly string[] = ['Concrete Grade', 'ConcreteGrade', 'Grade', 'Concrete Class', 'Structural Material'];

export interface MarkResult {
  /** Per element express id: [mark, "PsetName.Property"]. */
  byExpressId: Map<number, [string, string]>;
  /** Every property set name seen (for compatibility checks). */
  psetNames: Set<string>;
}

interface Rule {
  pset: string | null;
  prop: string;
}

export function parseRules(rules: readonly string[]): Rule[] {
  return rules
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const dot = r.lastIndexOf('.');
      return dot > 0 ? { pset: r.slice(0, dot).toLowerCase(), prop: r.slice(dot + 1).toLowerCase() } : { pset: null, prop: r.toLowerCase() };
    });
}

/** Priority of a (pset, property) pair under the rules, or -1 when no rule matches. */
export function rulePriority(rules: Rule[], pset: string, prop: string): number {
  const ps = pset.toLowerCase();
  const pr = prop.toLowerCase();
  return rules.findIndex((r) => r.prop === pr && (r.pset === null || r.pset === ps));
}

const val = (v: any): string => {
  const raw = v && typeof v === 'object' && 'value' in v ? v.value : v;
  return raw === null || raw === undefined ? '' : String(raw).trim();
};
const ref = (v: any): number | null => (v && typeof v === 'object' && 'value' in v ? Number(v.value) : null);

/** One pass over IfcRelDefinesByProperties. Cost grows with the number of property sets, not elements × rules. */
export function detectMarks(api: IfcAPI, modelID: number, rules: readonly string[]): MarkResult {
  const parsed = parseRules(rules);
  const best = new Map<number, [string, string, number]>();
  const psetNames = new Set<string>();
  const propCache = new Map<number, { name: string; value: string }>();
  const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  for (let i = 0; i < ids.size(); i++) {
    const rel = api.GetLine(modelID, ids.get(i));
    const psId = ref(rel.RelatingPropertyDefinition);
    if (psId === null) continue;
    const ps = api.GetLine(modelID, psId);
    if (!ps || ps.type !== WebIFC.IFCPROPERTYSET) continue;
    const psName = val(ps.Name);
    psetNames.add(psName);
    if (!parsed.length) continue;
    let hit: [string, string, number] | null = null;
    for (const p of ps.HasProperties ?? []) {
      const pid = ref(p);
      if (pid === null) continue;
      let prop = propCache.get(pid);
      if (!prop) {
        const line = api.GetLine(modelID, pid);
        prop = { name: val(line?.Name), value: line?.NominalValue !== undefined ? val(line.NominalValue) : '' };
        propCache.set(pid, prop);
      }
      if (!prop.value) continue;
      const pri = rulePriority(parsed, psName, prop.name);
      if (pri >= 0 && (!hit || pri < hit[2])) hit = [prop.value, `${psName}.${prop.name}`, pri];
    }
    if (!hit) continue;
    for (const o of rel.RelatedObjects ?? []) {
      const id = ref(o);
      if (id === null) continue;
      const cur = best.get(id);
      if (!cur || hit[2] < cur[2]) best.set(id, hit);
    }
  }
  const byExpressId = new Map<number, [string, string]>();
  for (const [id, [v, src]] of best) byExpressId.set(id, [v, src]);
  return { byExpressId, psetNames };
}
