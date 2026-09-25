import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** A docked panel with a header (Properties, Project browser, ...). */
export function DockPanel({ title, children, grow }: { title: string; children: ReactNode; grow?: boolean }) {
  const id = useId();
  return (
    <section className={['sk-dock', grow && 'sk-dock--grow'].filter(Boolean).join(' ')} aria-labelledby={id}>
      <h2 id={id} className="sk-dock__title">
        {title}
      </h2>
      <div className="sk-dock__body">{children}</div>
    </section>
  );
}

export interface TypeSelectorProps {
  icon: IconName;
  category: string;
  typeName: string;
}

export function TypeSelector({ icon, category, typeName }: TypeSelectorProps) {
  return (
    <div className="sk-type-selector">
      <Icon name={icon} size={22} />
      <div className="sk-type-selector__text">
        <span className="sk-type-selector__category">{category}</span>
        <span className="sk-type-selector__name">{typeName}</span>
      </div>
    </div>
  );
}

export interface PropertySectionProps {
  title: string;
  children: ReactNode;
  /** Revit-style: the header collapses the group (default). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /**
   * Remembers open/closed on this device, like Revit remembers its palette groups. Defaults to the
   * title, so every "Constraints" group opens or closes together; false keeps nothing.
   */
  persistKey?: string | false;
  /** Extra class for the section (e.g. a nested block). */
  className?: string;
}

const SECTION_STORE = 'shanku.propSections';
function readSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTION_STORE) ?? '{}');
  } catch {
    return {};
  }
}

/** A Properties group: a bold header band that collapses the rows under it, as in Revit's palette. */
export function PropertySection({ title, children, collapsible = true, defaultOpen = true, persistKey, className }: PropertySectionProps) {
  const id = useId();
  const key = persistKey === false ? null : (persistKey ?? title.toLowerCase());
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    const saved = key ? readSections()[key] : undefined;
    return saved ?? defaultOpen;
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!key) return;
    try {
      localStorage.setItem(SECTION_STORE, JSON.stringify({ ...readSections(), [key]: next }));
    } catch {
      /* storage unavailable: not remembered */
    }
  };
  return (
    <div className={['sk-prop-section', !open && 'is-collapsed', className].filter(Boolean).join(' ')} role="group" aria-labelledby={id}>
      {collapsible ? (
        <button type="button" id={id} className="sk-prop-section__title" aria-expanded={open} onClick={toggle}>
          <span>{title}</span>
          <svg className="sk-prop-section__chevron" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 7.5l3-3 3 3" />
          </svg>
        </button>
      ) : (
        <div id={id} className="sk-prop-section__title">
          {title}
        </div>
      )}
      {open ? <div className="sk-prop-section__rows">{children}</div> : null}
    </div>
  );
}

export interface PropertyRowProps {
  label: string;
  /** `null` with `varies` shows "Varies" (multi-selection with different values). */
  value: string | number | null;
  unit?: string;
  /** Monospace value: IDs, GlobalIds. */
  mono?: boolean;
  /** Computed values (volume, area): shown faint, never editable. */
  readOnly?: boolean;
  varies?: boolean;
  /** When given (and not readOnly) the value is editable. Called on Enter or blur with the raw text. */
  onCommit?: (value: string) => void;
  /** Changed here but not yet applied where it belongs (e.g. Revit): marked, with a tooltip. */
  modified?: boolean;
  /** Yes/No values edit as a checkbox; onCommit receives "Yes" or "No". */
  kind?: 'text' | 'yesno';
  /** Tooltip, e.g. why the value is read-only. */
  hint?: string;
}

function display(value: string | number | null, unit?: string): string {
  if (value === null || value === '') return '';
  return unit ? `${value} ${unit}` : String(value);
}

export function PropertyRow({ label, value, unit, mono, readOnly, varies, onCommit, modified, kind = 'text', hint }: PropertyRowProps) {
  const inputId = useId();
  const editable = Boolean(onCommit) && !readOnly;
  const initial = varies ? '' : value === null ? '' : String(value);
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const commit = () => {
    if (!onCommit || draft === initial) return;
    onCommit(draft.trim());
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(initial);
      e.currentTarget.blur();
    }
  };

  const valueClass = ['sk-prop-row__value', mono && 'is-mono', readOnly && 'is-readonly'].filter(Boolean).join(' ');
  const rowClass = ['sk-prop-row', modified && 'is-modified', readOnly && 'is-readonly'].filter(Boolean).join(' ');
  const title = [modified ? 'Changed here; not applied yet' : null, hint].filter(Boolean).join(' · ') || undefined;
  if (kind === 'yesno') {
    const on = !varies && String(value) === 'Yes';
    return (
      <div className={rowClass} title={title}>
        <label className="sk-prop-row__label" htmlFor={inputId}>
          {label}
        </label>
        <span className="sk-prop-row__field">
          <input
            id={inputId}
            type="checkbox"
            className="sk-prop-row__check"
            checked={on}
            ref={(el) => {
              if (el) el.indeterminate = !!varies;
            }}
            disabled={!editable}
            onChange={(e) => onCommit?.(e.target.checked ? 'Yes' : 'No')}
          />
        </span>
      </div>
    );
  }
  return (
    <div className={rowClass} title={title}>
      <label className="sk-prop-row__label" htmlFor={editable ? inputId : undefined}>
        {label}
      </label>
      {editable ? (
        <span className="sk-prop-row__field">
          <input
            id={inputId}
            className={valueClass}
            value={draft}
            placeholder={varies ? 'Varies' : undefined}
            inputMode={typeof value === 'number' ? 'decimal' : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
          {unit ? <span className="sk-prop-row__unit">{unit}</span> : null}
        </span>
      ) : (
        <span className={valueClass} title={varies ? 'Varies' : display(value, unit)}>
          {varies ? 'Varies' : display(value, unit)}
        </span>
      )}
    </div>
  );
}
