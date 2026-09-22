import { Quaternion, Vector3 } from 'three';

/**
 * Revit orbit: turn about the world vertical through the pivot (horizontal drag) and tilt about the
 * camera's own right axis (vertical drag). Returns the new position, target and the rotation to apply
 * to the camera orientation. Using the camera's right axis (not view × up) keeps orbiting working when
 * looking straight down or up, where view × up is zero and the camera used to freeze.
 */
export function orbitAround(
  position: Vector3,
  target: Vector3,
  pivot: Vector3,
  up: Vector3,
  dAzimuth: number,
  dElevation: number,
  cameraRight?: Vector3,
  minPolar = 1e-4,
): { position: Vector3; target: Vector3; rotation: Quaternion } {
  const viewDir = new Vector3().subVectors(target, position).normalize();
  const polar = Math.acos(Math.min(1, Math.max(-1, -viewDir.dot(up)))); // 0 = looking straight down
  const nextPolar = Math.min(Math.PI - minPolar, Math.max(minPolar, polar - dElevation));
  const clampedElev = polar - nextPolar; // never tilt over the top: the horizon stays level

  const right = cameraRight?.clone() ?? new Vector3().crossVectors(viewDir, up);
  right.sub(up.clone().multiplyScalar(right.dot(up))); // keep it horizontal
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  right.normalize();

  const qAz = new Quaternion().setFromAxisAngle(up, dAzimuth);
  const r = right.clone().applyQuaternion(qAz);
  const qEl = new Quaternion().setFromAxisAngle(r, clampedElev);
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
