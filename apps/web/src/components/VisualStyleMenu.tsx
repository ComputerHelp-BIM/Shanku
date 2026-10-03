import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DisplayStyle } from '@cad2bim/engine';

/** Revit's Visual Style menu on the view bar: one button with the current style, the list in Revit's order. */
export function VisualStyleMenu({ styles, value, onChange, disabled }: { styles: Array<{ id: DisplayStyle; label: string; keys: string }>; value: DisplayStyle; onChange: (s: DisplayStyle) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // the list opens above the button, on the page itself: inside the view bar the viewport would cover it
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  const current = styles.find((s) => s.id === value);
  return (
    <div className="app-stylemenu" ref={root}>
      <button type="button" className="app-stylemenu__button" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ left: r.left, bottom: window.innerHeight - r.top + 4 });
          setOpen((o) => !o);
        }} title="Visual Style" aria-label={`Visual Style: ${current?.label ?? value}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M12 2 3 7v10l9 5 9-5V7z" />
          <path d="M3 7l9 5 9-5M12 12v10" />
        </svg>
        {current?.label ?? value}
        <span aria-hidden="true">▾</span>
      </button>
      {open && at ? createPortal(
        <div className="app-stylemenu__list" role="menu" aria-label="Visual Style" ref={list} style={{ left: at.left, bottom: at.bottom }}>
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitemradio"
              aria-checked={s.id === value}
              className={s.id === value ? 'is-active' : undefined}
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
            >
              <span className="app-stylemenu__check" aria-hidden="true">
                {s.id === value ? '✓' : ''}
              </span>
              {s.label}
              {s.keys ? <kbd>{s.keys}</kbd> : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
