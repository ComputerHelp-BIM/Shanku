import { useMemo, useState } from 'react';
import { Button } from '@shanku/ui';
import type { Finding, QaGroup, QaReport, Severity } from '@shanku/engine';
import { fmtCount } from '../lib/format';

const SEVERITY_LABEL: Record<Severity, string> = { error: 'Error', warning: 'Warning', info: 'Note' };
const GROUP_LABEL: Record<QaGroup, string> = { model: 'Model health', marks: 'Marks' };

/** Severity glyphs, so status is never shown by colour alone. */
function SeverityIcon({ severity }: { severity: Severity }) {
  return (
    <svg className={`app-qa__icon app-qa__icon--${severity}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {severity === 'error' ? (
        <>
          <circle cx="8" cy="8" r="7" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" className="app-qa__glyph" />
        </>
      ) : severity === 'warning' ? (
        <>
          <path d="M8 1.5l7 12.5H1z" />
          <path d="M8 6v4M8 11.6v.4" className="app-qa__glyph app-qa__glyph--dark" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="7" />
          <path d="M8 7v4.5M8 4.6v.4" className="app-qa__glyph" />
        </>
      )}
    </svg>
  );
}

export interface QaPanelProps {
  report: QaReport | null;
  /** Select these elements (and show them in 3D). */
  onSelect: (elements: number[]) => void;
  /** Temporary isolate plus fit; Esc restores. */
  onIsolate: (elements: number[]) => void;
  /** Fit the view without changing the selection. */
  onZoom: (elements: number[]) => void;
  /** Select and fit one element (Step). */
  onStep: (element: number) => void;
  /** When linked to Revit: select the finding's elements in Revit too. */
  onShowInRevit?: (elements: number[]) => void;
  /** When Revit parameters can be edited: a safe fix for this finding, or null when it has none. */
  fixFor?: (f: Finding) => { label: string; run: () => void } | null;
}

/**
 * The QA panel (actionable QA, phase 1): tiles for errors, warnings and notes, a group filter, and one
 * card per finding with Select all, Isolate, Zoom and Step. Every card says what was measured and what
 * the check does not prove.
 */
export function QaPanel({ report, onSelect, onIsolate, onZoom, onStep, onShowInRevit, fixFor }: QaPanelProps) {
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [group, setGroup] = useState<QaGroup | null>(null);
  const [step, setStep] = useState<{ id: string; i: number } | null>(null);
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const f of report?.findings ?? []) c[f.severity]++;
    return c;
  }, [report]);

  if (!report) return <p className="app-qa__empty">Open a model to check it. Checks run on this device as soon as it loads.</p>;
  const shown = report.findings.filter((f) => (!severity || f.severity === severity) && (!group || f.group === group));

  const doStep = (f: Finding, dir: 1 | -1) => {
    const cur = step?.id === f.id ? step.i : -1;
    const i = (cur + dir + f.elements.length) % f.elements.length;
    setStep({ id: f.id, i });
    onStep(f.elements[i]);
  };

  return (
    <div className="app-qa">
      <div className="app-qa__tiles" role="group" aria-label="Filter by severity">
        {(['error', 'warning', 'info'] as const).map((s) => (
          <button key={s} type="button" className="app-qa__tile" aria-pressed={severity === s} onClick={() => setSeverity(severity === s ? null : s)}>
            <SeverityIcon severity={s} />
            <strong>{fmtCount(counts[s])}</strong>
            <span>{s === 'info' ? (counts[s] === 1 ? 'Note' : 'Notes') : counts[s] === 1 ? SEVERITY_LABEL[s] : `${SEVERITY_LABEL[s]}s`}</span>
          </button>
        ))}
        <div className="app-qa__tile app-qa__tile--static">
          <strong>{report.checks.length}</strong>
          <span>Checks · {Math.max(1, Math.round(report.ms))} ms</span>
        </div>
        <label className="app-qa__group">
          <span className="app-sr">Check group</span>
          <select className="app-select" value={group ?? ''} onChange={(e) => setGroup((e.target.value || null) as QaGroup | null)}>
            <option value="">All checks</option>
            {(Object.keys(GROUP_LABEL) as QaGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {report.findings.length === 0 ? (
        <p className="app-qa__empty">All {report.checks.length} checks passed. This does not mean the model is correct; it means these checks found nothing.</p>
      ) : !shown.length ? (
        <p className="app-qa__empty">No findings match this filter.</p>
      ) : (
        <ul className="app-qa__list">
          {shown.map((f) => (
            <li key={f.id} className={`app-qa__card app-qa__card--${f.severity}`}>
              <div className="app-qa__head">
                <SeverityIcon severity={f.severity} />
                <span className="app-sr">{SEVERITY_LABEL[f.severity]}:</span>
                <strong>{f.title}</strong>
                {f.clause ? <span className="app-qa__clause">{f.clause}</span> : null}
              </div>
              <p className="app-qa__detail">{f.detail}</p>
              <details className="app-qa__more">
                <summary>How this was checked</summary>
                <p>
                  <b>Measured:</b> {f.measured}
                </p>
                <p>
                  <b>What this does not prove:</b> {f.limits}
                </p>
              </details>
              {f.elements.length ? (
                <div className="app-qa__actions">
                  <Button size="sm" variant="ghost" onClick={() => onSelect(f.elements)}>
                    {f.elements.length === 1 ? 'Select' : `Select all ${fmtCount(f.elements.length)}`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onIsolate(f.elements)}>
                    Isolate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onZoom(f.elements)}>
                    Zoom
                  </Button>
                  {onShowInRevit ? (
                    <Button size="sm" variant="ghost" title="Select these elements in Revit" onClick={() => onShowInRevit(f.elements)}>
                      Show in Revit
                    </Button>
                  ) : null}
                  {(() => {
                    const fix = fixFor?.(f);
                    return fix ? (
                      <Button size="sm" variant="secondary" title="Propose the change, review it, then apply it in Revit as one undo" onClick={fix.run}>
                        {fix.label}
                      </Button>
                    ) : null;
                  })()}
                  {f.elements.length > 1 ? (
                    <span className="app-qa__step" role="group" aria-label="Step through elements">
                      <Button size="sm" variant="ghost" aria-label="Previous element" onClick={() => doStep(f, -1)}>
                        ‹
                      </Button>
                      <span aria-live="polite">{step?.id === f.id ? `${step.i + 1} of ${fmtCount(f.elements.length)}` : `${fmtCount(f.elements.length)} elements`}</span>
                      <Button size="sm" variant="ghost" aria-label="Next element" onClick={() => doStep(f, 1)}>
                        ›
                      </Button>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
