import { useMemo } from 'react';
import { Button } from '@shanku/ui';
import type { PipelineQa, PipelineSummary } from '@shanku/engine';

export interface PipelineState {
  fileName: string;
  summary: PipelineSummary | null;
  names: Record<string, string>;
  heights: Record<string, number>;
  phase: string | null;
  built: { ifcName: string; elements: number; openings: number } | null;
  error: string | null;
}

export interface PipelinePanelProps {
  state: PipelineState | null;
  onPick: () => void;
  onName: (level: number, name: string) => void;
  onHeight: (level: number, height: number) => void;
  onBuild: () => void;
  onDownload: () => void;
  onShow: (q: PipelineQa) => void;
  /** Export to Revit: the same model, built natively in Revit through the bridge. */
  onExportRevit?: () => void;
  exportRevit?: { ready: boolean; why: string };
}

const ICON = { error: '●', warning: '▲', info: 'i' } as const;

/** Review screen for DXF -> 3D: level table (editable names and heights), counts, QA, build. */
export function PipelinePanel({ state, onPick, onName, onHeight, onBuild, onDownload, onShow, onExportRevit, exportRevit }: PipelinePanelProps) {
  const s = state?.summary ?? null;
  // Levels follow edited heights live. A level is the top of its storey (pipeline 2.0.0): storeys stack
  // from ±0 in level order, so Level n sits at the sum of the heights up to it; the foundation is ±0.
  const levels = useMemo(() => {
    if (!s || !state) return [];
    let z = 0;
    return s.levels.map((l) => {
      if (l.foundation) return { ...l, elevation: 0, name: state.names[l.number] ?? l.name };
      const h = state.heights[l.number] ?? l.height ?? 0;
      z += h;
      return { ...l, height: h, elevation: z, name: state.names[l.number] ?? l.name };
    });
  }, [s, state]);
  const kinds = useMemo(() => (s ? [...new Set(s.counts.map((c) => c.kind))] : []), [s]);
  const count = (lv: number, k: string) => s?.counts.find((c) => c.level === lv && c.kind === k)?.count ?? 0;
  const errors = s?.qa.filter((q) => q.severity === 'error').length ?? 0;

  if (!state) {
    return (
      <div className="pl-empty">
        <p>Build an IFC4 model from a DXF drawing drawn to Computer Help’s layer standard: frames on Part-n layers, closed outlines on CH-* layers, one label inside each.</p>
        <Button variant="primary" onClick={onPick}>Choose a DXF…</Button>
      </div>
    );
  }
  return (
    <div className="pl">
      <div className="pl-head">
        <strong>{state.fileName}</strong>
        {s ? <span className="pl-faint">read in {(s.ms / 1000).toFixed(1)} s · pipeline {s.version}</span> : null}
        <span className="app-spacer" />
        <Button size="sm" onClick={onPick}>Other file…</Button>
      </div>
      {state.phase ? <p className="pl-phase">{state.phase}</p> : null}
      {state.error ? <p className="pl-error">{state.error}</p> : null}
      {s ? (
        <>
          <h4>Levels</h4>
          <div className="pl-scroll">
            <table className="pl-table">
              <thead>
                <tr>
                  <th>No.</th><th>Name</th><th className="n" title="A level is the top of its storey: its columns and walls rise to it, its beams and slabs hang from it. Level 1 (foundation) is ±0.">Level (mm)</th><th className="n">Height (mm)</th>
                  {kinds.map((k) => <th key={k} className="n">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={l.number}>
                    <td>{l.number}</td>
                    <td><input aria-label={`Name of level ${l.number}`} value={l.name} onChange={(e) => onName(l.number, e.target.value)} /></td>
                    <td className="n">{Math.round(l.elevation).toLocaleString('en-IN')}</td>
                    <td className="n">
                      {l.foundation ? <span className="pl-faint">foundation</span> : (
                        <input className="n" aria-label={`Height of level ${l.number}`} type="number" min={500} step={50} value={l.height ?? 0}
                          onChange={(e) => onHeight(l.number, Number(e.target.value))} />
                      )}
                    </td>
                    {kinds.map((k) => <td key={k} className="n">{count(l.number, k) || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Checks ({s.qa.length})</h4>
          {s.qa.length ? (
            <ul className="pl-qa">
              {s.qa.map((q, i) => (
                <li key={i} className={`is-${q.severity}`}>
                  <span className="pl-sev" aria-label={q.severity}>{ICON[q.severity]}</span>
                  <span className="pl-msg">{q.message}</span>
                  {q.at || q.bounds ? <button type="button" className="app-link" onClick={() => onShow(q)}>Show</button> : null}
                </li>
              ))}
            </ul>
          ) : <p className="pl-faint">Everything read cleanly.</p>}
          <div className="pl-actions">
            {state.built ? (
              <span className="pl-ok">✓ Built {state.built.elements.toLocaleString('en-IN')} elements, {state.built.openings} openings · opened as {state.built.ifcName}</span>
            ) : errors ? <span className="pl-faint">{errors} error{errors === 1 ? '' : 's'}: those items are skipped</span> : null}
            <span className="app-spacer" />
            {state.built ? <Button size="sm" onClick={onDownload}>Download IFC</Button> : null}
            {onExportRevit ? (
              <Button size="sm" disabled={!!state.phase} onClick={onExportRevit} title={exportRevit?.ready ? 'Build this model natively in Revit (checked first, one undo in Revit)' : `Export to Revit: ${exportRevit?.why ?? 'connect to Revit'}`}>
                Export to Revit
              </Button>
            ) : null}
            <Button size="sm" variant="primary" disabled={!!state.phase} onClick={onBuild}>{state.built ? 'Rebuild 3D model' : 'Create 3D model'}</Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
