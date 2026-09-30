/**
 * Parameter editing in Shanku: edits become pending changes, shown in Properties and reviewed in the
 * Changes window, then sent to their destination. Revit (through the bridge) is the first destination;
 * later ones (saving IFC, geometry edits) reuse the same changes.
 *
 * Every change remembers the value Revit had when Shanku read it, so the add-in can refuse it if
 * someone changed that value in Revit since.
 */

export type ParamKind = 'text' | 'number' | 'integer' | 'yesno' | 'element';

export interface RevitParam {
  id: number;
  name: string;
  group: string;
  kind: ParamKind;
  display: string | null;
  readOnly: boolean;
  why?: string | null;
  /** Display unit symbol for numbers ("mm", "m³"…), add-in 0.4.0+. */
  unit?: string | null;
}

export interface RevitElementParams {
  globalId: string;
  elementId: number;
  category: string;
  typeName: string;
  /** Instance parameters, in the Properties palette's order (add-in 0.3.0+). */
  params: RevitParam[];
  familyName?: string;
  /** Type parameters (add-in 0.3.0+; editable where Revit allows from 0.12.0). */
  typeParams?: RevitParam[];
  /** The type's element id, how many instances it has, and the types it can switch to (add-in 0.12.0+). */
  typeId?: number;
  typeInstances?: number;
  types?: TypeChoice[];
}

/** A type an element can switch to (its category's). */
export interface TypeChoice {
  id: number;
  family: string;
  name: string;
}

/**
 * What a pending change does in Revit (add-in 0.12.0, POST /elements/edit): an instance parameter, a type
 * parameter (every instance of the type), another type for elements, a duplicated type, a move or a rotation.
 */
export type EditKind = 'param' | 'typeParam' | 'setType' | 'duplicateType' | 'move' | 'rotate';

export interface PendingChange {
  globalId: string;
  paramId: number;
  name: string;
  /** Revit's value when read: a different value in Revit now is a conflict. */
  oldDisplay: string | null;
  value: string;
  /** For the Changes window: "Structural Columns C1". */
  element: string;
  /** Default 'param'. For the others, globalId is a key ("type:…", "op:…") and the fields below say what to do. */
  kind?: EditKind;
  /** The elements a setType, duplicateType, move or rotate acts on. */
  globalIds?: string[];
  typeId?: number;
  familyName?: string;
  typeName?: string;
  newName?: string;
  /** Move, mm along the model's axes (Revit's internal axes). */
  dx?: number;
  dy?: number;
  dz?: number;
  /** Rotate, degrees counter-clockwise seen from above, about each element's centre or the group's. */
  angle?: number;
  about?: 'each' | 'group';
}

/** The add-in's edit (POST /elements/edit). */
export interface EditOp {
  kind: EditKind;
  globalIds: string[];
  paramId?: number;
  name?: string;
  oldDisplay?: string | null;
  value?: string;
  typeId?: number;
  familyName?: string;
  typeName?: string;
  newName?: string;
  dx?: number;
  dy?: number;
  dz?: number;
  angle?: number;
  about?: 'each' | 'group';
}

/** Which type a type-parameter edit is for: an existing type by id, or one duplicated in the same apply. */
export interface TypeRef {
  typeId?: number;
  familyName: string;
  typeName: string;
}

/** The key type-parameter edits of a type share (its "globalId" in the pending list). */
export const typeKey = (t: TypeRef): string => (t.typeId ? `type:${t.typeId}` : `type:${t.familyName}/${t.typeName}`);

let opSerial = 0;
/** Adds a move, rotation, type switch or duplicated type as its own row. */
export function stageOp(pending: readonly PendingChange[], change: Omit<PendingChange, 'globalId' | 'paramId' | 'oldDisplay'>): PendingChange[] {
  opSerial += 1;
  return [...pending, { ...change, globalId: `op:${Date.now().toString(36)}${opSerial}`, paramId: 0, oldDisplay: null }];
}

/** Stages a type parameter: one row per type and parameter (a new value replaces the earlier one). */
export function stageTypeEdit(pending: readonly PendingChange[], type: TypeRef, p: Pick<RevitParam, 'id' | 'name' | 'display'>, value: string, label: string): PendingChange[] {
  const key = typeKey(type);
  const rest = pending.filter((c) => !(c.globalId === key && c.paramId === p.id && c.name === p.name));
  if (value === (p.display ?? '')) return rest; // back to Revit's value: nothing to change
  return [...rest, { kind: 'typeParam', globalId: key, paramId: p.id, name: p.name, oldDisplay: p.display, value, element: label, typeId: type.typeId, familyName: type.familyName, typeName: type.typeName }];
}

/** A pending change as the add-in's edit. */
export function toEditOp(c: PendingChange): EditOp {
  const kind = c.kind ?? 'param';
  if (kind === 'param') return { kind, globalIds: [c.globalId], paramId: c.paramId, name: c.name, oldDisplay: c.oldDisplay, value: c.value };
  if (kind === 'typeParam') return { kind, globalIds: [], paramId: c.paramId, name: c.name, oldDisplay: c.typeId ? c.oldDisplay : null, value: c.value, typeId: c.typeId, familyName: c.familyName, typeName: c.typeName };
  const { globalIds = [], typeId, familyName, typeName, newName, dx, dy, dz, angle, about } = c;
  return { kind, globalIds, typeId, familyName, typeName, newName, dx, dy, dz, angle, about };
}

/** Changes that move, turn or retype elements: Shanku reloads their geometry from Revit after applying. */
export const changesGeometry = (c: PendingChange): boolean => c.kind === 'move' || c.kind === 'rotate' || c.kind === 'setType' || c.kind === 'duplicateType' || c.kind === 'typeParam';

/** The outcome of checking or applying a change in Revit. */
export interface ChangeOutcome {
  ok: boolean;
  error?: string | null;
  newDisplay?: string | null;
}

export const changeKey = (c: Pick<PendingChange, 'globalId' | 'paramId' | 'name'>): string => `${c.globalId}|${c.paramId}|${c.name}`;

export interface CommonParam {
  id: number;
  name: string;
  group: string;
  kind: ParamKind;
  readOnly: boolean;
  why?: string | null;
  unit?: string | null;
  /** Revit's value (null when the selection differs). */
  display: string | null;
  varies: boolean;
}

/** Parameters every selected element has (same id and name), with Varies where values differ. */
export function commonParams(els: readonly RevitElementParams[]): CommonParam[] {
  if (!els.length) return [];
  const key = (p: RevitParam) => `${p.id}|${p.name}`;
  const rest = els.slice(1).map((e) => new Map(e.params.map((p) => [key(p), p])));
  const out: CommonParam[] = [];
  const seen = new Set<string>();
  for (const p of els[0].params) {
    // An add-in before 0.3.0 also sent Revit's hidden schedule copies (a second "Base Offset"): keep one.
    const shown = `${p.group}\u0001${p.name}`;
    if (seen.has(shown)) continue;
    seen.add(shown);
    const others = rest.map((m) => m.get(key(p)));
    if (others.some((o) => !o)) continue;
    const all = [p, ...(others as RevitParam[])];
    const varies = all.some((o) => o.display !== p.display);
    out.push({
      id: p.id,
      name: p.name,
      group: p.group,
      kind: p.kind,
      readOnly: all.some((o) => o.readOnly),
      why: all.find((o) => o.readOnly)?.why ?? null,
      unit: p.unit ?? null,
      display: varies ? null : p.display,
      varies,
    });
  }
  return out;
}

/** What Shanku shows for a parameter of an element: the pending value if there is one. */
export function effectiveDisplay(pending: readonly PendingChange[], globalId: string, p: Pick<RevitParam, 'id' | 'name' | 'display'>): { display: string | null; modified: boolean } {
  const c = pending.find((x) => x.globalId === globalId && x.paramId === p.id && x.name === p.name);
  return c ? { display: c.value, modified: true } : { display: p.display, modified: false };
}

/** The same, across a selection: modified if any element has a pending value; varies if they differ. */
export function effectiveCommon(pending: readonly PendingChange[], els: readonly RevitElementParams[], p: CommonParam): { display: string | null; varies: boolean; modified: boolean } {
  const values = els.map((e) => {
    const own = e.params.find((x) => x.id === p.id && x.name === p.name);
    return effectiveDisplay(pending, e.globalId, own ?? { id: p.id, name: p.name, display: null });
  });
  const modified = values.some((v) => v.modified);
  const varies = values.some((v) => v.display !== values[0].display);
  return { display: varies ? null : values[0].display, varies, modified };
}

/**
 * Stages one edit on the selected elements. A value equal to what Revit has removes the change
 * (typing the old value back is an undo, not a change).
 */
export function stageEdit(pending: readonly PendingChange[], els: readonly RevitElementParams[], p: Pick<CommonParam, 'id' | 'name'>, value: string, label: (e: RevitElementParams) => string): PendingChange[] {
  const next = new Map(pending.map((c) => [changeKey(c), c]));
  for (const e of els) {
    const own = e.params.find((x) => x.id === p.id && x.name === p.name);
    if (!own || own.readOnly) continue;
    const k = changeKey({ globalId: e.globalId, paramId: p.id, name: p.name });
    if ((own.display ?? '') === value) next.delete(k);
    else next.set(k, { globalId: e.globalId, paramId: p.id, name: p.name, oldDisplay: own.display, value, element: label(e) });
  }
  return [...next.values()];
}

/**
 * After an apply: changes Revit accepted leave the list; refused ones stay, with their reason.
 * `sent` and `results` are in the same order.
 */
export function afterApply(pending: readonly PendingChange[], sent: readonly PendingChange[], results: readonly ChangeOutcome[]): { remaining: PendingChange[]; applied: number; failed: Map<string, string> } {
  const done = new Set<string>();
  const failed = new Map<string, string>();
  sent.forEach((c, i) => {
    const r = results[i];
    if (r?.ok) done.add(changeKey(c));
    else failed.set(changeKey(c), r?.error ?? 'Revit did not answer for this change.');
  });
  return { remaining: pending.filter((c) => !done.has(changeKey(c))), applied: done.size, failed };
}

/** Groups parameters by their Revit group, keeping Revit's order (groups and rows as they come). */
export function byGroup<T extends { group: string; name: string }>(params: readonly T[]): Array<{ group: string; params: T[] }> {
  const groups = new Map<string, T[]>();
  for (const p of params) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return [...groups.entries()].map(([group, ps]) => ({ group, params: ps }));
}
