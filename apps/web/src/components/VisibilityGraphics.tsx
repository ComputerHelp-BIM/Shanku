import { useEffect, useState } from 'react';
import { Button } from '@shanku/ui';
import type { CategoryOverrides, GraphicsOverride } from '../lib/visibility';

export interface VgCategory {
  id: string;
  label: string;
  count: number;
}

/** Revit's Visibility/Graphics Overrides → Model Categories: visibility, surface colour, transparency, halftone. */
export function VisibilityGraphicsDialog({
  categories,
  value,
  focus,
  onApply,
  onClose,
}: {
  categories: VgCategory[];
  value: CategoryOverrides;
  /** Category to highlight (from "Override Graphics in View › By Category"). */
  focus?: string;
  onApply: (next: CategoryOverrides) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CategoryOverrides>(value);
  useEffect(() => setDraft(value), [value]);
  const get = (id: string): GraphicsOverride => draft[id] ?? {};
  const set = (id: string, patch: GraphicsOverride) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const allVisible = (v: boolean | 'invert') =>
    setDraft((d) => Object.fromEntries(categories.map((c) => [c.id, { ...d[c.id], visible: v === 'invert' ? !(d[c.id]?.visible ?? true) : v }])));
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  return (
    <div className="vg">
      <div className="vg-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="is-on">Model Categories</button>
        <button type="button" role="tab" aria-selected="false" disabled title="Filters come next">Filters</button>
      </div>
      <div className="vg-scroll">
        <table className="vg-table">
          <thead>
            <tr>
              <th className="c">Visibility</th>
              <th>Category</th>
              <th>Projection/Surface colour</th>
              <th className="n">Transparency</th>
              <th className="c">Halftone</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const o = get(c.id);
              return (
                <tr key={c.id} className={focus === c.id ? 'is-focus' : undefined}>
                  <td className="c">
                    <input type="checkbox" aria-label={`Show ${c.label}`} checked={o.visible ?? true} onChange={(e) => set(c.id, { visible: e.target.checked })} />
                  </td>
                  <td>
                    {c.label} <span className="vg-count">{c.count.toLocaleString('en-IN')}</span>
                  </td>
                  <td>
                    <span className="vg-color">
                      <input type="color" aria-label={`${c.label} colour`} value={o.color ?? '#9aa0a8'} onChange={(e) => set(c.id, { color: e.target.value })} />
                      {o.color ? (
                        <button type="button" className="app-link" onClick={() => set(c.id, { color: null })}>
                          By category
                        </button>
                      ) : (
                        <span className="vg-faint">No override</span>
                      )}
                    </span>
                  </td>
                  <td className="n">
                    <span className="vg-tr">
                      <input type="range" min={0} max={100} step={5} aria-label={`${c.label} transparency`} value={o.transparency ?? 0} onChange={(e) => set(c.id, { transparency: Number(e.target.value) })} />
                      <span>{o.transparency ?? 0}%</span>
                    </span>
                  </td>
                  <td className="c">
                    <input type="checkbox" aria-label={`${c.label} halftone`} checked={o.halftone ?? false} onChange={(e) => set(c.id, { halftone: e.target.checked })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="vg-actions">
        <Button size="sm" onClick={() => allVisible(true)}>All</Button>
        <Button size="sm" onClick={() => allVisible(false)}>None</Button>
        <Button size="sm" onClick={() => allVisible('invert')}>Invert</Button>
        <Button size="sm" onClick={() => setDraft({})}>Clear overrides</Button>
        <span className="app-spacer" />
        <Button size="sm" variant="primary" onClick={() => { if (dirty) onApply(draft); onClose(); }}>OK</Button>
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!dirty} onClick={() => onApply(draft)}>Apply</Button>
      </div>
    </div>
  );
}

/** Revit's View-Specific Element Graphics ("Override Graphics in View › By Element"). */
export function ElementGraphicsDialog({
  count,
  value,
  onApply,
  onClose,
}: {
  count: number;
  value: GraphicsOverride;
  onApply: (next: GraphicsOverride | null) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<GraphicsOverride>(value);
  useEffect(() => setD(value), [value]);
  return (
    <div className="vg vg--small">
      <p className="vg-faint">Applies to {count.toLocaleString('en-IN')} selected element{count === 1 ? '' : 's'} in this view. Overrides the category settings.</p>
      <label className="vg-field">
        <span>Surface colour</span>
        <span className="vg-color">
          <input type="color" aria-label="Element colour" value={d.color ?? '#9aa0a8'} onChange={(e) => setD({ ...d, color: e.target.value })} />
          {d.color ? <button type="button" className="app-link" onClick={() => setD({ ...d, color: undefined })}>By category</button> : <span className="vg-faint">By category</span>}
        </span>
      </label>
      <label className="vg-field">
        <span>Transparency</span>
        <span className="vg-tr">
          <input type="range" min={0} max={100} step={5} aria-label="Element transparency" value={d.transparency ?? 0} onChange={(e) => setD({ ...d, transparency: Number(e.target.value) })} />
          <span>{d.transparency ?? 0}%</span>
        </span>
      </label>
      <label className="vg-field">
        <span>Halftone</span>
        <input type="checkbox" aria-label="Element halftone" checked={d.halftone ?? false} onChange={(e) => setD({ ...d, halftone: e.target.checked })} />
      </label>
      <div className="vg-actions">
        <Button size="sm" onClick={() => { onApply(null); onClose(); }}>Reset</Button>
        <span className="app-spacer" />
        <Button size="sm" variant="primary" onClick={() => { onApply(d); onClose(); }}>OK</Button>
        <Button size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
