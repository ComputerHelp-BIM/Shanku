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
  // any digit grouping (1,00,000 or 100,000), a leading + (as values are shown), − or -
  const t = text.replace(/[,\s]/g, '').replace(/^\u2212/, '-').replace(/^\+/, '');
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

/** A native Modify request with typed values (mm, degrees), as the Modify dialog builds it. */
export type ModifyRequest =
  | { kind: 'move' | 'copy'; dx: number; dy: number; dz: number }
  | { kind: 'rotate'; angle: number; about: 'each' | 'group' }
  | { kind: 'mirror'; axis: 'horizontal' | 'vertical' | 'angle'; angle: number; copy: boolean }
  | { kind: 'array'; dx: number; dy: number; dz: number; count: number }
  | { kind: 'offset'; distance: number; copy: boolean };
export type ModifyKind = ModifyRequest['kind'];

const LIMIT = 1_000_000; // 1 km

/** Why a Modify request cannot be applied, or null (the same limits as the add-in's edits). */
export function modifyProblem(r: ModifyRequest): string | null {
  const nums = Object.entries(r).filter(([, v]) => typeof v === 'number') as Array<[string, number]>;
  if (nums.some(([, v]) => Number.isNaN(v))) return 'A value is not a number.';
  switch (r.kind) {
    case 'move':
    case 'copy':
      if (!r.dx && !r.dy && !r.dz) return `Type a distance to ${r.kind} by.`;
      return Math.hypot(r.dx, r.dy, r.dz) > LIMIT ? 'That is more than 1 km.' : null;
    case 'rotate':
      if (!r.angle) return 'Type an angle.';
      return Math.abs(r.angle) > 360 ? 'Turn by at most one full turn (360°).' : null;
    case 'mirror':
      return r.axis === 'angle' && Math.abs(r.angle) > 360 ? 'An axis angle is at most 360°.' : null;
    case 'array':
      if (!Number.isInteger(r.count) || r.count < 2) return 'An array needs a count of 2 or more (the original included).';
      if (r.count > 500) return 'At most 500 in one array.';
      if (!r.dx && !r.dy && !r.dz) return 'Type the spacing between them.';
      return Math.hypot(r.dx, r.dy, r.dz) * (r.count - 1) > LIMIT ? 'The array would reach more than 1 km.' : null;
    case 'offset':
      if (!r.distance) return 'Type the distance (positive: to the left of the beam’s start → end).';
      return Math.abs(r.distance) > LIMIT ? 'That is more than 1 km.' : null;
  }
}
