/**
 * "Rising frame": progress shown as a structural frame that builds itself in construction order —
 * footings, then storey by storey columns, beams and the slab. With a known fraction it is exactly that
 * far built; without one (Revit at work) it builds and resets in a loop, with a running timer. A tip
 * rotates underneath so a long wait always has something worth reading. Reduced motion: no loop.
 */
import { useEffect, useMemo, useState } from 'react';
import { WAITING_TIPS, type Task } from '../lib/progress';

const BAYS = 4;
const STOREYS = 5;
const W = 220;
const H = 150;
const X0 = 20;
const BAY = (W - 2 * X0) / BAYS;
const GROUND = H - 16;
const STOREY = (GROUND - 14) / STOREYS;

type Member = { kind: 'footing' | 'column' | 'beam' | 'slab'; x: number; y: number; w: number; h: number };

/** The frame's members in the order a building goes up. */
function members(): Member[] {
  const out: Member[] = [];
  for (let i = 0; i <= BAYS; i++) out.push({ kind: 'footing', x: X0 + i * BAY - 9, y: GROUND, w: 18, h: 5 });
  for (let s = 0; s < STOREYS; s++) {
    const top = GROUND - (s + 1) * STOREY;
    for (let i = 0; i <= BAYS; i++) out.push({ kind: 'column', x: X0 + i * BAY - 2.5, y: top, w: 5, h: STOREY });
    for (let i = 0; i < BAYS; i++) out.push({ kind: 'beam', x: X0 + i * BAY, y: top, w: BAY, h: 5 });
    out.push({ kind: 'slab', x: X0 - 6, y: top - 3, w: BAYS * BAY + 12, h: 3 });
  }
  return out;
}

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
    const id = window.setInterval(() => setNow(Date.now()), 140);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = now - task.startedAt;
  const known = task.fraction !== null && Number.isFinite(task.fraction);
  // how many members stand: the fraction, or a loop that builds, holds a moment, and starts again
  const cycle = all.length + 8;
  const built = known ? Math.round(Math.min(1, Math.max(0, task.fraction as number)) * all.length) : reduce ? all.length : Math.floor(elapsed / 140) % cycle;
  const tip = WAITING_TIPS[Math.floor(elapsed / 5000) % WAITING_TIPS.length];
  const pct = known ? Math.round((task.fraction as number) * 100) : null;

  return (
    <div className={`app-build app-build--${variant}`} role="status" aria-live="polite" aria-label={`${task.title}: ${task.phase}${pct !== null ? `, ${pct}%` : ''}`}>
      <svg className="app-build__frame" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <line className="app-build__ground" x1={4} x2={W - 4} y1={GROUND + 5} y2={GROUND + 5} />
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
      </svg>
      <div className="app-build__text">
        <p className="app-build__title">{task.title}</p>
        <p className="app-build__phase">{task.phase}</p>
        <div className={`app-build__bar${known ? '' : ' app-build__bar--busy'}`} aria-hidden="true">
          <span style={known ? { width: `${pct}%` } : undefined} />
        </div>
        <p className="app-build__meta">
          {task.detail ? <span>{task.detail}</span> : null}
          {pct !== null ? <span>{pct}%</span> : null}
          <span>{clock(elapsed)}</span>
        </p>
        {elapsed > 1500 ? <p className="app-build__tip">{tip}</p> : null}
      </div>
    </div>
  );
}
