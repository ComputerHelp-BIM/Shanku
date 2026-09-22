import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Unit quaternion, camera to world (as three.js Camera.quaternion). */
export interface Orientation {
  x: number;
  y: number;
  z: number;
  w: number;
}
type V3 = [number, number, number];

const SIZE = 64; // cube edge, px

/** Rotation matrix (row-major 3×3) of a quaternion. */
function rot(q: Orientation): number[] {
  const { x, y, z, w } = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** World (Y up, Z toward the viewer at Front) to CSS (y down). */
const css = (v: V3): V3 => [v[0], -v[1], v[2]];

/** Faces with their outward normal and the directions of their own right / up, seen from outside. */
const FACES: Array<{ label: string; n: V3; right: V3; up: V3 }> = [
  { label: 'FRONT', n: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  { label: 'BACK', n: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
  { label: 'RIGHT', n: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  { label: 'LEFT', n: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  { label: 'TOP', n: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { label: 'BOTTOM', n: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
];

/** CSS matrix3d placing a face: its x = right, y = down, z = outward normal, pushed out half a cube. */
function faceMatrix(f: (typeof FACES)[number]): string {
  const r = css(f.right), d = css(f.up.map((c) => -c) as V3), n = css(f.n);
  const t = n.map((c) => (c * SIZE) / 2);
  return `matrix3d(${[...r, 0, ...d, 0, ...n, 0, ...t, 1].map((v) => +v.toFixed(6)).join(',')})`;
}

export interface ViewCubeProps {
  orientation: Orientation;
  /** Look from this world direction (from the model towards the camera). */
  onLookFrom: (dir: V3) => void;
  onHome: () => void;
  /** Drag on the cube orbits the view by screen pixels. */
  onOrbit: (dx: number, dy: number) => void;
}

/**
 * Revit's ViewCube: follows the camera; click a face, edge or corner (each face is split 3 × 3, so all
 * 26 directions are there), drag to orbit, the house returns to the default 3D view.
 */
export function ViewCube({ orientation, onLookFrom, onHome, onOrbit }: ViewCubeProps) {
  const [hot, setHot] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // The cube shows world axes as the camera sees them: world to view = inverse camera rotation.
  const m = rot({ ...orientation, x: -orientation.x, y: -orientation.y, z: -orientation.z });
  // CSS flips y on both sides: F · R · F
  const c = [m[0], -m[1], m[2], -m[3], m[4], -m[5], m[6], -m[7], m[8]];
  const cube = `matrix3d(${[c[0], c[3], c[6], 0, c[1], c[4], c[7], 0, c[2], c[5], c[8], 0, 0, 0, 0, 1].map((v) => +v.toFixed(6)).join(',')})`;

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved) {
      // Capture only once it is really a drag: capturing on press would send the click to the stage,
      // not to the face, edge or corner under the pointer.
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      d.moved = true;
    }
    onOrbit(dx * 2.2, dy * 2.2);
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const up = () => {
    setTimeout(() => (drag.current = null), 0); // let the click handler see whether it was a drag
  };
  const pick = (dir: V3) => {
    if (drag.current?.moved) return;
    onLookFrom(dir);
  };
  useEffect(() => () => void (drag.current = null), []);

  return (
    <div className="vc" aria-label="ViewCube">
      <button type="button" className="vc-home" title="Home: default 3D view" aria-label="Home view" onClick={onHome}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z" />
        </svg>
      </button>
      <div className="vc-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="vc-cube" style={{ transform: cube }}>
          {FACES.map((f) => (
            <div key={f.label} className="vc-face" style={{ transform: faceMatrix(f) }}>
              <span className="vc-label">{f.label}</span>
              {[1, 0, -1].map((j) =>
                [-1, 0, 1].map((i) => {
                  const dir = f.n.map((nn, k) => nn + i * f.right[k] + j * f.up[k]) as V3;
                  const key = dir.join(',');
                  const name = i === 0 && j === 0 ? f.label.toLowerCase() : `${f.label.toLowerCase()} ${j === 1 ? 'top' : j === -1 ? 'bottom' : ''}${i === 1 ? ' right' : i === -1 ? ' left' : ''}`.trim();
                  return (
                    <button
                      key={`${i},${j}`}
                      type="button"
                      className={['vc-cell', i === 0 && j === 0 ? 'is-face' : i !== 0 && j !== 0 ? 'is-corner' : 'is-edge', hot === key && 'is-hot'].filter(Boolean).join(' ')}
                      style={{ gridColumn: i + 2, gridRow: 2 - j }}
                      aria-label={`View from ${name}`}
                      title={name}
                      onPointerEnter={() => setHot(key)}
                      onPointerLeave={() => setHot((h) => (h === key ? null : h))}
                      onClick={() => pick(dir)}
                    />
                  );
                }),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
