/**
 * Live updates from Revit (bridge milestone 3): changes Revit reports pile up here until they are
 * merged; after a merge, per-element state held by position is carried to the new positions.
 */
import type { RevitChanges } from './revitBridge';

export interface ChangeSet {
  modified: string[];
  added: string[];
  deleted: string[];
}

export const NO_CHANGES: ChangeSet = { modified: [], added: [], deleted: [] };

/** Adds a batch: added-then-deleted cancels out; deleted is no longer modified; added wins over modified. */
export function addChanges(cur: ChangeSet, c: Pick<RevitChanges, 'modified' | 'added' | 'deleted'>): ChangeSet {
  const modified = new Set(cur.modified), added = new Set(cur.added), deleted = new Set(cur.deleted);
  for (const g of c.added) {
    added.add(g);
    deleted.delete(g);
    modified.delete(g);
  }
  for (const g of c.modified) if (!added.has(g)) modified.add(g);
  for (const g of c.deleted) {
    modified.delete(g);
    if (added.delete(g)) continue; // appeared and went while waiting: nothing to do
    deleted.add(g);
  }
  return { modified: [...modified], added: [...added], deleted: [...deleted] };
}

export const changeCount = (c: ChangeSet): number => c.modified.length + c.added.length + c.deleted.length;

/** The GlobalIds a merge must export from Revit (changed and new). */
export const toExport = (c: ChangeSet): string[] => [...c.modified, ...c.added];

/** Removes what was merged, keeping changes that arrived meanwhile. */
export function withoutMerged(cur: ChangeSet, merged: ChangeSet): ChangeSet {
  const done = new Set([...merged.modified, ...merged.added, ...merged.deleted]);
  const keep = (a: string[]) => a.filter((g) => !done.has(g));
  return { modified: keep(cur.modified), added: keep(cur.added), deleted: keep(cur.deleted) };
}

/** Element positions after a merge (dropped when the element was deleted). */
export function remapIndices(indexMap: ReadonlyMap<number, number>, indices: readonly number[]): number[] {
  return indices.flatMap((i) => (indexMap.has(i) ? [indexMap.get(i)!] : []));
}

/** A record keyed by element position, re-keyed after a merge. */
export function remapRecord<T>(indexMap: ReadonlyMap<number, number>, rec: Readonly<Record<number, T>>): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const at = indexMap.get(Number(k));
    if (at !== undefined) out[at] = v;
  }
  return out;
}
