import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from './ErrorBoundary';

export interface FloatingWindowProps {
  /** Remembers position and size under this id. */
  id: string;
  title: string;
  /** e.g. the file name, shown after the title. */
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  /** Initial geometry in px when nothing is remembered yet. */
  initial?: { x?: number; y?: number; w: number; h: number };
  minWidth?: number;
  minHeight?: number;
  /** Top-edge colour, e.g. the document colour. */
  accent?: string;
  children: ReactNode;
}

type Geom = { x: number; y: number; w: number; h: number };
let topZ = 1000;

const load = (id: string): Geom | null => {
  try {
    const g = JSON.parse(localStorage.getItem(`shanku.window.${id}`) ?? 'null');
    return g && [g.x, g.y, g.w, g.h].every(Number.isFinite) ? g : null;
  } catch {
    return null;
  }
};

/** Keeps at least the title bar reachable inside the browser window. */
const clampGeom = (g: Geom, minW: number, minH: number): Geom => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(Math.max(minW, g.w), vw), h = Math.min(Math.max(minH, g.h), vh);
  return { w, h, x: Math.min(Math.max(g.x, 80 - w), vw - 80), y: Math.min(Math.max(g.y, 0), vh - 36) };
};

/**
 * A modeless window like Revit's dialogs: floats above the whole app (ribbon included), moves by its
 * title bar, resizes from any edge or corner, comes to the front when used, and remembers where it was.
 * Esc closes it unless a text field has focus.
 */
export function FloatingWindow({ id, title, subtitle, open, onClose, initial, minWidth = 360, minHeight = 200, accent, children }: FloatingWindowProps) {
  const [geom, setGeom] = useState<Geom>(() => {
    const vw = typeof window === 'undefined' ? 1280 : window.innerWidth, vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    const w = initial?.w ?? 720, h = initial?.h ?? 480;
    return load(id) ?? { w, h, x: initial?.x ?? Math.round((vw - w) / 2), y: initial?.y ?? Math.round((vh - h) / 3) };
  });
  const [z, setZ] = useState(() => ++topZ);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    setZ(++topZ);
    // Take focus for Esc, unless something inside (e.g. an autofocused field) already has it.
    requestAnimationFrame(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
    });
    setGeom((g) => clampGeom(g, minWidth, minHeight));
  }, [open, minWidth, minHeight]);
  useEffect(() => {
    try {
      localStorage.setItem(`shanku.window.${id}`, JSON.stringify(geom));
    } catch {
      /* storage unavailable */
    }
  }, [id, geom]);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onResize = () => setGeom((g) => clampGeom(g, minWidth, minHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, minWidth, minHeight]);

  if (!open || typeof document === 'undefined') return null;

  const drag = (edges: string) => (ev: ReactPointerEvent) => {
    if (ev.button !== 0 || (edges === 'move' && (ev.target as HTMLElement).closest('button, input, select, textarea'))) return;
    ev.preventDefault();
    const s = { px: ev.clientX, py: ev.clientY, ...geom };
    const move = (e: PointerEvent) => {
      const dx = e.clientX - s.px, dy = e.clientY - s.py;
      let { x, y, w, h } = s;
      if (edges === 'move') {
        x += dx;
        y += dy;
      } else {
        if (edges.includes('e')) w = s.w + dx;
        if (edges.includes('s')) h = s.h + dy;
        if (edges.includes('w')) {
          w = Math.max(minWidth, s.w - dx);
          x = s.x + s.w - w;
        }
        if (edges.includes('n')) {
          h = Math.max(minHeight, s.h - dy);
          y = s.y + s.h - h;
        }
      }
      setGeom(clampGeom({ x, y, w, h }, minWidth, minHeight));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && !t.closest('input, textarea, select, [contenteditable="true"]')) {
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <section
      ref={ref}
      className="sk-window"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h, zIndex: z, ...(accent ? { ['--sk-window-accent' as string]: accent } : {}) }}
      tabIndex={-1}
      onPointerDownCapture={(e) => {
        setZ(++topZ);
        // Take keyboard focus (for Esc) unless a control inside is being clicked.
        if (!(e.target as HTMLElement).closest('button, input, select, textarea, a, [tabindex]:not(.sk-window)')) ref.current?.focus({ preventScroll: true });
      }}
      onKeyDown={onKey}
    >
      <header className="sk-window__title" onPointerDown={drag('move')} onDoubleClick={() => setGeom((g) => clampGeom({ ...g, x: 24, y: 24, w: window.innerWidth - 48, h: window.innerHeight - 48 }, minWidth, minHeight))}>
        <h2>{title}</h2>
        {subtitle ? <span className="sk-window__subtitle">{subtitle}</span> : null}
        <span className="sk-window__spacer" />
        <button type="button" className="sk-icon-button" aria-label={`Close ${title}`} title="Close (Esc)" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="sk-window__body">
        {/* an error inside one window stays in that window */}
        <ErrorBoundary where={`${title} window`}>{children}</ErrorBoundary>
      </div>
      {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((edge) => (
        <div key={edge} className={`sk-window__edge sk-window__edge--${edge}`} onPointerDown={drag(edge)} aria-hidden="true" />
      ))}
    </section>,
    document.body,
  );
}
