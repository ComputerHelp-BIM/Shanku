/**
 * The roadmap, drawn two ways from one list (roadmap.ts): a building under construction — shipped storeys built,
 * the storey being built in scaffolding under a crane, planned storeys dashed, ideas as clouds above — and a metro
 * map, one line per area, its stations running from shipped to ideas, with "you are here" between. Either view's
 * items open the same card: what it is, where it stands, what kind of change, and its design note.
 */
import { useMemo, useState } from 'react';
import { KIND_LABEL, LINES, ROADMAP, STATUS_LABEL, STOREYS, byId, type Line, type RoadItem, type Status } from './roadmap';

const REPO = 'https://github.com/ComputerHelp-BIM/Shanku';
const ORDER: Status[] = ['shipped', 'building', 'next', 'planned', 'idea'];

function Item({ r, selected, onPick }: { r: RoadItem; selected: boolean; onPick: (id: string) => void }) {
  return (
    <li>
      <button type="button" className={`rb-item rb-item--${r.line}${selected ? ' is-selected' : ''}`} style={{ ['--line' as string]: LINES[r.line].colour }} aria-pressed={selected} onClick={() => onPick(r.id)}>
        <span className="rb-item__title">{r.title}</span>
        <span className="rb-item__kind">{r.version ? `v${r.version}` : KIND_LABEL[r.kind]}</span>
      </button>
    </li>
  );
}

function Building({ sel, onPick }: { sel: string | null; onPick: (id: string) => void }) {
  const sky = STOREYS.find((s) => s.status === 'idea');
  const floors = STOREYS.filter((s) => s.status !== 'idea').reverse(); // roof first
  return (
    <div className="rb">
      {sky ? (
        <div className="rb-sky" aria-label="Ideas">
          <p className="rb-sky__label">Ideas — not commitments. Tell us which matter.</p>
          <ul className="rb-clouds">
            {sky.items.map((id) => (
              <Item key={id} r={byId(id)!} selected={sel === id} onPick={onPick} />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rb-crane" aria-hidden="true">
        <svg viewBox="0 0 120 150">
          <path d="M20 150 V18 M14 150 H26 M20 18 H116 M20 18 L52 2 L116 18 M20 30 L32 18 M98 18 V58" />
          <rect x="91" y="58" width="14" height="10" rx="1" />
        </svg>
      </div>
      <ol className="rb-floors">
        {floors.map((s) => (
          <li key={s.id} className={`rb-floor rb-floor--${s.status}`}>
            <div className="rb-floor__head">
              <span className="rb-floor__label">{s.label}</span>
              <span className="rb-floor__status">{STATUS_LABEL[s.status]}</span>
            </div>
            <ul className="rb-floor__items">
              {s.items.map((id) => (
                <Item key={id} r={byId(id)!} selected={sel === id} onPick={onPick} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="rb-ground" aria-hidden="true" />
    </div>
  );
}

const GAP = 46;
const ROW = 112;
/** The first line's height: room above it for the tallest station labels (they rise at 38°). */
const TOP = 210;
/** The left margin for the line names. */
const LEFT = 168;

function Metro({ sel, onPick, version }: { sel: string | null; onPick: (id: string) => void; version: string }) {
  const layout = useMemo(() => {
    const lines = Object.keys(LINES) as Line[];
    // each status is a zone as wide as its busiest line
    let x = LEFT;
    const zones: Array<{ status: Status; x0: number; x1: number }> = [];
    const pos = new Map<string, { x: number; y: number }>();
    for (const status of ORDER) {
      const per = lines.map((l) => ROADMAP.filter((r) => r.line === l && r.status === status));
      const n = Math.max(1, ...per.map((p) => p.length));
      zones.push({ status, x0: x, x1: x + n * GAP });
      per.forEach((items, li) => items.forEach((r, k) => pos.set(r.id, { x: x + GAP / 2 + k * GAP, y: TOP + li * ROW })));
      x += n * GAP + 24;
    }
    return { lines, zones, pos, width: x + 120, height: TOP + lines.length * ROW - 40 };
  }, []);
  const here = layout.zones[0].x1 + 12;
  return (
    <div className="rm" role="group" aria-label="Roadmap as a metro map">
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
        {layout.zones.map((z) => (
          <text key={z.status} className="rm-zone" x={(z.x0 + z.x1) / 2} y={24} textAnchor="middle">
            {STATUS_LABEL[z.status]}
          </text>
        ))}
        <g className="rm-here">
          <line x1={here} x2={here} y1={36} y2={layout.height - 8} />
          <text x={here + 6} y={48}>
            You are here · v{version}
          </text>
        </g>
        {layout.lines.map((l, li) => {
          const st = ROADMAP.filter((r) => r.line === l).map((r) => ({ r, p: layout.pos.get(r.id)! }));
          const y = TOP + li * ROW;
          const solid = st.filter((s) => s.r.status !== 'idea');
          const ideas = st.filter((s) => s.r.status === 'idea');
          const lastSolid = solid.length ? solid[solid.length - 1].p.x : LEFT;
          return (
            <g key={l} style={{ ['--line' as string]: LINES[l].colour }}>
              <text className="rm-line-label" x={12} y={y + 4}>
                {LINES[l].label}
              </text>
              {solid.length ? <line className="rm-track" x1={solid[0].p.x} x2={lastSolid} y1={y} y2={y} /> : null}
              {ideas.length ? <line className="rm-track rm-track--idea" x1={lastSolid} x2={ideas[ideas.length - 1].p.x} y1={y} y2={y} /> : null}
              {st.map(({ r, p }, k) => (
                <g
                  key={r.id}
                  className={`rm-stn rm-stn--${r.status}${sel === r.id ? ' is-selected' : ''}`}
                  transform={`translate(${p.x} ${p.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${r.title}: ${STATUS_LABEL[r.status]}`}
                  aria-pressed={sel === r.id}
                  onClick={() => onPick(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPick(r.id);
                    }
                  }}
                >
                  <circle r={r.status === 'idea' ? 5 : 7} />
                  <text className="rm-stn__label" transform={`rotate(-38) translate(10 ${k % 2 ? 4 : -2})`}>
                    {r.title}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Roadmap({ version }: { version: string }) {
  const [view, setView] = useState<'building' | 'metro'>('building');
  const [sel, setSel] = useState<string | null>('ifc-writer');
  const pick = (id: string) => setSel((s) => (s === id ? null : id));
  const r = sel ? byId(sel) : undefined;
  const counts = ORDER.map((s) => [s, ROADMAP.filter((x) => x.status === s).length] as const);
  return (
    <div className="roadmap">
      <div className="roadmap__bar">
        <div className="roadmap__tabs" role="tablist" aria-label="Roadmap view">
          {(
            [
              ['building', 'The building'],
              ['metro', 'The metro map'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'is-active' : undefined} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="roadmap__counts">{counts.map(([s, n]) => `${n} ${STATUS_LABEL[s].toLowerCase()}`).join(' · ')}</p>
      </div>
      <div className="roadmap__body">
        <div className="roadmap__view">{view === 'building' ? <Building sel={sel} onPick={pick} /> : <Metro sel={sel} onPick={pick} version={version} />}</div>
        <aside className="roadmap__card" aria-live="polite">
          {r ? (
            <>
              <p className="roadmap__card-line" style={{ ['--line' as string]: LINES[r.line].colour }}>
                {LINES[r.line].label}
              </p>
              <h3>{r.title}</h3>
              <p>{r.detail}</p>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{r.version ? `${STATUS_LABEL[r.status]} in v${r.version}` : STATUS_LABEL[r.status]}</dd>
                </div>
                <div>
                  <dt>Kind</dt>
                  <dd>{KIND_LABEL[r.kind]}</dd>
                </div>
              </dl>
              {r.design ? (
                <a href={`${REPO}/blob/main/docs/design/${r.design}`} target="_blank" rel="noreferrer">
                  Read its design note
                </a>
              ) : null}
            </>
          ) : (
            <p className="roadmap__hint">Pick anything on the {view === 'building' ? 'building' : 'map'} to read about it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
