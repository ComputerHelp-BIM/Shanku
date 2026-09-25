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
}

export interface RevitElementParams {
  globalId: string;
  elementId: number;
  category: string;
  typeName: string;
  params: RevitParam[];
}

export interface PendingChange {
  globalId: string;
  paramId: number;
  name: string;
  /** Revit's value when read: a different value in Revit now is a conflict. */
  oldDisplay: string | null;
  value: string;
  /** For the Changes window: "Structural Columns C1". */
  element: string;
}

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
  for (const p of els[0].params) {
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

/** Groups parameters by their Revit group, in Revit's usual order for the common ones. */
export function byGroup<T extends { group: string; name: string }>(params: readonly T[]): Array<{ group: string; params: T[] }> {
  const ORDER = ['Constraints', 'Structural', 'Dimensions', 'Identity Data', 'Materials and Finishes', 'Phasing'];
  const groups = new Map<string, T[]>();
  for (const p of params) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  const rank = (g: string) => (ORDER.includes(g) ? ORDER.indexOf(g) : ORDER.length);
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])).map(([group, ps]) => ({ group, params: ps }));
}
