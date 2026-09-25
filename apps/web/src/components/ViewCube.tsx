import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Unit quaternion, camera to world (as three.js Camera.quaternion). */
export interface Orientation {
  x: number;
  y: number;
  z: number;
  w: number;
}
type V3 = [number, number, number];

const SIZE = 60; // cube edge, px
const RING = 118; // compass ring diameter, px

function rot(q: Orientation): number[] {
  const { x, y, z, w } = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}
const css = (v: V3): V3 => [v[0], -v[1], v[2]];

/** Faces: outward normal, own right / up seen from outside, and a fixed shade (lit from above). */
const FACES: Array<{ label: string; n: V3; right: V3; up: V3; shade: string }> = [
  { label: 'FRONT', n: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], shade: 'var(--vc-side)' },
  { label: 'BACK', n: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0], shade: 'var(--vc-side)' },
  { label: 'RIGHT', n: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], shade: 'var(--vc-side2)' },
  { label: 'LEFT', n: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0], shade: 'var(--vc-side2)' },
  { label: 'TOP', n: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1], shade: 'var(--vc-top)' },
  { label: 'BOTTOM', n: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1], shade: 'var(--vc-bottom)' },
];

/** CSS matrix placing an element with its x = right, y = down, z = normal, pushed out by `offset`. */
function placed(right: V3, up: V3, n: V3, offset: V3): string {
  const r = css(right), d = css(up.map((c) => -c) as V3), nn = css(n), t = css(offset);
  return `matrix3d(${[...r, 0, ...d, 0, ...nn, 0, ...t, 1].map((v) => +v.toFixed(6)).join(',')})`;
}

/** Compass: north is the model's back (−Z), as Revit's Front = South. */
const COMPASS: Array<{ label: string; dir: V3 }> = [
  { label: 'N', dir: [0, 0, -1] },
  { label: 'E', dir: [1, 0, 0] },
  { label: 'S', dir: [0, 0, 1] },
  { label: 'W', dir: [-1, 0, 0] },
];

export interface ViewCubeProps {
  orientation: Orientation;
  onLookFrom: (dir: V3) => void;
  onHome: () => void;
  /** Drag on the cube orbits freely; drag on the ring turns in plan only (dy = 0). */
  onOrbit: (dx: number, dy: number) => void;
  onSetHome: (current: boolean) => void;
  /** The view is being navigated: light up like Revit's ViewCube does while in use. */
  active?: boolean;
}

/**
 * Revit's ViewCube: shaded cube with clickable faces, edges and corners (26 directions), a compass
 * ring that turns the view in plan (drag) or faces a side (click N/E/S/W), Home, and a ▾ menu.
 */
export function ViewCube({ orientation, onLookFrom, onHome, onOrbit, onSetHome, active }: ViewCubeProps) {
  const [hover, setHover] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean; ring: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const m = rot({ ...orientation, x: -orientation.x, y: -orientation.y, z: -orientation.z });
  const c = [m[0], -m[1], m[2], -m[3], m[4], -m[5], m[6], -m[7], m[8]];
  const scene = `matrix3d(${[c[0], c[3], c[6], 0, c[1], c[4], c[7], 0, c[2], c[5], c[8], 0, 0, 0, 0, 1].map((v) => +v.toFixed(6)).join(',')})`;

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  // Drags are tracked on the window: the flat stage cannot take the pointer, or it would hide the
  // ring and faces that sit behind its plane in 3D.
  const down = (ring: boolean) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const d = { x: e.clientX, y: e.clientY, moved: false, ring };
    drag.current = d;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      onOrbit(dx * 2.2, d.ring ? 0 : dy * 2.2);
      d.x = ev.clientX;
      d.y = ev.clientY;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTimeout(() => (drag.current = null), 0); // let the click handler see whether it was a drag
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pick = (dir: V3) => {
    if (!drag.current?.moved) onLookFrom(dir);
  };

  /**
   * Is a screen point on the compass band? The flat ring, seen by a level camera, projects to an upright
   * ellipse whose screen bounding box is the ellipse itself; the band is between it and the inner edge.
   */
  const onRing = (clientX: number, clientY: number): boolean => {
    const r = root.current?.querySelector('.vc-ring')?.getBoundingClientRect();
    if (!r || r.width < 4 || r.height < 4) return false;
    const nx = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (clientY - (r.top + r.height / 2)) / (r.height / 2);
    const d = nx * nx + ny * ny;
    const inner = (RING / 2 - 13) / (RING / 2);
    return d <= 1.05 && d >= inner * inner * 0.95;
  };

  // The ring lies flat just under the cube (world horizontal plane).
  const ringT = placed([1, 0, 0], [0, 0, -1], [0, 1, 0], [0, -SIZE / 2 - 6, 0]);

  return (
    <div
      className={['vc', (active || hover || menu) && 'is-active'].filter(Boolean).join(' ')}
      ref={root}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      aria-label="View cube"
      onPointerDown={(e) => {
        // Presses that reach the frame (not a face, edge, corner or letter): drag the ring if on its band.
        if (e.target === e.currentTarget && onRing(e.clientX, e.clientY)) down(true)(e);
      }}
    >
      <button type="button" className="vc-home" title="Home" aria-label="Home view" onClick={onHome}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 3.2 2.5 11h2.8v9h5.2v-5.6h3v5.6h5.2v-9h2.8z" />
        </svg>
      </button>
      <div className="vc-stage">
        <div className="vc-scene" style={{ transform: scene }}>
          <div className="vc-ring" style={{ transform: ringT }} title="Drag to turn the view in plan">
            {COMPASS.map((k) => {
              // letter on the ring at its compass point, lying in the ring plane
              const at: V3 = [k.dir[0] * (RING / 2 - 9), 0, k.dir[2] * (RING / 2 - 9)];
              return (
                <button
                  key={k.label}
                  type="button"
                  className="vc-compass"
                  style={{ transform: `translate(-50%, -50%) translate(${RING / 2 + at[0]}px, ${RING / 2 + at[2]}px)` }}
                  aria-label={`View from ${k.label === 'N' ? 'north' : k.label === 'E' ? 'east' : k.label === 'S' ? 'south' : 'west'}`}
                  onClick={() => pick([k.dir[0], 0, k.dir[2]])}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
          <div className="vc-cube" onPointerDown={down(false)}>
            {FACES.map((f) => (
              <div key={f.label} className="vc-face" style={{ transform: placed(f.right, f.up, f.n, f.n.map((v) => (v * SIZE) / 2) as V3), background: f.shade }}>
                <span className="vc-label">{f.label}</span>
                {[1, 0, -1].map((j) =>
                  [-1, 0, 1].map((i) => {
                    const dir = f.n.map((nn, k) => nn + i * f.right[k] + j * f.up[k]) as V3;
                    const key = dir.join(',');
                    // Named by the world direction it looks from, so every hot spot has one clear name.
                    const name = [dir[1] > 0 ? 'top' : dir[1] < 0 ? 'bottom' : '', dir[2] > 0 ? 'front' : dir[2] < 0 ? 'back' : '', dir[0] > 0 ? 'right' : dir[0] < 0 ? 'left' : ''].filter(Boolean).join(' ');
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
      <button type="button" className="vc-menu-btn" aria-label="View cube options" aria-expanded={menu} title="View cube options" onClick={() => setMenu((o) => !o)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M5 8h14l-7 9z" />
        </svg>
      </button>
      {menu ? (
        <div className="vc-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { onHome(); setMenu(false); }}>Go Home</button>
          <button type="button" role="menuitem" onClick={() => { onSetHome(true); setMenu(false); }}>Set Current View as Home</button>
          <button type="button" role="menuitem" onClick={() => { onSetHome(false); setMenu(false); }}>Reset Home</button>
          <button type="button" role="menuitem" onClick={() => { onLookFrom([0, 0, 1]); setMenu(false); }}>Orient to Front</button>
          <button type="button" role="menuitem" onClick={() => { onLookFrom([0, 1, 0]); setMenu(false); }}>Orient to Top</button>
        </div>
      ) : null}
    </div>
  );
}
