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
  /** Before the tabs: Revit's File tab, which opens the application menu rather than a ribbon. */
  leading?: ReactNode;
}

export function RibbonTabs({ tabs, activeId, onChange, leading }: RibbonTabsProps) {
  return (
    <div className="sk-ribbon-tabs" role="tablist" aria-label="Ribbon">
      {leading}
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

/** A column of up to three small buttons (Revit's stacked panel rows). */
export function RibbonStack({ children }: { children: ReactNode }) {
  return <div className="sk-ribbon-stack">{children}</div>;
}

export interface RibbonButtonProps {
  icon: IconName;
  label: string;
  /** 'small': an icon in a stack (Revit's Modify panel); the label shows in the tooltip. Default 'large'. */
  size?: 'large' | 'small';
  /** Use the two-tone drawing (structural elements on the ribbon only). */
  twoTone?: boolean;
  active?: boolean;
  disabled?: boolean;
  /** Shown in the tooltip, e.g. "CL". */
  shortcutHint?: string;
  /** Receives the click, e.g. to open a menu under the button. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function RibbonButton({ icon, label, size = 'large', twoTone, active, disabled, shortcutHint, onClick }: RibbonButtonProps) {
  const small = size === 'small';
  return (
    <button
      type="button"
      className={['sk-ribbon-button', small && 'sk-ribbon-button--small', active && 'is-active'].filter(Boolean).join(' ')}
      aria-pressed={active ?? undefined}
      aria-label={small ? label : undefined}
      disabled={disabled}
      title={shortcutHint ? `${label} (${shortcutHint})` : label}
      onClick={onClick}
    >
      <Icon name={icon} size={small ? 18 : 24} variant={twoTone ? 'twoTone' : 'outline'} />
      {small ? null : <span>{label}</span>}
    </button>
  );
}
