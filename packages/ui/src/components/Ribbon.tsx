import type { MouseEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface RibbonTab {
  id: string;
  label: string;
}

export interface RibbonTabsProps {
  tabs: readonly RibbonTab[];
  activeId: string;
  onChange: (id: string) => void;
}

export function RibbonTabs({ tabs, activeId, onChange }: RibbonTabsProps) {
  return (
    <div className="sk-ribbon-tabs" role="tablist" aria-label="Ribbon">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={['sk-ribbon-tab', active && 'is-active'].filter(Boolean).join(' ')}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function Ribbon({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="sk-ribbon" role="toolbar" aria-label={label ?? 'Commands'}>
      {children}
    </div>
  );
}

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sk-ribbon-group" role="group" aria-label={label}>
      <div className="sk-ribbon-group__buttons">{children}</div>
      <div className="sk-ribbon-group__label">{label}</div>
    </div>
  );
}

export interface RibbonButtonProps {
  icon: IconName;
  label: string;
  /** Use the two-tone drawing (structural elements on the ribbon only). */
  twoTone?: boolean;
  active?: boolean;
  disabled?: boolean;
  /** Shown in the tooltip, e.g. "CL". */
  shortcutHint?: string;
  /** Receives the click, e.g. to open a menu under the button. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function RibbonButton({ icon, label, twoTone, active, disabled, shortcutHint, onClick }: RibbonButtonProps) {
  return (
    <button
      type="button"
      className={['sk-ribbon-button', active && 'is-active'].filter(Boolean).join(' ')}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      title={shortcutHint ? `${label} (${shortcutHint})` : label}
      onClick={onClick}
    >
      <Icon name={icon} size={24} variant={twoTone ? 'twoTone' : 'outline'} />
      <span>{label}</span>
    </button>
  );
}
