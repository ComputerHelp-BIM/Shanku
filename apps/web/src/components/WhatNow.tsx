import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface Intent {
  id: string;
  title: string;
  /** One line: what happens when you pick it. */
  detail: string;
  /** Needs an open model; without one, the sample opens first. */
  needsModel?: boolean;
  run: () => void;
}

/**
 * "What now?" (Structura item 7): the common tasks as a short list in the title bar, so a new user
 * sees where to start. Tasks that need a model open the sample first when nothing is open.
 */
export function WhatNow({ intents, hasModel }: { intents: Intent[]; hasModel: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('.app-whatnow__button')?.focus();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    // Focus the first task so the keyboard can go straight on.
    root.current?.querySelector<HTMLButtonElement>('.app-whatnow__item')?.focus();
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const move = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('.app-whatnow__item') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="app-whatnow" ref={root}>
      <button type="button" className="app-whatnow__button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        What now?
      </button>
      {open ? (
        <div className="app-whatnow__panel" id={listId} role="group" aria-label="Common tasks" onKeyDown={move}>
          {intents.map((it) => (
            <button
              key={it.id}
              type="button"
              className="app-whatnow__item"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
            >
              <strong>{it.title}</strong>
              <span>
                {it.detail}
                {it.needsModel && !hasModel ? ' Opens the sample model first.' : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
