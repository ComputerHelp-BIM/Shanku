import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { MenuItem } from '../lib/menu';

export { item, sep, type MenuItem } from '../lib/menu';

/** Revit-style right-click menu: separators, disabled entries, check marks, submenus (›). Esc or click away closes. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);

  useLayoutEffect(() => {
    // keep the menu inside the window
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.min(x, window.innerWidth - r.width - 4), y: Math.min(y, window.innerHeight - r.height - 4) });
  }, [x, y]);
  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // Rendered at the top of the page: inside a dock panel it would sit under the other panels.
  return createPortal(
    <div ref={ref} className="ctx" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <Items items={items} open={open} setOpen={setOpen} onClose={onClose} />
    </div>,
    document.body,
  );
}

function Items({ items, open, setOpen, onClose }: { items: MenuItem[]; open: number | null; setOpen: (i: number | null) => void; onClose: () => void }) {
  return (
    <>
      {items.map((it, i) =>
        it.kind === 'sep' ? (
          <div key={i} className="ctx-sep" role="separator" />
        ) : (
          <div key={i} className="ctx-row" title={it.title} onPointerEnter={() => setOpen(it.submenu ? i : null)}>
            <button
              type="button"
              role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={it.checked}
              aria-haspopup={it.submenu ? 'menu' : undefined}
              disabled={it.disabled}
              className="ctx-item"
              onClick={() => {
                if (it.submenu) return setOpen(open === i ? null : i);
                it.onClick?.();
                onClose();
              }}
            >
              <span className="ctx-check">{it.checked ? '✓' : ''}</span>
              <span className="ctx-label">{it.label}</span>
              {it.hint ? <kbd>{it.hint}</kbd> : null}
              {it.submenu ? <span className="ctx-more">›</span> : null}
            </button>
            {it.submenu && open === i ? (
              <div className="ctx ctx--sub" role="menu">
                <Items items={it.submenu} open={null} setOpen={() => undefined} onClose={onClose} />
              </div>
            ) : null}
          </div>
        ),
      )}
    </>
  );
}
