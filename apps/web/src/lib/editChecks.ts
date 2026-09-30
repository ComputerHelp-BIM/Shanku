/**
 * Checks for edits staged for Revit, as the add-in makes them (Core/EditPlanner.cs), so a mistake shows
 * before it is staged. Plain logic, no UI: the Move / Rotate tool and Type Properties use it, and tests
 * import it without building the UI package.
 */

/** Characters Revit refuses in a type name (as the add-in checks). */
const FORBIDDEN = '{}[]|;<>?`~\\:';

export type GeometryEdit = { kind: 'move'; dx: number; dy: number; dz: number } | { kind: 'rotate'; angle: number; about: 'each' | 'group' };

/** Most one move may be (mm), as the add-in checks: a typo guard. */
const MAX_MOVE = 1_000_000;

/** A typed number ("500", "-1,500", "1 500"); NaN when it is not one. */
export function readNumber(text: string): number {
  const t = text.replace(/[,\s]/g, '').replace(/^\u2212/, '-');
  return t === '' ? 0 : /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

/** Why a move or rotation cannot be staged, or null. */
export function geometryProblem(g: GeometryEdit): string | null {
  if (g.kind === 'move') {
    const d = [g.dx, g.dy, g.dz];
    if (d.some((v) => !Number.isFinite(v))) return 'A distance is not a number.';
    if (d.every((v) => Math.abs(v) < 0.01)) return 'Type a distance to move by.';
    if (d.some((v) => Math.abs(v) > MAX_MOVE)) return 'More than 1 km in one move: check the distance.';
    return null;
  }
  if (!Number.isFinite(g.angle)) return 'The angle is not a number.';
  if (Math.abs(g.angle) < 1e-6) return 'Type an angle to rotate by.';
  if (Math.abs(g.angle) > 360) return 'The angle is more than a full turn.';
  return null;
}

/** Why a new type name cannot be used, or null. */
export function typeNameProblem(name: string, taken: readonly string[]): string | null {
  if (!name.trim()) return 'The new type needs a name.';
  if (name.trim() !== name) return 'The name starts or ends with a space.';
  const bad = [...name].find((c) => FORBIDDEN.includes(c));
  if (bad) return `Revit does not allow "${bad}" in a type name.`;
  if (taken.includes(name)) return 'The family already has a type with this name.';
  return null;
}
