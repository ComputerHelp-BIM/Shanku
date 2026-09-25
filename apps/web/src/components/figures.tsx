/**
 * Guide figures: small diagrams drawn as inline SVG, coloured only through design tokens (see the
 * .fig-* rules in app.css), so they follow the Paper and Ink themes and stay crisp at any size.
 * Each figure has a text alternative for screen readers; the visible labels repeat what it shows.
 * Structura's guide uses the same approach; these describe Shanku's own controls (Revit-style).
 */
import { useId, type ReactNode } from 'react';
import './figures.css';

export type FigureId =
  | 'mouse'
  | 'interface'
  | 'selection'
  | 'viewRange'
  | 'sectionGrips'
  | 'precedence'
  | 'sectionBox'
  | 'explode'
  | 'commandSearch'
  | 'quantities'
  | 'dxfPipeline'
  | 'revitBridge';

function Svg({ w, h, label, children, className }: { w: number; h: number; label: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <figure className={['app-fig', className].filter(Boolean).join(' ')}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-labelledby={id} preserveAspectRatio="xMidYMid meet">
        <title id={id}>{label}</title>
        {children}
      </svg>
    </figure>
  );
}

/** Two-line label: bold title, lighter description. */
function Label({ x, y, title, desc, anchor = 'start' }: { x: number; y: number; title: string; desc?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <>
      <text x={x} y={y} className="fig-t" textAnchor={anchor}>
        {title}
      </text>
      {desc ? (
        <text x={x} y={y + 15} className="fig-d" textAnchor={anchor}>
          {desc}
        </text>
      ) : null}
    </>
  );
}

const Arrow = ({ x1, y1, x2, y2, className = 'fig-arrow' }: { x1: number; y1: number; x2: number; y2: number; className?: string }) => {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 6;
  const p1 = [x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45)], p2 = [x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)];
  return (
    <g className={className}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={`M ${x2} ${y2} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`} className="fig-arrowhead" />
    </g>
  );
};

/* ------------------------------------------------------------------ mouse */

/** Shanku's mouse map (Revit navigation), colour-keyed to the button each action uses. */
export function MouseFigure() {
  const groups: Array<{ tone: string; head: string; x: number; y: number; items: Array<[string, string]> }> = [
    {
      tone: 'left',
      head: 'LEFT BUTTON',
      x: 190,
      y: 30,
      items: [
        ['Click', 'Select · Ctrl adds, Shift removes'],
        ['Drag left → right', 'Window: only what is fully inside'],
        ['Drag right → left', 'Crossing: anything it touches'],
        ['Double-click a view symbol', 'Open that section, elevation or plan'],
      ],
    },
    {
      tone: 'wheel',
      head: 'WHEEL',
      x: 420,
      y: 30,
      items: [
        ['Scroll', 'Zoom about the cursor'],
        ['Middle drag', 'Pan'],
        ['Shift + middle drag', 'Orbit (about the selection)'],
        ['Double middle-click', 'Zoom to fit'],
      ],
    },
  ];
  return (
    <Svg w={660} h={270} label="Mouse controls. Left button: click to select (Ctrl adds, Shift removes), drag left to right for a window selection, right to left for a crossing selection, double-click a view symbol to open its view. Wheel: scroll to zoom, middle drag to pan, Shift and middle drag to orbit, double middle-click to zoom to fit. Right button: menu for what you clicked. Trackpad: Alt and drag to orbit, Alt, Shift and drag to pan.">
      <g transform="translate(40,34)">
        <rect x="0" y="0" width="110" height="170" rx="52" className="fig-body" />
        <path d="M0 58 A55 58 0 0 1 55 0 V64 H0 Z" className="fig-zone-left" />
        <path d="M55 0 A55 58 0 0 1 110 58 V64 H55 Z" className="fig-zone-right" />
        <path d="M0 64 H110 M55 0 V64" className="fig-seam" />
        <rect x="47" y="14" width="16" height="32" rx="8" className="fig-zone-wheel" />
        <path d="M51 22 H59 M51 28 H59 M51 34 H59 M51 40 H59" className="fig-seam" />
        <text x="55" y="118" className="fig-d" textAnchor="middle">Shanku</text>
      </g>
      {groups.map((g) => (
        <g key={g.head}>
          <circle cx={g.x - 10} cy={g.y - 4} r="5" className={`fig-dot fig-dot--${g.tone}`} />
          <text x={g.x} y={g.y} className="fig-h">
            {g.head}
          </text>
          {g.items.map(([t, d], i) => (
            <Label key={t} x={g.x} y={g.y + 24 + i * 38} title={t} desc={d} />
          ))}
        </g>
      ))}
      <circle cx="180" cy="210" r="5" className="fig-dot fig-dot--right" />
      <text x="190" y="214" className="fig-h">RIGHT BUTTON</text>
      <Label x={190} y={236} title="Right click" desc="Menu for what you clicked (Revit)" />
      <circle cx="410" cy="210" r="5" className="fig-dot fig-dot--pad" />
      <text x="420" y="214" className="fig-h">TRACKPAD</text>
      <Label x={420} y={236} title="Alt + drag · Alt + Shift + drag" desc="Orbit · pan without a middle button" />
    </Svg>
  );
}

/* -------------------------------------------------------------- interface */

export function InterfaceFigure() {
  const badge = (x: number, y: number, n: number) => (
    <g>
      <circle cx={x} cy={y} r="10" className="fig-badge" />
      <text x={x} y={y + 4} className="fig-badge-t" textAnchor="middle">
        {n}
      </text>
    </g>
  );
  return (
    <Svg w={660} h={330} label="The interface: 1 title bar with search, 2 ribbon, 3 Project Browser, 4 view tabs and the model canvas with the ViewCube, 5 Properties, 6 view bar and status bar.">
      <rect x="10" y="10" width="640" height="310" rx="10" className="fig-frame" />
      <rect x="10" y="10" width="640" height="30" rx="10" className="fig-strip" />
      <rect x="250" y="17" width="170" height="16" rx="8" className="fig-field" />
      <text x="262" y="29" className="fig-d">Search · Ctrl + K</text>
      <rect x="10" y="40" width="640" height="44" className="fig-strip2" />
      {[30, 70, 110, 170, 210, 270].map((x) => (
        <rect key={x} x={x} y="48" width="26" height="26" rx="5" className="fig-chip" />
      ))}
      <rect x="10" y="84" width="140" height="202" className="fig-panel" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={i < 2 ? 22 : 34} y={100 + i * 22} width={i < 2 ? 100 : 86} height="10" rx="3" className="fig-line" />
      ))}
      <rect x="150" y="84" width="350" height="22" className="fig-strip2" />
      <rect x="156" y="88" width="46" height="18" rx="4" className="fig-tab" />
      <rect x="206" y="88" width="50" height="18" rx="4" className="fig-chip" />
      {/* a small frame on the canvas */}
      <g transform="translate(250,140)">
        <path d="M0 60 L70 25 L150 60 L80 95 Z" className="fig-slab" />
        <path d="M0 110 L70 75 L150 110 L80 145 Z" className="fig-slab" />
        {[
          [4, 62],
          [74, 27],
          [146, 62],
          [80, 97],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x - 3} y={y} width="6" height="50" className="fig-column" />
        ))}
      </g>
      <g transform="translate(455,122)">
        <rect x="0" y="0" width="30" height="30" rx="3" className="fig-cube" />
        <ellipse cx="15" cy="34" rx="22" ry="7" className="fig-ring" />
      </g>
      <rect x="500" y="84" width="150" height="202" className="fig-panel" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <rect x="512" y={104 + i * 24} width="50" height="9" rx="3" className="fig-line" />
          <rect x="570" y={104 + i * 24} width="66" height="9" rx="3" className="fig-line fig-line--soft" />
        </g>
      ))}
      <rect x="150" y="262" width="350" height="24" className="fig-strip2" />
      <rect x="10" y="286" width="640" height="34" rx="10" className="fig-strip" />
      {badge(34, 25, 1)}
      <text x="50" y="29" className="fig-t">Title bar</text>
      {badge(310, 61, 2)}
      <text x="326" y="65" className="fig-t">Ribbon</text>
      {badge(80, 270, 3)}
      <text x="22" y="252" className="fig-t">Project Browser</text>
      {badge(325, 230, 4)}
      <text x="341" y="234" className="fig-t">Views and the model</text>
      {badge(575, 270, 5)}
      <text x="525" y="252" className="fig-t">Properties</text>
      {badge(170, 303, 6)}
      <text x="186" y="307" className="fig-t">View bar and status bar</text>
    </Svg>
  );
}

/* -------------------------------------------------------------- selection */

export function SelectionFigure() {
  const beam = (x: number, y: number, w: number, sel: boolean) => <rect x={x} y={y} width={w} height="14" rx="2" className={sel ? 'fig-el fig-el--sel' : 'fig-el'} />;
  const col = (x: number, y: number, sel: boolean) => <rect x={x} y={y} width="16" height="16" rx="2" className={sel ? 'fig-el fig-el--sel' : 'fig-el'} />;
  return (
    <Svg w={660} h={230} label="Box selection. Window, dragged left to right with a solid blue box, selects only elements fully inside it. Crossing, dragged right to left with a dashed green box, selects everything it touches.">
      {/* window */}
      <text x="20" y="24" className="fig-h">WINDOW · DRAG LEFT → RIGHT</text>
      <g transform="translate(20,40)">
        {beam(20, 40, 150, false)}
        {col(60, 90, true)}
        {col(110, 90, true)}
        {beam(40, 130, 200, false)}
        {col(230, 60, false)}
        <rect x="45" y="75" width="110" height="45" className="fig-window" />
        <Arrow x1={45} y1={150} x2={155} y2={150} className="fig-arrow fig-arrow--window" />
      </g>
      <Label x={40} y={216} title="Selects what is fully inside" desc="the two columns; the beams stick out" />
      {/* crossing */}
      <text x="350" y="24" className="fig-h">CROSSING · DRAG RIGHT → LEFT</text>
      <g transform="translate(350,40)">
        {beam(20, 40, 150, false)}
        {col(60, 90, true)}
        {col(110, 90, true)}
        {beam(40, 130, 200, true)}
        {col(230, 60, false)}
        <rect x="45" y="75" width="110" height="65" className="fig-crossing" />
        <Arrow x1={155} y1={165} x2={45} y2={165} className="fig-arrow fig-arrow--crossing" />
      </g>
      <Label x={370} y={216} title="Selects anything it touches" desc="both columns and the lower beam" />
    </Svg>
  );
}

/* -------------------------------------------------------------- view range */

export function ViewRangeFigure() {
  return (
    <Svg w={660} h={250} label="A structural plan's View Range, seen from the side. The plan looks down from the cut plane, 1200 mm above the level, to the view depth, 1200 mm below it. Columns crossing the cut plane show cut and solid; beams under the slab show as dashed hidden lines. Both offsets are set in Properties and may be negative.">
      <rect x="120" y="54" width="360" height="148" className="fig-band" />
      {/* slab at the level, beam under it, columns */}
      <rect x="120" y="120" width="360" height="14" className="fig-slab-cut" />
      <rect x="200" y="134" width="200" height="30" className="fig-hidden-el" />
      <rect x="150" y="10" width="18" height="230" className="fig-column-side" />
      <rect x="432" y="10" width="18" height="230" className="fig-column-side" />
      <rect x="150" y="56" width="18" height="10" className="fig-cutmark" />
      <rect x="432" y="56" width="18" height="10" className="fig-cutmark" />
      {/* planes */}
      <line x1="100" y1="56" x2="500" y2="56" className="fig-plane fig-plane--cut" />
      <line x1="100" y1="120" x2="500" y2="120" className="fig-level" />
      <line x1="100" y1="200" x2="500" y2="200" className="fig-plane" />
      {/* eye looking down */}
      <g transform="translate(300,22)">
        <path d="M-16 0 Q0 -12 16 0 Q0 12 -16 0 Z" className="fig-eye" />
        <circle cx="0" cy="0" r="4" className="fig-eye-pupil" />
      </g>
      <Arrow x1={300} y1={34} x2={300} y2={52} />
      <Label x={510} y={50} title="Cut Plane Offset" desc="+1200 mm (default)" />
      <Label x={510} y={116} title="Level" desc="± 0" />
      <Label x={510} y={196} title="View Depth Offset" desc="−1200 mm (default)" />
      <Label x={10} y={50} title="Cut" desc="solid, darker" />
      <Label x={10} y={150} title="Under the slab" desc="dashed hidden lines" />
    </Svg>
  );
}

/* ------------------------------------------------------------ section grips */

export function SectionGripsFigure() {
  return (
    <Svg w={660} h={220} label="A selected section in a plan. The head circle carries its number and an arrow showing where it looks. Arrows at the ends lengthen or shorten it, the triangle on the dashed far edge sets the far clip, the double arrow flips it, and dragging the line moves it.">
      <rect x="140" y="40" width="380" height="110" className="fig-extent" />
      <line x1="140" y1="150" x2="520" y2="150" className="fig-section-line" />
      {/* the head's arrow points the way the section looks: into the shaded extent */}
      <path d="M140 118 L131 136 L149 136 Z" className="fig-grip" />
      <circle cx="140" cy="150" r="13" className="fig-head" />
      <text x="140" y="154" className="fig-t" textAnchor="middle">1</text>
      <path d="M104 150 L116 142 L116 158 Z" className="fig-grip" />
      <path d="M556 150 L544 142 L544 158 Z" className="fig-grip" />
      <path d="M330 40 L322 52 L338 52 Z" className="fig-grip" />
      <g transform="translate(140,190)">
        <circle r="11" className="fig-head" />
        <path d="M0 -8 L4 -2 L-4 -2 Z M0 8 L4 2 L-4 2 Z" className="fig-grip" />
      </g>
      <Label x={20} y={104} title="◀ ▶ Ends" desc="lengthen along the line" />
      <text x="346" y="22" className="fig-t">▲ Far clip</text>
      <text x="420" y="22" className="fig-d">drag the dashed edge</text>
      <Label x={160} y={188} title="⇅ Flip" desc="look the other way" />
      <Label x={380} y={188} title="Drag the line" desc="move the whole section" />
      <text x="330" y="100" className="fig-d" textAnchor="middle">what the section shows</text>
    </Svg>
  );
}

/* -------------------------------------------------------------- precedence */

export function PrecedenceFigure() {
  const card = (y: number, t: string, d: string, cls: string) => (
    <g>
      <rect x="120" y={y} width="340" height="44" rx="8" className={`fig-card ${cls}`} />
      <Label x={138} y={y + 19} title={t} desc={d} />
    </g>
  );
  return (
    <Svg w={660} h={200} label="Which graphics win: an element override beats the first matching view filter, which beats the category settings in Visibility/Graphics.">
      {card(14, 'Element override', 'right-click → Override Graphics in View', 'fig-card--top')}
      {card(72, 'View filter', 'the first enabled filter that matches', 'fig-card--mid')}
      {card(130, 'Category', 'Visibility/Graphics (VG)', 'fig-card--base')}
      <Arrow x1={500} y1={170} x2={500} y2={22} />
      <text x="514" y="30" className="fig-t">wins</text>
      <text x="514" y="156" className="fig-d">used when nothing</text>
      <text x="514" y="170" className="fig-d">above applies</text>
    </Svg>
  );
}

/* -------------------------------------------------------------- section box */

export function SectionBoxFigure() {
  return (
    <Svg w={660} h={240} label="The section box around a selection. Drag a face arrow to move that face, Shift for 100 millimetre steps; drag the ring to rotate the box in plan, Shift for 15 degree steps. Cut members show as solid, darker faces with their own cut outline.">
      <g transform="translate(150,30)">
        {/* box */}
        <path d="M0 60 L120 0 L260 60 L140 120 Z" className="fig-box" />
        <path d="M0 60 V150 L140 210 V120 M140 210 L260 150 V60" className="fig-box" />
        {/* cut column inside: its cap on the top face */}
        <path d="M110 70 L130 60 L150 70 L130 80 Z" className="fig-cap" />
        <path d="M110 70 V160 L130 170 V80 M130 170 L150 160 V70" className="fig-column-iso" />
        {/* grips */}
        <path d="M130 40 L122 52 L138 52 Z" className="fig-grip" />
        <path d="M60 118 L50 110 L54 124 Z" className="fig-grip" />
        <path d="M205 118 L215 110 L211 124 Z" className="fig-grip" />
        <ellipse cx="130" cy="60" rx="150" ry="70" className="fig-ring-rot" />
      </g>
      <Label x={20} y={60} title="Face arrows" desc="drag to move a face" />
      <Label x={20} y={96} title="Shift" desc="100 mm steps · 15° ring" />
      <Label x={450} y={60} title="Ring" desc="rotate in plan" />
      <Label x={450} y={120} title="Cut faces" desc="solid, a shade darker," />
      <text x="450" y="150" className="fig-d">with a cut outline</text>
      <text x="20" y="200" className="fig-t">BX</text>
      <text x="44" y="200" className="fig-d">around the selection · again to remove</text>
    </Svg>
  );
}

/* ------------------------------------------------------------------ explode */

export function ExplodeFigure() {
  const slab = (x: number, y: number, w = 70, cls = 'fig-slab') => <path d={`M${x} ${y} L${x + w / 2} ${y - w / 4} L${x + w} ${y} L${x + w / 2} ${y + w / 4} Z`} className={cls} />;
  const colm = (x: number, y: number, h = 26) => <rect x={x} y={y} width="5" height={h} className="fig-column" />;
  return (
    <Svg w={660} h={220} label="Exploded views. Storeys lift each storey apart, Radial pushes elements out from the middle of the plan, Categories lays footings, columns, beams and slabs side by side. The three can be combined.">
      <text x="30" y="24" className="fig-h">STOREYS</text>
      <g transform="translate(40,60)">
        {slab(0, 0)}
        {colm(8, 2)}
        {colm(60, 2)}
        {slab(0, 60)}
        {colm(8, 62)}
        {colm(60, 62)}
        {slab(0, 120)}
        <Arrow x1={100} y1={120} x2={100} y2={20} />
      </g>
      <text x="250" y="24" className="fig-h">RADIAL</text>
      <g transform="translate(300,110)">
        {[
          [-70, -40],
          [40, -40],
          [-70, 30],
          [40, 30],
        ].map(([x, y]) => (
          <g key={`${x}${y}`}>
            {slab(x, y, 44)}
          </g>
        ))}
        {[
          [-10, -12, -40, -30],
          [34, -12, 60, -30],
          [-10, 16, -40, 36],
          [34, 16, 60, 36],
        ].map(([a, b, c, d]) => (
          <Arrow key={`${a}${b}`} x1={a} y1={b} x2={c} y2={d} />
        ))}
      </g>
      <text x="460" y="24" className="fig-h">CATEGORIES</text>
      <g transform="translate(450,70)">
        <rect x="0" y="80" width="40" height="14" className="fig-cat fig-cat--footing" />
        <rect x="56" y="30" width="8" height="64" className="fig-cat fig-cat--column" />
        <rect x="72" y="30" width="8" height="64" className="fig-cat fig-cat--column" />
        <rect x="96" y="60" width="50" height="10" className="fig-cat fig-cat--beam" />
        <rect x="96" y="78" width="50" height="10" className="fig-cat fig-cat--beam" />
        <rect x="160" y="70" width="36" height="8" className="fig-cat fig-cat--slab" />
        <text x="20" y="110" className="fig-d" textAnchor="middle">footings</text>
        <text x="68" y="110" className="fig-d" textAnchor="middle">columns</text>
        <text x="121" y="110" className="fig-d" textAnchor="middle">beams</text>
        <text x="178" y="110" className="fig-d" textAnchor="middle">slabs</text>
      </g>
      <text x="330" y="208" className="fig-d" textAnchor="middle">Turn on any combination · Spread sets how far · Collapse puts it back</text>
    </Svg>
  );
}

/* ---------------------------------------------------------- command search */

export function CommandSearchFigure() {
  const row = (y: number, t: string, tag?: string, active = false) => (
    <g>
      {active ? <rect x="120" y={y - 14} width="420" height="22" rx="4" className="fig-row-active" /> : null}
      <text x="134" y={y} className="fig-t fig-t--regular">{t}</text>
      {tag ? (
        <g>
          <rect x="440" y={y - 12} width="36" height="16" rx="4" className="fig-new" />
          <text x="458" y={y} className="fig-new-t" textAnchor="middle">New</text>
        </g>
      ) : null}
    </g>
  );
  return (
    <Svg w={660} h={250} label="The command search, Ctrl + K, before you type: Recently used, Most used, and New in this release with New badges. Type a command name, a mark, an Element ID or a GlobalId.">
      <rect x="120" y="12" width="420" height="26" rx="13" className="fig-field" />
      <text x="138" y="30" className="fig-d">Search commands, or find by mark, Element ID or name…</text>
      <rect x="110" y="44" width="440" height="198" rx="8" className="fig-panel" />
      <text x="126" y="64" className="fig-h">RECENTLY USED</text>
      {row(84, 'Zoom to fit', undefined, true)}
      {row(106, 'Isolate elements')}
      <text x="126" y="132" className="fig-h">MOST USED</text>
      {row(152, 'Show hidden lines (this view)')}
      <text x="126" y="178" className="fig-h">NEW IN SHANKU</text>
      {row(198, 'Show QA checks', 'new')}
      {row(220, 'Explode: storeys', 'new')}
      <Label x={20} y={84} title="Ctrl + K" desc="or click the box" />
      <Label x={566} y={84} title="↑ ↓ Enter" desc="move and run" />
      <Label x={566} y={198} title="New" desc="until you try it" />
    </Svg>
  );
}

/* -------------------------------------------------------------- quantities */

function Flow({ steps, label, h = 150 }: { steps: Array<[string, string]>; label: string; h?: number }) {
  const w = 660, gap = 22, bw = (w - 20 - gap * (steps.length - 1)) / steps.length;
  return (
    <Svg w={w} h={h} label={label}>
      {steps.map(([t, d], i) => {
        const x = 10 + i * (bw + gap);
        return (
          <g key={t}>
            <rect x={x} y="30" width={bw} height="84" rx="8" className={i === steps.length - 1 ? 'fig-card fig-card--top' : 'fig-card'} />
            <text x={x + bw / 2} y="64" className="fig-t" textAnchor="middle">{t}</text>
            {d.split('\n').map((ln, k) => (
              <text key={ln} x={x + bw / 2} y={82 + k * 14} className="fig-d" textAnchor="middle">{ln}</text>
            ))}
            {i < steps.length - 1 ? <Arrow x1={x + bw + 3} y1={72} x2={x + bw + gap - 3} y2={72} /> : null}
          </g>
        );
      })}
    </Svg>
  );
}

export function QuantitiesFigure() {
  return (
    <Flow
      label="Where the numbers come from: IFC base quantities when the file has them, otherwise measured from the geometry; marks and grades read by rules; grouped in the BOQ by level, category and grade with rates; exported to Excel."
      steps={[
        ['IFC quantities', 'base quantities\nwhen present'],
        ['Or geometry', 'measured from\nthe solids'],
        ['Marks · grades', 'first property\nby your rules'],
        ['BOQ', 'level · category\n· grade · rate'],
        ['Excel', 'one workbook\nper export'],
      ]}
    />
  );
}

export function DxfPipelineFigure() {
  return (
    <Flow
      label="DXF to 3D: the drawing's frames and CH layers are read, outlines, labels and levels are matched, checked, and written as an IFC4 model that opens in Shanku and Revit."
      steps={[
        ['DXF drawing', 'frames and\nCH-* layers'],
        ['Read', 'outlines, labels,\nlevels, heights'],
        ['Check', 'duplicates and\nmissing labels'],
        ['IFC4 model', 'stable GlobalIds,\nno openings'],
        ['Open', 'in Shanku\nor Revit'],
      ]}
    />
  );
}

/* ------------------------------------------------------------ revit bridge */

export function RevitBridgeFigure() {
  return (
    <Svg w={660} h={230} label="The Revit bridge. The Shanku add-in in Revit and Shanku in the browser talk over localhost on this computer only, after pairing with a one-time code. Revit sends the model as IFC4; the selection follows in both directions. The Revit model is not changed.">
      <rect x="20" y="40" width="190" height="150" rx="10" className="fig-panel" />
      <text x="115" y="66" className="fig-t" textAnchor="middle">Revit 2025</text>
      <rect x="44" y="84" width="142" height="40" rx="8" className="fig-card fig-card--mid" />
      <text x="115" y="102" className="fig-t" textAnchor="middle">Shanku add-in</text>
      <text x="115" y="117" className="fig-d" textAnchor="middle">Shanku tab → Connect</text>
      <text x="115" y="150" className="fig-d" textAnchor="middle">your model · never changed</text>
      <rect x="450" y="40" width="190" height="150" rx="10" className="fig-panel" />
      <text x="545" y="66" className="fig-t" textAnchor="middle">Shanku in the browser</text>
      <rect x="474" y="84" width="142" height="40" rx="8" className="fig-card fig-card--top" />
      <text x="545" y="102" className="fig-t" textAnchor="middle">Revit window</text>
      <text x="545" y="117" className="fig-d" textAnchor="middle">enter the 6-digit code</text>
      <text x="545" y="150" className="fig-d" textAnchor="middle">status bar: ● Revit</text>
      <Arrow x1={214} y1={92} x2={444} y2={92} />
      <text x="330" y="84" className="fig-t" textAnchor="middle">Load model (IFC4)</text>
      <Arrow x1={214} y1={130} x2={444} y2={130} className="fig-arrow fig-arrow--window" />
      <Arrow x1={444} y1={146} x2={214} y2={146} className="fig-arrow fig-arrow--window" />
      <text x="330" y="124" className="fig-t" textAnchor="middle">Selection, both ways</text>
      <rect x="250" y="176" width="160" height="24" rx="12" className="fig-field" />
      <text x="330" y="192" className="fig-d" textAnchor="middle">localhost:7071 · this PC only</text>
      <text x="330" y="24" className="fig-h" textAnchor="middle">PAIR ONCE WITH A CODE · THEN IT RECONNECTS</text>
    </Svg>
  );
}

/** Figures by id, for the guide's `{ figure }` blocks. */
export const FIGURES: Record<FigureId, () => JSX.Element> = {
  mouse: MouseFigure,
  interface: InterfaceFigure,
  selection: SelectionFigure,
  viewRange: ViewRangeFigure,
  sectionGrips: SectionGripsFigure,
  precedence: PrecedenceFigure,
  sectionBox: SectionBoxFigure,
  explode: ExplodeFigure,
  commandSearch: CommandSearchFigure,
  quantities: QuantitiesFigure,
  dxfPipeline: DxfPipelineFigure,
  revitBridge: RevitBridgeFigure,
};
