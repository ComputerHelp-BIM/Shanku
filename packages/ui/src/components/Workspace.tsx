import { useId, type ReactNode } from 'react';
import { TOGGLE_BOTTOM_PANEL, formatShortcut, useShortcut } from '../hooks/useShortcut';
import { Kbd } from './Button';

export interface ViewTab {
  id: string;
  label: string;
  closable?: boolean;
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
          <div key={tab.id} className={['sk-view-tab', active && 'is-active'].filter(Boolean).join(' ')}>
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
  /** Bind Ctrl + ` (fallback Ctrl + Shift + `) to toggle. Default true. */
  bindShortcut?: boolean;
}

/**
 * Console / QA / BOQ / Activity dock under the viewport. Collapsed, only its
 * tab strip remains so it stays discoverable. The toggle shortcut also works
 * while typing in the console.
 */
export function BottomPanel({ tabs, activeId, onTabChange, open, onOpenChange, bindShortcut = true }: BottomPanelProps) {
  const bodyId = useId();
  useShortcut(TOGGLE_BOTTOM_PANEL, () => onOpenChange(!open), { enabled: bindShortcut, allowInEditable: true });
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  return (
    <section className={['sk-bottom-panel', open ? 'is-open' : 'is-collapsed'].join(' ')} aria-label="Bottom panel">
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
              onClick={() => {
                onTabChange(tab.id);
                if (!open) onOpenChange(true);
              }}
            >
              {tab.label}
              {typeof tab.badge === 'number' ? <span className="sk-bottom-panel__badge">{tab.badge}</span> : null}
            </button>
          ))}
        </div>
        <span className="sk-bottom-panel__hint">
          Toggle <Kbd>{formatShortcut(TOGGLE_BOTTOM_PANEL[0])}</Kbd>
        </span>
        <button
          type="button"
          className="sk-icon-button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? 'Collapse bottom panel' : 'Expand bottom panel'}
          title={`${open ? 'Collapse' : 'Expand'} (${formatShortcut(TOGGLE_BOTTOM_PANEL[0])})`}
          onClick={() => onOpenChange(!open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
          </svg>
        </button>
      </div>
      <div id={bodyId} role="tabpanel" className="sk-bottom-panel__body" hidden={!open}>
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
  left: ReactNode;
  viewTabs: ReactNode;
  viewport: ReactNode;
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
      <div className="sk-shell__body">
        <aside className="sk-shell__left">{p.left}</aside>
        <main className="sk-shell__main">
          {p.viewTabs}
          <div className="sk-shell__viewport">{p.viewport}</div>
          {p.viewBar ? <div className="sk-shell__viewbar">{p.viewBar}</div> : null}
          {p.bottomPanel}
        </main>
      </div>
      {p.statusBar}
    </div>
  );
}
