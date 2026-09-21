import { Vector3 } from 'three';

/**
 * Orbit a camera about a pivot. Azimuth turns about the world up axis, elevation
 * tilts about the camera's right axis and is clamped so the view never flips.
 * Returns new position and target (both move rigidly around the pivot).
 */
export function orbitAround(
  position: Vector3,
  target: Vector3,
  pivot: Vector3,
  up: Vector3,
  dAzimuth: number,
  dElevation: number,
  minPolar = 0.02,
): { position: Vector3; target: Vector3 } {
  const viewDir = new Vector3().subVectors(target, position).normalize();
  const polar = Math.acos(Math.min(1, Math.max(-1, -viewDir.dot(up)))); // 0 = looking straight down
  const nextPolar = Math.min(Math.PI - minPolar, Math.max(minPolar, polar - dElevation));
  const clampedElev = polar - nextPolar;

  const right = new Vector3().crossVectors(viewDir, up);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  right.normalize();

  const rotate = (p: Vector3) => {
    const v = p.clone().sub(pivot);
    v.applyAxisAngle(up, dAzimuth);
    const r = right.clone().applyAxisAngle(up, dAzimuth);
    v.applyAxisAngle(r, clampedElev);
    return v.add(pivot);
  };
  return { position: rotate(position), target: rotate(target) };
}

/**
 * Orthographic zoom that keeps the world point under the cursor fixed.
 * `cursorWorldBefore/After` are the cursor unprojected before and after the zoom change;
 * the camera shifts by their difference.
 */
export function zoomShift(cursorWorldBefore: Vector3, cursorWorldAfter: Vector3): Vector3 {
  return new Vector3().subVectors(cursorWorldBefore, cursorWorldAfter);
}

/** World units per screen pixel for an orthographic camera. */
export function worldPerPixel(frustumHeight: number, zoom: number, viewportHeightPx: number): number {
  return frustumHeight / zoom / Math.max(1, viewportHeightPx);
}

/** Zoom factor for a wheel delta; positive deltaY zooms out. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.pow(1.0015, -px);
}
