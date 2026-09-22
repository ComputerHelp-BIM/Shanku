import { CATEGORY_ORDER } from './categories';
import type { Category, ElementRecord, Level } from './types';

export type BoqKey = 'level' | 'category' | 'grade';

export interface BoqRow {
  level: string;
  category: Category | '';
  grade: string;
  count: number;
  /** m³ */
  volume: number;
  /** m, summed where the category has a length. */
  length: number;
  /** m², summed where the category has an area. */
  area: number;
  /** How many elements in the row used geometry instead of IFC quantities. */
  fromGeometry: number;
  elements: number[];
}

export interface Boq {
  groupBy: BoqKey[];
  rows: BoqRow[];
  total: Omit<BoqRow, 'level' | 'category' | 'grade' | 'elements'>;
}

/**
 * Groups elements into BOQ rows by any combination of level, category and grade.
 * Rows sort by level elevation, then the category order used across Shanku, then grade.
 */
export function buildBoq(elements: readonly ElementRecord[], levels: readonly Level[], groupBy: BoqKey[], include?: (e: ElementRecord) => boolean): Boq {
  const levelRank = new Map(levels.map((l, i) => [l.name, i]));
  const map = new Map<string, BoqRow>();
  const total = { count: 0, volume: 0, length: 0, area: 0, fromGeometry: 0 };
  for (const e of elements) {
    if (include && !include(e)) continue;
    const level = groupBy.includes('level') ? e.level || '(no level)' : '';
    const category = groupBy.includes('category') ? e.category : '';
    const grade = groupBy.includes('grade') ? e.grade || '(no grade)' : '';
    const key = `${level}\u0000${category}\u0000${grade}`;
    let row = map.get(key);
    if (!row) map.set(key, (row = { level, category, grade, count: 0, volume: 0, length: 0, area: 0, fromGeometry: 0, elements: [] }));
    row.count++;
    row.volume += e.volume;
    row.length += e.length ?? 0;
    row.area += e.area ?? 0;
    if (e.quantitySource === 'geometry') row.fromGeometry++;
    row.elements.push(e.index);
    total.count++;
    total.volume += e.volume;
    total.length += e.length ?? 0;
    total.area += e.area ?? 0;
    if (e.quantitySource === 'geometry') total.fromGeometry++;
  }
  const cat = (c: string) => (c ? CATEGORY_ORDER.indexOf(c as Category) : -1);
  const rows = [...map.values()].sort(
    (a, b) =>
      (levelRank.get(a.level) ?? 1e9) - (levelRank.get(b.level) ?? 1e9) ||
      a.level.localeCompare(b.level) ||
      cat(a.category) - cat(b.category) ||
      a.grade.localeCompare(b.grade),
  );
  return { groupBy, rows, total };
}
