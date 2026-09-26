import { useState } from 'react';
import { MEASURE_MODES, type MeasureMode, type MeasureReadout } from '@shanku/engine';

export interface MeasureBarProps {
  readout: MeasureReadout;
  onMode: (mode: MeasureMode) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * The Measure tool's bar over the view (Revit shows the total on the Options Bar): the five modes,
 * what to do next, what a click takes now (Tab cycles), the rubber band length, and the results with
 * their ΔX ΔY ΔZ, perpendicular, clear and centre-to-centre values.
 */
export function MeasureBar({ readout: r, onMode, onClear, onClose }: MeasureBarProps) {
  const [copied, setCopied] = useState<number | null>(null);
  const [latest, ...older] = r.results;
  const copy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked (insecure context or permission): the values stay on screen */
    }
  };
  return (
    <>
    <section className="app-toolstrip" aria-label="Measure">
      <strong>Measure</strong>
      <div className="app-segmented" role="radiogroup" aria-label="What to measure">
        {MEASURE_MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={r.mode === m.id} className={r.mode === m.id ? 'is-active' : undefined} title={m.tip} onClick={() => onMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <span className="app-toolstrip__prompt" aria-live="polite" title={r.prompt}>
        {r.hover ? (
          <>
            <span className="app-toolstrip__hover">{r.hover.label}</span>
            {r.hover.total > 1 ? <em>{r.hover.position} of {r.hover.total} · Tab</em> : null}
            {r.live ? <b>{r.live}</b> : null}
          </>
        ) : (
          r.prompt
        )}
      </span>
      <button type="button" className="app-toolstrip__close" aria-label="Close Measure (Esc)" title="Close Measure (Esc)" onClick={onClose}>
        ×
      </button>
    </section>
    {latest ? (
    <section className="app-measure" aria-label="Measurements">
        <div className="app-measure__result">
          <div className="app-measure__title">
            <span>{latest.title}</span>
            <b>{latest.value}</b>
          </div>
          <dl>
            {latest.rows.map(([k, v]) => (
              <div key={k} className={v.length > 22 || k.length > 24 ? 'is-wide' : undefined}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="app-measure__actions">
            <button type="button" className="app-link" onClick={() => void copy(latest.id, latest.copy)}>
              {copied === latest.id ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="app-link" onClick={onClear}>
              Clear all
            </button>
          </div>
        </div>
      {older.length ? (
        <ul className="app-measure__older" aria-label="Earlier measurements">
          {older.slice(0, 5).map((m) => (
            <li key={m.id}>
              <span title={m.title}>{m.title}</span>
              <button type="button" className="app-link" title="Copy" onClick={() => void copy(m.id, m.copy)}>
                {copied === m.id ? 'Copied' : m.value}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
    ) : null}
    </>
  );
}
