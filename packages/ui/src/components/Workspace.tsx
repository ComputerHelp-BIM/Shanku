import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type CSSProperties } from 'react';
import { TOGGLE_BOTTOM_PANEL, formatShortcut, useShortcut } from '../hooks/useShortcut';
import { Kbd } from './Button';

export interface ViewTab {
  id: string;
  label: string;
  closable?: boolean;
  /** Document colour, like pyRevit's tab colouring: every view of the same file shares it. */
  color?: string;
  /** Tooltip, e.g. the file name. */
  title?: string;
}

export interface ViewTabsProps {
  tabs: readonly ViewTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}

export function ViewTabs({ tabs, activeId, onSelect, onClose }: ViewTabsProps) {
  return (
    <div className="sk-view-tabs" role="tablist" aria-label="Open views">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={['sk-view-tab', active && 'is-active', tab.color && 'has-color'].filter(Boolean).join(' ')}
            style={tab.color ? ({ '--tab-color': tab.color } as CSSProperties) : undefined}
            title={tab.title}
          >
            <button type="button" role="tab" aria-selected={active} className="sk-view-tab__label" onClick={() => onSelect(tab.id)}>
              {tab.label}
            </button>
            {tab.closable && onClose ? (
              <button type="button" className="sk-view-tab__close" aria-label={`Close ${tab.label}`} onClick={() => onClose(tab.id)}>
                ×
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export interface BottomPanelTab {
  id: string;
  label: string;
  /** e.g. QA issue count. */
  badge?: number;
  content: ReactNode;
}

export interface BottomPanelProps {
  tabs: readonly BottomPanelTab[];
  activeId: string;
  onTabChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open height in px. Controlled when given with onHeightChange. Default 196. */
  height?: number;
  onHeightChange?: (height: number) => void;
  /** Dragging below this closes the panel, like VS Code. Default 96. */
  minHeight?: number;
  /** Bind Ctrl + ` (fallback Ctrl + Shift + `) to toggle. Default true. */
  bindShortcut?: boolean;
}

const DEFAULT_HEIGHT = 196;

/**
 * Console / QA / BOQ / Activity dock under the viewport, VS Code style: when closed
 * it takes no space at all, only a thin drag handle along the bottom edge. Drag the
 * handle up (or press Ctrl + `) to open; drag its top edge to resize; drag it below
 * `minHeight` to close. The shortcut also works while typing in the console.
 */
export function BottomPanel({
  tabs,
  activeId,
  onTabChange,
  open,
  onOpenChange,
  height,
  onHeightChange,
  minHeight = 96,
  bindShortcut = true,
}: BottomPanelProps) {
  const bodyId = useId();
  const [innerHeight, setInnerHeight] = useState(DEFAULT_HEIGHT);
  const h = height ?? innerHeight;
  const setHeight = (v: number) => (onHeightChange ? onHeightChange(v) : setInnerHeight(v));
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useShortcut(TOGGLE_BOTTOM_PANEL, () => onOpenChange(!open), { enabled: bindShortcut, allowInEditable: true });
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const toggleLabel = formatShortcut(TOGGLE_BOTTOM_PANEL[0]);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = open ? h : 0;
    const parent = rootRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
    const maxH = parent > 0 ? Math.max(minHeight, parent * 0.8) : Infinity;
    let last = startH;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = Math.min(maxH, Math.max(0, startH + (startY - ev.clientY)));
      if (last >= minHeight) {
        if (!open) onOpenChange(true);
        setHeight(Math.round(last));
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      if (last < minHeight) onOpenChange(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onSashKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenChange(!open);
    } else if (open && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setHeight(Math.max(minHeight, h + (e.key === 'ArrowUp' ? 16 : -16)));
    }
  };

  const sash = (
    <div
      className={['sk-bottom-sash', dragging && 'is-dragging'].filter(Boolean).join(' ')}
      role="separator"
      aria-orientation="horizontal"
      aria-label={open ? 'Resize bottom panel' : `Show bottom panel (drag up or ${toggleLabel})`}
      aria-valuenow={open ? h : 0}
      aria-controls={bodyId}
      tabIndex={0}
      title={open ? 'Drag to resize' : `Drag up or press ${toggleLabel}`}
      onPointerDown={startDrag}
      onKeyDown={onSashKey}
    />
  );

  if (!open) {
    return (
      <div ref={rootRef} className="sk-bottom-panel is-collapsed">
        {sash}
      </div>
    );
  }

  return (
    <section ref={rootRef} className="sk-bottom-panel is-open" style={{ height: h }} aria-label="Bottom panel">
      {sash}
      <div className="sk-bottom-panel__bar">
        <div role="tablist" aria-label="Bottom panel tabs" className="sk-bottom-panel__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active?.id}
              aria-controls={bodyId}
              className={['sk-bottom-panel__tab', tab.id === active?.id && 'is-active'].filter(Boolean).join(' ')}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              {typeof tab.badge === 'number' ? <span className="sk-bottom-panel__badge">{tab.badge}</span> : null}
            </button>
          ))}
        </div>
        <span className="sk-bottom-panel__hint">
          Toggle <Kbd>{toggleLabel}</Kbd>
        </span>
        <button
          type="button"
          className="sk-icon-button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label="Hide bottom panel"
          title={`Hide (${toggleLabel})`}
          onClick={() => onOpenChange(false)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div id={bodyId} role="tabpanel" className="sk-bottom-panel__body">
        {active?.content}
      </div>
    </section>
  );
}

export function StatusBar({ children }: { children: ReactNode }) {
  return (
    <footer className="sk-statusbar" aria-label="Status">
      {children}
    </footer>
  );
}

export function StatusChip({ children }: { children: ReactNode }) {
  return <span className="sk-chip">{children}</span>;
}

/** The local-first promise, always visible. */
export function LocalIndicator({ text = 'Local only — nothing uploaded' }: { text?: string }) {
  return (
    <span className="sk-local">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M6 11h12v9H6z" />
        <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
      </svg>
      {text}
    </span>
  );
}

export interface AppShellProps {
  titleBar: ReactNode;
  ribbonTabs: ReactNode;
  ribbon: ReactNode;
  /** A docking workspace that owns everything between the ribbon and the status bar. Replaces the fixed slots below. */
  workspace?: ReactNode;
  left?: ReactNode;
  viewTabs?: ReactNode;
  viewport?: ReactNode;
  viewBar?: ReactNode;
  bottomPanel?: ReactNode;
  statusBar: ReactNode;
}

/** The full Shanku window layout. Fills its container (give it 100vh). */
export function AppShell(p: AppShellProps) {
  return (
    <div className="sk-shell">
      {p.titleBar}
      {p.ribbonTabs}
      {p.ribbon}
      {p.workspace ? (
        <div className="sk-shell__workspace">{p.workspace}</div>
      ) : (
      <div className="sk-shell__body">
        <aside className="sk-shell__left">{p.left}</aside>
        <main className="sk-shell__main">
          {p.viewTabs}
          <div className="sk-shell__viewport">{p.viewport}</div>
          {p.viewBar ? <div className="sk-shell__viewbar">{p.viewBar}</div> : null}
          {p.bottomPanel}
        </main>
      </div>
      )}
      {p.statusBar}
    </div>
  );
}
