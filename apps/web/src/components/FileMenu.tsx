/**
 * Revit's File menu (the application menu): the big commands down the left; hovering one with choices shows them on
 * the right with a line each saying what they do ("Saves an IFC file."); with nothing hovered, the right shows the
 * recent files. Options at the bottom. Placed on the page itself (inside the ribbon the viewport would cover it).
 * Esc or a click outside closes it; the arrow keys move between commands, → into the choices.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@cad2bim/ui';
import type { RecentFile } from '../lib/recent';

export interface FileMenuChoice {
  label: string;
  description: string;
  icon: IconName;
  disabled?: boolean;
  /** Why it is unavailable, or a note (shown as its tooltip). */
  hint?: string;
  onClick?: () => void;
}

export interface FileMenuItem {
  id: string;
  label: string;
  icon: IconName;
  disabled?: boolean;
  hint?: string;
  /** A command (Save) … */
  onClick?: () => void;
  /** … or choices shown on the right (Open, Export), under this heading. */
  heading?: string;
  choices?: FileMenuChoice[];
}

export interface FileMenuProps {
  open: boolean;
  /** The File tab: the menu opens under it. */
  anchor: HTMLElement | null;
  items: FileMenuItem[];
  recent: RecentFile[];
  /** Recent files need Chrome or Edge (file handles); elsewhere the pane says so. */
  recentSupported: boolean;
  onOpenRecent: (r: RecentFile) => void;
  /** Revit's Options button; shown only when there is an options dialog to open. */
  onOptions?: () => void;
  onClose: () => void;
}

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
};

export function FileMenu({ open, anchor, items, recent, recentSupported, onOpenRecent, onOptions, onClose }: FileMenuProps) {
  const [hover, setHover] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    setHover(null);
    // focus the first command, as a menu does
    requestAnimationFrame(() => itemRefs.current.find((b) => b && !b.disabled)?.focus());
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open, anchor, onClose]);

  if (!open || !anchor) return null;
  const r = anchor.getBoundingClientRect();
  const current = items.find((i) => i.id === hover && i.choices);

  const run = (fn?: () => void) => {
    onClose();
    fn?.();
  };
  const onKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = itemRefs.current.filter((b): b is HTMLButtonElement => !!b);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      for (let k = 1; k <= list.length; k++) {
        const next = list[(at + step * k + list.length * 2) % list.length];
        if (!next.disabled) {
          next.focus();
          break;
        }
      }
    } else if (e.key === 'ArrowRight' && current) {
      e.preventDefault();
      panel.current?.querySelector<HTMLButtonElement>('.app-filemenu__choice:not(:disabled)')?.focus();
    } else if (e.key === 'ArrowLeft') {
      const i = items.findIndex((x) => x.id === hover);
      if (i >= 0) itemRefs.current[i]?.focus();
    }
  };

  return createPortal(
    <div className="app-filemenu" role="menu" aria-label="File" ref={panel} style={{ left: r.left, top: r.bottom }} onKeyDown={onKeys}>
      <div className="app-filemenu__body">
        <div className="app-filemenu__items">
          {items.map((it, i) => (
            <button
              key={it.id}
              ref={(b) => {
                itemRefs.current[i] = b;
              }}
              type="button"
              role="menuitem"
              className={['app-filemenu__item', hover === it.id && 'is-hover'].filter(Boolean).join(' ')}
              disabled={it.disabled}
              title={it.hint}
              aria-haspopup={it.choices ? 'menu' : undefined}
              aria-expanded={it.choices ? hover === it.id : undefined}
              onPointerEnter={() => setHover(it.id)}
              onFocus={() => setHover(it.id)}
              onClick={() => (it.choices ? setHover(it.id) : run(it.onClick))}
            >
              <Icon name={it.icon} size={28} />
              <span>{it.label}</span>
              {it.choices ? <span className="app-filemenu__more" aria-hidden="true">▸</span> : null}
            </button>
          ))}
        </div>
        <div className="app-filemenu__pane" role={current ? 'menu' : undefined} aria-label={current?.heading}>
          {current ? (
            <>
              <div className="app-filemenu__heading">{current.heading}</div>
              {current.choices!.map((c) => (
                <button key={c.label} type="button" role="menuitem" className="app-filemenu__choice" disabled={c.disabled} title={c.hint} onClick={() => run(c.onClick)}>
                  <Icon name={c.icon} size={28} />
                  <span className="app-filemenu__choice-text">
                    <strong>{c.label}</strong>
                    <span>{c.description}</span>
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="app-filemenu__heading">Recent Files</div>
              {recent.length ? (
                recent.map((f) => (
                  <button key={`${f.name}-${f.at}`} type="button" role="menuitem" className="app-filemenu__recent" onClick={() => run(() => onOpenRecent(f))} title={`Open ${f.name} again`}>
                    <Icon name={f.kind === 'dxf' ? 'dxf' : f.name.toLowerCase().endsWith('.ifc') || f.name.toLowerCase().endsWith('.gz') ? 'ifc' : 'save'} size={18} />
                    <span>{f.name}</span>
                    <span className="app-filemenu__when">{when(f.at)}</span>
                  </button>
                ))
              ) : (
                <p className="app-filemenu__empty">{recentSupported ? 'Files you open appear here.' : 'Recent files need Chrome or Edge (they let cad2bim open a file again).'}</p>
              )}
            </>
          )}
        </div>
      </div>
      {onOptions ? (
        <div className="app-filemenu__footer">
          <button type="button" className="app-filemenu__footer-btn" onClick={() => run(onOptions)}>
            Options
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
