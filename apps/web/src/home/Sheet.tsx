/**
 * The homepage is a drawing sheet: sections open with level heads (as in a Revit elevation), descending from the
 * roof at the top to the foundation at the title block; a dimension string sits under the headline; the footer
 * is a title block. Decorative parts are hidden from screen readers; the words they carry are real text.
 */
import type { ReactNode } from 'react';

/** A section's opening line: the level symbol, a dash-dot level line, the level and its elevation, the kicker. */
export function LevelHead({ level, elevation, children }: { level: string; elevation: string; children: ReactNode }) {
  return (
    <div className="lv">
      <svg className="lv__head" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" />
        <path d="M12 21 A9 9 0 0 1 3 12 L12 12 Z" />
      </svg>
      <span className="lv__name" aria-hidden="true">
        {level}
        <span className="lv__el">{elevation}</span>
      </span>
      <span className="lv__line" aria-hidden="true" />
      <p className="home-kicker lv__kicker">{children}</p>
    </div>
  );
}

/** A dimension string: ticks at both ends, the label over the middle. */
export function DimLine({ label }: { label: string }) {
  return (
    <div className="dim" aria-hidden="true">
      <span className="dim__tick" />
      <span className="dim__line" />
      <span className="dim__label">{label}</span>
      <span className="dim__line" />
      <span className="dim__tick" />
    </div>
  );
}

/** The footer as a drawing's title block. */
export function TitleBlock({ version, children }: { version: string; children?: ReactNode }) {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const cells: Array<[string, ReactNode]> = [
    ['Project', 'cad2bim'],
    ['Client', 'Computer Help · Building Software, Mumbai'],
    ['Drawing', 'Structural BIM in the browser'],
    ['Sheet', 'C2B-000'],
    ['Revision', `v${version}`],
    ['Date', today],
    ['Scale', '1 : 1 (it is the real thing)'],
  ];
  return (
    <div className="tb">
      <dl className="tb__cells">
        {cells.map(([k, v]) => (
          <div key={k} className={`tb__cell tb__cell--${k.toLowerCase()}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
