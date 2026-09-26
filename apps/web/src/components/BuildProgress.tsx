/**
 * "Rising frame": progress as a building going up. A tower crane stands beside a structural frame; its
 * trolley runs along the jib to where the next member goes and lowers it on its cable — footings, then
 * storey by storey columns, beams and the slab. With a known fraction the frame is exactly that far
 * built; without one (Revit at work) it builds, tops out and starts again, with a running timer. A caption
 * names what is going up ("Storey 3 · beams"), a flag goes up on the roof at the end, and tips rotate
 * underneath in a long wait. Reduced motion: no animation, no loop — the frame shows the state.
 */
import { useEffect, useMemo, useState } from 'react';
import { WAITING_TIPS, type Task } from '../lib/progress';

const W = 320;
const H = 240;
const BAYS = 4;
const STOREYS = 6;
const X0 = 20;
const BAY = 55; // frame 20 … 240
const GROUND = H - 18;
const JIB_Y = 16;
const STOREY = (GROUND - JIB_Y - 38) / STOREYS;
const MAST_X = 286;
const STEP_MS = 160;

type Kind = 'footing' | 'column' | 'beam' | 'slab';
type Member = { kind: Kind; storey: number; x: number; y: number; w: number; h: number };

/** The frame's members in the order a building goes up. */
function members(): Member[] {
  const out: Member[] = [];
  for (let i = 0; i <= BAYS; i++) out.push({ kind: 'footing', storey: 0, x: X0 + i * BAY - 11, y: GROUND - 1, w: 22, h: 7 });
  for (let s = 1; s <= STOREYS; s++) {
    const top = GROUND - s * STOREY;
    for (let i = 0; i <= BAYS; i++) out.push({ kind: 'column', storey: s, x: X0 + i * BAY - 3, y: top, w: 6, h: STOREY });
    for (let i = 0; i < BAYS; i++) out.push({ kind: 'beam', storey: s, x: X0 + i * BAY, y: top, w: BAY, h: 6 });
    out.push({ kind: 'slab', storey: s, x: X0 - 8, y: top - 4, w: BAYS * BAY + 16, h: 4 });
  }
  return out;
}

const KIND_WORD: Record<Kind, string> = { footing: 'footings', column: 'columns', beam: 'beams', slab: 'slab' };

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** center: over an empty viewport; floating: over an open model; inline: inside a window's content. */
export function BuildProgress({ task, variant = 'center' }: { task: Task; variant?: 'center' | 'floating' | 'inline' }) {
  const all = useMemo(members, []);
  const reduce = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), STEP_MS);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = now - task.startedAt;
  const known = task.fraction !== null && Number.isFinite(task.fraction);
  // busy: a phase that cannot measure itself (Revit regenerating) — the frame holds, the display shows work
  const busy = known && !!task.busy;
  // how many members stand: the fraction, or a loop that builds, holds (topped out) a moment, and starts again
  const cycle = all.length + 12;
  const loopAt = Math.floor(elapsed / STEP_MS) % cycle;
  const built = known ? Math.round(Math.min(1, Math.max(0, task.fraction as number)) * all.length) : reduce ? Math.round(all.length / 2) : Math.min(all.length, loopAt);
  const done = built >= all.length;
  const pct = known && !busy ? Math.round((task.fraction as number) * 100) : null;
  const tip = WAITING_TIPS[Math.floor(elapsed / 5000) % WAITING_TIPS.length];

  // the member on the hook: the next one to place (the crane waits over the roof once topped out)
  const next = done ? null : all[built];
  const hookX = next ? next.x + next.w / 2 : X0 + (BAYS * BAY) / 2;
  const hookY = next ? Math.max(JIB_Y + 14, next.y - 12) : GROUND - STOREYS * STOREY - 26;
  const caption = busy ? 'Revit is working on it' : done ? 'Topped out' : next!.kind === 'footing' ? 'Footings' : `Storey ${next!.storey} · ${KIND_WORD[next!.kind]}`;

  return (
    <div className={`app-build app-build--${variant}${reduce ? ' is-still' : ''}${busy ? ' is-busy' : ''}`} role="status" aria-live="polite" aria-label={`${task.title}: ${task.phase}${pct !== null ? `, ${pct}%` : ''}`}>
      <figure className="app-build__scene">
        <svg className="app-build__frame" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {/* ground */}
          <line className="app-build__ground" x1={2} x2={W - 2} y1={GROUND + 7} y2={GROUND + 7} />
          {Array.from({ length: 22 }, (_, i) => (
            <line key={i} className="app-build__hatch" x1={6 + i * 14} x2={i * 14} y1={GROUND + 8} y2={GROUND + 14} />
          ))}

          {/* the building */}
          {all.map((m, i) => (
            <rect
              key={i}
              className={`app-build__m app-build__m--${m.kind}${i < built ? ' is-up' : ''}${i === built - 1 && !reduce ? ' is-new' : ''}`}
              x={m.x}
              y={m.y}
              width={m.w}
              height={m.h}
            />
          ))}
          {done ? (
            <g className="app-build__flag" transform={`translate(${X0 + (BAYS * BAY) / 2} ${GROUND - STOREYS * STOREY - 4})`}>
              <line x1={0} x2={0} y1={0} y2={-22} />
              <path d="M0 -22 L14 -17.5 L0 -13 Z" />
            </g>
          ) : null}

          {/* the tower crane: mast, jib, counter-jib with its weight, cab */}
          <g className="app-build__crane">
            <rect className="app-build__mast" x={MAST_X - 5} y={JIB_Y} width={10} height={GROUND - JIB_Y + 1} />
            {Array.from({ length: Math.floor((GROUND - JIB_Y) / 12) }, (_, i) => (
              <line key={i} className="app-build__lattice" x1={MAST_X - 5} x2={MAST_X + 5} y1={JIB_Y + 6 + i * 12} y2={JIB_Y + 12 + i * 12} />
            ))}
            <rect className="app-build__jib" x={12} y={JIB_Y - 3} width={W - 14} height={5} />
            <rect className="app-build__weight" x={W - 30} y={JIB_Y + 2} width={16} height={9} />
            <rect className="app-build__cab" x={MAST_X - 9} y={JIB_Y + 2} width={11} height={9} rx={1.5} />
            <line className="app-build__tie" x1={MAST_X} y1={JIB_Y - 14} x2={30} y2={JIB_Y - 3} />
            <line className="app-build__tie" x1={MAST_X} y1={JIB_Y - 14} x2={W - 6} y2={JIB_Y - 3} />
            <rect className="app-build__peak" x={MAST_X - 2} y={JIB_Y - 16} width={4} height={14} />
            {/* trolley and hook: they travel to the next member */}
            <g className="app-build__trolley" style={{ transform: `translateX(${hookX}px)` }}>
              <rect x={-6} y={JIB_Y + 2} width={12} height={5} />
              <line className="app-build__cable" x1={0} x2={0} y1={JIB_Y + 7} y2={hookY} />
              <path className="app-build__hook" d={`M-4 ${hookY} h8 v3 a4 4 0 1 1 -4 4`} />
            </g>
          </g>
        </svg>
        <figcaption className="app-build__caption">{caption}</figcaption>
      </figure>
      <div className="app-build__text">
        <p className="app-build__title">{task.title}</p>
        <p className="app-build__phase">{task.phase}</p>
        <div className={`app-build__bar${known ? '' : ' app-build__bar--busy'}${busy ? ' app-build__bar--working' : ''}`} aria-hidden="true">
          <span style={known ? { width: `${Math.round((task.fraction as number) * 100)}%` } : undefined} />
        </div>
        <p className="app-build__meta">
          {task.detail ? <span>{task.detail}</span> : null}
          {pct !== null ? <span className="app-build__pct">{pct}%</span> : busy ? <span className="app-build__pct">Revit is working</span> : null}
          <span>{clock(elapsed)}</span>
        </p>
        {elapsed > 1500 ? <p className="app-build__tip">{tip}</p> : null}
      </div>
    </div>
  );
}
