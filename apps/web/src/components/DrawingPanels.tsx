import { useMemo, useState } from 'react';
import { Button, DockPanel, PropertyRow, PropertySection, TypeSelector } from '@shanku/ui';
import { fmtBytes, fmtCount } from '../lib/format';
import { UNIT_CHOICES } from '../lib/documents';
import type { DrawingDoc } from '../lib/useDrawings';

export function DrawingProperties({ doc, onUnits }: { doc: DrawingDoc; onUnits: (u: string) => void }) {
  const i = doc.drawing.info;
  const sel = doc.selected;
  if (sel) {
    const p = sel.props;
    const fmt = (v: string | number | number[]) => (Array.isArray(v) ? v.map((n) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })).join(', ') : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : v);
    return (
      <DockPanel title="Properties">
        <TypeSelector
          icon="dxf"
          category={sel.entities.length > 1 ? `${sel.entities.length} DXF objects · Esc clears` : 'DXF object · Esc clears'}
          typeName={p ? (sel.entities.length > 1 ? `${p.Type} and ${sel.entities.length - 1} more` : String(p.Type)) : 'Loading…'}
        />
        {p ? (
          <>
            <PropertySection title="General">
              {(['Handle', 'Layer', 'Color', 'Linetype'] as const).map((k) => (p[k] !== undefined ? <PropertyRow key={k} label={k} value={fmt(p[k])} readOnly /> : null))}
            </PropertySection>
            <PropertySection title="Geometry">
              {Object.entries(p)
                .filter(([k]) => !['Type', 'Handle', 'Layer', 'Color', 'Linetype'].includes(k))
                .map(([k, v]) => (
                  <PropertyRow key={k} label={k} value={fmt(v)} readOnly />
                ))}
            </PropertySection>
          </>
        ) : null}
      </DockPanel>
    );
  }
  return (
    <DockPanel title="Properties">
      <TypeSelector icon="dxf" category="DXF drawing" typeName={doc.name} />
      <PropertySection title="File">
        <PropertyRow label="Size" value={fmtBytes(doc.drawing.fileSize)} />
        <PropertyRow label="Format" value={`${i.release} (${i.version})`} />
        <PropertyRow label="Declared units" value={i.units} />
        <div className="sk-prop-row">
          <label className="sk-prop-row__label" htmlFor={`${doc.id}-units`}>
            Drawing units
          </label>
          <select id={`${doc.id}-units`} className="app-select" value={doc.units} onChange={(e) => onUnits(e.target.value)}>
            {[...new Set([i.units, ...UNIT_CHOICES])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </PropertySection>
      <PropertySection title="Content">
        <PropertyRow label="Lines" value={fmtCount(i.segments)} />
        <PropertyRow label="Fills" value={fmtCount(i.polygons)} />
        <PropertyRow label="Texts" value={fmtCount(i.texts)} />
        <PropertyRow label="Layers" value={fmtCount(i.layers)} />
        <PropertyRow label="Opened in" value={`${(doc.drawing.loadMs / 1000).toFixed(1)} s`} readOnly />
      </PropertySection>
    </DockPanel>
  );
}

/** AutoCAD-style layer on/off list with a filter. */
export function LayersPanel({ doc, onChange }: { doc: DrawingDoc; onChange: (on: boolean[]) => void }) {
  const [filter, setFilter] = useState('');
  const layers = doc.drawing.layers;
  const shown = useMemo(
    () => layers.map((l, i) => ({ ...l, i })).filter((l) => l.name.toLowerCase().includes(filter.toLowerCase())),
    [layers, filter],
  );
  const setAll = (v: boolean) => {
    const next = [...doc.layerOn];
    for (const l of shown) next[l.i] = v;
    onChange(next);
  };
  return (
    <DockPanel title="Layers" grow>
      <div className="app-layers__tools">
        <input className="app-layers__filter" placeholder="Filter layers" aria-label="Filter layers" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
          All on
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
          All off
        </Button>
      </div>
      <ul className="app-layers">
        {shown.map((l) => (
          <li key={l.name}>
            <label>
              <input
                type="checkbox"
                checked={doc.layerOn[l.i]}
                onChange={(e) => {
                  const next = [...doc.layerOn];
                  next[l.i] = e.target.checked;
                  onChange(next);
                }}
              />
              <span className="app-layers__name">{l.name}</span>
              <span className="app-layers__count">{fmtCount(l.count)}</span>
            </label>
          </li>
        ))}
      </ul>
    </DockPanel>
  );
}
