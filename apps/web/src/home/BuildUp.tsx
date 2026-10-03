/**
 * The homepage's build-up: a structural frame drawn in isometric that builds itself as you scroll — footings,
 * columns, beams and slabs, storey by storey — then explodes and is cut open. Each step is one of cad2bim's
 * features, told beside it. Drawn as SVG (the 3D engine stays off the homepage, so it opens at once), coloured by
 * the design system's structural categories, so it reads in both themes.
 *
 * Motion: progress follows the scroll of the homepage's own container. With "reduce motion", the frame is shown
 * built and the steps are a plain list.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

type Cat = 'footing' | 'column' | 'beam' | 'slab';
interface Box {
  cat: Cat;
  /** Which step brings it, and its order within that step (for the stagger). */
  step: number;
  order: number;
  /** Storey (0 for footings), for the explode. */
  storey: number;
  min: [number, number, number];
  max: [number, number, number];
}

export const STEPS: Array<{ title: string; text: string }> = [
  { title: 'Drop in a file', text: 'An IFC model from Revit, a CH drawing or a .c2b project. It opens on your machine and is never uploaded.' },
  { title: 'Drawings become models', text: 'DXF → 3D turns drawings made to Computer Help’s layer standard into an IFC4 model, with checks you can zoom to.' },
  { title: 'Navigate like Revit', text: 'View cube, section box, visual styles, and the two-letter shortcuts you already know: HI, HH, BX, ZF.' },
  { title: 'Edit it, natively', text: 'Move, Copy, Rotate, Mirror, Array and Align with locks. Move a level and what is hosted on it follows.' },
  { title: 'Quantities, to Excel', text: 'Concrete by level, category and grade, with rates and overrides — out to Excel with live formulas.' },
  { title: 'Pull it apart', text: 'Exploded views by storey, radially or by category, to see how it goes together.' },
  { title: 'Cut it open', text: 'A section box with solid cut faces and arrow grips; plans with a real view range.' },
  { title: 'Round-trip with Revit', text: 'cad2bim Bridge for Revit loads the open model, keeps the selection in step, and applies your parameter and type changes in one undoable transaction.' },
];

const BAYS_X = 3;
const BAYS_Y = 2;
const STOREYS = 3;
const H = 0.95; // storey height (bay = 1)

function frame(): Box[] {
  const out: Box[] = [];
  const cols: Array<[number, number]> = [];
  for (let i = 0; i <= BAYS_X; i++) for (let j = 0; j <= BAYS_Y; j++) cols.push([i, j]);
  cols.forEach(([x, y], k) => out.push({ cat: 'footing', step: 0, order: k, storey: 0, min: [x - 0.2, y - 0.2, -0.18], max: [x + 0.2, y + 0.2, 0] }));
  for (let s = 0; s < STOREYS; s++) {
    const z0 = s * H, z1 = (s + 1) * H;
    const step = s === 0 ? 1 : s + 2; // storey 1: columns at step 1, beams and slab at step 2; storeys 2 and 3: steps 3 and 4
    cols.forEach(([x, y], k) => out.push({ cat: 'column', step, order: k, storey: s + 1, min: [x - 0.06, y - 0.06, z0], max: [x + 0.06, y + 0.06, z1 - 0.12] }));
    const bStep = s === 0 ? 2 : step;
    let o = 0;
    for (let j = 0; j <= BAYS_Y; j++) for (let i = 0; i < BAYS_X; i++) out.push({ cat: 'beam', step: bStep, order: 20 + o++, storey: s + 1, min: [i + 0.06, j - 0.05, z1 - 0.12], max: [i + 0.94, j + 0.05, z1] });
    for (let i = 0; i <= BAYS_X; i++) for (let j = 0; j < BAYS_Y; j++) out.push({ cat: 'beam', step: bStep, order: 20 + o++, storey: s + 1, min: [i - 0.05, j + 0.06, z1 - 0.12], max: [i + 0.05, j + 0.94, z1] });
    out.push({ cat: 'slab', step: bStep, order: 60, storey: s + 1, min: [-0.06, -0.06, z1], max: [BAYS_X + 0.06, BAYS_Y + 0.06, z1 + 0.05] });
  }
  return out;
}

const S = 62; // px per bay
const C = Math.cos(Math.PI / 6), N = Math.sin(Math.PI / 6);
const iso = (x: number, y: number, z: number): string => `${((x - y) * C * S).toFixed(1)},${((x + y) * N * S - z * S).toFixed(1)}`;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** One box as its three visible faces (top, +x, +y). */
function Faces({ b, cut }: { b: { min: number[]; max: number[] }; cut: boolean }) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  return (
    <>
      <polygon className="bu-face bu-face--top" points={[iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)].join(' ')} />
      <polygon className={`bu-face bu-face--x${cut ? ' bu-face--cut' : ''}`} points={[iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)].join(' ')} />
      <polygon className="bu-face bu-face--y" points={[iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)].join(' ')} />
    </>
  );
}

export function BuildUp() {
  const section = useRef<HTMLElement>(null);
  const reduced = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  // t: 0 … STEPS.length; each step takes one unit of scroll
  const [t, setT] = useState(reduced ? 5 : 0);
  useEffect(() => {
    if (reduced) return;
    const el = section.current;
    const scroller = el?.closest('.home') as HTMLElement | null;
    if (!el || !scroller) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const range = r.height - scroller.clientHeight;
      const p = range > 0 ? clamp(-r.top / range) : 1;
      setT((prev) => (Math.abs(prev - p * STEPS.length) > 0.004 ? p * STEPS.length : prev));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const boxes = useMemo(frame, []);
  const active = Math.min(STEPS.length - 1, Math.floor(t));
  const explode = clamp(t - 5) * (1 - clamp(t - 6.4)); // apart, then back together for the cut
  const cut = clamp(t - 6);
  const revit = clamp(t - 7);
  const CUT_X = 1.5;

  const drawn = boxes
    .map((b) => {
      const a = clamp((t - b.step) * 1.8 - b.order * 0.012);
      if (a <= 0) return null;
      const dz = (1 - a) * 0.7 + b.storey * 0.42 * explode;
      let min = [b.min[0], b.min[1], b.min[2] + dz], max = [b.max[0], b.max[1], b.max[2] + dz];
      let isCut = false;
      if (cut > 0 && b.max[0] > CUT_X) {
        if (b.min[0] >= CUT_X) return null; // wholly beyond the cut: removed
        max = [b.max[0] - (b.max[0] - CUT_X) * cut, max[1], max[2]];
        isCut = cut > 0.5;
      }
      return { b, a, min, max, isCut };
    })
    .filter((d): d is NonNullable<typeof d> => !!d)
    .sort((p, q) => p.min[0] + p.min[1] + p.min[2] * 0.5 - (q.min[0] + q.min[1] + q.min[2] * 0.5));

  return (
    <section ref={section} className={`bu${reduced ? ' bu--still' : ''}`} aria-labelledby="bu-title">
      <div className="bu__sticky">
        <div className="bu__text">
          <p className="home-kicker">How it works</p>
          <h2 id="bu-title">From a drawing to a model you can edit.</h2>
          <ol className="bu__steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className={reduced || i === active ? 'is-active' : i < active ? 'is-done' : undefined} aria-current={!reduced && i === active ? 'step' : undefined}>
                <span className="bu__n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <figure className="bu__fig">
          <svg viewBox="-260 -300 560 520" role="img" aria-label="A three-storey concrete frame drawn in isometric: footings, columns, beams and slabs, built storey by storey, then exploded and cut open.">
            {drawn.map(({ b, a, min, max, isCut }, i) => (
              <g key={i} className={`bu-el bu-el--${b.cat}`} opacity={a}>
                <Faces b={{ min, max }} cut={isCut} />
              </g>
            ))}
            {cut > 0 ? (
              <polygon className="bu-plane" opacity={cut * (1 - revit * 0.6)} points={[iso(CUT_X, -0.4, -0.3), iso(CUT_X, BAYS_Y + 0.4, -0.3), iso(CUT_X, BAYS_Y + 0.4, STOREYS * H + 0.4), iso(CUT_X, -0.4, STOREYS * H + 0.4)].join(' ')} />
            ) : null}
            {revit > 0 ? (
              <g className="bu-revit" opacity={revit}>
                <rect x="-250" y="-292" width="132" height="30" rx="6" />
                <text x="-184" y="-272" textAnchor="middle">
                  Revit ⇄ cad2bim
                </text>
              </g>
            ) : null}
          </svg>
          <figcaption className="bu__caption" aria-hidden="true">
            {STEPS[active].title}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
