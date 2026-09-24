import { CATEGORY_ORDER } from '../model/categories';
import type { ElementRecord } from '../model/types';

/**
 * Exploded views: every element is moved by a fixed offset (world metres, Y up) scaled by an
 * amount from 0 (assembled) to 1 (fully exploded). Offsets are computed once per mode on the CPU and
 * applied in the vertex shaders, so exploding never rebuilds geometry.
 */
export type ExplodeMode = 'storeys' | 'radial' | 'categories';

export const EXPLODE_MODES: ReadonlyArray<{ id: ExplodeMode; label: string; hint: string }> = [
  { id: 'storeys', label: 'Storeys', hint: 'Lift each storey apart from the one below' },
  { id: 'radial', label: 'Radial', hint: 'Push elements outwards from the middle of the plan' },
  { id: 'categories', label: 'Categories', hint: 'Lay columns, beams, slabs, walls and footings side by side' },
];

type Bounds = ElementRecord['bounds'];

/** Tolerance when deciding which storey an element starts on (metres). */
const STOREY_TOLERANCE = 0.05;

const centreX = (b: Bounds) => (b[0] + b[3]) / 2;
const centreZ = (b: Bounds) => (b[2] + b[5]) / 2;

/**
 * Storey rank per element: levels are ordered by the lowest element on them, and an element sits on
 * the highest level whose base is at or below its own base (so elements with no level still stack).
 */
function storeyRanks(elements: readonly ElementRecord[]): { rank: Int32Array; gap: number } {
  const base = new Map<string, number>();
  for (const e of elements) {
    if (!e.level) continue;
    const y = e.bounds[1];
    const cur = base.get(e.level);
    if (cur === undefined || y < cur) base.set(e.level, y);
  }
  const bases = [...base.values()].sort((a, b) => a - b);
  const rank = new Int32Array(elements.length);
  elements.forEach((e, i) => {
    const y = e.level && base.has(e.level) ? base.get(e.level)! : e.bounds[1];
    let r = 0;
    for (let k = 0; k < bases.length; k++) if (bases[k] <= y + STOREY_TOLERANCE) r = k;
    rank[i] = r;
  });
  // Typical storey height: median gap between level bases, else a tenth of the model height.
  const gaps = bases.slice(1).map((b, k) => b - bases[k]).filter((g) => g > STOREY_TOLERANCE).sort((a, b) => a - b);
  let gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  if (!(gap > 0)) {
    let lo = Infinity, hi = -Infinity;
    for (const e of elements) {
      lo = Math.min(lo, e.bounds[1]);
      hi = Math.max(hi, e.bounds[4]);
    }
    gap = Number.isFinite(hi - lo) && hi > lo ? (hi - lo) / 10 : 3;
  }
  return { rank, gap };
}

/**
 * Offsets per element at full explosion, packed as x, y, z (length = elements × 3).
 * `storeys`: each storey is lifted by one typical storey height per storey below it.
 * `radial`: each element moves away from the plan centre by its own distance from it.
 * `categories`: categories are laid out along X, one model width (plus 25 %) apart, centred.
 */
/**
 * Offsets for several modes at once: they add up (storeys lift in Y, radial spreads in the plan,
 * categories lay out along X), so any combination is well defined.
 */
export function explodeOffsets(elements: readonly ElementRecord[], modes: ExplodeMode | readonly ExplodeMode[]): Float32Array {
  const list = typeof modes === 'string' ? [modes] : [...new Set(modes)];
  if (list.length === 1) return explodeOffsetsOne(elements, list[0]);
  const out = new Float32Array(elements.length * 3);
  for (const m of list) {
    const o = explodeOffsetsOne(elements, m);
    for (let i = 0; i < out.length; i++) out[i] += o[i];
  }
  return out;
}

function explodeOffsetsOne(elements: readonly ElementRecord[], mode: ExplodeMode): Float32Array {
  const out = new Float32Array(elements.length * 3);
  if (!elements.length) return out;
  if (mode === 'storeys') {
    const { rank, gap } = storeyRanks(elements);
    for (let i = 0; i < elements.length; i++) out[i * 3 + 1] = rank[i] * gap;
    return out;
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const e of elements) {
    x0 = Math.min(x0, e.bounds[0]);
    x1 = Math.max(x1, e.bounds[3]);
    z0 = Math.min(z0, e.bounds[2]);
    z1 = Math.max(z1, e.bounds[5]);
  }
  if (mode === 'radial') {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    elements.forEach((e, i) => {
      out[i * 3] = centreX(e.bounds) - cx;
      out[i * 3 + 2] = centreZ(e.bounds) - cz;
    });
    return out;
  }
  // Laid out in the engine's category order: foundations first, then the frame, then the rest.
  const present = CATEGORY_ORDER.filter((c) => elements.some((e) => e.category === c));
  const spacing = Math.max(1, x1 - x0) * 1.25;
  const mid = (present.length - 1) / 2;
  const slot = new Map(present.map((c, k) => [c, (k - mid) * spacing]));
  elements.forEach((e, i) => {
    out[i * 3] = slot.get(e.category) ?? 0;
  });
  return out;
}

/** An element's bounds moved by its offset at the given amount (for fitting, picking boxes, dimensions). */
export function explodedBounds(b: Bounds, offsets: Float32Array | null, index: number, amount: number): Bounds {
  if (!offsets || amount === 0) return b;
  const dx = offsets[index * 3] * amount, dy = offsets[index * 3 + 1] * amount, dz = offsets[index * 3 + 2] * amount;
  return [b[0] + dx, b[1] + dy, b[2] + dz, b[3] + dx, b[4] + dy, b[5] + dz];
}
