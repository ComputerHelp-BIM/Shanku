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

export function PropertySection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="sk-prop-section" role="group" aria-labelledby={id}>
      <div id={id} className="sk-prop-section__title">
        {title}
      </div>
      {children}
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
}

function display(value: string | number | null, unit?: string): string {
  if (value === null || value === '') return '';
  return unit ? `${value} ${unit}` : String(value);
}

export function PropertyRow({ label, value, unit, mono, readOnly, varies, onCommit }: PropertyRowProps) {
  const inputId = useId();
  const editable = Boolean(onCommit) && !readOnly;
  const initial = varies ? '' : value === null ? '' : String(value);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);

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
  return (
    <div className="sk-prop-row">
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
