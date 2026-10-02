/**
 * Align locks (docs/design/datums-and-constraints.md): after Align, an element's centre or face can be locked to
 * the datum it was aligned to (Revit's padlock). An edit that would take a locked element off its datum is
 * stopped with Revit's "Constraints are not satisfied" — remove the constraints, or cancel. Moving along the
 * datum keeps the lock.
 */
import type { ParamElement, Pt } from '../model/parametric';
import { align } from './ops';

export interface AlignLock {
  id: string;
  /** The element's id (GlobalId). */
  element: string;
  /** The datum's id. */
  datum: string;
  to: 'center' | 'face';
}

/** Whether a lock still holds: aligning again would not move the element (within 0.5 mm). */
export function lockHolds(e: ParamElement, lock: AlignLock, line: { a: Pt; b: Pt }): boolean {
  const r = align([e], line.a, line.b, lock.to);
  if (r.refused.length || !r.changed.length) return false;
  const moved = r.changed[0];
  const at = (x: ParamElement) => x.center ?? x.start ?? x.outline?.[0] ?? [0, 0];
  const p = at(e), q = at(moved);
  return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5;
}

/** The locks an edit would break: its changed elements that would no longer sit on their datums. */
export function brokenLocks(changed: readonly ParamElement[], locks: readonly AlignLock[], lineOf: (datum: string) => { a: Pt; b: Pt } | null): AlignLock[] {
  const byId = new Map(changed.map((e) => [e.id, e]));
  return locks.filter((l) => {
    const e = byId.get(l.element);
    if (!e) return false;
    const line = lineOf(l.datum);
    return line ? !lockHolds(e, l, line) : false;
  });
}
