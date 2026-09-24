/**
 * AutoCAD-style adaptive grid for the 2D drawing view. Grid lines sit at powers of ten in real
 * drawing units (the file's own coordinates, so a 1000 mm grid lands on round coordinates).
 *
 * Three levels are drawn at once: fine lines that fade in as you zoom in, a middle level that
 * strengthens from minor to major, and a major level. When the fine level gets too dense it drops out
 * and every level moves up one decade, so the grid never pops as you zoom (the colours at the switch
 * are the same on both sides).
 */
export interface GridLevel {
  /** Line spacing in drawing units. */
  step: number;
  /** 0 = minor line colour, 1 = major line colour; values between blend the two. */
  mix: number;
  /** 0..1, multiplied into the line colour's alpha. */
  opacity: number;
}

/** Minimum screen spacing, in device pixels, before the finest level starts to show. */
export const GRID_MIN_PX = 8;

/** The three grid levels for a zoom (device pixels per drawing unit), finest first. */
export function gridLevels(pxPerUnit: number, minPx = GRID_MIN_PX): GridLevel[] {
  if (!(pxPerUnit > 0) || !Number.isFinite(pxPerUnit)) return [];
  // Finest decade whose lines are at least minPx apart on screen.
  const step = 10 ** Math.ceil(Math.log10(minPx / pxPerUnit) - 1e-9);
  const fade = Math.min(1, Math.max(0, Math.log10((step * pxPerUnit) / minPx)));
  return [
    { step, mix: 0, opacity: fade },
    { step: step * 10, mix: fade, opacity: 1 },
    { step: step * 100, mix: 1, opacity: 1 },
  ];
}

/**
 * Grid positions between min and max (drawing units) for one level. With `skipCoarser`, positions
 * that a coarser level (10 × step) already draws are left out, so no line is stroked twice.
 */
export function gridValues(min: number, max: number, step: number, skipCoarser: boolean, limit = 4000): number[] {
  if (!(step > 0) || !(max >= min)) return [];
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  if (last - first > limit) return []; // guard: a bad zoom never floods the canvas
  const out: number[] = [];
  for (let k = first; k <= last; k++) {
    if (skipCoarser && k % 10 === 0) continue;
    out.push(k * step);
  }
  return out;
}
