import type { Category, ElementRecord } from '@shanku/engine';

/**
 * Marks from a pasted message (quick-wins B2): "C1, C4, B12", one per line, "C1-C5" or "C1 to C5".
 * Site queries arrive this way on WhatsApp and in Excel; Shanku selects every element with those
 * marks (all levels) and lists the ones it could not find.
 */
export function parseMarkList(text: string, maxRange = 200): string[] {
  const out: string[] = [];
  const cleaned = text.replace(/\s+to\s+/gi, '-').replace(/\band\b/gi, ',');
  for (const raw of cleaned.split(/[\s,;|/]+/)) {
    const tok = raw.replace(/^[("'[]+|[)"'\].:]+$/g, '').trim();
    if (!tok) continue;
    const range = /^([A-Za-z]+)(\d+)-\1?(\d+)$/i.exec(tok);
    if (range) {
      const [, prefix, a, b] = range;
      const lo = Math.min(+a, +b), hi = Math.max(+a, +b);
      if (hi - lo <= maxRange) {
        for (let n = lo; n <= hi; n++) out.push(`${prefix}${n}`);
        continue;
      }
    }
    out.push(tok);
  }
  return [...new Set(out.map((t) => t.toUpperCase()))];
}

/** Marks compare without case, spaces or hyphens, so "c-1" finds "C1". */
export const normMark = (m: string) => m.toUpperCase().replace(/[\s-]+/g, '');

/** Elements whose mark is in the list, and the list entries nothing matched. */
export function matchMarks(elements: readonly ElementRecord[], marks: readonly string[]): { indices: number[]; found: string[]; unknown: string[] } {
  const want = new Map(marks.map((m) => [normMark(m), m]));
  const hit = new Set<string>();
  const indices: number[] = [];
  for (const e of elements) {
    if (!e.mark) continue;
    const k = normMark(e.mark);
    if (want.has(k)) {
      indices.push(e.index);
      hit.add(k);
    }
  }
  return { indices, found: marks.filter((m) => hit.has(normMark(m))), unknown: marks.filter((m) => !hit.has(normMark(m))) };
}

/** Is this pasted text worth treating as a mark list (at least one token that looks like a mark)? */
export const looksLikeMarks = (text: string) => text.length < 5000 && /\b[A-Za-z]{1,4}-?\d{1,4}\b/.test(text);

const DEFAULT_PREFIX: Partial<Record<Category, string>> = { Column: 'C', Beam: 'B', Slab: 'S', Wall: 'W', Footing: 'F', Pile: 'P', Stair: 'ST' };

/**
 * New marks for unmarked elements that continue the model's own numbering: the prefix most used in
 * that category (else C, B, S, W, F…), numbered after the highest in use, lowest level first and
 * then left to right, front to back, so the result reads like a hand-numbered drawing.
 */
export function proposeMarks(elements: readonly ElementRecord[], targets: readonly number[], levelOrder: readonly string[] = []): Array<{ index: number; mark: string }> {
  const rank = new Map(levelOrder.map((l, i) => [l, i]));
  const byCat = new Map<Category, ElementRecord[]>();
  for (const i of targets) {
    const e = elements[i];
    if (!e || e.mark) continue;
    byCat.set(e.category, [...(byCat.get(e.category) ?? []), e]);
  }
  const out: Array<{ index: number; mark: string }> = [];
  for (const [cat, list] of byCat) {
    const prefixes = new Map<string, number>();
    const used = new Map<string, number>();
    for (const e of elements) {
      if (e.category !== cat || !e.mark) continue;
      const m = /^([A-Za-z]+)-?(\d+)/.exec(e.mark);
      if (!m) continue;
      const p = m[1].toUpperCase();
      prefixes.set(p, (prefixes.get(p) ?? 0) + 1);
      used.set(p, Math.max(used.get(p) ?? 0, +m[2]));
    }
    const prefix = [...prefixes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_PREFIX[cat] ?? cat[0];
    let n = used.get(prefix) ?? 0;
    const sorted = [...list].sort(
      (a, b) =>
        (rank.get(a.level) ?? 1e9) - (rank.get(b.level) ?? 1e9) ||
        Math.round((b.bounds[5] + b.bounds[2]) * 5) - Math.round((a.bounds[5] + a.bounds[2]) * 5) || // back to front in rows of 0.2 m
        a.bounds[0] - b.bounds[0],
    );
    for (const e of sorted) out.push({ index: e.index, mark: `${prefix}${++n}` });
  }
  return out;
}
