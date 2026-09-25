import type { ElementRecord } from '@shanku/engine';

/**
 * What a BOQ counts (from the Structura viewer's scope switch). Every total in the BOQ window and
 * the Excel export carries the sentence from describeScope(), so a number never travels without
 * saying what it includes.
 */
export type BoqScope = { kind: 'model' } | { kind: 'visible' } | { kind: 'selection' } | { kind: 'levels'; from: string; to: string };

export interface ScopeContext {
  /** Elements hidden in the active view (temporary hide/isolate, Visibility/Graphics, filters). */
  hidden: ReadonlySet<number>;
  selection: ReadonlySet<number>;
  /** Level names, lowest first. */
  levels: readonly string[];
}

/** The elements a scope includes, in model order. A level range includes both ends, in either order. */
export function scopeElements(elements: readonly ElementRecord[], scope: BoqScope, ctx: ScopeContext): ElementRecord[] {
  switch (scope.kind) {
    case 'model':
      return [...elements];
    case 'visible':
      return elements.filter((e) => !ctx.hidden.has(e.index));
    case 'selection':
      return elements.filter((e) => ctx.selection.has(e.index));
    case 'levels': {
      const a = ctx.levels.indexOf(scope.from), b = ctx.levels.indexOf(scope.to);
      if (a < 0 || b < 0) return [];
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const keep = new Set(ctx.levels.slice(lo, hi + 1));
      return elements.filter((e) => keep.has(e.level));
    }
  }
}

/** "Visible elements only · 312 of 850": what the numbers include, in one line. */
export function describeScope(scope: BoqScope, count: number, total: number): string {
  const n = (v: number) => v.toLocaleString('en-IN');
  const part = `${n(count)} of ${n(total)} elements`;
  switch (scope.kind) {
    case 'model':
      return `Whole model · ${n(total)} elements`;
    case 'visible':
      return `Visible elements only · ${part} (hidden in this view left out; the section box is not applied)`;
    case 'selection':
      return `Selection only · ${part}`;
    case 'levels':
      return `${scope.from === scope.to ? `${scope.from} only` : `${scope.from} to ${scope.to}`} · ${part}`;
  }
}
