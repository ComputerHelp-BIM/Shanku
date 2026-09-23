import { Quaternion, Vector3 } from 'three';

/**
 * Revit orbit: turn about the world vertical through the pivot (horizontal drag) and tilt about the
 * camera's own right axis (vertical drag). Returns the new position, target and the rotation to apply
 * to the camera orientation.
 *
 * The tilt is free: dragging past straight down or straight up carries the camera over the top or
 * under the bottom instead of stopping there (stopping is what made it feel stuck). Once the camera
 * is upside down, pass `upsideDown` so horizontal drags are reversed and the model still turns the
 * way the hand moves.
 */
export function orbitAround(
  position: Vector3,
  target: Vector3,
  pivot: Vector3,
  up: Vector3,
  dAzimuth: number,
  dElevation: number,
  cameraRight?: Vector3,
  upsideDown = false,
): { position: Vector3; target: Vector3; rotation: Quaternion } {
  const viewDir = new Vector3().subVectors(target, position).normalize();
  const right = cameraRight?.clone() ?? new Vector3().crossVectors(viewDir, up);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  right.normalize();

  const qAz = new Quaternion().setFromAxisAngle(up, upsideDown ? -dAzimuth : dAzimuth);
  const r = right.clone().applyQuaternion(qAz);
  const qEl = new Quaternion().setFromAxisAngle(r, dElevation);
  const rotation = qEl.multiply(qAz); // azimuth first, then tilt
  const rotate = (p: Vector3) => p.clone().sub(pivot).applyQuaternion(rotation).add(pivot);
  return { position: rotate(position), target: rotate(target), rotation };
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
