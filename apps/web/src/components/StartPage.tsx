import { useState } from 'react';
import { Button, Icon } from '@shanku/ui';
import { SAMPLES, sampleUrl, type SampleBuilding } from '../lib/samples';
import { fmtCount } from '../lib/format';

export interface StartPageProps {
  onChooseIfc: () => void;
  onChooseDxf: () => void;
  onSample: (s: SampleBuilding) => void;
  onGuide: () => void;
  /** A sample is downloading or opening. */
  busy?: string | null;
}

const FORMATS: ReadonlyArray<{ ext: string; note?: string }> = [
  { ext: '.ifc' },
  { ext: '.ifc.gz' },
  { ext: '.dxf' },
  { ext: '.dwg', note: 'save as DXF' },
  { ext: '.rvt', note: 'live link or IFC export' },
];

/**
 * What the app shows before a file is open: what it opens, one button to choose a file, and sample
 * buildings to try (small, a G+14 tower and a large twin-tower podium), all read on this device.
 */
export function StartPage({ onChooseIfc, onChooseDxf, onSample, onGuide, busy }: StartPageProps) {
  const [downloads, setDownloads] = useState(false);
  return (
    <div className="app-start">
      <div className="app-start__inner">
        <h1 className="app-start__title">Open any IFC model in your browser</h1>
        <p className="app-start__lead">
          Drop a file here or choose one. It is read entirely on this device: nothing is uploaded, and no Revit or other licence is needed to look at it, measure it or
          take quantities.
        </p>
        <ul className="app-start__formats" aria-label="Formats">
          {FORMATS.map((f) => (
            <li key={f.ext} className={f.note ? 'is-guided' : undefined}>
              {f.ext}
              {f.note ? ` — ${f.note}` : ''}
            </li>
          ))}
        </ul>
        <div className="app-start__actions">
          <Button variant="primary" onClick={onChooseIfc}>
            <Icon name="ifc" size={18} /> Choose a model file
          </Button>
          <Button onClick={onChooseDxf}>
            <Icon name="dxf" size={18} /> Open a DXF drawing
          </Button>
        </div>
        <p className="app-start__or">or open a sample building</p>
        <div className="app-start__samples">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="app-start__sample" disabled={!!busy} onClick={() => onSample(s)} aria-busy={busy === s.id}>
              <strong>{s.title}</strong>
              <span>{s.detail}</span>
              <em>{busy === s.id ? 'Opening…' : `${fmtCount(s.elements)} elements · ${s.shows}`}</em>
            </button>
          ))}
        </div>
        <p className="app-start__foot">
          Everything runs locally in this tab.
          <button type="button" className="app-link" onClick={onGuide}>
            Read the guide
          </button>
          <button type="button" className="app-link" aria-expanded={downloads} onClick={() => setDownloads((d) => !d)}>
            Download the sample files
          </button>
        </p>
        {downloads ? (
          <ul className="app-start__downloads">
            {SAMPLES.map((s) => (
              <li key={s.id}>
                <a className="app-link" href={sampleUrl(s)} download={s.file}>
                  {s.file}
                </a>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
