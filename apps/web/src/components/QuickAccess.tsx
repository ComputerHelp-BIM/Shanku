import { useEffect, useRef, useState } from 'react';
import { Icon } from '@shanku/ui';
import type { History } from '@shanku/engine';

export interface QuickAccessProps {
  history: History;
  onOpen: () => void;
  onHome: () => void;
  canHome: boolean;
}

/** Revit's Quick Access Toolbar: Open · Undo ▾ · Redo ▾ · Default 3D View. The ▾ lists named transactions. */
export function QuickAccess({ history, onOpen, onHome, canHome }: QuickAccessProps) {
  const [menu, setMenu] = useState<'undo' | 'redo' | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const list = menu === 'undo' ? history.undoList : menu === 'redo' ? history.redoList : [];
  const btn = (label: string, icon: Parameters<typeof Icon>[0]['name'], onClick: () => void, disabled = false, title = label) => (
    <button type="button" className="qat-btn" aria-label={label} title={title} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
  return (
    <span className="qat" ref={root}>
      {btn('Open', 'ifc', onOpen, false, 'Open an IFC model')}
      <span className="qat-split">
        {btn('Undo', 'undo', () => history.undo(), !history.canUndo, history.canUndo ? `Undo ${history.undoList[0]} (Ctrl + Z)` : 'Nothing to undo')}
        <button type="button" className="qat-drop" aria-label="Undo list" aria-expanded={menu === 'undo'} disabled={!history.canUndo} onClick={() => setMenu((m) => (m === 'undo' ? null : 'undo'))}>▾</button>
      </span>
      <span className="qat-split">
        {btn('Redo', 'redo', () => history.redo(), !history.canRedo, history.canRedo ? `Redo ${history.redoList[0]} (Ctrl + Y)` : 'Nothing to redo')}
        <button type="button" className="qat-drop" aria-label="Redo list" aria-expanded={menu === 'redo'} disabled={!history.canRedo} onClick={() => setMenu((m) => (m === 'redo' ? null : 'redo'))}>▾</button>
      </span>
      {btn('Default 3D View', 'view3d', onHome, !canHome)}
      {menu && list.length ? (
        <span className="qat-menu" role="menu" aria-label={menu === 'undo' ? 'Undo history' : 'Redo history'}>
          {list.map((name, i) => (
            <button
              key={`${name}-${i}`}
              type="button"
              role="menuitem"
              onClick={() => {
                if (menu === 'undo') history.undo(i + 1);
                else history.redo(i + 1);
                setMenu(null);
              }}
            >
              {name}
              {i > 0 ? <span className="qat-menu__n">{i + 1} steps</span> : null}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
