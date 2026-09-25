import { Children, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** A docked panel with a header (Properties, Project browser, ...). */
export function DockPanel({ title, children, grow, toolbar, footer }: { title: string; children: ReactNode; grow?: boolean; toolbar?: ReactNode; footer?: ReactNode }) {
  const id = useId();
  return (
    <section className={['sk-dock', grow && 'sk-dock--grow', footer && 'sk-dock--footer'].filter(Boolean).join(' ')} aria-labelledby={id}>
      <h2 id={id} className="sk-dock__title">
        {title}
      </h2>
      {toolbar ? <div className="sk-dock__toolbar">{toolbar}</div> : null}
      <div className="sk-dock__body">{children}</div>
      {/* the footer stays put while the body scrolls (Revit's Apply bar) */}
      {footer ? <div className="sk-dock__footer">{footer}</div> : null}
    </section>
  );
}

// ---------------------------------------------------------------- property grid

/** Row order inside each group: Revit's (categorized), A → Z or Z → A. Groups keep their order. */
export type PropertySort = 'categorized' | 'asc' | 'desc';
const SortCtx = createContext<PropertySort>('categorized');

const SPLIT_KEY = 'shanku.propSplit';
const SPLIT_EVENT = 'shanku:prop-split';
function readSplit(): number | null {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Sort mode kept per panel on this device (Properties and Type Properties each remember theirs). */
export function usePropertySort(key: string): [PropertySort, (s: PropertySort) => void] {
  const store = `shanku.propSort.${key}`;
  const [sort, setSort] = useState<PropertySort>(() => {
    try {
      const v = localStorage.getItem(store);
      return v === 'asc' || v === 'desc' ? v : 'categorized';
    } catch {
      return 'categorized';
    }
  });
  return [
    sort,
    (s) => {
      setSort(s);
      try {
        localStorage.setItem(store, s);
      } catch {
        /* not remembered */
      }
    },
  ];
}

/**
 * Holds property sections as Revit's palette does: drag the thin line between labels and values to
 * resize the label column (shared by every panel and remembered), and sort rows within each group.
 */
export function PropertyGrid({ children, sort = 'categorized' }: { children: ReactNode; sort?: PropertySort }) {
  const ref = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState<number | null>(readSplit);
  useEffect(() => {
    const on = (e: Event) => setSplit((e as CustomEvent<number>).detail);
    window.addEventListener(SPLIT_EVENT, on);
    return () => window.removeEventListener(SPLIT_EVENT, on);
  }, []);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.target as Element).classList?.contains('sk-prop-row__split') || !ref.current) return;
    e.preventDefault();
    const box = ref.current.getBoundingClientRect();
    const move = (ev: globalThis.PointerEvent) => {
      const w = Math.round(Math.min(box.width - 80, Math.max(80, ev.clientX - box.left)));
      setSplit(w);
      window.dispatchEvent(new CustomEvent(SPLIT_EVENT, { detail: w }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(SPLIT_KEY, String(readSplitFromDom(ref.current)));
      } catch {
        /* not remembered */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <SortCtx.Provider value={sort}>
      <div ref={ref} className="sk-prop-grid" style={split ? ({ '--sk-prop-label': `${split}px` } as CSSProperties) : undefined} onPointerDown={onPointerDown}>
        {children}
      </div>
    </SortCtx.Provider>
  );
}
function readSplitFromDom(el: HTMLDivElement | null): number {
  const v = el?.style.getPropertyValue('--sk-prop-label') ?? '';
  return parseInt(v, 10) || 0;
}

/** Revit's footer: sort buttons (categorized, A → Z, Z → A) and a slot for actions such as Apply. */
export function PropertiesFooter({ sort, onSort, children }: { sort: PropertySort; onSort: (s: PropertySort) => void; children?: ReactNode }) {
  const b = (s: PropertySort, label: string, path: string) => (
    <button type="button" className={['sk-prop-sort', sort === s && 'is-on'].filter(Boolean).join(' ')} aria-pressed={sort === s} title={label} aria-label={label} onClick={() => onSort(s)}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
  return (
    <div className="sk-prop-footer">
      <div className="sk-prop-footer__sort" role="group" aria-label="Sort parameters">
        {b('categorized', 'Categorized (Revit order)', 'M2 3.5h7M2 6.5h7M2 9.5h7M2 12.5h7M12 3v10M10.5 11.5L12 13l1.5-1.5')}
        {b('asc', 'Sort A to Z within groups', 'M2.5 7l2-5 2 5M3.2 5.3h2.6M2.5 9h4l-4 5h4M12 3v10M10.5 11.5L12 13l1.5-1.5')}
        {b('desc', 'Sort Z to A within groups', 'M2.5 2h4l-4 5h4M2.5 14l2-5 2 5M3.2 12.3h2.6M12 3v10M10.5 11.5L12 13l1.5-1.5')}
      </div>
      {children ? <div className="sk-prop-footer__actions">{children}</div> : null}
    </div>
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

/** Rows sorted by their label within a group (A → Z or Z → A); other children keep their place last. */
function sortRows(children: ReactNode, mode: PropertySort): ReactNode {
  if (mode === 'categorized') return children;
  const items = Children.toArray(children);
  const label = (c: ReactNode) => (isValidElement(c) && typeof (c.props as { label?: unknown }).label === 'string' ? ((c.props as { label: string }).label) : null);
  const rows = items.filter((c) => label(c) !== null).sort((a, b) => label(a)!.localeCompare(label(b)!, undefined, { numeric: true, sensitivity: 'base' }));
  if (mode === 'desc') rows.reverse();
  return [...rows, ...items.filter((c) => label(c) === null)];
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
  const sortMode = useContext(SortCtx);
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
      {open ? <div className="sk-prop-section__rows">{sortRows(children, sortMode)}</div> : null}
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
          <span className="sk-prop-row__split" aria-hidden="true" />
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
        <span className="sk-prop-row__split" aria-hidden="true" />
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
