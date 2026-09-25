/**
 * Export to Revit review: elements approved by set (level × kind), as the safety rules ask. Sets keep
 * the drawing's level order; kinds follow the order they are built in.
 */
import type { RevitExchange } from '@shanku/engine';

const KIND_ORDER = ['pcc', 'footing', 'pedestal', 'column', 'wall', 'beam', 'slab', 'chajja'];
export const KIND_LABEL: Record<string, string> = { pcc: 'PCC', footing: 'Footings', pedestal: 'Pedestals', column: 'Columns', wall: 'Walls', beam: 'Beams', slab: 'Slabs', chajja: 'Chajjas' };

export interface ExportSet {
  key: string;
  level: string;
  kind: string;
  ids: string[];
}

/** Sets of elements by level, then kind. */
export function exportSets(x: RevitExchange): ExportSet[] {
  const levelRank = new Map(x.levels.map((l, i) => [l.name, i]));
  const sets = new Map<string, ExportSet>();
  for (const e of x.elements) {
    const key = `${e.level}|${e.kind}`;
    const s = sets.get(key) ?? { key, level: e.level, kind: e.kind, ids: [] };
    s.ids.push(e.id);
    sets.set(key, s);
  }
  const rank = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);
  return [...sets.values()].sort((a, b) => (levelRank.get(a.level) ?? 0) - (levelRank.get(b.level) ?? 0) || rank(a.kind) - rank(b.kind));
}

/** The exchange with only the approved sets' elements (levels are always sent). */
export function approvedOnly(x: RevitExchange, off: ReadonlySet<string>): RevitExchange {
  return { ...x, elements: x.elements.filter((e) => !off.has(`${e.level}|${e.kind}`)) };
}
